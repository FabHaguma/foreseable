// Maintainer utility. The workbook is only used to prepare the initial dataset.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { encryptInitialData } from '../backend/initial-data.js';
const appRoot = fileURLToPath(new URL('../', import.meta.url));
const envPath = fileURLToPath(new URL('../../.env', import.meta.url));
let env = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
let key = /^INITIAL_DATA_KEY=([a-f0-9]{64})\s*$/m.exec(env)?.[1];
if (!key) { key = randomBytes(32).toString('hex'); env += `\nINITIAL_DATA_KEY=${key}\n`; }
if (!/^APP_PASSWORD=.+$/m.test(env)) env += `APP_PASSWORD=${randomBytes(18).toString('base64url')}\n`;
writeFileSync(envPath, env.trim() + '\n', { mode: 0o600 });
const contacts = JSON.parse(readFileSync(appRoot + 'data/initial-contacts.json', 'utf8'));
mkdirSync(appRoot + '../private-data', { recursive: true });
writeFileSync(appRoot + '../private-data/initial-contacts.enc', JSON.stringify(encryptInitialData(contacts, key)) + '\n', { mode: 0o600 });
console.log(`Encrypted ${contacts.length} starting contacts. The key and workspace password are in the ignored root .env file.`);
