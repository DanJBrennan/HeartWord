-- HeartWord v1 SQLite schema.
-- See docs/ARCHITECTURE.md's "Data model (v1)" for the entity rationale.
-- IDs are TEXT (UUIDv4-style); timestamps are INTEGER unix-epoch milliseconds.
-- Media files themselves live under HEARTWORD_DATA_DIR/assets/, referenced
-- here by path — never stored as blobs.

PRAGMA foreign_keys = ON;

-- One row per (language, book, chapter) production — the unit the
-- language/book/chapter navigation in docs/design/timeline.md selects.
CREATE TABLE IF NOT EXISTS projects (
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

-- A reusable set of 4+ visually distinct character designs meant to be
-- cast (and repeated/"cloned") together to fill out a crowd, rather than
-- named individuals in their own right -- e.g. "Mark Pharisees and
-- Scribes", "Mark Crowd Witnesses". Mirrors the Global/Book/Chapter scope
-- shape of `characters` itself, and the Global Character Library / per-book
-- Character Library split already established in the source comic canon
-- (OpenAI-Code Comics) -- see docs/design/canonical-characters.md's
-- "Character Groups" section.
CREATE TABLE IF NOT EXISTS character_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('global','book','chapter')),
  scope_book TEXT,
  scope_chapter INTEGER,
  notes TEXT,                  -- e.g. how many distinct member designs exist
                                -- vs. the 4+ target -- see character-tool.md's
                                -- Gap Detection for an incomplete group
  created_at INTEGER NOT NULL
);

-- Canon character identity — one row per character concept (Jesus,
-- Matthew/Levi, "Friend 1, Mark 2", ...), independent of region or version.
CREATE TABLE IF NOT EXISTS characters (
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
  group_id TEXT REFERENCES character_groups(id),  -- set only for a member of
                                -- a character group (see above); NULL for a
                                -- named individual like Jesus or a disciple
  is_spokesperson INTEGER NOT NULL DEFAULT 0,  -- at most one TRUE per
                                -- group_id (enforced by the unique index
                                -- below) -- the member who gets voice-mapped
                                -- and lip-synced when the group needs a line;
                                -- other members may still appear making
                                -- non-verbal utterances (a shot's action
                                -- text can say so) without their own voice
                                -- mapping -- see PRODUCT_VISION.md's Canon
                                -- Builder and Voice Approval
  joined_narrative_at TEXT,    -- e.g. 'Mark 1:16' -- for a disciple whose
                                -- entrance into the story is a specific
                                -- calling verse, the earliest reference at
                                -- which they're part of "the disciples" and
                                -- should be offered to stage 3 (casting) for
                                -- any scene at or after this point. NULL for
                                -- a character not gated by a calling moment
                                -- (Jesus, one-chapter characters, group
                                -- members). See casting/disciple-timeline.ts.
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_characters_scope ON characters(scope_kind, scope_book, scope_chapter);
-- idx_characters_group and idx_one_spokesperson_per_group are created in
-- src/db/client.ts, AFTER the column migrations run, not here -- both
-- reference group_id/is_spokesperson, which an already-existing database
-- (like Dan's real Mark 2 project) doesn't have until the migration below
-- adds them, and CREATE INDEX fails immediately if the column doesn't
-- exist yet (unlike CREATE TABLE IF NOT EXISTS, which just no-ops).

-- Non-destructive version history for a character — the v2-candidate
-- workflow in canonical-characters.md. Approving a version never deletes
-- an earlier one.
CREATE TABLE IF NOT EXISTS character_versions (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES characters(id),
  version_label TEXT NOT NULL,      -- e.g. 'v1', 'v2-candidate'
  status TEXT NOT NULL CHECK (status IN ('candidate','approved','superseded','rejected')),
  voice_provider TEXT,              -- e.g. 'elevenlabs'; NULL for a
  voice_id TEXT,                    -- character with no spoken lines
  notes TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (character_id, version_label)
);
CREATE INDEX IF NOT EXISTS idx_character_versions_character ON character_versions(character_id);

-- Individual asset files (headshot, body/pose refs, motion clips) tied to a
-- specific character version. Category mirrors what BVET-Data already used
-- (References / Candidates / Versions; Portraits / Full Body / Motion).
CREATE TABLE IF NOT EXISTS character_assets (
  id TEXT PRIMARY KEY,
  character_version_id TEXT NOT NULL REFERENCES character_versions(id),
  category TEXT NOT NULL,           -- 'headshot' | 'body_pose' | 'motion_reference' | ...
  path TEXT NOT NULL,               -- path within HEARTWORD_DATA_DIR/assets
  content_hash TEXT,                -- sha256, for dedup/integrity (BVET-Data pattern)
  imported_from TEXT,               -- original path, if imported from BVET-Data
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_character_assets_version ON character_assets(character_version_id);

-- Scene/shot breakdown for a project (pipeline stages 2-3).
CREATE TABLE IF NOT EXISTS scenes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  sequence INTEGER NOT NULL,        -- ordering within the chapter
  verse_start TEXT NOT NULL,        -- e.g. 'Mark 2:1'
  verse_end TEXT NOT NULL,
  summary TEXT,
  reasoning TEXT,                   -- casting/direction reasoning log (AGENTS.md)
  lighting_continuity TEXT,         -- one-scene lighting/setting descriptor
                                     -- (time of day, light source, interior/
                                     -- exterior) -- set by stage 3 (casting)
                                     -- and threaded into every shot's stage-4
                                     -- generation prompt, so a scene's shots
                                     -- share one lighting decision instead of
                                     -- each reinventing it and drifting
  created_at INTEGER NOT NULL,
  UNIQUE (project_id, sequence)
);

CREATE TABLE IF NOT EXISTS shots (
  id TEXT PRIMARY KEY,
  scene_id TEXT NOT NULL REFERENCES scenes(id),
  sequence INTEGER NOT NULL,
  action TEXT NOT NULL,             -- blocking/action decision
  verse_ref TEXT,                   -- e.g. 'Mark 2:5-7' -- which verse(s) this
                                     -- shot depicts; grounds dialogue-duration
                                     -- lookups against audio_segments
  framing TEXT,                     -- 'wide' | 'medium_wide' | 'medium' |
                                     -- 'medium_close' | 'close_up' | 'insert'
                                     -- -- see src/pipeline/casting/coverage.ts
  camera_movement TEXT,             -- 'static' | 'push_in' | 'pull_out' |
                                     -- 'pan_left' | 'pan_right' | 'tracking' |
                                     -- 'handheld_follow'
  needs_lip_sync INTEGER NOT NULL DEFAULT 0,  -- shot carries on-camera dialogue
                                     -- Kling's Avatar API must lip-sync;
                                     -- forces framing to medium_close/
                                     -- close_up/insert (coverage.ts)
  dialogue_character_id TEXT REFERENCES characters(id),  -- whose mouth needs
                                     -- to sync, when needs_lip_sync = 1
  coverage_plan TEXT NOT NULL DEFAULT 'single_clip',  -- 'single_clip' |
                                     -- 'covered_sequence' -- set when this
                                     -- shot's real dialogue duration is too
                                     -- long for one generated clip
  coverage_notes TEXT,              -- human-readable coverage breakdown when
                                     -- coverage_plan = 'covered_sequence'
  crowd_density TEXT,                -- 'empty' | 'sparse' | 'moderate' | 'packed'
                                     -- -- how full the location should read,
                                     -- grounded in the verse text (e.g. Mark
                                     -- 2:2's "no room, not even at the door"
                                     -- demands 'packed', not left to media
                                     -- generation to guess from prose alone)
  continuity_notes TEXT,             -- objects/props/physical states that
                                     -- must (or must not) appear in this shot
                                     -- to stay consistent with the rest of
                                     -- the scene -- e.g. "roof intact, not
                                     -- yet opened" for a shot before the
                                     -- roof-opening event, "opening now
                                     -- visible" after. NULL when nothing
                                     -- scene-specific applies.
  status TEXT NOT NULL DEFAULT 'planned',
  created_at INTEGER NOT NULL,
  UNIQUE (scene_id, sequence)
);
CREATE INDEX IF NOT EXISTS idx_shots_scene ON shots(scene_id);

CREATE TABLE IF NOT EXISTS shot_characters (
  shot_id TEXT NOT NULL REFERENCES shots(id),
  character_id TEXT NOT NULL REFERENCES characters(id),
  PRIMARY KEY (shot_id, character_id)
);

-- One immutable row per paid provider call — Cost Governance in
-- PRODUCT_VISION.md. Never UPDATEd or DELETEd after insert.
CREATE TABLE IF NOT EXISTS generation_attempts (
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
CREATE INDEX IF NOT EXISTS idx_generation_attempts_shot ON generation_attempts(shot_id);

-- A planned (not yet generated) piece of a covered_sequence shot's L-cut
-- coverage map -- see src/pipeline/casting/coverage-manifest.ts. Distinct
-- from `clips`: a clip is an ACCEPTED result already placed on the
-- timeline, whereas a coverage_beats row exists before any generation
-- call, describing what should be generated and under which slice of the
-- shot's dialogue audio it will sit once accepted. A beat's audio range
-- is initially a proportional estimate (audio_confidence NULL or low),
-- refined against real phrase/silence boundaries before generation --
-- the same "structurally correct now, confidence capped pending
-- refinement" pattern used for verse-group boundaries in
-- src/pipeline/ingestion/select-boundaries.ts. Regenerating a shot's plan
-- replaces every beat still in 'planned' status (never one already
-- 'generated' or 'accepted') -- see build-coverage-manifest.ts.
CREATE TABLE IF NOT EXISTS coverage_beats (
  id TEXT PRIMARY KEY,
  shot_id TEXT NOT NULL REFERENCES shots(id),
  sequence INTEGER NOT NULL,        -- 1-based position within this shot's coverage map
  beat_type TEXT NOT NULL CHECK (beat_type IN ('master','lip_sync_insert','cutaway')),
  audio_start_ms INTEGER NOT NULL,  -- offset from the start of the shot's
  audio_end_ms INTEGER NOT NULL,    -- dialogue audio, not the project timeline
  audio_confidence INTEGER,         -- 0-100, like audio_segments.confidence;
                                     -- NULL/low until refined against real
                                     -- silence/phrase boundaries
  needs_lip_sync INTEGER NOT NULL DEFAULT 0,
  character_id TEXT REFERENCES characters(id),  -- who's on camera; NULL for
                                     -- a master/cutaway until a human or
                                     -- Codex picks the reaction subject
  requires_new_keyframe INTEGER NOT NULL DEFAULT 1,  -- false only for a
                                     -- lip-sync insert reusing the shot's
                                     -- already-approved keyframe as anchor
  keyframe_asset_path TEXT,         -- set once a keyframe exists for this beat
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','generated','accepted')),
  created_at INTEGER NOT NULL,
  UNIQUE (shot_id, sequence)
);
CREATE INDEX IF NOT EXISTS idx_coverage_beats_shot ON coverage_beats(shot_id);

-- Immutable candidate history for a coverage beat.  `coverage_beats` retains
-- the currently selected candidate path so downstream video stages have one
-- simple anchor; this table retains every submitted still when a producer
-- requests a regeneration.
CREATE TABLE IF NOT EXISTS coverage_keyframe_attempts (
  id TEXT PRIMARY KEY,
  coverage_beat_id TEXT NOT NULL REFERENCES coverage_beats(id),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt TEXT,
  status TEXT NOT NULL CHECK (status IN ('accepted','retry_same','retry_modified','escalate','hold_for_review')),
  result_asset_path TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_coverage_keyframe_attempts_beat ON coverage_keyframe_attempts(coverage_beat_id, created_at);

-- An accepted result placed on the timeline.
CREATE TABLE IF NOT EXISTS clips (
  id TEXT PRIMARY KEY,
  shot_id TEXT NOT NULL REFERENCES shots(id),
  generation_attempt_id TEXT NOT NULL REFERENCES generation_attempts(id),
  timeline_start_ms INTEGER NOT NULL,
  timeline_end_ms INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_clips_shot ON clips(shot_id);

-- Three-Layer Audio Architecture (PRODUCT_VISION.md).
CREATE TABLE IF NOT EXISTS audio_segments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  layer TEXT NOT NULL CHECK (layer IN ('original_reading','composite_cast_master','spaced_production')),
  source_path TEXT NOT NULL,
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL,
  speaker_character_id TEXT REFERENCES characters(id),   -- NULL for narration
  verse_ref TEXT,            -- e.g. 'Mark 2:1-5'; set by ingestion for the
                             -- 'original_reading' layer, NULL for the other
                             -- two layers (they're keyed by shot/clip instead)
  confidence INTEGER,        -- 0-100 assurance score for this segment's
                             -- timing (PRODUCT_VISION.md's Source Material
                             -- Validator scoring model); NULL where a
                             -- boundary is certain rather than estimated
                             -- (e.g. the chapter's very first/last segment)
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audio_segments_project ON audio_segments(project_id);

CREATE TABLE IF NOT EXISTS tracks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  kind TEXT NOT NULL,               -- 'narration' | 'dialogue' | 'music' | 'sfx'
  muted INTEGER NOT NULL DEFAULT 0,
  volume REAL NOT NULL DEFAULT 1.0
);

-- Append-only edit history — undo/redo replays this (timeline.md), rather
-- than mutating a single current-state record.
CREATE TABLE IF NOT EXISTS edit_commands (
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
CREATE TABLE IF NOT EXISTS cost_ledger_entries (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  generation_attempt_id TEXT REFERENCES generation_attempts(id),
  amount_usd REAL NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cost_ledger_project ON cost_ledger_entries(project_id);

-- A held-for-review flag from QC (stage 7) or a human note.
CREATE TABLE IF NOT EXISTS review_notes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  subject_type TEXT NOT NULL CHECK (subject_type IN ('shot','clip','character_version','audio_segment','project')),
  subject_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('qc','human')),
  note TEXT NOT NULL,
  resolved INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_review_notes_project ON review_notes(project_id);
