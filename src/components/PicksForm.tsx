"use client";

import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatSpread, isLocked } from "@/lib/scoring";

type Game = {
  id: number;
  home_team: string;
  away_team: string;
  spread: number;
  kickoff_time: string;
  is_tiebreaker: boolean;
};

type ExistingPick = {
  game_id: number;
  picked_team: "home" | "away";
  tiebreaker_guess: number | null;
};

export default function PicksForm({
  userId,
  games,
  existingPicks,
}: {
  userId: string;
  games: Game[];
  existingPicks: ExistingPick[];
}) {
  const initialPicks: Record<number, "home" | "away" | undefined> = {};
  const initialTiebreaker: Record<number, string> = {};
  for (const p of existingPicks) {
    initialPicks[p.game_id] = p.picked_team;
    if (p.tiebreaker_guess != null) initialTiebreaker[p.game_id] = String(p.tiebreaker_guess);
  }

  const [picks, setPicks] = useState(initialPicks);
  const [tiebreakers, setTiebreakers] = useState(initialTiebreaker);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function selectTeam(gameId: number, side: "home" | "away") {
    if (isLocked(games.find((g) => g.id === gameId)!.kickoff_time)) return;
    setPicks((prev) => ({ ...prev, [gameId]: side }));
  }

  function handleSubmit() {
    setError("");
    startTransition(async () => {
      const supabase = createClient();
      const rows = games
        .filter((g) => !isLocked(g.kickoff_time) && picks[g.id])
        .map((g) => ({
          user_id: userId,
          game_id: g.id,
          picked_team: picks[g.id],
          tiebreaker_guess: g.is_tiebreaker && tiebreakers[g.id] ? Number(tiebreakers[g.id]) : null,
        }));

      if (rows.length === 0) {
        setError("Pick at least one game before saving.");
        return;
      }

      const { error: upsertError } = await supabase
        .from("picks")
        .upsert(rows, { onConflict: "user_id,game_id" });

      if (upsertError) {
        setError(upsertError.message);
      } else {
        setSavedAt(Date.now());
      }
    });
  }

  return (
    <div className="space-y-4">
      {games.map((g) => {
        const locked = isLocked(g.kickoff_time);
        const pick = picks[g.id];
        return (
          <div
            key={g.id}
            className={`rounded border p-4 ${
              g.is_tiebreaker ? "border-gold/50 bg-gold/5" : "border-line bg-surface"
            }`}
          >
            <div className="flex items-center justify-between text-xs text-mute">
              <span>
                {new Date(g.kickoff_time).toLocaleString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
              {g.is_tiebreaker && (
                <span className="font-medium uppercase tracking-wide text-gold">
                  Tiebreaker game
                </span>
              )}
              {locked && <span className="font-medium text-loss">Locked</span>}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={locked}
                onClick={() => selectTeam(g.id, "away")}
                className={`rounded border px-3 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  pick === "away"
                    ? "border-gold bg-gold/10 text-ink"
                    : "border-line text-ink hover:border-gold/60"
                }`}
              >
                <div className="font-display text-lg">{g.away_team}</div>
                <div className="text-sm text-mute">{formatSpread(g.spread, "away")}</div>
              </button>
              <button
                type="button"
                disabled={locked}
                onClick={() => selectTeam(g.id, "home")}
                className={`rounded border px-3 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  pick === "home"
                    ? "border-gold bg-gold/10 text-ink"
                    : "border-line text-ink hover:border-gold/60"
                }`}
              >
                <div className="font-display text-lg">{g.home_team}</div>
                <div className="text-sm text-mute">{formatSpread(g.spread, "home")}</div>
              </button>
            </div>

            {g.is_tiebreaker && (
              <div className="mt-3">
                <label className="text-xs text-mute">
                  Guess the combined final score (both teams&apos; points added together)
                </label>
                <input
                  type="number"
                  disabled={locked}
                  value={tiebreakers[g.id] ?? ""}
                  onChange={(e) =>
                    setTiebreakers((prev) => ({ ...prev, [g.id]: e.target.value }))
                  }
                  placeholder="e.g. 65"
                  className="mt-1 w-28 rounded border border-line bg-surface2 px-2 py-1.5 text-ink placeholder:text-mute focus:border-gold focus:outline-none disabled:opacity-50"
                />
              </div>
            )}
          </div>
        );
      })}

      <div className="sticky bottom-4 flex items-center gap-3 rounded border border-line bg-surface2/95 p-3 backdrop-blur">
        <button
          onClick={handleSubmit}
          disabled={isPending}
          className="rounded bg-gold px-5 py-2 font-medium text-field hover:bg-gold/90 disabled:opacity-60"
        >
          {isPending ? "Saving..." : "Save picks"}
        </button>
        {savedAt && <span className="text-sm text-turf">Saved ✓</span>}
        {error && <span className="text-sm text-loss">{error}</span>}
      </div>
    </div>
  );
}
