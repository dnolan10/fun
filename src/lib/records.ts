import type { UserRecord } from "@/lib/scoring";

// Cumulative against-the-spread record for every user, built from every
// final game so far this season. `pick_results` already has select granted
// to authenticated/anon, so this is a plain read -- no new migration needed.
export async function getAllUserRecords(supabase: any): Promise<Map<string, UserRecord>> {
  const { data } = await supabase
    .from("pick_results")
    .select("user_id, points, ats_winner")
    .not("points", "is", null);

  const map = new Map<string, UserRecord>();
  for (const r of data ?? []) {
    const rec = map.get(r.user_id) ?? { wins: 0, losses: 0, pushes: 0 };
    if (r.ats_winner === "push") rec.pushes++;
    else if (r.points === 1) rec.wins++;
    else rec.losses++;
    map.set(r.user_id, rec);
  }
  return map;
}
