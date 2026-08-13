import {Database} from "bun:sqlite";
import {mkdirSync} from "node:fs";
import {join, resolve} from "node:path";

const schema = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  schemaVersion INTEGER NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  workspace TEXT NOT NULL,
  agent TEXT NOT NULL,
  model TEXT NOT NULL,
  playwrightSession TEXT NOT NULL,
  status TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sessionId TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_by_session ON events (sessionId, id);
CREATE TABLE IF NOT EXISTS session_leases (
  sessionId TEXT PRIMARY KEY,
  ownerId TEXT NOT NULL,
  processId INTEGER NOT NULL,
  acquiredAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS codebase_profiles (
  path TEXT PRIMARY KEY,
  learnedAt TEXT NOT NULL,
  sourceKind TEXT NOT NULL,
  summary TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS codebase_profile_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL,
  category TEXT NOT NULL,
  content TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS codebase_entries_by_path ON codebase_profile_entries (path, id);
`;

const openDatabases = new Map<string, Database>();

function ensureSessionColumns(database: Database): void {
  const columns = new Set(
    (
      database.query("PRAGMA table_info(sessions)").all() as Array<{
        name: string;
      }>
    ).map(column => column.name)
  );
  if (!columns.has("providerSessionId")) {
    database.exec("ALTER TABLE sessions ADD COLUMN providerSessionId TEXT;");
  }
  if (!columns.has("baseUrl")) {
    database.exec("ALTER TABLE sessions ADD COLUMN baseUrl TEXT;");
  }
  if (!columns.has("resumeCount")) {
    database.exec(
      "ALTER TABLE sessions ADD COLUMN resumeCount INTEGER NOT NULL DEFAULT 0;"
    );
  }
  if (!columns.has("redactionCount")) {
    database.exec(
      "ALTER TABLE sessions ADD COLUMN redactionCount INTEGER NOT NULL DEFAULT 0;"
    );
  }
  if (!columns.has("redactionVerifiers")) {
    database.exec("ALTER TABLE sessions ADD COLUMN redactionVerifiers TEXT;");
  }
}

export function openSessionDatabase(storageDir: string): Database {
  const key = resolve(storageDir);
  const existing = openDatabases.get(key);
  if (existing) return existing;
  mkdirSync(key, {recursive: true});
  const database = new Database(join(key, "parterre.db"));
  database.exec("PRAGMA journal_mode = WAL;");
  database.exec(schema);
  ensureSessionColumns(database);
  openDatabases.set(key, database);
  return database;
}

export function closeSessionDatabase(storageDir: string): void {
  const key = resolve(storageDir);
  const database = openDatabases.get(key);
  if (!database) return;
  try {
    database.close();
  } finally {
    openDatabases.delete(key);
  }
}

export function closeAllSessionDatabases(): void {
  const databases = Array.from(openDatabases.values());
  openDatabases.clear();
  for (const database of databases) database.close();
}
