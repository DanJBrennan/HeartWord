-- HeartWord v1 SQLite schema.
-- See docs/ARCHITECTURE.md's "Data model (v1)" for the entity rationale.
-- IDs are TEXT (UUIDv4-style); timestamps are INTEGER unix-epoch milliseconds.
-- Media files themselves live under HEARTWORD_DATA_DIR/assets/, referenced
-- here by path — never stored as blobs.

PRAGMA foreign_keys = ON;

-- One row per (language, book, chapter) production — the unit the
-- language/book/chapter navigation in docs/design/timeline.md selects.
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  language TEXT NOT NULL,
  book TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  stage TEXT NOT NULL DEFAULT 'ingestion',   -- current pipeline stage reached
  status TEXT NOT NULL DEFAULT 'not_started',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (language, book, chapter)
);

-- Canon character identity — one row per character concept (Jesus,
-- Matthew/Levi, "Friend 1, Mark 2", ...), independent of region or version.
CREATE TABLE characters (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('global','book','chapter')),
  scope_book TEXT,             -- set when scope_kind != 'global'
  scope_chapter INTEGER,       -- set when scope_kind = 'chapter'
  canon_status TEXT NOT NULL CHECK (canon_status IN ('candidate','approved','rejected')),
  region TEXT NOT NULL,        -- e.g. 'Papuan' — see canonical-characters.md;
                                -- a character's assets never cross regions
  legacy_identity_id TEXT,     -- provenance: the original BVET-Data
                                -- identityId, when imported from there
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_characters_scope ON characters(scope_kind, scope_book, scope_chapter);

-- Non-destructive version history for a character — the v2-candidate
-- workflow in canonical-characters.md. Approving a version never deletes
-- an earlier one.
CREATE TABLE character_versions (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES characters(id),
  version_label TEXT NOT NULL,      -- e.g. 'v1', 'v2-candidate'
  status TEXT NOT NULL CHECK (status IN ('candidate','approved','superseded','rejected')),
  voice_provider TEXT,              -- e.g. 'elevenlabs'
  voice_id TEXT,
  notes TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (character_id, version_label)
);
CREATE INDEX idx_character_versions_character ON character_versions(character_id);

-- Individual asset files (headshot, body/pose refs, motion clips) tied to a
-- specific character version. Category mirrors what BVET-Data already used
-- (References / Candidates / Versions; Portraits / Full Body / Motion).
CREATE TABLE character_assets (
  id TEXT PRIMARY KEY,
  character_version_id TEXT NOT NULL REFERENCES character_versions(id),
  category TEXT NOT NULL,           -- 'headshot' | 'body_pose' | 'motion_reference' | ...
  path TEXT NOT NULL,               -- path within HEARTWORD_DATA_DIR/assets
  content_hash TEXT,                -- sha256, for dedup/integrity (BVET-Data pattern)
  imported_from TEXT,               -- original path, if imported from BVET-Data
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_character_assets_version ON character_assets(character_version_id);

-- Scene/shot breakdown for a project (pipeline stages 2-3).
CREATE TABLE scenes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  sequence INTEGER NOT NULL,        -- ordering within the chapter
  verse_start TEXT NOT NULL,        -- e.g. 'Mark 2:1'
  verse_end TEXT NOT NULL,
  summary TEXT,
  reasoning TEXT,                   -- casting/direction reasoning log (AGENTS.md)
  created_at INTEGER NOT NULL,
  UNIQUE (project_id, sequence)
);

CREATE TABLE shots (
  id TEXT PRIMARY KEY,
  scene_id TEXT NOT NULL REFERENCES scenes(id),
  sequence INTEGER NOT NULL,
  action TEXT NOT NULL,             -- blocking/action decision
  status TEXT NOT NULL DEFAULT 'planned',
  created_at INTEGER NOT NULL,
  UNIQUE (scene_id, sequence)
);
CREATE INDEX idx_shots_scene ON shots(scene_id);

CREATE TABLE shot_characters (
  shot_id TEXT NOT NULL REFERENCES shots(id),
  character_id TEXT NOT NULL REFERENCES characters(id),
  PRIMARY KEY (shot_id, character_id)
);

-- One immutable row per paid provider call — Cost Governance in
-- PRODUCT_VISION.md. Never UPDATEd or DELETEd after insert.
CREATE TABLE generation_attempts (
  id TEXT PRIMARY KEY,
  shot_id TEXT NOT NULL REFERENCES shots(id),
  provider TEXT NOT NULL,           -- 'nano_banana' | 'nano_banana_pro' |
                                      -- 'veo_3_1_lite' | 'omni_1_1' | 'kling_avatar'
  model TEXT NOT NULL,
  operation TEXT NOT NULL,          -- 'generate' | 'generate_draft' |
                                      -- 'generate_guided' | 'edit_region' | 'lip_sync'
  resolution TEXT,                  -- '360p' | '720p' | '1080p' | NULL
  prompt TEXT,
  status TEXT NOT NULL CHECK (status IN ('accepted','retry_same','retry_modified','escalate','hold_for_review')),
  result_asset_path TEXT,
  cost_usd REAL NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_generation_attempts_shot ON generation_attempts(shot_id);

-- An accepted result placed on the timeline.
CREATE TABLE clips (
  id TEXT PRIMARY KEY,
  shot_id TEXT NOT NULL REFERENCES shots(id),
  generation_attempt_id TEXT NOT NULL REFERENCES generation_attempts(id),
  timeline_start_ms INTEGER NOT NULL,
  timeline_end_ms INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_clips_shot ON clips(shot_id);

-- Three-Layer Audio Architecture (PRODUCT_VISION.md).
CREATE TABLE audio_segments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  layer TEXT NOT NULL CHECK (layer IN ('original_reading','composite_cast_master','spaced_production')),
  source_path TEXT NOT NULL,
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL,
  speaker_character_id TEXT REFERENCES characters(id),   -- NULL for narration
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_audio_segments_project ON audio_segments(project_id);

CREATE TABLE tracks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  kind TEXT NOT NULL,               -- 'narration' | 'dialogue' | 'music' | 'sfx'
  muted INTEGER NOT NULL DEFAULT 0,
  volume REAL NOT NULL DEFAULT 1.0
);

-- Append-only edit history — undo/redo replays this (timeline.md), rather
-- than mutating a single current-state record.
CREATE TABLE edit_commands (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  sequence INTEGER NOT NULL,        -- position in this project's history
  command_type TEXT NOT NULL,       -- 'trim_clip' | 'move_clip' | 'mute_track' | ...
  payload TEXT NOT NULL,            -- JSON
  idempotency_key TEXT NOT NULL UNIQUE,
  applied_at INTEGER NOT NULL,
  undone INTEGER NOT NULL DEFAULT 0,
  UNIQUE (project_id, sequence)
);

-- Append-only; a project's running cost total is SUM(amount_usd) here.
CREATE TABLE cost_ledger_entries (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  generation_attempt_id TEXT REFERENCES generation_attempts(id),
  amount_usd REAL NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_cost_ledger_project ON cost_ledger_entries(project_id);

-- A held-for-review flag from QC (stage 7) or a human note.
CREATE TABLE review_notes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  subject_type TEXT NOT NULL CHECK (subject_type IN ('shot','clip','character_version')),
  subject_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('qc','human')),
  note TEXT NOT NULL,
  resolved INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_review_notes_project ON review_notes(project_id);
