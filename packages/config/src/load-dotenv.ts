import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * CLI(db:migrate, db:seed)가 Next.js처럼 .env 파일을 읽도록 한다.
 * 이미 설정된 process.env는 덮어쓰지 않는다.
 */
export function loadDotenv(cwd = process.cwd()): string[] {
  const candidates = [
    resolve(cwd, ".env"),
    resolve(cwd, ".env.local"),
    resolve(cwd, "apps/web/.env.local"),
    resolve(cwd, "../../.env"),
    resolve(cwd, "../../.env.local"),
    resolve(cwd, "../../apps/web/.env.local"),
  ];

  const loaded: string[] = [];
  const seen = new Set<string>();

  for (const file of candidates) {
    if (seen.has(file) || !existsSync(file)) continue;
    seen.add(file);
    applyEnvFile(file);
    loaded.push(file);
  }

  return loaded;
}

function applyEnvFile(file: string): void {
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (process.env[key] !== undefined) continue;
    process.env[key] = unquote(line.slice(eq + 1).trim());
  }
}

function unquote(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
