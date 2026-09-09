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
  home_conference: string | null;
  away_conference: string | null;
};

type OddsDebug = {
  espnTeamsFetched: number;
  teamKeysBuilt: number;
  teamsRanked: number;
  teamsWithStats: number;
  oddsGamesMatchedToEspn: number;
  oddsGamesTotal: number;
  warnings: string[];
};

export default function AdminDashboard({
  weeks,
  games,
  pickCounts,
}: {
  weeks: Week[];
  games: Game[];
  pickCounts: Record<number, number>;
}) {
  const router = useRouter();

  // --- Create week ---
  const [season, setSeason] = useState(new Date().getFullYear());
  const [weekNumber, setWeekNumber] = useState(1);
  const [label, setLabel] = useState("");
  const [creatingWeek, setCreatingWeek] = useState(false);

  // --- One shared "which week am I working on" selector for the whole
  // manage section below (adding games, editing games, publish toggle) ---
  const [selectedWeekId, setSelectedWeekId] = useState<number | "">(weeks[0]?.id ?? "");

  async function createWeek() {
    setCreatingWeek(true);
    const res = await fetch("/api/admin/create-week", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ season, week_number: weekNumber, label: label || `Week ${weekNumber}` }),
    });
    setCreatingWeek(false);
    if (res.ok) {
      const { week } = await res.json();
      setLabel("");
      if (week?.id) setSelectedWeekId(week.id);
      router.refresh();
    } else {
      const { error } = await res.json();
      alert(error);
    }
  }

  // --- Pull odds to add games to the selected week ---
  const [oddsGames, setOddsGames] = useState<OddsGame[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [spreadOverrides, setSpreadOverrides] = useState<Record<string, string>>({});
  const [tiebreakerId, setTiebreakerId] = useState<string>("");
  const [loadingOdds, setLoadingOdds] = useState(false);
  const [savingSlate, setSavingSlate] = useState(false);
  const [oddsDebug, setOddsDebug] = useState<OddsDebug | null>(null);

  async function pullOdds() {
    setLoadingOdds(true);
    const res = await fetch("/api/admin/fetch-odds");
    setLoadingOdds(false);
    if (!res.ok) {
      const { error } = await res.json();
      alert(error);
      return;
    }
    const { games: fetched, debug } = await res.json();
    setOddsGames(fetched);
    setOddsDebug(debug ?? null);
  }

  function selectByConference(conferenceMatch: RegExp) {
    setSelected((prev) => {
      const next = { ...prev };
      for (const g of oddsGames) {
        if (
          (g.home_conference && conferenceMatch.test(g.home_conference)) ||
          (g.away_conference && conferenceMatch.test(g.away_conference))
        ) {
          next[g.external_id] = true;
        }
      }
      return next;
    });
  }

  async function addGamesToWeek() {
    if (!selectedWeekId) {
      alert("Choose a week first.");
      return;
    }
    const chosen = oddsGames
      .filter((g) => selected[g.external_id])
      .map((g) => ({
        ...g,
        spread:
          spreadOverrides[g.external_id] !== undefined
            ? Number(spreadOverrides[g.external_id])
            : g.spread,
        is_tiebreaker: g.external_id === tiebreakerId,
      }));

    if (chosen.length === 0) {
      alert("Select at least one game.");
      return;
    }

    setSavingSlate(true);
    // publish stays false here on purpose -- publishing is handled by the
    // separate toggle button so adding games never silently changes it.
    const res = await fetch("/api/admin/save-games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ week_id: selectedWeekId, games: chosen, publish: false }),
    });
    setSavingSlate(false);
    if (res.ok) {
      setOddsGames([]);
      setSelected({});
      setSpreadOverrides({});
      setTiebreakerId("");
      setOddsDebug(null);
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

  // --- Manage existing games (edit spread/kickoff/tiebreaker, delete) ---
  const [rowEdits, setRowEdits] = useState<Record<number, { spread: string; kickoff: string }>>(
    {}
  );
  const [savingGameId, setSavingGameId] = useState<number | null>(null);
  const [deletingGameId, setDeletingGameId] = useState<number | null>(null);

  function toLocalInputValue(iso: string) {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
      d.getHours()
    )}:${pad(d.getMinutes())}`;
  }

  function getRowEdit(g: Game) {
    return rowEdits[g.id] ?? { spread: String(g.spread), kickoff: toLocalInputValue(g.kickoff_time) };
  }

  async function saveGameEdit(g: Game) {
    const edit = getRowEdit(g);
    setSavingGameId(g.id);
    const res = await fetch("/api/admin/update-game", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        game_id: g.id,
        spread: Number(edit.spread),
        kickoff_time: new Date(edit.kickoff).toISOString(),
      }),
    });
    setSavingGameId(null);
    if (res.ok) {
      router.refresh();
    } else {
      const { error } = await res.json();
      alert(error);
    }
  }

  async function makeTiebreaker(g: Game) {
    const res = await fetch("/api/admin/update-game", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game_id: g.id, is_tiebreaker: true }),
    });
    if (res.ok) {
      router.refresh();
    } else {
      const { error } = await res.json();
      alert(error);
    }
  }

  async function deleteGame(g: Game) {
    const warning = g.is_final
      ? "This game already has a final score. Deleting it removes it and everyone's picks for it from scoring. Continue?"
      : "Delete this game? Any picks already made for it will be removed too.";
    if (!confirm(warning)) return;
    setDeletingGameId(g.id);
    const res = await fetch("/api/admin/delete-game", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game_id: g.id }),
    });
    setDeletingGameId(null);
    if (res.ok) {
      router.refresh();
    } else {
      const { error } = await res.json();
      alert(error);
    }
  }

  const [togglingPublish, setTogglingPublish] = useState(false);

  async function togglePublish(week: Week) {
    setTogglingPublish(true);
    const res = await fetch("/api/admin/toggle-publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ week_id: week.id, is_published: !week.is_published }),
    });
    setTogglingPublish(false);
    if (res.ok) {
      router.refresh();
    } else {
      const { error } = await res.json();
      alert(error);
    }
  }

  const selectedWeek = weeks.find((w) => w.id === selectedWeekId);
  const gamesForSelectedWeek = games
    .filter((g) => g.week_id === selectedWeekId)
    .sort((a, b) => new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime());

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

      {/* Manage a week: pick it once, then add games, edit games, remove games, publish/unpublish -- all in one place */}
      <section className="rounded border border-line bg-surface p-4">
        <h2 className="font-display text-lg text-orange">2. Manage a week</h2>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <select
            value={selectedWeekId}
            onChange={(e) => setSelectedWeekId(e.target.value ? Number(e.target.value) : "")}
            className="rounded border border-line bg-surface2 px-2 py-1.5 text-ink"
          >
            <option value="">Choose a week...</option>
            {weeks.map((w) => (
              <option key={w.id} value={w.id}>
                {w.label} {w.is_published ? "(published)" : "(draft)"}
              </option>
            ))}
          </select>
          {selectedWeek && (
            <button
              onClick={() => togglePublish(selectedWeek)}
              disabled={togglingPublish}
              className={`rounded px-4 py-2 text-sm font-medium disabled:opacity-60 ${
                selectedWeek.is_published
                  ? "border border-loss text-loss hover:bg-loss/10"
                  : "bg-orange text-field hover:bg-orange/90"
              }`}
            >
              {togglingPublish
                ? "Working..."
                : selectedWeek.is_published
                ? "Unpublish this week"
                : "Publish this week"}
            </button>
          )}
        </div>

        {selectedWeekId && (
          <>
            {/* Existing games in this week */}
            <div className="mt-4 space-y-2">
              <h3 className="text-sm font-medium text-ink">Games in this week</h3>
              {gamesForSelectedWeek.length === 0 && (
                <p className="text-sm text-mute">No games yet — pull odds below to add some.</p>
              )}
              {gamesForSelectedWeek.map((g) => {
                const edit = getRowEdit(g);
                const count = pickCounts[g.id] ?? 0;
                const locked = isLocked(g.kickoff_time);
                return (
                  <div
                    key={g.id}
                    className={`rounded border p-3 ${
                      g.is_tiebreaker ? "border-orange/50 bg-orange/5" : "border-line bg-surface2"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm text-ink">
                        {g.away_team} @ {g.home_team}
                        {g.is_tiebreaker && (
                          <span className="ml-2 text-xs font-medium text-orange">TIEBREAKER</span>
                        )}
                        {locked && <span className="ml-2 text-xs text-loss">Locked</span>}
                      </div>
                      <span className="text-xs text-mute">
                        {count > 0 ? `${count} pick${count === 1 ? "" : "s"} made` : "No picks yet"}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap items-end gap-3">
                      <label className="text-xs text-mute">
                        Home spread
                        <input
                          type="number"
                          step="0.5"
                          value={edit.spread}
                          onChange={(e) =>
                            setRowEdits((prev) => ({
                              ...prev,
                              [g.id]: { ...edit, spread: e.target.value },
                            }))
                          }
                          className="ml-2 w-20 rounded border border-line bg-field px-2 py-1 text-ink"
                        />
                      </label>
                      <label className="text-xs text-mute">
                        Kickoff
                        <input
                          type="datetime-local"
                          value={edit.kickoff}
                          onChange={(e) =>
                            setRowEdits((prev) => ({
                              ...prev,
                              [g.id]: { ...edit, kickoff: e.target.value },
                            }))
                          }
                          className="ml-2 rounded border border-line bg-field px-2 py-1 text-ink"
                        />
                      </label>
                      <button
                        onClick={() => saveGameEdit(g)}
                        disabled={savingGameId === g.id}
                        className="rounded bg-tan px-3 py-1.5 text-xs text-ink hover:bg-tan/90 disabled:opacity-60"
                      >
                        {savingGameId === g.id ? "Saving..." : "Save changes"}
                      </button>
                      {!g.is_tiebreaker && (
                        <button
                          onClick={() => makeTiebreaker(g)}
                          className="rounded border border-line px-3 py-1.5 text-xs text-ink hover:border-orange hover:text-orange"
                        >
                          Make tiebreaker
                        </button>
                      )}
                      <button
                        onClick={() => deleteGame(g)}
                        disabled={deletingGameId === g.id}
                        className="rounded border border-loss px-3 py-1.5 text-xs text-loss hover:bg-loss/10 disabled:opacity-60"
                      >
                        {deletingGameId === g.id ? "Removing..." : "Remove game"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Add more games to this same week */}
            <div className="mt-6 border-t border-line pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-medium text-ink">
                  Add games to {selectedWeek?.label ?? "this week"}
                </h3>
                <button
                  onClick={pullOdds}
                  disabled={loadingOdds}
                  className="rounded border border-line px-4 py-2 text-sm text-ink hover:border-orange hover:text-orange disabled:opacity-60"
                >
                  {loadingOdds ? "Pulling..." : "Pull current NCAAF odds"}
                </button>
              </div>

              {oddsDebug && (
                <div className="mt-3 rounded border border-line bg-surface2 p-3 text-xs text-mute">
                  Matched {oddsDebug.oddsGamesMatchedToEspn}/{oddsDebug.oddsGamesTotal * 2} team
                  names to ESPN · {oddsDebug.teamsRanked} teams currently ranked ·{" "}
                  {oddsDebug.teamsWithStats} teams with stats on file.
                  {oddsDebug.warnings.length > 0 && (
                    <div className="mt-1 text-loss">
                      {oddsDebug.warnings.map((w, i) => (
                        <div key={i}>⚠ {w}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {oddsGames.length > 0 && (
                <div className="mt-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-mute">
                      Check the games you want to add, adjust spreads if needed, and mark one as
                      the tiebreaker (this replaces any existing tiebreaker for the week). Ranked
                      games are listed first, then the most lopsided unranked games.
                    </p>
                    <span className="whitespace-nowrap rounded border border-orange/40 bg-orange/10 px-3 py-1 text-sm font-medium text-orange">
                      {Object.values(selected).filter(Boolean).length} selected
                      <span className="text-mute"> (aim for 20-25 total)</span>
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => selectByConference(/big ten/i)}
                      className="rounded border border-line px-3 py-1.5 text-xs text-ink hover:border-orange hover:text-orange"
                    >
                      + Select all Big Ten games
                    </button>
                    <button
                      type="button"
                      onClick={() => selectByConference(/mid-american|\bmac\b/i)}
                      className="rounded border border-line px-3 py-1.5 text-xs text-ink hover:border-orange hover:text-orange"
                    >
                      + Select all MAC games
                    </button>
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
                        <div className="flex flex-wrap items-center gap-2">
                          <span>
                            {rankLabel(g.away_rank)}
                            {g.away_team} @ {rankLabel(g.home_rank)}
                            {g.home_team}
                          </span>
                          {(g.home_conference || g.away_conference) && (
                            <span className="rounded-full border border-tan/50 bg-tan/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-tan">
                              {[g.away_conference, g.home_conference]
                                .filter((c, i, arr) => c && arr.indexOf(c) === i)
                                .join(" vs ")}
                            </span>
                          )}
                        </div>
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
                            setSpreadOverrides((prev) => ({
                              ...prev,
                              [g.external_id]: e.target.value,
                            }))
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
                      onClick={addGamesToWeek}
                      disabled={savingSlate}
                      className="rounded bg-orange px-4 py-2 text-sm font-medium text-field hover:bg-orange/90 disabled:opacity-60"
                    >
                      {savingSlate ? "Adding..." : "Add selected games to this week"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
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
