-- packages/db/migrations/0001_initial.sql
-- 출처: docs/SHORTS_INTELLIGENCE_OS_SPEC.md 6.3 초기 Migration SQL (수정 없이 사용)
-- auth.uid()는 Supabase가 제공한다. 로컬 개발은 0000_local_auth_shim.sql이 동일 시그니처를 만든다.
create extension if not exists pgcrypto;
create extension if not exists citext;
create extension if not exists vector;

create type member_role as enum ('owner', 'operator', 'reviewer', 'viewer');
create type integration_status as enum (
  'disconnected', 'pending', 'connected', 'degraded', 'error', 'revoked'
);
create type niche_status as enum ('active', 'paused', 'archived');
create type topic_decision as enum (
  'new', 'watch', 'approved', 'rejected', 'archived'
);
create type run_status as enum (
  'queued', 'running', 'waiting', 'succeeded', 'failed', 'cancelled'
);
create type research_status as enum (
  'draft', 'collecting', 'ready', 'needs_review', 'approved', 'failed'
);
create type project_status as enum (
  'draft',
  'research_ready',
  'scripting',
  'qa_review',
  'approved_to_render',
  'rendering',
  'rendered',
  'publish_review',
  'published',
  'rejected',
  'archived'
);
create type qa_result as enum ('pass', 'warn', 'fail', 'not_run');
create type approval_decision as enum ('approved', 'rejected', 'changes_requested');
create type asset_type as enum (
  'image', 'video_clip', 'voice', 'music', 'subtitle', 'thumbnail', 'final_video'
);
create type publish_status as enum (
  'draft', 'awaiting_approval', 'approved', 'uploading',
  'scheduled', 'published', 'failed', 'cancelled'
);

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  slug citext not null unique,
  owner_user_id uuid not null,
  timezone text not null default 'Asia/Seoul',
  default_locale text not null default 'ko-KR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table workspace_members (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null,
  role member_role not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table workspace_settings (
  workspace_id uuid primary key references workspaces(id) on delete cascade,
  target_countries text[] not null default array['KR'],
  content_languages text[] not null default array['ko'],
  default_currency char(3) not null default 'USD',
  daily_ai_budget numeric(12,4),
  monthly_ai_budget numeric(12,4),
  feature_flags jsonb not null default '{}'::jsonb,
  provider_limits jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table integrations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  provider text not null,
  display_name text not null,
  status integration_status not null default 'disconnected',
  external_account_id text,
  secret_ref text,
  scopes text[] not null default '{}',
  capabilities jsonb not null default '{}'::jsonb,
  quota_snapshot jsonb not null default '{}'::jsonb,
  token_expires_at timestamptz,
  last_verified_at timestamptz,
  last_error_code text,
  last_error_message text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider, display_name)
);

create table channels (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  integration_id uuid references integrations(id) on delete set null,
  provider text not null default 'youtube',
  external_channel_id text not null,
  channel_kind text not null check (channel_kind in ('owned', 'competitor')),
  title text not null,
  handle text,
  country_code char(2),
  default_language text,
  thumbnail_url text,
  subscriber_count bigint,
  video_count bigint,
  metadata jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider, external_channel_id)
);

create table brand_profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  channel_id uuid references channels(id) on delete set null,
  name text not null,
  description text,
  target_audience jsonb not null default '{}'::jsonb,
  voice_rules jsonb not null default '{}'::jsonb,
  visual_rules jsonb not null default '{}'::jsonb,
  forbidden_patterns jsonb not null default '[]'::jsonb,
  default_duration_seconds integer not null default 45
    check (default_duration_seconds between 5 and 180),
  default_language text not null default 'ko',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table score_configs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  version integer not null,
  name text not null,
  weights jsonb not null,
  thresholds jsonb not null,
  active boolean not null default false,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (workspace_id, version)
);

create unique index score_configs_one_active_idx
  on score_configs(workspace_id)
  where active = true;

create table niches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  slug citext not null,
  name text not null,
  description text,
  status niche_status not null default 'active',
  target_country char(2) not null,
  target_language text not null,
  seed_keywords text[] not null default '{}',
  include_terms text[] not null default '{}',
  exclude_terms text[] not null default '{}',
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, slug, target_country, target_language)
);

create table niche_metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  niche_id uuid not null references niches(id) on delete cascade,
  score_config_id uuid not null references score_configs(id),
  opportunity_score numeric(5,2),
  confidence_score numeric(5,2),
  decision_band text,
  signal_values jsonb not null default '{}'::jsonb,
  score_breakdown jsonb not null default '{}'::jsonb,
  sample_size integer not null default 0,
  collected_at timestamptz not null,
  calculated_at timestamptz not null default now(),
  check (opportunity_score is null or opportunity_score between 0 and 100),
  check (confidence_score is null or confidence_score between 0 and 100)
);

create index niche_metric_latest_idx
  on niche_metric_snapshots(niche_id, calculated_at desc);

create table topics (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  niche_id uuid not null references niches(id) on delete cascade,
  title text not null,
  normalized_title citext not null,
  angle_hint text,
  target_country char(2) not null,
  target_language text not null,
  decision topic_decision not null default 'new',
  decision_reason text,
  decided_by uuid,
  decided_at timestamptz,
  discovered_by text not null,
  first_discovered_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, niche_id, normalized_title, target_country, target_language)
);

create index topics_queue_idx
  on topics(workspace_id, decision, last_seen_at desc);

create table topic_signals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  topic_id uuid not null references topics(id) on delete cascade,
  signal_key text not null,
  provider text not null,
  raw_numeric numeric,
  raw_text text,
  normalized_score numeric(5,2),
  signal_confidence numeric(5,2),
  unit text,
  sample_size integer not null default 0,
  freshness_hours numeric(10,2),
  raw_payload jsonb not null default '{}'::jsonb,
  collected_at timestamptz not null,
  check (normalized_score is null or normalized_score between 0 and 100),
  check (signal_confidence is null or signal_confidence between 0 and 100)
);

create index topic_signals_latest_idx
  on topic_signals(topic_id, signal_key, collected_at desc);

create table topic_score_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  topic_id uuid not null references topics(id) on delete cascade,
  score_config_id uuid not null references score_configs(id),
  opportunity_score numeric(5,2) not null check (opportunity_score between 0 and 100),
  confidence_score numeric(5,2) not null check (confidence_score between 0 and 100),
  decision_band text not null,
  available_weight numeric(5,2) not null,
  score_breakdown jsonb not null,
  penalties jsonb not null default '[]'::jsonb,
  calculated_at timestamptz not null default now()
);

create index topic_scores_latest_idx
  on topic_score_snapshots(topic_id, calculated_at desc);

create table reference_videos (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  channel_id uuid references channels(id) on delete set null,
  provider text not null default 'youtube',
  external_video_id text not null,
  external_channel_id text not null,
  url text not null,
  title text not null,
  description text,
  published_at timestamptz,
  duration_seconds integer,
  view_count bigint,
  like_count bigint,
  comment_count bigint,
  short_candidate boolean not null default false,
  is_short boolean,
  short_classification_source text,
  metadata jsonb not null default '{}'::jsonb,
  first_collected_at timestamptz not null default now(),
  last_collected_at timestamptz not null default now(),
  unique (workspace_id, provider, external_video_id)
);

create table topic_reference_videos (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  topic_id uuid not null references topics(id) on delete cascade,
  reference_video_id uuid not null references reference_videos(id) on delete cascade,
  relevance_score numeric(5,2),
  relation_type text not null default 'discovery',
  created_at timestamptz not null default now(),
  primary key (topic_id, reference_video_id),
  check (relevance_score is null or relevance_score between 0 and 100)
);

create index topic_reference_videos_video_idx
  on topic_reference_videos(reference_video_id, topic_id);

create table video_metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  reference_video_id uuid not null references reference_videos(id) on delete cascade,
  view_count bigint,
  like_count bigint,
  comment_count bigint,
  view_velocity numeric,
  breakout_ratio numeric,
  snapshot_age_hours numeric,
  collected_at timestamptz not null,
  unique (reference_video_id, collected_at)
);

create table notebook_collections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  niche_id uuid references niches(id) on delete set null,
  integration_id uuid not null references integrations(id) on delete cascade,
  provider_notebook_id text not null,
  provider_resource_name text,
  title text not null,
  locale text not null,
  volume_number integer not null default 1,
  status text not null default 'active',
  source_count integer not null default 0,
  notebook_url text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, integration_id, provider_notebook_id)
);

create table sources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  reference_video_id uuid references reference_videos(id) on delete set null,
  source_type text not null,
  provider text not null,
  canonical_url text,
  title text,
  author text,
  publisher text,
  excerpt text,
  content_text text,
  published_at timestamptz,
  retrieved_at timestamptz not null default now(),
  quality_score numeric(5,2),
  rights_status text not null default 'reference_only',
  content_hash text,
  metadata jsonb not null default '{}'::jsonb,
  embedding vector,
  embedding_model text,
  embedding_dimensions integer,
  created_at timestamptz not null default now(),
  check (quality_score is null or quality_score between 0 and 100)
);

create unique index sources_canonical_url_idx
  on sources(workspace_id, canonical_url)
  where canonical_url is not null;

create table topic_sources (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  topic_id uuid not null references topics(id) on delete cascade,
  source_id uuid not null references sources(id) on delete cascade,
  relevance_score numeric(5,2),
  relation_reason text,
  created_at timestamptz not null default now(),
  primary key (topic_id, source_id),
  check (relevance_score is null or relevance_score between 0 and 100)
);

create index topic_sources_source_idx
  on topic_sources(source_id, topic_id);

create table notebook_source_syncs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  notebook_collection_id uuid not null references notebook_collections(id) on delete cascade,
  source_id uuid not null references sources(id) on delete cascade,
  provider_source_id text,
  provider_resource_name text,
  status run_status not null default 'queued',
  attempt_count integer not null default 0,
  last_error_code text,
  last_error_message text,
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (notebook_collection_id, source_id)
);

create table research_briefs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  topic_id uuid not null references topics(id) on delete cascade,
  version integer not null,
  status research_status not null default 'draft',
  executive_summary text,
  key_facts jsonb not null default '[]'::jsonb,
  audience_insights jsonb not null default '[]'::jsonb,
  angles jsonb not null default '[]'::jsonb,
  counterpoints jsonb not null default '[]'::jsonb,
  unknowns jsonb not null default '[]'::jsonb,
  citations jsonb not null default '[]'::jsonb,
  citation_coverage numeric(5,2),
  model_name text,
  prompt_version text not null,
  input_hash text not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  approved_by uuid,
  approved_at timestamptz,
  unique (topic_id, version)
);

create table dna_patterns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  niche_id uuid references niches(id) on delete set null,
  reference_video_id uuid references reference_videos(id) on delete set null,
  pattern_type text not null,
  name text not null,
  abstraction_level text not null default 'structural',
  structured_pattern jsonb not null,
  evidence jsonb not null default '[]'::jsonb,
  confidence_score numeric(5,2),
  safe_to_reuse boolean not null default true,
  model_name text,
  prompt_version text,
  created_at timestamptz not null default now(),
  check (confidence_score is null or confidence_score between 0 and 100)
);

create table content_projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  topic_id uuid not null references topics(id),
  research_brief_id uuid references research_briefs(id),
  channel_id uuid references channels(id),
  brand_profile_id uuid references brand_profiles(id),
  title text not null,
  target_language text not null,
  target_duration_seconds integer not null check (target_duration_seconds between 5 and 180),
  status project_status not null default 'draft',
  owner_user_id uuid not null,
  selected_angle_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table content_angles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  content_project_id uuid not null references content_projects(id) on delete cascade,
  version integer not null,
  title text not null,
  hook text not null,
  promise text not null,
  outline jsonb not null,
  novelty_rationale text,
  score_breakdown jsonb not null default '{}'::jsonb,
  selected boolean not null default false,
  created_at timestamptz not null default now(),
  unique (content_project_id, version, title)
);

alter table content_projects
  add constraint content_projects_selected_angle_fk
  foreign key (selected_angle_id) references content_angles(id) on delete set null;

create table scripts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  content_project_id uuid not null references content_projects(id) on delete cascade,
  content_angle_id uuid references content_angles(id) on delete set null,
  version integer not null,
  title text not null,
  hook text not null,
  script_text text not null,
  structured_script jsonb not null,
  word_count integer not null,
  estimated_duration_seconds numeric(7,2) not null,
  factual_claims jsonb not null default '[]'::jsonb,
  originality_summary jsonb not null default '{}'::jsonb,
  model_name text,
  prompt_version text not null,
  input_hash text not null,
  status text not null default 'draft',
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (content_project_id, version)
);

create table script_citations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  script_id uuid not null references scripts(id) on delete cascade,
  source_id uuid not null references sources(id) on delete restrict,
  claim_key text not null,
  quote_excerpt text,
  support_level text not null check (support_level in ('direct', 'partial', 'context')),
  created_at timestamptz not null default now(),
  unique (script_id, source_id, claim_key)
);

create table shots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  script_id uuid not null references scripts(id) on delete cascade,
  sequence_no integer not null,
  start_seconds numeric(7,2) not null,
  end_seconds numeric(7,2) not null,
  narration text,
  on_screen_text text,
  visual_description text not null,
  camera_direction text,
  generation_prompt text,
  negative_prompt text,
  asset_strategy text not null check (
    asset_strategy in ('ai_video', 'ai_image', 'stock', 'user_upload', 'motion_graphic')
  ),
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (script_id, sequence_no),
  check (end_seconds > start_seconds)
);

create table media_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  content_project_id uuid not null references content_projects(id) on delete cascade,
  shot_id uuid references shots(id) on delete set null,
  asset_type asset_type not null,
  provider text not null,
  provider_operation_id text,
  storage_uri text,
  preview_uri text,
  mime_type text,
  byte_size bigint,
  checksum_sha256 text,
  prompt_text text,
  generation_parameters jsonb not null default '{}'::jsonb,
  rights_metadata jsonb not null default '{}'::jsonb,
  status run_status not null default 'queued',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table render_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  content_project_id uuid not null references content_projects(id) on delete cascade,
  version integer not null,
  status run_status not null default 'queued',
  render_manifest jsonb not null,
  output_asset_id uuid references media_assets(id) on delete set null,
  output_checksum_sha256 text,
  duration_seconds numeric(7,2),
  width integer,
  height integer,
  error_code text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (content_project_id, version)
);

create table qa_reviews (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  content_project_id uuid not null references content_projects(id) on delete cascade,
  script_id uuid references scripts(id) on delete cascade,
  render_job_id uuid references render_jobs(id) on delete cascade,
  check_type text not null,
  result qa_result not null,
  score numeric(5,2),
  severity text not null default 'info'
    check (severity in ('info', 'low', 'medium', 'high', 'blocker')),
  findings jsonb not null default '[]'::jsonb,
  model_name text,
  rule_version text not null,
  created_at timestamptz not null default now(),
  check (score is null or score between 0 and 100)
);

create table approvals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  entity_version integer,
  decision approval_decision not null,
  comment text,
  decided_by uuid not null,
  decided_at timestamptz not null default now(),
  snapshot_hash text not null
);

create index approvals_entity_idx
  on approvals(workspace_id, entity_type, entity_id, decided_at desc);

create table publish_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  content_project_id uuid not null references content_projects(id) on delete cascade,
  render_job_id uuid not null references render_jobs(id),
  channel_id uuid not null references channels(id),
  approval_id uuid not null references approvals(id),
  status publish_status not null default 'draft',
  title text not null,
  description text not null,
  tags text[] not null default '{}',
  privacy_status text not null default 'private'
    check (privacy_status in ('private', 'unlisted', 'public')),
  scheduled_at timestamptz,
  idempotency_key text not null,
  upload_session_ref text,
  external_video_id text,
  last_error_code text,
  last_error_message text,
  attempt_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, idempotency_key)
);

create table published_videos (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  publish_job_id uuid not null unique references publish_jobs(id),
  channel_id uuid not null references channels(id),
  content_project_id uuid not null references content_projects(id),
  provider text not null default 'youtube',
  external_video_id text not null,
  url text not null,
  published_at timestamptz,
  current_privacy_status text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider, external_video_id)
);

create table analytics_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  published_video_id uuid not null references published_videos(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  age_bucket text,
  views bigint,
  engaged_views bigint,
  watch_time_minutes numeric,
  average_view_duration_seconds numeric,
  average_view_percentage numeric(7,3),
  likes bigint,
  comments bigint,
  subscribers_gained bigint,
  estimated_revenue numeric(14,6),
  currency char(3) not null default 'USD',
  raw_payload jsonb not null default '{}'::jsonb,
  collected_at timestamptz not null default now(),
  unique (published_video_id, period_start, period_end, collected_at)
);

create table workflow_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  workflow_type text not null,
  entity_type text,
  entity_id uuid,
  status run_status not null default 'queued',
  idempotency_key text,
  requested_by uuid not null,
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  progress numeric(5,2) not null default 0,
  error_code text,
  error_message text,
  retry_count integer not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (progress between 0 and 100)
);

create unique index workflow_runs_idempotency_idx
  on workflow_runs(workspace_id, idempotency_key)
  where idempotency_key is not null;

create index workflow_runs_queue_idx
  on workflow_runs(workspace_id, status, created_at desc);

create table workflow_steps (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  workflow_run_id uuid not null references workflow_runs(id) on delete cascade,
  sequence_no integer not null,
  step_key text not null,
  provider text,
  status run_status not null default 'queued',
  provider_request_id text,
  attempt_count integer not null default 0,
  input_summary jsonb not null default '{}'::jsonb,
  output_summary jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workflow_run_id, sequence_no)
);

create table cost_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  workflow_run_id uuid references workflow_runs(id) on delete set null,
  content_project_id uuid references content_projects(id) on delete set null,
  provider text not null,
  service text not null,
  model_name text,
  quantity numeric(18,6),
  unit text,
  estimated_cost numeric(14,6),
  actual_cost numeric(14,6),
  currency char(3) not null default 'USD',
  provider_request_id text,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  actor_user_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_state jsonb,
  after_state jsonb,
  request_id text,
  ip_hash text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index audit_logs_entity_idx
  on audit_logs(workspace_id, entity_type, entity_id, created_at desc);

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'workspaces',
    'workspace_settings',
    'integrations',
    'channels',
    'brand_profiles',
    'niches',
    'topics',
    'notebook_collections',
    'notebook_source_syncs',
    'content_projects',
    'shots',
    'media_assets',
    'publish_jobs',
    'published_videos',
    'workflow_runs'
  ]
  loop
    execute format(
      'create trigger %I_set_updated_at before update on %I
       for each row execute function set_updated_at()',
      table_name,
      table_name
    );
  end loop;
end;
$$;

create or replace function is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
  );
$$;

create or replace function has_workspace_role(
  target_workspace_id uuid,
  allowed_roles member_role[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
      and wm.role = any(allowed_roles)
  );
$$;

create or replace function create_workspace_with_owner(
  workspace_name text,
  workspace_slug text,
  workspace_timezone text default 'Asia/Seoul',
  workspace_locale text default 'ko-KR'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_workspace_id uuid;
  current_user_id uuid;
begin
  current_user_id := auth.uid();
  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  insert into workspaces(name, slug, owner_user_id, timezone, default_locale)
  values (
    workspace_name,
    workspace_slug,
    current_user_id,
    workspace_timezone,
    workspace_locale
  )
  returning id into new_workspace_id;

  insert into workspace_members(workspace_id, user_id, role)
  values (new_workspace_id, current_user_id, 'owner');

  insert into workspace_settings(workspace_id)
  values (new_workspace_id);

  insert into score_configs(
    workspace_id,
    version,
    name,
    weights,
    thresholds,
    active,
    created_by
  )
  values (
    new_workspace_id,
    1,
    'Default v1',
    '{
      "youtube_velocity": 25,
      "search_interest": 15,
      "commercial_intent": 15,
      "competition_gap": 15,
      "shorts_fit": 10,
      "repeatability": 8,
      "source_quality": 7,
      "policy_safety": 5
    }'::jsonb,
    '{
      "produce_score": 85,
      "watch_score": 70,
      "minimum_produce_confidence": 60
    }'::jsonb,
    true,
    current_user_id
  );

  return new_workspace_id;
end;
$$;

grant execute on function create_workspace_with_owner(
  text,
  text,
  text,
  text
) to authenticated;

alter table workspaces enable row level security;
alter table workspace_members enable row level security;

create policy workspaces_select_member
on workspaces for select
using (is_workspace_member(id));

create policy workspaces_update_owner
on workspaces for update
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

create policy members_select_member
on workspace_members for select
using (is_workspace_member(workspace_id));

create policy members_manage_owner
on workspace_members for all
using (has_workspace_role(workspace_id, array['owner']::member_role[]))
with check (has_workspace_role(workspace_id, array['owner']::member_role[]));

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'workspace_settings',
    'integrations',
    'channels',
    'brand_profiles',
    'score_configs',
    'niches',
    'niche_metric_snapshots',
    'topics',
    'topic_signals',
    'topic_score_snapshots',
    'reference_videos',
    'topic_reference_videos',
    'video_metric_snapshots',
    'notebook_collections',
    'sources',
    'topic_sources',
    'notebook_source_syncs',
    'research_briefs',
    'dna_patterns',
    'content_projects',
    'content_angles',
    'scripts',
    'script_citations',
    'shots',
    'media_assets',
    'render_jobs',
    'qa_reviews',
    'approvals',
    'publish_jobs',
    'published_videos',
    'analytics_snapshots',
    'workflow_runs',
    'workflow_steps',
    'cost_events',
    'audit_logs'
  ]
  loop
    execute format('alter table %I enable row level security', table_name);
    execute format(
      'create policy %I_member_read on %I
       for select using (is_workspace_member(workspace_id))',
      table_name,
      table_name
    );
  end loop;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'channels',
    'brand_profiles',
    'niches',
    'topics',
    'topic_signals',
    'reference_videos',
    'topic_reference_videos',
    'sources',
    'topic_sources',
    'research_briefs',
    'dna_patterns',
    'content_projects',
    'content_angles',
    'scripts',
    'script_citations',
    'shots'
  ]
  loop
    execute format(
      'create policy %I_operator_write on %I
       for all
       using (
         has_workspace_role(
           workspace_id,
           array[''owner'', ''operator'']::member_role[]
         )
       )
       with check (
         has_workspace_role(
           workspace_id,
           array[''owner'', ''operator'']::member_role[]
         )
       )',
      table_name,
      table_name
    );
  end loop;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'workspace_settings',
    'integrations',
    'score_configs',
    'notebook_collections'
  ]
  loop
    execute format(
      'create policy %I_owner_write on %I
       for all
       using (
         has_workspace_role(workspace_id, array[''owner'']::member_role[])
       )
       with check (
         has_workspace_role(workspace_id, array[''owner'']::member_role[])
       )',
      table_name,
      table_name
    );
  end loop;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['qa_reviews', 'approvals']
  loop
    execute format(
      'create policy %I_reviewer_write on %I
       for all
       using (
         has_workspace_role(
           workspace_id,
           array[''owner'', ''reviewer'']::member_role[]
         )
       )
       with check (
         has_workspace_role(
           workspace_id,
           array[''owner'', ''reviewer'']::member_role[]
         )
       )',
      table_name,
      table_name
    );
  end loop;
end;
$$;
