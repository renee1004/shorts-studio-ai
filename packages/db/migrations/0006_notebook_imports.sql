create table notebook_imports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  imported_by uuid not null,
  notebook_id text not null,
  item_id text not null,
  kind text not null check (kind in ('note', 'report')),
  title text not null,
  original_text text not null,
  content_hash text not null,
  imported_at timestamptz not null default now()
);
create unique index notebook_imports_revision_idx on notebook_imports
  (workspace_id, imported_by, notebook_id, item_id, kind, content_hash);
alter table notebook_imports enable row level security;
-- Personal Google content is private to the importing member, even in a shared workspace.
create policy notebook_imports_read on notebook_imports for select using
  (imported_by = auth.uid() and is_workspace_member(workspace_id));
create policy notebook_imports_insert on notebook_imports for insert with check
  (imported_by = auth.uid() and has_workspace_role(workspace_id, array['owner','operator']::member_role[]));
grant select, insert on notebook_imports to authenticated;
