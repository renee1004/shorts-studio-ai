import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");

/** Supabase에는 auth 스키마와 권한이 이미 있으므로 로컬 전용 파일은 건너뛴다. */
const localOnly = new Set(["0000_local_auth_shim.sql", "0002_local_grants.sql"]);

export type MigrationTarget = "local" | "supabase";

export type MigrationResult = { file: string; applied: boolean; skippedReason?: string };

export async function runMigrations(options: {
  connectionString: string;
  target?: MigrationTarget;
  log?: (message: string) => void;
}): Promise<MigrationResult[]> {
  const target = options.target ?? (process.env.DB_TARGET === "supabase" ? "supabase" : "local");
  const log = options.log ?? (() => {});
  const sqlClient = postgres(options.connectionString, { max: 1, onnotice: () => {} });

  try {
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
