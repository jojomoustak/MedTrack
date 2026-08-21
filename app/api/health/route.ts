/**
 * Minimal, unauthenticated health-check endpoint proving the Phase 4
 * foundation wires together (config validation, structured logging) —
 * deliberately does NOT touch the database (an unauthenticated endpoint
 * has no profile context to scope a query to, and this route's job is
 * "is the app up", not "is the DB reachable").
 */
import { NextResponse } from "next/server";
import { getEnv } from "@/lib/config/env";
import { toSafeErrorResponse } from "@/lib/errors/http";
import { logger } from "@/lib/logging/logger";

export const runtime = "nodejs";

export async function GET() {
  try {
    // Confirms config validation succeeds without leaking any of its values.
    getEnv();
    logger.debug("health.check.ok");
    return NextResponse.json({ status: "ok", time: new Date().toISOString() });
  } catch (err) {
    return toSafeErrorResponse(err, { route: "health" });
  }
}
