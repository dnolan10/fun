import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import FeedbackList from "@/components/FeedbackList";

export default async function AdminFeedbackPage() {
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

  const { data: feedback } = await supabase
    .from("feedback")
    .select("id, message, status, created_at, profiles(display_name)")
    .order("created_at", { ascending: false });

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold text-ink">🚩 Flags on the Play</h1>
      <p className="mt-1 text-sm text-mute">Bug reports and feedback from your group.</p>
      <div className="mt-6">
        <FeedbackList items={(feedback ?? []) as any} />
      </div>
    </div>
  );
}
