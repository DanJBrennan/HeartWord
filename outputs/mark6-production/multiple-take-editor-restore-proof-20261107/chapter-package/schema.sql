CREATE TABLE alignment_evidence (
  project_id TEXT NOT NULL REFERENCES projects(id), source_hash TEXT NOT NULL, model TEXT NOT NULL,
  result_json TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL,
  PRIMARY KEY(project_id, source_hash)
);
CREATE TABLE audio_segments (
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
CREATE TABLE chapter_ending_plans (
  project_id TEXT PRIMARY KEY REFERENCES projects(id),
  plan_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('proposed','needs_review')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE chapter_intro_plans (
  project_id TEXT PRIMARY KEY REFERENCES projects(id),
  plan_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('proposed','needs_review')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE chapter_render_manifests (
  render_id TEXT PRIMARY KEY REFERENCES chapter_renders(id),
  timeline_json TEXT NOT NULL, source_audio_json TEXT NOT NULL
);
CREATE TABLE chapter_renders (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  result_asset_path TEXT NOT NULL,
  total_duration_ms INTEGER NOT NULL,
  shot_count INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE character_assets (
  id TEXT PRIMARY KEY,
  character_version_id TEXT NOT NULL REFERENCES character_versions(id),
  category TEXT NOT NULL,           -- 'headshot' | 'body_pose' | 'motion_reference' | ...
  path TEXT NOT NULL,               -- path within HEARTWORD_DATA_DIR/assets
  content_hash TEXT,                -- sha256, for dedup/integrity (BVET-Data pattern)
  imported_from TEXT,               -- original path, if imported from BVET-Data
  story_state TEXT,                 -- e.g. 'pre_healing' or 'healed'; NULL = no state gate
  available_from_verse TEXT,        -- canonical verse where this scene reference becomes eligible
  available_through_verse TEXT,     -- canonical verse after which this scene reference is ineligible
  asset_role TEXT NOT NULL DEFAULT 'scene_reference', -- 'scene_reference' | 'comparison_proof'
  created_at INTEGER NOT NULL
);
CREATE TABLE character_groups (
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
CREATE TABLE character_versions (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES characters(id),
  version_label TEXT NOT NULL,      -- e.g. 'v1', 'v2-candidate'
  status TEXT NOT NULL CHECK (status IN ('candidate','approved','superseded','rejected')),
  voice_provider TEXT,              -- e.g. 'elevenlabs'; NULL for a
  voice_id TEXT,                    -- character with no spoken lines
  locked_visual_facts TEXT,         -- producer-approved JSON facts that every generated shot must obey
  notes TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (character_id, version_label)
);
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
CREATE TABLE clips (
  id TEXT PRIMARY KEY,
  shot_id TEXT NOT NULL REFERENCES shots(id),
  generation_attempt_id TEXT NOT NULL REFERENCES generation_attempts(id),
  timeline_start_ms INTEGER NOT NULL,
  timeline_end_ms INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE composite_audio_source_map (
  composite_segment_id TEXT PRIMARY KEY REFERENCES audio_segments(id),
  original_segment_id TEXT NOT NULL REFERENCES audio_segments(id),
  source_hash TEXT NOT NULL, voice_version_id TEXT REFERENCES character_versions(id),
  created_at INTEGER NOT NULL
);
CREATE TABLE control_room_presentation_briefs (
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
CREATE TABLE control_room_presentation_items (
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
CREATE TABLE control_room_presentation_lines (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES control_room_presentation_items(id),
  line_number INTEGER NOT NULL,
  speaker_name TEXT NOT NULL,
  text TEXT NOT NULL,
  UNIQUE(item_id, line_number)
);
CREATE TABLE control_room_red_team_findings (
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
CREATE TABLE control_room_voice_profiles (
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
CREATE TABLE cost_ledger_entries (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  generation_attempt_id TEXT REFERENCES generation_attempts(id),
  amount_usd REAL NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE coverage_beats (
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
CREATE TABLE coverage_keyframe_attempts (
  id TEXT PRIMARY KEY,
  coverage_beat_id TEXT NOT NULL REFERENCES coverage_beats(id),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt TEXT,
  status TEXT NOT NULL CHECK (status IN ('accepted','retry_same','retry_modified','escalate','hold_for_review')),
  result_asset_path TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE creative_direction_proposals (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  narration_span_verse_ref TEXT NOT NULL,
  gap_ms INTEGER NOT NULL,
  ideas_json TEXT NOT NULL,  -- JSON array of GapFillIdea (see index.ts)
  context_json TEXT,
  model TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE directed_video_jobs (
  shot_id TEXT PRIMARY KEY REFERENCES shots(id),
  project_id TEXT NOT NULL REFERENCES projects(id),
  status TEXT NOT NULL CHECK (status IN ('running','accepted','held','incomplete')),
  result_json TEXT,
  error TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE director_negotiation_log (
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
CREATE TABLE director_resolutions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  narration_span_verse_ref TEXT NOT NULL,
  approved_ideas_json TEXT NOT NULL,
  rounds_used INTEGER NOT NULL,      -- max round reached across all this gap's conflicts
  forced_final_count INTEGER NOT NULL DEFAULT 0, -- how many ideas hit the 10-round cap
  created_at INTEGER NOT NULL
);
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
CREATE TABLE editorial_beats (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  sequence INTEGER NOT NULL,
  placement TEXT NOT NULL CHECK (placement IN ('pre_source','post_source')),
  beat_type TEXT NOT NULL CHECK (beat_type IN ('title_card','establishing','bridge','arrival','departure','journey','destination_hint')),
  description TEXT NOT NULL,
  rationale TEXT NOT NULL,
  evidence TEXT,
  duration_ms INTEGER NOT NULL CHECK (duration_ms > 0),
  timeline_start_ms INTEGER NOT NULL CHECK (timeline_start_ms >= 0),
  timeline_end_ms INTEGER NOT NULL CHECK (timeline_end_ms > timeline_start_ms),
  source_label TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('approved_for_generation','generated','accepted','held')),
  approved_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(project_id, placement, sequence)
);
CREATE TABLE evaluation_cases (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL, artifact_hash TEXT NOT NULL, evidence_json TEXT NOT NULL,
  label TEXT NOT NULL CHECK(label IN ('accept','reject','hold')), factual INTEGER NOT NULL DEFAULT 0,
  protected INTEGER NOT NULL DEFAULT 0, synthetic INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL,
  UNIQUE(project_id, subject_type, subject_id, artifact_hash)
);
CREATE TABLE evaluation_predictions (
  id TEXT PRIMARY KEY, evaluation_case_id TEXT NOT NULL REFERENCES evaluation_cases(id),
  version TEXT NOT NULL, label TEXT NOT NULL CHECK(label IN ('accept','reject','hold')),
  confidence REAL, cost_usd REAL, evidence TEXT NOT NULL,
  training_case_ids_json TEXT NOT NULL DEFAULT '[]', created_at INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  UNIQUE(evaluation_case_id, version)
);
CREATE TABLE evaluation_runs (
  id TEXT PRIMARY KEY, baseline_version TEXT NOT NULL, candidate_version TEXT NOT NULL,
  case_ids_json TEXT NOT NULL, held_out_project_id TEXT, result_json TEXT NOT NULL,
  recommendation TEXT NOT NULL CHECK(recommendation IN ('insufficient_evidence','do_not_adopt','eligible_for_producer_review')), created_at INTEGER NOT NULL
);
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
CREATE TABLE media_library_items (
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
CREATE TABLE media_reuse_candidates (
  id TEXT PRIMARY KEY,
  library_item_id TEXT NOT NULL REFERENCES media_library_items(id),
  target_shot_id TEXT NOT NULL REFERENCES shots(id),
  status TEXT NOT NULL CHECK (status IN ('candidate','dismissed','approved_for_generation')) DEFAULT 'candidate',
  note TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (library_item_id, target_shot_id)
);
CREATE TABLE production_audio_assets (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
  kind TEXT NOT NULL CHECK (kind IN ('music','sfx')), description TEXT NOT NULL,
  path TEXT NOT NULL, sha256 TEXT NOT NULL, duration_ms INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE production_events (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES production_runs(id),
  sequence INTEGER NOT NULL, role TEXT NOT NULL, round INTEGER NOT NULL,
  prompt TEXT NOT NULL, output_json TEXT, error TEXT, model TEXT NOT NULL,
  cost_usd REAL, created_at INTEGER NOT NULL, UNIQUE(run_id, sequence)
);
CREATE TABLE production_lesson_events (
  id TEXT PRIMARY KEY, lesson_id TEXT NOT NULL REFERENCES production_lessons(id), action TEXT NOT NULL,
  detail TEXT, created_at INTEGER NOT NULL
);
CREATE TABLE production_lessons (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), scope_kind TEXT NOT NULL CHECK(scope_kind IN ('shot','scene','chapter','book','language','region','global')),
  scope_value TEXT, subject_id TEXT, issue TEXT NOT NULL, requested_change TEXT NOT NULL, rationale TEXT, status TEXT NOT NULL CHECK(status IN ('candidate','active','disabled','superseded')),
  source_note_id TEXT, supersedes_id TEXT REFERENCES production_lessons(id),
  source_language TEXT, source_book TEXT, source_chapter INTEGER, source_region TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE production_runs (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
  phase TEXT NOT NULL CHECK (phase IN ('planning','editing','finishing')),
  brief_hash TEXT NOT NULL, brief_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running','approved','awaiting_assets','held','incomplete')),
  result_json TEXT, created_at INTEGER NOT NULL, completed_at INTEGER, worker_pid INTEGER
);
CREATE TABLE project_restart_cutovers (
  project_id TEXT PRIMARY KEY REFERENCES projects(id),
  started_at INTEGER NOT NULL,
  approved_by TEXT NOT NULL,
  reason TEXT NOT NULL
);
CREATE TABLE project_source_bindings (
  project_id TEXT PRIMARY KEY REFERENCES projects(id),
  docx_path TEXT NOT NULL, audio_path TEXT NOT NULL, reference_path TEXT NOT NULL,
  audio_edition TEXT NOT NULL CHECK (audio_edition IN ('non_drama','drama')),
  docx_hash TEXT NOT NULL, audio_hash TEXT NOT NULL, reference_hash TEXT NOT NULL,
  provenance TEXT NOT NULL CHECK (provenance IN ('catalog','legacy')),
  bound_at INTEGER NOT NULL
);
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
CREATE TABLE review_notes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  subject_type TEXT NOT NULL CHECK (subject_type IN ('shot','clip','character_version','audio_segment','project')),
  subject_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('qc','human')),
  note TEXT NOT NULL,
  resolved INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE scenes (
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
  spatial_continuity TEXT,          -- shared production-design identity for
                                     -- one recurring location: scale, stable
                                     -- anchors and staging zones
  created_at INTEGER NOT NULL,
  UNIQUE (project_id, sequence)
);
CREATE TABLE shot_characters (
  shot_id TEXT NOT NULL REFERENCES shots(id),
  character_id TEXT NOT NULL REFERENCES characters(id),
  PRIMARY KEY (shot_id, character_id)
);
CREATE TABLE shot_utterance_bindings (
  id TEXT PRIMARY KEY, shot_id TEXT NOT NULL UNIQUE REFERENCES shots(id),
  source_audio_segment_id TEXT NOT NULL REFERENCES audio_segments(id),
  source_start_ms INTEGER NOT NULL, source_end_ms INTEGER NOT NULL,
  character_version_id TEXT NOT NULL REFERENCES character_versions(id),
  source_hash TEXT NOT NULL, approved_at INTEGER NOT NULL, approved_by TEXT NOT NULL
);
CREATE TABLE shots (
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
  spatial_view TEXT,                 -- camera relation to the scene's shared
                                     -- spatial identity; tight views can
                                     -- intentionally omit anchors
  status TEXT NOT NULL DEFAULT 'planned',
  created_at INTEGER NOT NULL,
  UNIQUE (scene_id, sequence)
);
CREATE TABLE soundtrack_attempts (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
  run_id TEXT NOT NULL REFERENCES production_runs(id), request_key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL, request_json TEXT NOT NULL, status TEXT NOT NULL,
  provider TEXT, model TEXT, path TEXT, usage_json TEXT, cost_usd REAL,
  review_json TEXT, error TEXT, created_at INTEGER NOT NULL
);
CREATE TABLE source_alignment_boundary_overrides (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
  audio_segment_id TEXT NOT NULL REFERENCES audio_segments(id),
  original_start_ms INTEGER NOT NULL, original_end_ms INTEGER NOT NULL,
  start_ms INTEGER NOT NULL, end_ms INTEGER NOT NULL,
  reviewer_name TEXT NOT NULL, evidence TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE source_alignment_corrections (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
  audio_segment_id TEXT NOT NULL REFERENCES audio_segments(id),
  verse_ref TEXT NOT NULL, assigned_text TEXT NOT NULL, reviewer_name TEXT NOT NULL,
  evidence TEXT NOT NULL, source_hash TEXT NOT NULL, alignment_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE source_alignment_editorial_classifications (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
  audio_segment_id TEXT NOT NULL REFERENCES audio_segments(id),
  classification TEXT NOT NULL CHECK (classification IN ('narrated_title_cross_reference','mixed_editorial_transition')),
  title_text TEXT NOT NULL, cross_reference_text TEXT NOT NULL,
  next_verse_ref TEXT, reviewer_name TEXT NOT NULL, evidence TEXT NOT NULL,
  -- A producer's resolved film-treatment decision for this narrated title:
  -- whether it appears on screen, is omitted, or is kept as narrated audio.
  -- NULL means undecided (the default "do not automatically display" stance
  -- in crew-context.ts still applies). Append-only like the rest of this
  -- table: a later row for the same audio_segment_id/next_verse_ref wins.
  film_treatment TEXT CHECK (film_treatment IS NULL OR film_treatment IN ('title_card','omit','narrated')),
  source_hash TEXT NOT NULL, alignment_hash TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE source_alignment_reviews (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), reviewer_name TEXT NOT NULL,
  reviewer_attestation TEXT NOT NULL, source_hash TEXT NOT NULL, alignment_hash TEXT NOT NULL,
  evidence TEXT NOT NULL, created_at INTEGER NOT NULL,
  UNIQUE(project_id, source_hash, alignment_hash)
);
CREATE TABLE source_alignment_segment_merges (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
  first_segment_id TEXT NOT NULL, second_segment_id TEXT NOT NULL, -- historical only; both rows are deleted by the merge
  first_start_ms INTEGER NOT NULL, first_end_ms INTEGER NOT NULL,
  second_start_ms INTEGER NOT NULL, second_end_ms INTEGER NOT NULL,
  merged_segment_id TEXT NOT NULL,
  superseded_correction_ids TEXT, superseded_editorial_classification_ids TEXT,
  superseded_speaker_attribution_ids TEXT, superseded_boundary_override_ids TEXT,
  reviewer_name TEXT NOT NULL, evidence TEXT NOT NULL,
  source_hash TEXT NOT NULL, alignment_hash TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE source_alignment_segment_splits (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
  original_segment_id TEXT NOT NULL, -- historical only; that row is deleted by the split
  original_start_ms INTEGER NOT NULL, original_end_ms INTEGER NOT NULL,
  split_at_ms INTEGER NOT NULL,
  first_segment_id TEXT NOT NULL, second_segment_id TEXT NOT NULL,
  superseded_correction_ids TEXT, superseded_editorial_classification_ids TEXT,
  superseded_speaker_attribution_ids TEXT, superseded_boundary_override_ids TEXT,
  reviewer_name TEXT NOT NULL, evidence TEXT NOT NULL,
  source_hash TEXT NOT NULL, alignment_hash TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE source_alignment_speaker_attributions (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
  audio_segment_id TEXT NOT NULL REFERENCES audio_segments(id),
  character_id TEXT NOT NULL REFERENCES characters(id),
  verse_ref TEXT, reviewer_name TEXT NOT NULL, evidence TEXT NOT NULL,
  source_hash TEXT NOT NULL, alignment_hash TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE stage_executions (
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
CREATE TABLE tracks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  kind TEXT NOT NULL,               -- 'narration' | 'dialogue' | 'music' | 'sfx'
  muted INTEGER NOT NULL DEFAULT 0,
  volume REAL NOT NULL DEFAULT 1.0
);
CREATE TABLE video_generation_jobs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  shot_id TEXT NOT NULL REFERENCES shots(id),
  backend TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active','completed','held','error')),
  progress_json TEXT,
  metadata_json TEXT,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_audio_segments_project ON audio_segments(project_id);
CREATE INDEX idx_chapter_renders_project ON chapter_renders(project_id);
CREATE INDEX idx_character_assets_version ON character_assets(character_version_id);
CREATE INDEX idx_character_versions_character ON character_versions(character_id);
CREATE INDEX idx_characters_scope ON characters(scope_kind, scope_book, scope_chapter);
CREATE INDEX idx_clips_shot ON clips(shot_id);
CREATE INDEX idx_control_room_presentation_brief_agent ON control_room_presentation_briefs(agent_name);
CREATE INDEX idx_control_room_presentation_item_kind ON control_room_presentation_items(kind);
CREATE INDEX idx_control_room_red_team_reviewer ON control_room_red_team_findings(reviewer, severity);
CREATE INDEX idx_cost_ledger_project ON cost_ledger_entries(project_id);
CREATE INDEX idx_coverage_beats_shot ON coverage_beats(shot_id);
CREATE INDEX idx_coverage_keyframe_attempts_beat ON coverage_keyframe_attempts(coverage_beat_id, created_at);
CREATE INDEX idx_creative_direction_proposals_project ON creative_direction_proposals(project_id);
CREATE INDEX idx_director_negotiation_log_project ON director_negotiation_log(project_id);
CREATE INDEX idx_director_resolutions_project ON director_resolutions(project_id);
CREATE INDEX idx_editorial_beats_project ON editorial_beats(project_id, timeline_start_ms);
CREATE INDEX idx_evaluation_predictions_version ON evaluation_predictions(version);
CREATE INDEX idx_generation_attempts_shot ON generation_attempts(shot_id);
CREATE INDEX idx_media_library_items_lookup ON media_library_items(kind, project_id, shot_id, created_at);
CREATE INDEX idx_media_reuse_candidates_target ON media_reuse_candidates(target_shot_id, status);
CREATE UNIQUE INDEX idx_one_running_crew ON production_runs(project_id) WHERE status='running';
CREATE INDEX idx_production_lesson_events_lesson ON production_lesson_events(lesson_id, created_at);
CREATE INDEX idx_production_lessons_scope ON production_lessons(status,scope_kind,scope_value);
CREATE INDEX idx_production_runs_project ON production_runs(project_id, created_at);
CREATE INDEX idx_review_notes_project ON review_notes(project_id);
CREATE INDEX idx_shot_utterance_source ON shot_utterance_bindings(source_audio_segment_id);
CREATE INDEX idx_shots_scene ON shots(scene_id);
CREATE INDEX idx_source_alignment_boundary_overrides_segment ON source_alignment_boundary_overrides(audio_segment_id, created_at);
CREATE INDEX idx_source_alignment_corrections_segment ON source_alignment_corrections(audio_segment_id, created_at);
CREATE INDEX idx_source_alignment_editorial_classifications_segment ON source_alignment_editorial_classifications(audio_segment_id, created_at);
CREATE INDEX idx_source_alignment_segment_merges_first ON source_alignment_segment_merges(first_segment_id);
CREATE INDEX idx_source_alignment_segment_merges_second ON source_alignment_segment_merges(second_segment_id);
CREATE INDEX idx_source_alignment_segment_splits_original ON source_alignment_segment_splits(original_segment_id);
CREATE INDEX idx_source_alignment_speaker_attributions_segment ON source_alignment_speaker_attributions(audio_segment_id, created_at);
CREATE INDEX idx_stage_executions_lookup ON stage_executions(project_id, stage, status, started_at);
CREATE INDEX idx_video_jobs_project ON video_generation_jobs(project_id,updated_at);
CREATE INDEX idx_video_jobs_shot ON video_generation_jobs(shot_id,status);
CREATE TRIGGER evaluation_cases_no_delete
BEFORE DELETE ON evaluation_cases BEGIN SELECT RAISE(ABORT, 'evaluation cases are immutable'); END;
CREATE TRIGGER evaluation_cases_no_update
BEFORE UPDATE ON evaluation_cases BEGIN SELECT RAISE(ABORT, 'evaluation cases are immutable'); END;
CREATE TRIGGER evaluation_predictions_no_delete
BEFORE DELETE ON evaluation_predictions BEGIN SELECT RAISE(ABORT, 'evaluation predictions are immutable'); END;
CREATE TRIGGER evaluation_predictions_no_update
BEFORE UPDATE ON evaluation_predictions BEGIN SELECT RAISE(ABORT, 'evaluation predictions are immutable'); END;