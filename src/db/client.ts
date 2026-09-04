import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Runtime data lives outside the OneDrive-synced repo — see "Development
 * environment" in docs/ARCHITECTURE.md. HEARTWORD_DATA_DIR overrides this
 * explicitly (see .env.example) for any machine/setup. Absent that, this
 * tries two defaults in order:
 *   1. The native Windows path Dan created (`C:\Users\danbr\HeartWordData`)
 *      — correct when this runs directly on Windows.
 *   2. `$HOME/mnt/HeartWordData` — correct when this runs inside a Claude
 *      Cowork/Code session bridged to Dan's computer, where that folder is
 *      reached through a per-session mount rather than its native path.
 * Resolved at call time (not module load) so HOME is read fresh each run
 * rather than baked into a constant — that mount path's absolute prefix is
 * specific to one session and isn't stable across sessions.
 */
function resolveDataDir(): string {
  if (process.env.HEARTWORD_DATA_DIR) return process.env.HEARTWORD_DATA_DIR;

  const windowsPath = "C:\\Users\\danbr\\HeartWordData";
  if (existsSync(windowsPath)) return windowsPath;

  const bridgedPath = process.env.HOME ? join(process.env.HOME, "mnt", "HeartWordData") : undefined;
  if (bridgedPath && existsSync(bridgedPath)) return bridgedPath;

  throw new Error(
    "Could not find HeartWordData. Set HEARTWORD_DATA_DIR explicitly (see .env.example)."
  );
}

const DATA_DIR = resolveDataDir();
const DB_DIR = join(DATA_DIR, "db");
const DB_PATH = join(DB_DIR, "heartword.sqlite");
const SCHEMA_PATH = join(__dirname, "schema.sql");

let db: DatabaseSync | undefined;

/**
 * Opens (and lazily initializes) the v1 SQLite database using Node's
 * built-in node:sqlite (stable enough for a single-user local tool, and
 * avoids native-module compilation entirely — see
 * docs/plans/CURRENT_GOAL.md for why that matters on this OneDrive-mounted
 * dev setup). Schema is applied with CREATE TABLE/INDEX IF NOT EXISTS (see
 * schema.sql), so this is safe to call on every server start.
 */
export function getDb(): DatabaseSync {
  if (db) return db;

  if (!existsSync(DB_DIR)) {
    mkdirSync(DB_DIR, { recursive: true });
  }

  db = new DatabaseSync(DB_PATH);
  // journal_mode=PERSIST, not the SQLite default (DELETE) or WAL:
  //   - WAL's mmap-based shared memory fails outright ("disk I/O error")
  //     over the network-style mount this dev shell reaches HeartWordData
  //     through, even though it's a plain local Windows folder, not
  //     OneDrive-synced.
  //   - The default DELETE journal mode fails too, for a different
  //     reason: it unlink()s the journal file after each commit, and this
  //     mount doesn't allow deletes without an explicit one-time grant
  //     (see AGENTS.md/_to_delete convention used throughout this repo).
  //   - PERSIST keeps the same crash-safety guarantee (a real journal file
  //     backs every write transaction) but truncates it to zero-length
  //     instead of deleting it, and truncate works fine here — so this is
  //     not a safety downgrade, just a mode that avoids an unsupported
  //     syscall on this particular mount.
  db.exec("PRAGMA journal_mode = PERSIST;");

  const schema = readFileSync(SCHEMA_PATH, "utf-8");
  db.exec(schema);

  return db;
}

export function getDataDir(): string {
  return DATA_DIR;
}
