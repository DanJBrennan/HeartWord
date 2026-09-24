import { createRequire } from "node:module";
// Vite 5 predates node:sqlite. Load the built-in through Node itself so
// DB-backed stage tests and the server use the same implementation.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
type DatabaseSync = import("node:sqlite").DatabaseSync;
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

const SCHEMA_PATH = join(__dirname, "schema.sql");

let db: DatabaseSync | undefined;
let openedDataDir: string | undefined;

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
  const dataDir = resolveDataDir();
  const dbDir = join(dataDir, "db");

  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  db = new DatabaseSync(join(dbDir, "heartword.sqlite"));
  openedDataDir = dataDir;
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
  migrateMediaLibraryStandaloneOrigins(db);
  db.exec("CREATE INDEX IF NOT EXISTS idx_media_library_items_location ON media_library_items(location, library_status);");

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
  { table: "production_runs", column: "worker_pid", ddl: "ALTER TABLE production_runs ADD COLUMN worker_pid INTEGER" },
  { table: "creative_direction_proposals", column: "context_json", ddl: "ALTER TABLE creative_direction_proposals ADD COLUMN context_json TEXT" },
  { table: "scenes", column: "lighting_continuity", ddl: "ALTER TABLE scenes ADD COLUMN lighting_continuity TEXT" },
  { table: "scenes", column: "spatial_continuity", ddl: "ALTER TABLE scenes ADD COLUMN spatial_continuity TEXT" },
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
  { table: "shots", column: "spatial_view", ddl: "ALTER TABLE shots ADD COLUMN spatial_view TEXT" },
  { table: "character_versions", column: "locked_visual_facts", ddl: "ALTER TABLE character_versions ADD COLUMN locked_visual_facts TEXT" },
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
  },
  { table: "production_lessons", column: "source_language", ddl: "ALTER TABLE production_lessons ADD COLUMN source_language TEXT" },
  { table: "production_lessons", column: "source_book", ddl: "ALTER TABLE production_lessons ADD COLUMN source_book TEXT" },
  { table: "production_lessons", column: "source_chapter", ddl: "ALTER TABLE production_lessons ADD COLUMN source_chapter INTEGER" },
  { table: "production_lessons", column: "source_region", ddl: "ALTER TABLE production_lessons ADD COLUMN source_region TEXT" }
  ,{ table: "evaluation_predictions", column: "content_hash", ddl: "ALTER TABLE evaluation_predictions ADD COLUMN content_hash TEXT NOT NULL DEFAULT ''" }
  ,{ table: "source_alignment_editorial_classifications", column: "film_treatment", ddl: "ALTER TABLE source_alignment_editorial_classifications ADD COLUMN film_treatment TEXT" }
  ,{ table: "character_assets", column: "story_state", ddl: "ALTER TABLE character_assets ADD COLUMN story_state TEXT" }
  ,{ table: "character_assets", column: "available_from_verse", ddl: "ALTER TABLE character_assets ADD COLUMN available_from_verse TEXT" }
  ,{ table: "character_assets", column: "available_through_verse", ddl: "ALTER TABLE character_assets ADD COLUMN available_through_verse TEXT" }
  ,{ table: "character_assets", column: "asset_role", ddl: "ALTER TABLE character_assets ADD COLUMN asset_role TEXT NOT NULL DEFAULT 'scene_reference'" }
];

function applyColumnMigrations(db: DatabaseSync): void {
  for (const migration of COLUMN_MIGRATIONS) {
    const columns = db.prepare(`PRAGMA table_info(${migration.table})`).all() as Array<{ name: string }>;
    if (!columns.some((c) => c.name === migration.column)) {
      db.exec(migration.ddl);
    }
  }
}

/** SQLite cannot drop NOT NULL in place; retain old rows and candidate FKs. */
export function migrateMediaLibraryStandaloneOrigins(db: DatabaseSync): void {
  const columns = db.prepare("PRAGMA table_info(media_library_items)").all() as Array<{name:string; notnull:number}>;
  if (columns.some(c => c.name === "title") && columns.find(c => c.name === "shot_id")?.notnull === 0) return;
  db.exec("PRAGMA foreign_keys=OFF");
  try {
    db.exec(`BEGIN;
      CREATE TABLE media_library_items_new (
        id TEXT PRIMARY KEY,
        generation_attempt_id TEXT UNIQUE REFERENCES generation_attempts(id),
        project_id TEXT REFERENCES projects(id),
        shot_id TEXT REFERENCES shots(id),
        kind TEXT NOT NULL CHECK (kind IN ('image','video','frame')),
        asset_path TEXT NOT NULL UNIQUE,
        parent_item_id TEXT REFERENCES media_library_items(id),
        parent_time_ms INTEGER,
        title TEXT,
        location TEXT,
        tags_json TEXT,
        library_status TEXT NOT NULL DEFAULT 'retained' CHECK (library_status IN ('retained','reusable_reference')),
        provenance_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        CHECK ((project_id IS NULL AND shot_id IS NULL) OR (project_id IS NOT NULL AND shot_id IS NOT NULL))
      );
      INSERT INTO media_library_items_new (id,generation_attempt_id,project_id,shot_id,kind,asset_path,parent_item_id,parent_time_ms,provenance_json,created_at)
        SELECT id,generation_attempt_id,project_id,shot_id,kind,asset_path,parent_item_id,parent_time_ms,provenance_json,created_at FROM media_library_items;
      DROP TABLE media_library_items;
      ALTER TABLE media_library_items_new RENAME TO media_library_items;
      CREATE INDEX IF NOT EXISTS idx_media_library_items_lookup ON media_library_items(kind, project_id, shot_id, created_at);
      COMMIT;`);
    const issues = db.prepare("PRAGMA foreign_key_check").all();
    if (issues.length) throw new Error("Media library migration found broken foreign keys.");
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch { /* transaction may have committed */ }
    throw error;
  } finally {
    db.exec("PRAGMA foreign_keys=ON");
  }
}

export function getDataDir(): string {
  return openedDataDir ?? resolveDataDir();
}
