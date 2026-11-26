import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { createStore, choices } from './store.js';
import { exportCsv } from './csv.js';
import { decryptInitialData } from './initial-data.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const frontend = resolve(root, 'frontend');
const production = process.env.NODE_ENV === 'production';
const password = process.env.APP_PASSWORD || '';
if (production && password.length < 12) throw new Error('Set APP_PASSWORD to at least 12 characters in .env before starting production.');
const store = createStore(resolve(process.env.DATA_DIR || resolve(root, 'data'), 'forseen.sqlite'));
const seedPath = resolve(root, 'data/initial-contacts.json');
if (!production && !process.env.DATA_DIR && !store.list().length && existsSync(seedPath)) store.import(JSON.parse(await readFile(seedPath, 'utf8')));
const encryptedSeed = process.env.INITIAL_DATA_FILE || resolve(root, '../private-data/initial-contacts.enc');
if (!store.list().length && production && process.env.INITIAL_DATA_FILE && !existsSync(encryptedSeed)) throw new Error('Copy your private VPS setup files into the checkout before the first start.');
if (!store.list().length && existsSync(encryptedSeed)) store.import(decryptInitialData(JSON.parse(await readFile(encryptedSeed, 'utf8')), process.env.INITIAL_DATA_KEY));
const sessions = new Map();
const failures = new Map();
const hash = text => createHash('sha256').update(text).digest();
const send = (res, code, data, headers = {}) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', ...headers }); res.end(JSON.stringify(data)); };
async function body(req) {
  let size = 0, chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 5 * 1024 * 1024) { const error = new Error('Request too large.'); error.status = 413; throw error; }
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString()); } catch { throw new Error('Invalid JSON.'); }
}
function authenticated(req) {
  if (!password) return true;
  const token = /(?:^|;\s*)forseen_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
  const expires = token && sessions.get(token);
  if (expires && expires > Date.now()) return true;
  if (token) sessions.delete(token);
  return false;
}
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  res.setHeader('Cache-Control', 'no-store');
  try {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname;
    if (path === '/api/v1/health' && req.method === 'GET') return send(res, 200, { status: 'ok' });
    if (path.startsWith('/api/') && !['GET', 'HEAD'].includes(req.method)) {
      if (req.headers['sec-fetch-site'] === 'cross-site') return send(res, 403, { error: 'Cross-site requests are not allowed.' });
      const origin = req.headers.origin;
      if (origin && new URL(origin).host !== req.headers.host) return send(res, 403, { error: 'Invalid request origin.' });
      if (!String(req.headers['content-type']).startsWith('application/json')) return send(res, 415, { error: 'Send application/json.' });
    }
    if (path === '/api/v1/session' && req.method === 'GET') return send(res, 200, { authenticated: authenticated(req), passwordRequired: Boolean(password) });
    if (path === '/api/v1/session' && req.method === 'POST') {
      const ip = req.socket.remoteAddress;
      const record = failures.get(ip);
      if (record && record.until > Date.now() && record.count >= 10) return send(res, 429, { error: 'Too many attempts. Try again in 15 minutes.' });
      const input = await body(req);
      if (!password || (typeof input.password === 'string' && timingSafeEqual(hash(input.password), hash(password)))) {
        failures.delete(ip);
        for (const [token, expires] of sessions) if (expires < Date.now()) sessions.delete(token);
        const token = randomBytes(32).toString('hex');
        sessions.set(token, Date.now() + 7 * 86400000);
        return send(res, 200, { authenticated: true }, { 'Set-Cookie': `forseen_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${production ? '; Secure' : ''}` });
      }
      failures.set(ip, { count: record && record.until > Date.now() ? record.count + 1 : 1, until: Date.now() + 900000 });
      return send(res, 401, { error: 'That password is not correct.' });
    }
    if (path.startsWith('/api/')) {
      if (!authenticated(req)) return send(res, 401, { error: 'Please sign in to your workspace.' });
      if (path === '/api/v1/logout' && req.method === 'POST') {
        const token = /forseen_session=([a-f0-9]{64})/.exec(req.headers.cookie || '')?.[1];
        sessions.delete(token);
        return send(res, 200, {}, { 'Set-Cookie': `forseen_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${production ? '; Secure' : ''}` });
      }
      if (path === '/api/v1/contacts' && req.method === 'GET') return send(res, 200, { contacts: store.list(), choices });
      if (path === '/api/v1/import' && req.method === 'POST') return send(res, 200, store.import((await body(req)).contacts));
      if (path === '/api/v1/export' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="forseen-feedback-${new Date().toISOString().slice(0, 10)}.csv"` });
        return res.end(exportCsv(store.list()));
      }
      const match = /^\/api\/v1\/contacts\/(\d+)(\/call|\/history)?$/.exec(path);
      if (match) {
        const id = Number(match[1]);
        if (req.method === 'GET' && match[2] === '/history') {
          if (!store.get(id)) return send(res, 404, { error: 'Contact not found.' });
          return send(res, 200, { calls: store.history(id) });
        }
        if ((req.method === 'PATCH' && !match[2]) || (req.method === 'POST' && match[2] === '/call')) {
          const input = await body(req);
          const contact = match[2] ? store.call(id, input.revision) : store.update(id, input.patch, input.revision);
          if (!contact) return send(res, 404, { error: 'Contact not found.' });
          if (contact.conflict) return send(res, 409, { error: 'This contact changed on another screen. Reload before editing again.' });
          return send(res, 200, { contact });
        }
      }
      return send(res, 404, { error: 'Endpoint not found.' });
    }
    if (!['GET', 'HEAD'].includes(req.method)) return send(res, 405, { error: 'Method not allowed.' });
    const file = path === '/' ? resolve(frontend, 'index.html') : resolve(frontend, '.' + decodeURIComponent(path));
    if (!file.startsWith(frontend + sep) || !types[extname(file)]) return send(res, 404, { error: 'Not found.' });
    if (!(await stat(file)).isFile()) return send(res, 404, { error: 'Not found.' });
    res.writeHead(200, { 'Content-Type': types[extname(file)] });
    res.end(req.method === 'HEAD' ? undefined : await readFile(file));
  } catch (error) {
    if (error.code === 'ENOENT') return send(res, 404, { error: 'Not found.' });
    if (res.headersSent) return res.end();
    send(res, error.status || 400, { error: error.message || 'Something went wrong.' });
  }
});
const port = Number(process.env.PORT || 3010);
server.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`Forseen is ready at http://localhost:${server.address().port}`));
function close() { server.close(() => { store.close(); process.exit(0); }); }
process.on('SIGINT', close);
process.on('SIGTERM', close);
