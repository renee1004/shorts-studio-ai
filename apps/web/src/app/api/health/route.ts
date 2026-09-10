import { sql } from "drizzle-orm";
import { serviceDb } from "@shorts-os/db";
import { env } from "@/server/env";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const current = env();
    await serviceDb(current.DATABASE_URL).execute(sql`select 1 from schema_migrations limit 1`);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
