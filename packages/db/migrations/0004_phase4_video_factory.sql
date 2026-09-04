-- Phase 4 Video Factory: bind render jobs to workflow runs, command hash, and probe.
alter table render_jobs
  add column if not exists workflow_run_id uuid references workflow_runs(id) on delete set null,
  add column if not exists command_hash text,
  add column if not exists loudness_lufs numeric(6,2),
  add column if not exists probe jsonb not null default '{}'::jsonb;

drop index if exists render_jobs_command_hash_idx;
create unique index render_jobs_command_hash_idx
  on render_jobs (workspace_id, command_hash)
  where command_hash is not null and status in ('queued', 'running', 'waiting', 'succeeded');

create index if not exists media_assets_project_shot_idx
  on media_assets (workspace_id, content_project_id, shot_id, created_at desc);

-- Operator can upload clips and enqueue renders. Worker writes still use the service role.
do $$
declare
  table_name text;
begin
  foreach table_name in array array['media_assets', 'render_jobs']
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

