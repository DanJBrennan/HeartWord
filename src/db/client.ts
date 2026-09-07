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
  applyColumnMigrations(db);

  // These two indexes reference characters.group_id/is_spokesperson, which
  // only exist after applyColumnMigrations runs on an already-existing
  // database -- see the comment in schema.sql where these used to live.
  db.exec(`CREATE INDEX IF NOT EXISTS idx_characters_group ON characters(group_id);`);
  db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_one_spokesperson_per_group
       ON characters(group_id) WHERE is_spokesperson = 1;`
  );

  return db;
}

/**
 * Additive column migrations for tables that already existed before a
 * schema change. schema.sql's `CREATE TABLE IF NOT EXISTS` only takes
 * effect on a brand-new database -- an already-existing table (like Dan's
 * real Mark 2 project data) never picks up a newly added column from it.
 * Each entry here is checked against `PRAGMA table_info` before running,
 * so this is idempotent and safe to call on every server start alongside
 * the schema above. A fresh database already has every column from
 * schema.sql's CREATE TABLE, so every check here is a no-op for it.
 */
const COLUMN_MIGRATIONS: Array<{ table: string; column: string; ddl: string }> = [
  { table: "scenes", column: "lighting_continuity", ddl: "ALTER TABLE scenes ADD COLUMN lighting_continuity TEXT" },
  { table: "shots", column: "verse_ref", ddl: "ALTER TABLE shots ADD COLUMN verse_ref TEXT" },
  { table: "shots", column: "framing", ddl: "ALTER TABLE shots ADD COLUMN framing TEXT" },
  { table: "shots", column: "camera_movement", ddl: "ALTER TABLE shots ADD COLUMN camera_movement TEXT" },
  {
    table: "shots",
    column: "needs_lip_sync",
    ddl: "ALTER TABLE shots ADD COLUMN needs_lip_sync INTEGER NOT NULL DEFAULT 0"
  },
  {
    table: "shots",
    column: "dialogue_character_id",
    ddl: "ALTER TABLE shots ADD COLUMN dialogue_character_id TEXT REFERENCES characters(id)"
  },
  {
    table: "shots",
    column: "coverage_plan",
    ddl: "ALTER TABLE shots ADD COLUMN coverage_plan TEXT NOT NULL DEFAULT 'single_clip'"
  },
  { table: "shots", column: "coverage_notes", ddl: "ALTER TABLE shots ADD COLUMN coverage_notes TEXT" },
  { table: "shots", column: "crowd_density", ddl: "ALTER TABLE shots ADD COLUMN crowd_density TEXT" },
  { table: "shots", column: "continuity_notes", ddl: "ALTER TABLE shots ADD COLUMN continuity_notes TEXT" },
  { table: "characters", column: "group_id", ddl: "ALTER TABLE characters ADD COLUMN group_id TEXT REFERENCES character_groups(id)" },
  {
    table: "characters",
    column: "is_spokesperson",
    ddl: "ALTER TABLE characters ADD COLUMN is_spokesperson INTEGER NOT NULL DEFAULT 0"
  },
  {
    table: "characters",
    column: "joined_narrative_at",
    ddl: "ALTER TABLE characters ADD COLUMN joined_narrative_at TEXT"
  }
];

function applyColumnMigrations(db: DatabaseSync): void {
  for (const migration of COLUMN_MIGRATIONS) {
    const columns = db.prepare(`PRAGMA table_info(${migration.table})`).all() as Array<{ name: string }>;
    if (!columns.some((c) => c.name === migration.column)) {
      db.exec(migration.ddl);
    }
  }
}

export function getDataDir(): string {
  return DATA_DIR;
}
