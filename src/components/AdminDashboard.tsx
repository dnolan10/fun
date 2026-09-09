"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { isLocked, rankLabel, sortByRankThenSpread, statLine } from "@/lib/scoring";

type Week = {
  id: number;
  label: string;
  season: number;
  week_number: number;
  is_published: boolean;
};

type Game = {
  id: number;
  week_id: number;
  home_team: string;
  away_team: string;
  spread: number;
  kickoff_time: string;
  is_tiebreaker: boolean;
  home_score: number | null;
  away_score: number | null;
  is_final: boolean;
};

type OddsGame = {
  external_id: string;
  home_team: string;
  away_team: string;
  spread: number;
  kickoff_time: string;
  home_rank: number | null;
  away_rank: number | null;
  home_record: string | null;
  away_record: string | null;
  home_ppg: number | null;
  away_ppg: number | null;
};

export default function AdminDashboard({ weeks, games }: { weeks: Week[]; games: Game[] }) {
  const router = useRouter();

  // --- Create week ---
  const [season, setSeason] = useState(new Date().getFullYear());
  const [weekNumber, setWeekNumber] = useState(1);
  const [label, setLabel] = useState("");
  const [creatingWeek, setCreatingWeek] = useState(false);

  async function createWeek() {
    setCreatingWeek(true);
    const res = await fetch("/api/admin/create-week", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ season, week_number: weekNumber, label: label || `Week ${weekNumber}` }),
    });
    setCreatingWeek(false);
    if (res.ok) {
      setLabel("");
      router.refresh();
    } else {
      const { error } = await res.json();
      alert(error);
    }
  }

  // --- Pull odds & build a week's slate ---
  const [targetWeekId, setTargetWeekId] = useState<number | "">("");
  const [oddsGames, setOddsGames] = useState<OddsGame[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [spreadOverrides, setSpreadOverrides] = useState<Record<string, string>>({});
  const [tiebreakerId, setTiebreakerId] = useState<string>("");
  const [loadingOdds, setLoadingOdds] = useState(false);
  const [savingSlate, setSavingSlate] = useState(false);

  async function pullOdds() {
    setLoadingOdds(true);
    const res = await fetch("/api/admin/fetch-odds");
    setLoadingOdds(false);
    if (!res.ok) {
      const { error } = await res.json();
      alert(error);
      return;
    }
    const { games: fetched } = await res.json();
    setOddsGames(fetched);
  }

  async function saveSlate(publish: boolean) {
    if (!targetWeekId) {
      alert("Choose which week to attach these games to first.");
      return;
    }
    const chosen = oddsGames
      .filter((g) => selected[g.external_id])
      .map((g) => ({
        ...g,
        spread: spreadOverrides[g.external_id] !== undefined
          ? Number(spreadOverrides[g.external_id])
          : g.spread,
        is_tiebreaker: g.external_id === tiebreakerId,
      }));

    if (chosen.length === 0) {
      alert("Select at least one game.");
      return;
    }

    setSavingSlate(true);
    const res = await fetch("/api/admin/save-games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ week_id: targetWeekId, games: chosen, publish }),
    });
    setSavingSlate(false);
    if (res.ok) {
      setOddsGames([]);
      setSelected({});
      setSpreadOverrides({});
      setTiebreakerId("");
      router.refresh();
    } else {
      const { error } = await res.json();
      alert(error);
    }
  }

  // --- Enter results ---
  const [scoreInputs, setScoreInputs] = useState<Record<number, { home: string; away: string }>>({});
  const [savingResult, setSavingResult] = useState<number | null>(null);

  async function saveResult(gameId: number) {
    const input = scoreInputs[gameId];
    if (!input || input.home === "" || input.away === "") {
      alert("Enter both scores.");
      return;
    }
    setSavingResult(gameId);
    const res = await fetch("/api/admin/enter-results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        game_id: gameId,
        home_score: Number(input.home),
        away_score: Number(input.away),
      }),
    });
    setSavingResult(null);
    if (res.ok) {
      router.refresh();
    } else {
      const { error } = await res.json();
      alert(error);
    }
  }

  const unpublishedOrRecentWeeks = weeks;
  const needsResults = games.filter((g) => !g.is_final && isLocked(g.kickoff_time));

  return (
    <div className="space-y-10">
      <h1 className="font-display text-3xl font-semibold text-ink">Admin</h1>

      {/* Create week */}
      <section className="rounded border border-line bg-surface p-4">
        <h2 className="font-display text-lg text-orange">1. Create a week</h2>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-mute">Season</label>
            <input
              type="number"
              value={season}
              onChange={(e) => setSeason(Number(e.target.value))}
              className="mt-1 w-24 rounded border border-line bg-surface2 px-2 py-1.5 text-ink"
            />
          </div>
          <div>
            <label className="block text-xs text-mute">Week #</label>
            <input
              type="number"
              value={weekNumber}
              onChange={(e) => setWeekNumber(Number(e.target.value))}
              className="mt-1 w-20 rounded border border-line bg-surface2 px-2 py-1.5 text-ink"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-mute">Label</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={`Week ${weekNumber}`}
              className="mt-1 w-full rounded border border-line bg-surface2 px-2 py-1.5 text-ink placeholder:text-mute"
            />
          </div>
          <button
            onClick={createWeek}
            disabled={creatingWeek}
            className="rounded bg-orange px-4 py-2 text-sm font-medium text-field hover:bg-orange/90 disabled:opacity-60"
          >
            {creatingWeek ? "Creating..." : "Create week"}
          </button>
        </div>
      </section>

      {/* Pull odds & build slate */}
      <section className="rounded border border-line bg-surface p-4">
        <h2 className="font-display text-lg text-orange">2. Build the slate</h2>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <select
            value={targetWeekId}
            onChange={(e) => setTargetWeekId(e.target.value ? Number(e.target.value) : "")}
            className="rounded border border-line bg-surface2 px-2 py-1.5 text-ink"
          >
            <option value="">Attach games to week...</option>
            {unpublishedOrRecentWeeks.map((w) => (
              <option key={w.id} value={w.id}>
                {w.label} {w.is_published ? "(published)" : "(draft)"}
              </option>
            ))}
          </select>
          <button
            onClick={pullOdds}
            disabled={loadingOdds}
            className="rounded border border-line px-4 py-2 text-sm text-ink hover:border-orange hover:text-orange disabled:opacity-60"
          >
            {loadingOdds ? "Pulling..." : "Pull current NCAAF odds"}
          </button>
        </div>

        {oddsGames.length > 0 && (
          <div className="mt-4 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-mute">
                Check the games you want in this week&apos;s pool, adjust spreads if needed, and
                mark one as the tiebreaker. Ranked-team games are listed first, then the most
                lopsided unranked games.
              </p>
              <span className="whitespace-nowrap rounded border border-orange/40 bg-orange/10 px-3 py-1 text-sm font-medium text-orange">
                {Object.values(selected).filter(Boolean).length} selected
                <span className="text-mute"> (aim for 20-25)</span>
              </span>
            </div>
            {sortByRankThenSpread(oddsGames).map((g) => (
              <div
                key={g.external_id}
                className="flex flex-wrap items-center gap-3 rounded border border-line bg-surface2 p-3"
              >
                <input
                  type="checkbox"
                  checked={!!selected[g.external_id]}
                  onChange={(e) =>
                    setSelected((prev) => ({ ...prev, [g.external_id]: e.target.checked }))
                  }
                />
                <div className="flex-1 text-sm text-ink">
                  {rankLabel(g.away_rank)}
                  {g.away_team} @ {rankLabel(g.home_rank)}
                  {g.home_team}
                  <div className="text-xs text-mute">
                    {new Date(g.kickoff_time).toLocaleString()}
                  </div>
                  <div className="text-xs text-mute">
                    {statLine(g.away_record, g.away_ppg)}
                    {g.away_record || g.away_ppg != null ? "  vs  " : ""}
                    {statLine(g.home_record, g.home_ppg)}
                  </div>
                </div>
                <label className="text-xs text-mute">
                  Home spread
                  <input
                    type="number"
                    step="0.5"
                    value={spreadOverrides[g.external_id] ?? g.spread}
                    onChange={(e) =>
                      setSpreadOverrides((prev) => ({ ...prev, [g.external_id]: e.target.value }))
                    }
                    className="ml-2 w-20 rounded border border-line bg-field px-2 py-1 text-ink"
                  />
                </label>
                <label className="flex items-center gap-1 text-xs text-mute">
                  <input
                    type="radio"
                    name="tiebreaker"
                    checked={tiebreakerId === g.external_id}
                    onChange={() => setTiebreakerId(g.external_id)}
                  />
                  Tiebreaker
                </label>
              </div>
            ))}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => saveSlate(true)}
                disabled={savingSlate}
                className="rounded bg-orange px-4 py-2 text-sm font-medium text-field hover:bg-orange/90 disabled:opacity-60"
              >
                {savingSlate ? "Saving..." : "Save & publish week"}
              </button>
              <button
                onClick={() => saveSlate(false)}
                disabled={savingSlate}
                className="rounded border border-line px-4 py-2 text-sm text-ink hover:border-orange hover:text-orange disabled:opacity-60"
              >
                Save as draft
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Enter results */}
      <section className="rounded border border-line bg-surface p-4">
        <h2 className="font-display text-lg text-orange">3. Enter final scores</h2>
        <p className="mt-1 text-xs text-mute">
          Scoring, weekly winners, and the cumulative leaderboard update automatically once you
          save a final score.
        </p>
        <div className="mt-3 space-y-2">
          {needsResults.length === 0 && (
            <p className="text-sm text-mute">No games are waiting on a final score.</p>
          )}
          {needsResults.map((g) => (
            <div
              key={g.id}
              className="flex flex-wrap items-center gap-3 rounded border border-line bg-surface2 p-3"
            >
              <div className="flex-1 text-sm text-ink">
                {g.away_team} @ {g.home_team}
              </div>
              <input
                type="number"
                placeholder="Away score"
                value={scoreInputs[g.id]?.away ?? ""}
                onChange={(e) =>
                  setScoreInputs((prev) => ({
                    ...prev,
                    [g.id]: { home: prev[g.id]?.home ?? "", away: e.target.value },
                  }))
                }
                className="w-28 rounded border border-line bg-field px-2 py-1 text-ink"
              />
              <input
                type="number"
                placeholder="Home score"
                value={scoreInputs[g.id]?.home ?? ""}
                onChange={(e) =>
                  setScoreInputs((prev) => ({
                    ...prev,
                    [g.id]: { home: e.target.value, away: prev[g.id]?.away ?? "" },
                  }))
                }
                className="w-28 rounded border border-line bg-field px-2 py-1 text-ink"
              />
              <button
                onClick={() => saveResult(g.id)}
                disabled={savingResult === g.id}
                className="rounded bg-tan px-3 py-1.5 text-sm text-ink hover:bg-tan/90 disabled:opacity-60"
              >
                {savingResult === g.id ? "Saving..." : "Save result"}
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
