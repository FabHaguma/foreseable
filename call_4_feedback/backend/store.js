import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const editable = ['reached', 'reason', 'result', 'promisedFor', 'notes', 'openedSeen'];
export const fields = ['code', 'section', 'name', 'partner', 'listNo', 'phone', 'whatsapp', 'context', 'calledOn', ...editable];
export const choices = {
  reached: ['Yes', 'No answer', 'Phone off', 'Wrong number'],
  reason: ['No internet', 'No smartphone', 'No Google account or Play Store', 'Was waiting for a text', 'Lost the link', 'Blocked in the app', 'Used another number', 'Not interested', 'Not a member', 'Other'],
  result: ['Opened Seen on the call', 'Promised', 'Link sent', 'Call again', 'Will not apply'],
  openedSeen: ['Yes', 'No']
};

export function validateContact(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid contact.');
  const contact = {};
  for (const field of fields) {
    const value = input[field] ?? '';
    if (typeof value !== 'string' || value.length > (['notes', 'context'].includes(field) ? 10000 : 1000)) throw new Error(`Invalid ${field}.`);
    contact[field] = value.trim();
  }
  if (!contact.code || !contact.name) throw new Error('Every contact needs a code and name.');
  if (contact.phone && !/^\+?[\d\s()./-]{5,40}$/.test(contact.phone)) throw new Error(`Invalid phone number for ${contact.code}.`);
  return contact;
}

export function createStore(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS contacts (id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, position INTEGER NOT NULL,
      data TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS calls (id INTEGER PRIMARY KEY, contact_id INTEGER NOT NULL REFERENCES contacts(id),
      called_at TEXT NOT NULL);
    INSERT OR IGNORE INTO schema_migrations VALUES (1);`);
  const decode = row => row ? { ...JSON.parse(row.data), id: row.id, revision: row.revision,
    attempts: Number(db.prepare('SELECT COUNT(*) AS count FROM calls WHERE contact_id=?').get(row.id).count) } : null;
  function get(id) { return decode(db.prepare('SELECT * FROM contacts WHERE id=?').get(id)); }
  return {
    db,
    list: () => db.prepare('SELECT * FROM contacts ORDER BY position, id').all().map(decode),
    get,
    import(inputs) {
      if (!Array.isArray(inputs) || !inputs.length || inputs.length > 5000) throw new Error('Import between 1 and 5,000 contacts.');
      const contacts = inputs.map(validateContact);
      const codes = new Set();
      for (const contact of contacts) {
        if (codes.has(contact.code)) throw new Error(`Duplicate code: ${contact.code}. Nothing was imported.`);
        codes.add(contact.code);
      }
      let added = 0;
      const max = db.prepare('SELECT COALESCE(MAX(position),0) AS position FROM contacts').get().position;
      db.exec('BEGIN IMMEDIATE');
      try {
        const insert = db.prepare('INSERT OR IGNORE INTO contacts(code,position,data) VALUES(?,?,?)');
        for (const [index, contact] of contacts.entries()) added += Number(insert.run(contact.code, max + index + 1, JSON.stringify(contact)).changes);
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
      return { added, skipped: contacts.length - added };
    },
    update(id, patch, revision) {
      const current = get(id);
      if (!current) return null;
      if (!Number.isInteger(revision) || revision !== current.revision) return { conflict: true };
      if (!patch || typeof patch !== 'object' || Array.isArray(patch) || !Object.keys(patch).length || Object.keys(patch).some(key => !editable.includes(key))) throw new Error('Only feedback fields can be edited.');
      for (const [key, value] of Object.entries(patch)) {
        if (typeof value !== 'string' || value.length > (key === 'notes' ? 10000 : 1000)) throw new Error(`Invalid ${key}.`);
        if (choices[key] && value && !choices[key].includes(value)) throw new Error(`Choose a valid ${key}.`);
      }
      const data = validateContact({ ...current, ...patch });
      const result = db.prepare('UPDATE contacts SET data=?, revision=revision+1 WHERE id=? AND revision=?').run(JSON.stringify(data), id, revision);
      return result.changes ? get(id) : { conflict: true };
    },
    call(id, revision) {
      const current = get(id);
      if (!current) return null;
      if (!Number.isInteger(revision) || revision !== current.revision) return { conflict: true };
      if (!current.phone) throw new Error('This contact has no phone number.');
      const calledOn = new Date().toISOString();
      db.exec('BEGIN IMMEDIATE');
      try {
        const result = db.prepare('UPDATE contacts SET data=?, revision=revision+1 WHERE id=? AND revision=?').run(JSON.stringify(validateContact({ ...current, calledOn })), id, revision);
        if (!result.changes) { db.exec('ROLLBACK'); return { conflict: true }; }
        db.prepare('INSERT INTO calls(contact_id,called_at) VALUES(?,?)').run(id, calledOn);
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
      return get(id);
    },
    history: id => db.prepare('SELECT called_at AS calledOn FROM calls WHERE contact_id=? ORDER BY id DESC').all(id),
    backup(destination) { db.exec('VACUUM INTO ' + "'" + destination.replaceAll("'", "''") + "'"); },
    close: () => db.close()
  };
}
