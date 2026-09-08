import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="mt-16">
        <h1 className="font-display text-4xl font-semibold leading-tight text-ink">
          Pick winners.
          <br />
          Beat the spread.
          <br />
          <span className="text-gold">Take the pot.</span>
        </h1>
        <p className="mt-4 max-w-md text-mute">
          A weekly college football pick &apos;em with your friends, run against the point
          spread — not just the AP Top 25.
        </p>
        <Link
          href="/login"
          className="mt-8 inline-block rounded bg-gold px-5 py-2.5 font-medium text-field hover:bg-gold/90"
        >
          Sign in to play
        </Link>
      </div>
    );
  }

  const { data: week } = await supabase
    .from("weeks")
    .select("id, label, week_number, season")
    .eq("is_published", true)
    .order("week_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold text-ink">Welcome back</h1>
      {week ? (
        <div className="mt-6 rounded border border-line bg-surface p-5">
          <p className="text-sm uppercase tracking-wide text-mute">Current week</p>
          <p className="mt-1 font-display text-xl text-ink">{week.label}</p>
          <div className="mt-4 flex gap-3">
            <Link
              href="/picks"
              className="rounded bg-gold px-4 py-2 text-sm font-medium text-field hover:bg-gold/90"
            >
              Make your picks
            </Link>
            <Link
              href="/leaderboard"
              className="rounded border border-line px-4 py-2 text-sm text-ink hover:border-gold hover:text-gold"
            >
              View standings
            </Link>
          </div>
        </div>
      ) : (
        <p className="mt-6 text-mute">No week has been published yet — check back soon.</p>
      )}
    </div>
  );
}
