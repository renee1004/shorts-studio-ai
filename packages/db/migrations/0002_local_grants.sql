-- 로컬 전용 후처리. 0001에서 만든 테이블·함수에 authenticated 권한을 부여한다.
-- Supabase는 anon/authenticated 기본 권한을 자동으로 관리하므로 적용하지 않는다.

grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
grant execute on all functions in schema auth to authenticated;
