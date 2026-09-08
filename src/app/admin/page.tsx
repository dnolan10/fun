import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminDashboard from "@/components/AdminDashboard";

export default async function AdminPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!profile?.is_admin) redirect("/");

  const { data: weeks } = await supabase
    .from("weeks")
    .select("id, label, season, week_number, is_published")
    .order("week_number", { ascending: false });

  const { data: games } = await supabase
    .from("games")
    .select("id, week_id, home_team, away_team, spread, kickoff_time, is_tiebreaker, home_score, away_score, is_final")
    .order("kickoff_time", { ascending: true });

  return (
    <AdminDashboard weeks={weeks ?? []} games={games ?? []} />
  );
}
