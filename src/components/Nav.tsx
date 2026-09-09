import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function Nav() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isAdmin = false;
  let displayName = "";
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin, display_name")
      .eq("id", user.id)
      .single();
    isAdmin = !!profile?.is_admin;
    displayName = profile?.display_name ?? "";
  }

  return (
    <header className="yard-lines border-b border-line">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
        <Link href="/" className="font-display text-xl font-semibold tracking-tight text-ink">
          The Pool House
        </Link>
        <nav className="flex items-center gap-5 text-sm text-mute">
          {user ? (
            <>
              <Link href="/picks" className="hover:text-ink">
                Picks
              </Link>
              <Link href="/leaderboard" className="hover:text-ink">
                Standings
              </Link>
              {isAdmin && (
                <Link href="/admin" className="hover:text-orange">
                  Admin
                </Link>
              )}
              <span className="hidden text-mute sm:inline">{displayName}</span>
              <form action="/auth/signout" method="post">
                <button className="rounded border border-line px-3 py-1.5 text-ink hover:border-orange hover:text-orange">
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <Link
              href="/login"
              className="rounded bg-orange px-3 py-1.5 font-medium text-field hover:bg-orange/90"
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
