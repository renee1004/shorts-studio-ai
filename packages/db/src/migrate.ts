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

    return results;
  } finally {
    await sqlClient.end({ timeout: 5 });
  }
}
