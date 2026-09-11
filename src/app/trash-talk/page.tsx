import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TrashTalkFeed from "@/components/TrashTalkFeed";

export default async function TrashTalkPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: messages } = await supabase
    .from("trash_talk")
    .select(
      "id, message, created_at, user_id, profiles(display_name, avatar_type, avatar_emoji, avatar_color, avatar_url)"
    )
    .order("created_at", { ascending: true })
    .limit(200);

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_type, avatar_emoji, avatar_color, avatar_url");

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold text-ink">🗣️ Trash Talk</h1>
      <p className="mt-1 text-sm text-mute">Say what you gotta say. Everyone in the pool can see it.</p>
      <div className="mt-4">
        <TrashTalkFeed
          initialMessages={(messages ?? []) as any}
          profiles={(profiles ?? []) as any}
          currentUserId={user.id}
        />
      </div>
    </div>
  );
}
