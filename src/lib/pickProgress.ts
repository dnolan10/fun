export type PickCompletion = {
  user_id: string;
  display_name: string;
  total_games: number;
  picks_made: number;
  is_complete: boolean;
};

export async function getWeekPickCompletion(supabase: any, weekId: number): Promise<PickCompletion[]> {
  const { data, error } = await supabase.rpc("week_pick_completion", { p_week_id: weekId });
  if (error) {
    console.error("week_pick_completion failed:", error);
    return [];
  }
  return (data ?? []) as PickCompletion[];
}
