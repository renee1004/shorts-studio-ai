-- Phase 3 approval integrity: bind every QA row to its exact immutable input.
alter table qa_reviews
  add column if not exists input_hash text;

create index if not exists qa_reviews_input_idx
  on qa_reviews(workspace_id, content_project_id, script_id, check_type, input_hash, created_at desc);
