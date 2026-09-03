-- 로컬 PostgreSQL 전용 shim.
-- Supabase에는 auth 스키마, auth.uid(), authenticated/service_role 역할이 이미 있으므로
-- 이 파일은 DB_TARGET=local 일 때만 적용한다. 0001_initial.sql은 두 환경에서 동일하다.

create schema if not exists auth;

-- Supabase의 auth.uid()와 같은 계약: 현재 요청 사용자 UUID 또는 null.
-- 웹 요청은 트랜잭션마다 set_config('app.current_user_id', ...)로 주입한다.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.current_user_id', true), '')::uuid;
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end;
$$;

-- 애플리케이션 접속 역할. 테이블 소유자가 아니어야 RLS가 실제로 적용된다.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_user') then
    create role app_user login password 'app_user';
  end if;
end;
$$;

grant authenticated to app_user;
grant usage on schema public, auth to authenticated, service_role;

-- 이후 생성되는 객체에 대한 기본 권한
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant usage, select on sequences to authenticated;
alter default privileges in schema public
  grant execute on functions to authenticated;
