import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!profile?.is_admin) return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const { week_id } = await request.json();
  if (week_id == null) {
    return NextResponse.json({ error: "week_id is required" }, { status: 400 });
  }

  // Deleting the week cascades to its games, which cascades to their picks.
  const { error } = await supabase.from("weeks").delete().eq("id", week_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
