import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import NavLinks from "@/components/NavLinks";

export default async function Nav() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isAdmin = false;
  let displayName = "";
  let avatarProfile = null as null | {
    display_name: string;
    avatar_type: string | null;
    avatar_emoji: string | null;
    avatar_color: string | null;
    avatar_url: string | null;
  };
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin, display_name, avatar_type, avatar_emoji, avatar_color, avatar_url")
      .eq("id", user.id)
      .single();
    isAdmin = !!profile?.is_admin;
    displayName = profile?.display_name ?? "";
    if (profile) avatarProfile = profile;
  }

  return (
    <header className="yard-lines border-b border-line">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
        <Link href="/" className="font-display text-xl font-semibold tracking-tight text-ink">
          The Sic 'Em Sheet
        </Link>
        {user ? (
          <NavLinks isAdmin={isAdmin} displayName={displayName} avatarProfile={avatarProfile} />
        ) : (
          <Link
            href="/login"
            className="rounded bg-orange px-3 py-1.5 font-medium text-field hover:bg-orange/90"
          >
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}
