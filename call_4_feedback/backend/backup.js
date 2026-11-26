import { createStore } from './store.js';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
const directory = resolve(process.env.DATA_DIR || 'data');
mkdirSync(resolve(directory, 'backups'), { recursive: true });
const destination = resolve(directory, 'backups', `forseen-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`);
const store = createStore(resolve(directory, 'forseen.sqlite'));
try { store.backup(destination); console.log(destination); } finally { store.close(); }
