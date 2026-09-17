-- HeartWord v1 SQLite schema.
-- See docs/ARCHITECTURE.md's "Data model (v1)" for the entity rationale.
-- IDs are TEXT (UUIDv4-style); timestamps are INTEGER unix-epoch milliseconds.
-- Media files themselves live under HEARTWORD_DATA_DIR/assets/, referenced
-- here by path — never stored as blobs.

PRAGMA foreign_keys = ON;

-- Immutable filmmaking briefs/results and append-only role exchanges.
CREATE TABLE IF NOT EXISTS production_runs (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
  phase TEXT NOT NULL CHECK (phase IN ('planning','editing','finishing')),
  brief_hash TEXT NOT NULL, brief_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running','approved','awaiting_assets','held','incomplete')),
  result_json TEXT, created_at INTEGER NOT NULL, completed_at INTEGER, worker_pid INTEGER
);
CREATE INDEX IF NOT EXISTS idx_production_runs_project ON production_runs(project_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_running_crew ON production_runs(project_id) WHERE status='running';
CREATE TABLE IF NOT EXISTS production_events (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES production_runs(id),
  sequence INTEGER NOT NULL, role TEXT NOT NULL, round INTEGER NOT NULL,
  prompt TEXT NOT NULL, output_json TEXT, error TEXT, model TEXT NOT NULL,
  cost_usd REAL, created_at INTEGER NOT NULL, UNIQUE(run_id, sequence)
);
CREATE TABLE IF NOT EXISTS production_audio_assets (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
  kind TEXT NOT NULL CHECK (kind IN ('music','sfx')), description TEXT NOT NULL,
  path TEXT NOT NULL, sha256 TEXT NOT NULL, duration_ms INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS soundtrack_attempts (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
  run_id TEXT NOT NULL REFERENCES production_runs(id), request_key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL, request_json TEXT NOT NULL, status TEXT NOT NULL,
  provider TEXT, model TEXT, path TEXT, usage_json TEXT, cost_usd REAL,
  review_json TEXT, error TEXT, created_at INTEGER NOT NULL
);
-- The timeline and audio provenance used by a particular immutable render.
CREATE TABLE IF NOT EXISTS chapter_render_manifests (
  render_id TEXT PRIMARY KEY REFERENCES chapter_renders(id),
  timeline_json TEXT NOT NULL, source_audio_json TEXT NOT NULL
);

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

-- Durable orchestration ledger.  This is deliberately local and single-worker:
-- it records exactly what was started before a provider call can be made, so an
-- interrupted desktop run can be reconciled instead of blindly repeated.
CREATE TABLE IF NOT EXISTS stage_executions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  stage TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  dependency_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running','completed','held','failed','uncertain')),
  attempt INTEGER NOT NULL,
  reason TEXT NOT NULL,
  output_json TEXT,
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  worker_token TEXT NOT NULL,
  UNIQUE(project_id, stage, attempt)
);
CREATE INDEX IF NOT EXISTS idx_stage_executions_lookup ON stage_executions(project_id, stage, status, started_at);

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

-- Producer-confirmed speech identity for an on-camera speaking shot. A verse
-- is intentionally insufficient: one speaker may have several utterances in
-- it. The bound source interval is immutable evidence for voicing, lip sync
-- and assembly; changing it creates a new binding rather than guessing.
CREATE TABLE IF NOT EXISTS shot_utterance_bindings (
  id TEXT PRIMARY KEY, shot_id TEXT NOT NULL UNIQUE REFERENCES shots(id),
  source_audio_segment_id TEXT NOT NULL REFERENCES audio_segments(id),
  source_start_ms INTEGER NOT NULL, source_end_ms INTEGER NOT NULL,
  character_version_id TEXT NOT NULL REFERENCES character_versions(id),
  source_hash TEXT NOT NULL, approved_at INTEGER NOT NULL, approved_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shot_utterance_source ON shot_utterance_bindings(source_audio_segment_id);

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

-- A durable, non-destructive browse/retrieval projection over generated takes.
-- The original generation_attempts row and its file remain the authority;
-- this table only adds stable discovery, optional extracted-frame lineage, and
-- a snapshot of the provenance that a later retrieval agent may inspect.
CREATE TABLE IF NOT EXISTS media_library_items (
  id TEXT PRIMARY KEY,
  generation_attempt_id TEXT UNIQUE REFERENCES generation_attempts(id),
  project_id TEXT NOT NULL REFERENCES projects(id),
  shot_id TEXT NOT NULL REFERENCES shots(id),
  kind TEXT NOT NULL CHECK (kind IN ('image','video','frame')),
  asset_path TEXT NOT NULL UNIQUE,
  parent_item_id TEXT REFERENCES media_library_items(id),
  parent_time_ms INTEGER,
  provenance_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_media_library_items_lookup ON media_library_items(kind, project_id, shot_id, created_at);

-- Selecting a library item never replaces the donor or target take. It is a
-- reviewable reference candidate for an existing target shot.
CREATE TABLE IF NOT EXISTS media_reuse_candidates (
  id TEXT PRIMARY KEY,
  library_item_id TEXT NOT NULL REFERENCES media_library_items(id),
  target_shot_id TEXT NOT NULL REFERENCES shots(id),
  status TEXT NOT NULL CHECK (status IN ('candidate','dismissed','approved_for_generation')) DEFAULT 'candidate',
  note TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (library_item_id, target_shot_id)
);
CREATE INDEX IF NOT EXISTS idx_media_reuse_candidates_target ON media_reuse_candidates(target_shot_id, status);

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

-- Maps a current composite clip back to the exact original interval it
-- preserved. This avoids ambiguous speaker/verse lookup during lip sync.
CREATE TABLE IF NOT EXISTS composite_audio_source_map (
  composite_segment_id TEXT PRIMARY KEY REFERENCES audio_segments(id),
  original_segment_id TEXT NOT NULL REFERENCES audio_segments(id),
  source_hash TEXT NOT NULL, voice_version_id TEXT REFERENCES character_versions(id),
  created_at INTEGER NOT NULL
);

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

-- Named human attestation for a specific immutable source/audio alignment.
CREATE TABLE IF NOT EXISTS source_alignment_reviews (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), reviewer_name TEXT NOT NULL,
  reviewer_attestation TEXT NOT NULL, source_hash TEXT NOT NULL, alignment_hash TEXT NOT NULL,
  evidence TEXT NOT NULL, created_at INTEGER NOT NULL,
  UNIQUE(project_id, source_hash, alignment_hash)
);

-- Producer-adjudicated evaluation evidence. Cases retain a hash/address of
-- the reviewed artifact; variants are compared but never deployed here.
CREATE TABLE IF NOT EXISTS evaluation_cases (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL, artifact_hash TEXT NOT NULL, evidence_json TEXT NOT NULL,
  label TEXT NOT NULL CHECK(label IN ('accept','reject','hold')), factual INTEGER NOT NULL DEFAULT 0,
  protected INTEGER NOT NULL DEFAULT 0, synthetic INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL,
  UNIQUE(project_id, subject_type, subject_id, artifact_hash)
);
CREATE TABLE IF NOT EXISTS evaluation_runs (
  id TEXT PRIMARY KEY, baseline_version TEXT NOT NULL, candidate_version TEXT NOT NULL,
  case_ids_json TEXT NOT NULL, held_out_project_id TEXT, result_json TEXT NOT NULL,
  recommendation TEXT NOT NULL CHECK(recommendation IN ('insufficient_evidence','do_not_adopt','eligible_for_producer_review')), created_at INTEGER NOT NULL
);
-- A versioned prediction is evidence for comparison, never an adjudication.
-- Keeping it separate from evaluation_cases makes the human label immutable.
CREATE TABLE IF NOT EXISTS evaluation_predictions (
  id TEXT PRIMARY KEY, evaluation_case_id TEXT NOT NULL REFERENCES evaluation_cases(id),
  version TEXT NOT NULL, label TEXT NOT NULL CHECK(label IN ('accept','reject','hold')),
  confidence REAL, cost_usd REAL, evidence TEXT NOT NULL,
  training_case_ids_json TEXT NOT NULL DEFAULT '[]', created_at INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  UNIQUE(evaluation_case_id, version)
);
CREATE INDEX IF NOT EXISTS idx_evaluation_predictions_version ON evaluation_predictions(version);
CREATE TRIGGER IF NOT EXISTS evaluation_cases_no_update
BEFORE UPDATE ON evaluation_cases BEGIN SELECT RAISE(ABORT, 'evaluation cases are immutable'); END;
CREATE TRIGGER IF NOT EXISTS evaluation_cases_no_delete
BEFORE DELETE ON evaluation_cases BEGIN SELECT RAISE(ABORT, 'evaluation cases are immutable'); END;
CREATE TRIGGER IF NOT EXISTS evaluation_predictions_no_update
BEFORE UPDATE ON evaluation_predictions BEGIN SELECT RAISE(ABORT, 'evaluation predictions are immutable'); END;
CREATE TRIGGER IF NOT EXISTS evaluation_predictions_no_delete
BEFORE DELETE ON evaluation_predictions BEGIN SELECT RAISE(ABORT, 'evaluation predictions are immutable'); END;

-- Durable, inspectable correction lessons. A correction remains scoped to its
-- original chapter unless a producer explicitly promotes it; candidates never
-- silently influence another chapter.
CREATE TABLE IF NOT EXISTS production_lessons (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), scope_kind TEXT NOT NULL CHECK(scope_kind IN ('shot','scene','chapter','book','language','region','global')),
  scope_value TEXT, subject_id TEXT, issue TEXT NOT NULL, requested_change TEXT NOT NULL, rationale TEXT, status TEXT NOT NULL CHECK(status IN ('candidate','active','disabled','superseded')),
  source_note_id TEXT, supersedes_id TEXT REFERENCES production_lessons(id),
  source_language TEXT, source_book TEXT, source_chapter INTEGER, source_region TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_production_lessons_scope ON production_lessons(status,scope_kind,scope_value);
CREATE TABLE IF NOT EXISTS production_lesson_events (
  id TEXT PRIMARY KEY, lesson_id TEXT NOT NULL REFERENCES production_lessons(id), action TEXT NOT NULL,
  detail TEXT, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_production_lesson_events_lesson ON production_lesson_events(lesson_id, created_at);

-- Stage 6: one continuous chapter video, concatenating every shot's own
-- already-assembled clip (see `clips` / a shot's `assemble_shot`
-- generation_attempts row) in scene/shot order. v1 scope, per
-- docs/design/timeline.md: HARD CUTS ONLY between shots -- the
-- `spaced_production` audio layer that would let a producer place and
-- approve deliberate editorial gaps between shots doesn't exist yet
-- (no rows in audio_segments use that layer value), so this reflects
-- exactly what's already true: each shot's own clip already carries its
-- own real audio (dialogue or silence) trimmed to its own real duration,
-- with nothing inserted between one shot's end and the next one's start.
-- Re-running stage 6 adds a new row rather than overwriting the last one,
-- the same history-preserving convention already used for a shot's own
-- assemble_shot attempts.
CREATE TABLE IF NOT EXISTS chapter_renders (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  result_asset_path TEXT NOT NULL,
  total_duration_ms INTEGER NOT NULL,
  shot_count INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chapter_renders_project ON chapter_renders(project_id);

-- Creative Director agent (src/pipeline/creative-direction/index.ts),
-- added 2026-09-10 at Dan's request: when a real narration-only span in
-- the source recording has no matching visual coverage (see
-- docs/design/timeline.md's coverage requirement and
-- scripts/report-narration-coverage.ts), this agent proposes specific
-- gap-filling shot ideas -- mostly continuity extensions of the
-- surrounding action, but free to invent a human-interest beat (a
-- reaction, a piece of business, an ambient detail) as long as it keeps
-- the scene's scriptural decorum. History-preserving like every other
-- generation_attempts-adjacent table here: re-running the agent against
-- the same gap adds a new row rather than overwriting the last proposal.
CREATE TABLE IF NOT EXISTS creative_direction_proposals (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  narration_span_verse_ref TEXT NOT NULL,
  gap_ms INTEGER NOT NULL,
  ideas_json TEXT NOT NULL,  -- JSON array of GapFillIdea (see index.ts)
  context_json TEXT,
  model TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_creative_direction_proposals_project ON creative_direction_proposals(project_id);

-- Reserves a paid directed-video request before sending it. An interrupted or
-- rejected request remains visible and never silently triggers another bill.
CREATE TABLE IF NOT EXISTS directed_video_jobs (
  shot_id TEXT PRIMARY KEY REFERENCES shots(id),
  project_id TEXT NOT NULL REFERENCES projects(id),
  status TEXT NOT NULL CHECK (status IN ('running','accepted','held','incomplete')),
  result_json TEXT,
  error TEXT,
  created_at INTEGER NOT NULL
);

-- Production Director agent (src/pipeline/creative-direction/
-- production-director.ts), added 2026-09-10 at Dan's request. NOT the
-- same role as src/pipeline/qc/director.ts's Director (which reviews an
-- already-generated shot's keyframe against the Critic + automated
-- checks) -- this is the film-production "director" role from
-- docs/design/shot-planning.md's multi-agent model, scoped here to
-- deciding what the Creative Director agent may build to fill a
-- narration coverage gap: budget/time cost and the overall intent of
-- the film, not per-shot visual QC.
--
-- Every round of the negotiation (a proposal, a requested change, an
-- approval, a rejection, or a forced final decision) is logged here --
-- docs/design/shot-planning.md's "Interaction Log" requirement applied
-- to this specific negotiation, so a producer can see who proposed what
-- and how a disagreement actually got resolved, not just the outcome.
CREATE TABLE IF NOT EXISTS director_negotiation_log (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  narration_span_verse_ref TEXT NOT NULL,
  idea_id TEXT NOT NULL,        -- stable id assigned to one idea/conflict when first proposed, preserved across revisions
  round INTEGER NOT NULL,       -- 0 = initial Creative Director proposal for this idea
  role TEXT NOT NULL CHECK (role IN ('creative_director','production_director')),
  verdict TEXT CHECK (verdict IN ('approve','request_changes','reject','forced_final') OR verdict IS NULL), -- set on production_director rows
  content TEXT NOT NULL,        -- the idea (JSON) or the verdict's feedback text
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_director_negotiation_log_project ON director_negotiation_log(project_id);

-- Final outcome of one gap's negotiation -- the ideas the Production
-- Director actually approved (whether by agreement or by exercising its
-- forced-final authority after 10 rounds on a given conflict), ready to
-- be implemented (real keyframe/video generation for a new_shot idea; a
-- direct timeline edit for reorder_existing/extend_existing).
CREATE TABLE IF NOT EXISTS director_resolutions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  narration_span_verse_ref TEXT NOT NULL,
  approved_ideas_json TEXT NOT NULL,
  rounds_used INTEGER NOT NULL,      -- max round reached across all this gap's conflicts
  forced_final_count INTEGER NOT NULL DEFAULT 0, -- how many ideas hit the 10-round cap
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_director_resolutions_project ON director_resolutions(project_id);

-- Presentation-only voice casting for the private control-room personas.
-- This is deliberately separate from characters/character_versions: those
-- tables are the source-language Scripture-video canon and its approved
-- dialogue voices. These profiles cannot dispatch work or influence any
-- production decision; they only make staged control-room exchanges
-- recognizable to the producer.
CREATE TABLE IF NOT EXISTS control_room_voice_profiles (
  agent_name TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  tier_status TEXT NOT NULL,
  voice_provider TEXT NOT NULL,
  voice_id TEXT NOT NULL,
  delivery_instructions TEXT NOT NULL,
  presentation_only INTEGER NOT NULL DEFAULT 1 CHECK (presentation_only = 1),
  source_reference TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Producer-approved humorous demonstration library. This is deliberately
-- separate from production conversations, project records, and agent runtime.
CREATE TABLE IF NOT EXISTS control_room_presentation_items (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('utterance', 'exchange')),
  category TEXT,
  cue TEXT,
  callback_group TEXT,
  callback_note TEXT,
  agents_json TEXT NOT NULL,
  source_workbook TEXT NOT NULL,
  source_sheet TEXT NOT NULL,
  source_row INTEGER NOT NULL,
  presentation_only INTEGER NOT NULL DEFAULT 1 CHECK (presentation_only = 1),
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS control_room_presentation_lines (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES control_room_presentation_items(id),
  line_number INTEGER NOT NULL,
  speaker_name TEXT NOT NULL,
  text TEXT NOT NULL,
  UNIQUE(item_id, line_number)
);
CREATE INDEX IF NOT EXISTS idx_control_room_presentation_item_kind ON control_room_presentation_items(kind);

-- Read-only, dated context snapshots for the private control-room demo.
-- They are not production status, runtime-agent memory, or a substitute for
-- the evidence ledger. Each brief names the design documents it was drawn from.
CREATE TABLE IF NOT EXISTS control_room_presentation_briefs (
  id TEXT PRIMARY KEY,
  agent_name TEXT NOT NULL REFERENCES control_room_voice_profiles(agent_name),
  title TEXT NOT NULL,
  context TEXT NOT NULL,
  source_references_json TEXT NOT NULL,
  snapshot_date TEXT NOT NULL,
  presentation_only INTEGER NOT NULL DEFAULT 1 CHECK (presentation_only = 1),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(agent_name, title)
);
CREATE INDEX IF NOT EXISTS idx_control_room_presentation_brief_agent ON control_room_presentation_briefs(agent_name);

-- Evidence-backed, presentation-only project-audit findings for the future
-- Red Team. These are read-only review context, never live production gates.
CREATE TABLE IF NOT EXISTS control_room_red_team_findings (
  id TEXT PRIMARY KEY,
  reviewer TEXT NOT NULL CHECK (reviewer IN ('Ada', 'Theo', 'Cora')),
  review_area TEXT NOT NULL,
  finding TEXT NOT NULL,
  evidence TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('high', 'medium', 'low')),
  recommendation TEXT NOT NULL,
  source_references_json TEXT NOT NULL,
  audit_scope TEXT NOT NULL,
  presentation_only INTEGER NOT NULL DEFAULT 1 CHECK (presentation_only = 1),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_control_room_red_team_reviewer ON control_room_red_team_findings(reviewer, severity);
