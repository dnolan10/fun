"use client";

import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatSpread, isLocked, rankLabel, statLine } from "@/lib/scoring";

type Game = {
  id: number;
  home_team: string;
  away_team: string;
  spread: number;
  kickoff_time: string;
  is_tiebreaker: boolean;
  home_rank: number | null;
  away_rank: number | null;
  home_record: string | null;
  away_record: string | null;
  home_ppg: number | null;
  away_ppg: number | null;
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

  function applyQuickPick(rule: "home" | "away" | "favorites" | "underdogs" | "random") {
    setPicks((prev) => {
      const next = { ...prev };
      for (const g of games) {
        if (isLocked(g.kickoff_time)) continue; // never touch locked games
        if (rule === "home") next[g.id] = "home";
        else if (rule === "away") next[g.id] = "away";
        else if (rule === "favorites") next[g.id] = g.spread <= 0 ? "home" : "away";
        else if (rule === "underdogs") next[g.id] = g.spread <= 0 ? "away" : "home";
        else if (rule === "random") next[g.id] = Math.random() < 0.5 ? "home" : "away";
      }
      return next;
    });
  }

  function clearPicks() {
    setPicks((prev) => {
      const next = { ...prev };
      for (const g of games) {
        if (isLocked(g.kickoff_time)) continue;
        delete next[g.id];
      }
      return next;
    });
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
        console.error("Pick save failed:", upsertError);
        setError(
          `Save failed: ${upsertError.message}${
            upsertError.code ? ` (code ${upsertError.code})` : ""
          }`
        );
        setSavedAt(null);
      } else {
        setSavedAt(Date.now());
      }
    });
  }

  const pickedCount = games.filter((g) => picks[g.id]).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 rounded border border-line bg-surface p-3">
        <span className="w-full text-xs text-mute sm:w-auto sm:self-center">Quick pick:</span>
        <button
          type="button"
          onClick={() => applyQuickPick("home")}
          className="rounded border border-line px-3 py-1.5 text-xs text-ink hover:border-orange hover:text-orange"
        >
          All home teams
        </button>
        <button
          type="button"
          onClick={() => applyQuickPick("away")}
          className="rounded border border-line px-3 py-1.5 text-xs text-ink hover:border-orange hover:text-orange"
        >
          All away teams
        </button>
        <button
          type="button"
          onClick={() => applyQuickPick("favorites")}
          className="rounded border border-line px-3 py-1.5 text-xs text-ink hover:border-orange hover:text-orange"
        >
          All favorites
        </button>
        <button
          type="button"
          onClick={() => applyQuickPick("underdogs")}
          className="rounded border border-line px-3 py-1.5 text-xs text-ink hover:border-orange hover:text-orange"
        >
          All underdogs
        </button>
        <button
          type="button"
          onClick={() => applyQuickPick("random")}
          className="rounded border border-line px-3 py-1.5 text-xs text-ink hover:border-orange hover:text-orange"
        >
          Random
        </button>
        <button
          type="button"
          onClick={clearPicks}
          className="rounded border border-line px-3 py-1.5 text-xs text-loss hover:border-loss"
        >
          Clear
        </button>
      </div>

      <p className="text-sm text-mute">
        You&apos;ve picked <span className="text-orange">{pickedCount}</span> of {games.length}{" "}
        games. Tap any game below to change your pick until it locks at kickoff.
      </p>

      {games.map((g) => {
        const locked = isLocked(g.kickoff_time);
        const pick = picks[g.id];
        return (
          <div
            key={g.id}
            className={`rounded border p-4 ${
              g.is_tiebreaker ? "border-orange/50 bg-orange/5" : "border-line bg-surface"
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
                <span className="font-medium uppercase tracking-wide text-orange">
                  Tiebreaker game
                </span>
              )}
              {locked && <span className="font-medium text-loss">Locked</span>}
              {pick && !locked && <span className="font-medium text-orange">Your pick: {pick === "home" ? g.home_team : g.away_team}</span>}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={locked}
                onClick={() => selectTeam(g.id, "away")}
                className={`rounded border px-3 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  pick === "away"
                    ? "border-orange bg-orange/10 text-ink"
                    : "border-line text-ink hover:border-orange/60"
                }`}
              >
                <div className="font-display text-lg">
                  {rankLabel(g.away_rank)}
                  {g.away_team}
                </div>
                <div className="text-sm text-mute">{formatSpread(g.spread, "away")}</div>
                <div className="text-xs text-mute">{statLine(g.away_record, g.away_ppg)}</div>
              </button>
              <button
                type="button"
                disabled={locked}
                onClick={() => selectTeam(g.id, "home")}
                className={`rounded border px-3 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  pick === "home"
                    ? "border-orange bg-orange/10 text-ink"
                    : "border-line text-ink hover:border-orange/60"
                }`}
              >
                <div className="font-display text-lg">
                  {rankLabel(g.home_rank)}
                  {g.home_team}
                </div>
                <div className="text-sm text-mute">{formatSpread(g.spread, "home")}</div>
                <div className="text-xs text-mute">{statLine(g.home_record, g.home_ppg)}</div>
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
                  className="mt-1 w-28 rounded border border-line bg-surface2 px-2 py-1.5 text-ink placeholder:text-mute focus:border-orange focus:outline-none disabled:opacity-50"
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
          className="rounded bg-orange px-5 py-2 font-medium text-field hover:bg-orange/90 disabled:opacity-60"
        >
          {isPending ? "Saving..." : "Save picks"}
        </button>
        {savedAt && <span className="text-sm text-tan">Saved ✓</span>}
        {error && <span className="text-sm text-loss">{error}</span>}
      </div>
    </div>
  );
}
