import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");

/** Supabase에는 auth 스키마와 권한이 이미 있으므로 로컬 전용 파일은 건너뛴다. */
const localOnly = new Set(["0000_local_auth_shim.sql", "0002_local_grants.sql"]);

export type MigrationTarget = "local" | "supabase";

export type MigrationResult = { file: string; applied: boolean; skippedReason?: string };

/** 스펙 6.3이 요구하는 확장. 없으면 SQL 오류 대신 무엇을 설치해야 하는지 알려준다. */
const requiredExtensions = ["pgcrypto", "citext", "vector"] as const;

export class MissingExtensionError extends Error {
  constructor(readonly missing: string[]) {
    super(
      [
        `PostgreSQL 확장이 없어 마이그레이션을 시작할 수 없습니다: ${missing.join(", ")}`,
        "",
        "설치 방법 (Ubuntu/WSL):",
        "  PGV=$(ls /usr/lib/postgresql | sort -n | tail -1)",
        "  sudo apt install -y postgresql-contrib postgresql-$PGV-pgvector",
        "  sudo service postgresql restart",
        "",
        "Supabase를 쓰신다면 이 확장들이 이미 준비되어 있습니다.",
      ].join("\n"),
    );
    this.name = "MissingExtensionError";
  }
}

async function assertRequiredExtensions(
  client: ReturnType<typeof postgres>,
): Promise<void> {
  const rows = await client<{ name: string }[]>`
    select name from pg_available_extensions where name in ${client(requiredExtensions)}
  `;
  const available = new Set(rows.map((row) => row.name));
  const missing = requiredExtensions.filter((name) => !available.has(name));
  if (missing.length > 0) throw new MissingExtensionError(missing);
}

/**
 * 역할은 데이터베이스가 아니라 클러스터에 속한다. 덤프를 복원하거나 클러스터를 바꾸면
 * schema_migrations는 남아 있어도 app_user가 없을 수 있으므로 매번 다시 보장한다.
 */
async function ensureLocalAppRole(client: ReturnType<typeof postgres>): Promise<void> {
  await client.unsafe(`
    do $$
    begin
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then
        create role authenticated nologin;
      end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then
        create role service_role nologin bypassrls;
      end if;
      if not exists (select 1 from pg_roles where rolname = 'app_user') then
        create role app_user login password 'app_user';
      end if;
    end;
    $$;

    grant authenticated to app_user;
  `);
  // Container setup generates a unique application password; preserve the
  // existing role identity while synchronizing its configured credential.
  if (process.env.DATABASE_APP_URL) {
    const appUrl = new URL(process.env.DATABASE_APP_URL);
    if (decodeURIComponent(appUrl.username) !== "app_user") {
      throw new Error("DB_TARGET=local의 DATABASE_APP_URL 사용자 이름은 app_user여야 합니다.");
    }
    const password = decodeURIComponent(appUrl.password);
    if (!password) throw new Error("DATABASE_APP_URL에 비밀번호가 필요합니다.");
    await client.unsafe(`alter role app_user password '${password.replace(/'/g, "''")}'`);
  }
}

/** 역할을 새로 만든 경우 기존 테이블 권한이 비어 있으므로 함께 다시 부여한다. */
async function ensureLocalGrants(client: ReturnType<typeof postgres>): Promise<void> {
  await client.unsafe(`
    grant usage on schema public, auth to authenticated, service_role;
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant usage, select on all sequences in schema public to authenticated;
    grant execute on all functions in schema public to authenticated;
    grant execute on all functions in schema auth to authenticated;
  `);
}

export async function runMigrations(options: {
  connectionString: string;
  target?: MigrationTarget;
  log?: (message: string) => void;
}): Promise<MigrationResult[]> {
  const target = options.target ?? (process.env.DB_TARGET === "supabase" ? "supabase" : "local");
  const log = options.log ?? (() => {});
  const sqlClient = postgres(options.connectionString, { max: 1, onnotice: () => {} });

  try {
    await assertRequiredExtensions(sqlClient);
    if (target === "local") await ensureLocalAppRole(sqlClient);

    await sqlClient.unsafe(`
      create table if not exists schema_migrations (
        file text primary key,
        applied_at timestamptz not null default now()
      )
    `);

    const applied = new Set(
      (await sqlClient<{ file: string }[]>`select file from schema_migrations`).map((r) => r.file),
    );

    const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
    const results: MigrationResult[] = [];

    for (const file of files) {
      if (applied.has(file)) {
        results.push({ file, applied: false, skippedReason: "ALREADY_APPLIED" });
        continue;
      }
      if (target === "supabase" && localOnly.has(file)) {
        results.push({ file, applied: false, skippedReason: "LOCAL_ONLY" });
        continue;
      }

      const contents = await readFile(path.join(migrationsDir, file), "utf8");
      log(`적용: ${file}`);
      await sqlClient.begin(async (tx) => {
        await tx.unsafe(contents);
        await tx`insert into schema_migrations(file) values (${file})`;
      });
      results.push({ file, applied: true });
    }

    if (target === "local") await ensureLocalGrants(sqlClient);

    return results;
  } finally {
    await sqlClient.end({ timeout: 5 });
  }
}
