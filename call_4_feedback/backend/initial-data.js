import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function keyBytes(key) {
  if (!/^[a-f0-9]{64}$/i.test(key || '')) throw new Error('INITIAL_DATA_KEY must be the 64-character key from your private .env file.');
  return Buffer.from(key, 'hex');
}
export function encryptInitialData(contacts, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyBytes(key), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(contacts), 'utf8'), cipher.final()]);
  return { version: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: encrypted.toString('base64') };
}
export function decryptInitialData(envelope, key) {
  if (envelope.version !== 1) throw new Error('Unsupported initial data version.');
  const decipher = createDecipheriv('aes-256-gcm', keyBytes(key), Buffer.from(envelope.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  try { return JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64')), decipher.final()]).toString('utf8')); }
  catch { throw new Error('Could not unlock the starting contacts. Use INITIAL_DATA_KEY from your original private .env file.'); }
}
