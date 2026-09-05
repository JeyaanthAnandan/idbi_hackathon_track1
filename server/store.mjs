import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DATA_DIR = path.resolve(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'mitra.json');
const EMPTY = { users: {}, sessions: {}, audit: [], adviceReceipts: [] };
let queue = Promise.resolve();

async function load() {
  try {
    return { ...EMPTY, ...JSON.parse(await readFile(DATA_FILE, 'utf8')) };
  } catch (error) {
    if (error.code === 'ENOENT') return structuredClone(EMPTY);
    throw error;
  }
}

async function save(db) {
  await mkdir(DATA_DIR, { recursive: true });
  const temp = `${DATA_FILE}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(db, null, 2)}\n`, { mode: 0o600 });
  await rename(temp, DATA_FILE);
}

export function readStore(fn) {
  return queue.then(async () => fn(await load()));
}

export function updateStore(fn) {
  const operation = queue.then(async () => {
    const db = await load();
    const result = await fn(db);
    await save(db);
    return result;
  });
  queue = operation.catch(() => {});
  return operation;
}

export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  return { salt, hash: scryptSync(password, salt, 64).toString('hex') };
}

export function passwordMatches(password, user) {
  const actual = Buffer.from(hashPassword(password, user.passwordSalt).hash, 'hex');
  const expected = Buffer.from(user.passwordHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export const tokenHash = (token) => createHash('sha256').update(token).digest('hex');
export const newId = (prefix) => `${prefix}_${randomBytes(12).toString('hex')}`;
export const newToken = () => randomBytes(32).toString('base64url');

export function publicSession(user) {
  return { id: user.id, name: user.name, email: user.email };
}

export function audit(db, userId, event, detail = {}) {
  db.audit.push({ id: newId('aud'), userId, event, detail, at: new Date().toISOString() });
  if (db.audit.length > 2000) db.audit = db.audit.slice(-2000);
}
