import { NextResponse } from "next/server";
import { one } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * The container healthcheck in Dockerfile.web calls this.
 *
 * It deliberately touches the database: a web process that is up but cannot
 * reach Postgres serves errors to everyone, and Docker should know that counts
 * as unhealthy.
 */
export async function GET() {
  try {
    await one("select 1 as ok");
    return NextResponse.json({ ok: true });
  } catch {
    // No detail in the body: this endpoint is reachable from the internet.
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
