import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createStore } from '../backend/store.js';
import { exportCsv } from '../backend/csv.js';
import { parseCsv } from './parse-csv.js';
import { encryptInitialData, decryptInitialData } from '../backend/initial-data.js';

const fixture = (code = 'C1') => ({ code, name: 'Example Person', phone: '+250 700 000 001', context: 'Example guidance', notes: 'Original note', calledOn: '07:30' });

test('starting contacts are encrypted and require the private key', () => {
  const key = 'a'.repeat(64), contacts = [fixture()];
  const envelope = encryptInitialData(contacts, key);
  assert.ok(!JSON.stringify(envelope).includes('Example Person'));
  assert.deepEqual(decryptInitialData(envelope, key), contacts);
  assert.throws(() => decryptInitialData(envelope, 'b'.repeat(64)), /unlock/);
  assert.throws(() => decryptInitialData(envelope, ''), /INITIAL_DATA_KEY/);
  assert.throws(() => decryptInitialData({ ...envelope, tag: Buffer.alloc(16).toString('base64') }, key), /unlock/);
});

test('imports are atomic and repeated codes never overwrite feedback', () => {
  const store = createStore(':memory:');
  try {
    assert.throws(() => store.import([fixture(), fixture()]), /Duplicate/);
    assert.equal(store.list().length, 0);
    assert.throws(() => store.import([fixture(), { code: 'A1' }]), /name/);
    assert.equal(store.list().length, 0);
    assert.deepEqual(store.import([fixture()]), { added: 1, skipped: 0 });
    const first = store.list()[0];
    store.update(first.id, { notes: 'Saved feedback' }, first.revision);
    assert.deepEqual(store.import([{ ...fixture(), notes: 'Overwrite attempt' }, fixture('D1')]), { added: 1, skipped: 1 });
    assert.equal(store.get(first.id).notes, 'Saved feedback');
  } finally { store.close(); }
});
test('feedback validation and revision checks prevent accidental overwrites', () => {
  const store = createStore(':memory:');
  try {
    store.import([fixture()]); const first = store.list()[0];
    assert.throws(() => store.update(first.id, { name: 'Changed' }, first.revision), /Only feedback/);
    assert.throws(() => store.update(first.id, { reached: 'invented' }, first.revision), /valid/);
    assert.throws(() => store.update(first.id, { notes: 'x'.repeat(10001) }, first.revision), /Invalid/);
    const updated = store.update(first.id, { reached: 'Yes', notes: 'Useful\nfeedback' }, first.revision);
    assert.equal(updated.revision, first.revision + 1);
    assert.deepEqual(store.update(first.id, { notes: 'Stale' }, first.revision), { conflict: true });
    assert.equal(store.get(first.id).notes, 'Useful\nfeedback');
  } finally { store.close(); }
});
test('call timestamps, history, persistence and backup restoration', () => {
  const directory = mkdtempSync(join(tmpdir(), 'forseen-store-'));
  const path = join(directory, 'test.sqlite'); let store = createStore(path);
  try {
    store.import([fixture()]); const first = store.list()[0];
    const started = Date.now(); const updated = store.call(first.id, first.revision);
    assert.ok(Date.parse(updated.calledOn) >= started);
    assert.equal(updated.attempts, 1);
    assert.deepEqual(store.call(first.id, first.revision), { conflict: true });
    assert.equal(store.history(first.id).length, 1);
    const backup = join(directory, 'snapshot.sqlite'); store.backup(backup); store.close();
    store = createStore(path); assert.equal(store.get(first.id).attempts, 1); store.close();
    store = createStore(backup); assert.equal(store.get(first.id).calledOn, updated.calledOn);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});
test('CSV exports requested columns, unicode, multiline notes and neutralizes formulas', () => {
  const csv = exportCsv([{ ...fixture(), name: 'Éxample, "Person"', notes: 'Line 1\nLine 2', result: '=HYPERLINK("bad")' }]);
  assert.ok(csv.startsWith('\ufeff'));
  const rows = parseCsv(csv);
  assert.deepEqual(rows[0].slice(0, 4), ['Code', 'Name', 'Number', 'Called on']);
  assert.equal(rows[1][1], 'Éxample, "Person"');
  assert.equal(rows[1][2], "'+250 700 000 001");
  assert.equal(rows[1][8], 'Line 1\nLine 2');
  assert.ok(rows[1][6].startsWith("'="));
});
test('HTTP access control, import, saves, calls, export and origin protection', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'forseen-http-'));
  writeFileSync(join(directory, 'starter.enc'), JSON.stringify(encryptInitialData([fixture()], 'a'.repeat(64))));
  const child = spawn(process.execPath, ['--preserve-symlinks', '--preserve-symlinks-main', 'backend/server.js'], {
    cwd: resolve('.'), env: { ...process.env, PORT: '0', HOST: '127.0.0.1', DATA_DIR: directory, INITIAL_DATA_FILE: join(directory, 'starter.enc'), INITIAL_DATA_KEY: 'a'.repeat(64), NODE_ENV: 'production', APP_PASSWORD: 'fictional-test-password-123' }, stdio: ['ignore', 'pipe', 'pipe']
  });
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  try {
    const base = await new Promise((resolveReady, reject) => {
      const timeout = setTimeout(() => reject(new Error('Server did not start: ' + errors)), 15000);
      child.stdout.on('data', chunk => { const match = /http:\/\/localhost:(\d+)/.exec(String(chunk)); if (match) { clearTimeout(timeout); resolveReady('http://127.0.0.1:' + match[1]); } });
      child.on('error', reject); child.on('exit', code => { if (code) { clearTimeout(timeout); reject(new Error(errors)); } });
    });
    const request = (path, method = 'GET', data, cookie = '', extra = {}) => fetch(base + '/api/v1' + path, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie, ...extra }, ...(data ? { body: JSON.stringify(data) } : {}) });
    assert.equal((await request('/health')).status, 200);
    for (const path of ['/contacts', '/export', '/contacts/1/history']) assert.equal((await request(path)).status, 401);
    assert.equal((await request('/import', 'POST', { contacts: [fixture()] })).status, 401);
    assert.equal((await request('/session', 'POST', { password: 'wrong' })).status, 401);
    const login = await request('/session', 'POST', { password: 'fictional-test-password-123' });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    assert.ok(login.headers.get('set-cookie').includes('Secure'));
    assert.equal((await request('/contacts', 'GET', null, cookie)).status, 200);
    assert.equal((await request('/import', 'POST', { contacts: [fixture()] }, cookie, { Origin: 'https://other.example' })).status, 403);
    assert.equal((await request('/import', 'POST', { contacts: [fixture()] }, cookie)).status, 200);
    const { contacts } = await (await request('/contacts', 'GET', null, cookie)).json();
    assert.equal(contacts.length, 1); let item = contacts[0];
    const saved = await request(`/contacts/${item.id}`, 'PATCH', { patch: { notes: 'Saved through HTTP' }, revision: item.revision }, cookie);
    assert.equal(saved.status, 200); item = (await saved.json()).contact;
    assert.equal((await request(`/contacts/${item.id}`, 'PATCH', { patch: { notes: 'Stale' }, revision: 1 }, cookie)).status, 409);
    const called = await request(`/contacts/${item.id}/call`, 'POST', { revision: item.revision }, cookie);
    assert.equal(called.status, 200);
    assert.equal((await called.json()).contact.attempts, 1);
    assert.ok((await (await request('/export', 'GET', null, cookie)).text()).includes('Saved through HTTP'));
    assert.equal((await fetch(base + '/data/forseen.sqlite')).status, 404);
    await request('/logout', 'POST', {}, cookie);
    assert.equal((await request('/contacts', 'GET', null, cookie)).status, 401);
  } finally {
    child.kill(); await new Promise(resolveExit => child.exitCode !== null ? resolveExit() : child.once('exit', resolveExit));
    rmSync(directory, { recursive: true, force: true });
  }
});
