-- Additive: retain all existing projects; old requests have an unknown fingerprint.
alter table content_projects add column if not exists creation_input_hash text;
