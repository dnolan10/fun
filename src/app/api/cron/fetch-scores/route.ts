import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncFinalScores } from "@/lib/scoreSync";

// Triggered by Vercel Cron (see vercel.json) -- Vercel signs these requests
// with a bearer token matching the CRON_SECRET env var, which must be set
// in the project's environment variables.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const result = await syncFinalScores(supabase);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
