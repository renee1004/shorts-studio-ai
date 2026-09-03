import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;

type Pool = ReturnType<typeof postgres>;

const pools = new Map<string, Pool>();

function pool(connectionString: string): Pool {
  let existing = pools.get(connectionString);
  if (!existing) {
    existing = postgres(connectionString, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
      onnotice: () => {},
    });
    pools.set(connectionString, existing);
  }
  return existing;
}

/**
 * 소유자 권한 접속. 마이그레이션, 시드, Worker 전용이며 RLS를 우회한다.
 * 사용자 요청 경로에서는 쓰지 않는다.
 */
export function serviceDb(connectionString: string): Database {
  return drizzle(pool(connectionString), { schema, casing: "snake_case" });
}

/**
 * 사용자 요청용 접속. 테이블 소유자가 아닌 역할로 붙어 RLS가 실제로 적용된다.
 * 트랜잭션마다 app.current_user_id를 심어 auth.uid()가 값을 읽게 한다.
 */
export async function withUserSession<T>(
  connectionString: string,
  userId: string,
  fn: (tx: Database) => Promise<T>,
): Promise<T> {
  const db = drizzle(pool(connectionString), { schema, casing: "snake_case" });
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.current_user_id', ${userId}, true)`);
    await tx.execute(sql`set local role authenticated`);
    return fn(tx as unknown as Database);
  });
}

export async function closePools(): Promise<void> {
  await Promise.all([...pools.values()].map((p) => p.end({ timeout: 5 })));
  pools.clear();
}

export { schema };
