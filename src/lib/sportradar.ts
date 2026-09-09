// Shared SportRadar NCAAFB v7 helpers: AP rankings + standings (record, PPG,
// conference), all matched to a team by SportRadar's own stable team GUID
// rather than fuzzy name matching. See fetch-odds/route.ts for the fuller
// explanation of why ID-based matching matters.

export function normalizeTeamName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
}

export function sportradarUrl(path: string, apiKey: string) {
  const accessLevel = process.env.SPORTRADAR_ACCESS_LEVEL || "trial";
  return `https://api.sportradar.com/ncaafb/${accessLevel}/v7/en${path}?api_key=${apiKey}`;
}

// Generic recursive collector: finds every object in an arbitrarily-nested
// JSON blob that has ALL of the given keys, since SportRadar's docs specify
// field names but not the exact envelope shape.
export function collectObjectsWithKeys(node: any, requiredKeys: string[], out: any[]) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((n) => collectObjectsWithKeys(n, requiredKeys, out));
    return;
  }
  if (requiredKeys.every((k) => node[k] !== undefined)) {
    out.push(node);
  }
  for (const key of Object.keys(node)) {
    collectObjectsWithKeys(node[key], requiredKeys, out);
  }
}

export async function fetchApRankings(
  apiKey: string,
  warnings: string[]
): Promise<Map<string, number>> {
  const rankMap = new Map<string, number>();
  try {
    const year = new Date().getFullYear();
    const res = await fetch(sportradarUrl(`/polls/AP25/${year}/rankings.json`, apiKey), {
      cache: "no-store",
    });
    if (!res.ok) {
      warnings.push(`SportRadar rankings returned ${res.status}`);
      return rankMap;
    }
    const data = await res.json();
    const entries: any[] = [];
    collectObjectsWithKeys(data, ["rank", "team"], entries);
    for (const entry of entries) {
      const teamId = entry.team?.id;
      if (teamId && typeof entry.rank === "number") {
        rankMap.set(teamId, entry.rank);
      }
    }
    if (rankMap.size === 0) warnings.push("Parsed 0 ranked teams from SportRadar rankings response");
  } catch (e: any) {
    warnings.push(`SportRadar rankings fetch failed: ${e?.message ?? e}`);
  }
  return rankMap;
}

export type TeamStat = {
  id: string;
  market: string;
  name: string;
  alias: string;
  record: string | null;
  ppg: number | null;
  conference: string | null;
};

function collectStandingsEntries(node: any, out: TeamStat[], conferenceName: string | null) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((n) => collectStandingsEntries(n, out, conferenceName));
    return;
  }
  if (
    node.id &&
    node.market &&
    node.wins !== undefined &&
    node.losses !== undefined &&
    node.points_for !== undefined
  ) {
    const wins = node.wins ?? 0;
    const losses = node.losses ?? 0;
    const ties = node.ties ?? 0;
    const gamesPlayed = wins + losses + ties;
    const ppg = gamesPlayed > 0 ? Math.round((node.points_for / gamesPlayed) * 10) / 10 : null;
    out.push({
      id: node.id,
      market: node.market,
      name: node.name ?? "",
      alias: node.alias ?? "",
      record: ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`,
      ppg,
      conference: conferenceName,
    });
    return;
  }

  for (const key of Object.keys(node)) {
    const child = node[key];
    if (/^conferences?$/i.test(key)) {
      const list = Array.isArray(child) ? child : [child];
      for (const conf of list) {
        const confName =
          conf && typeof conf === "object" && typeof conf.name === "string"
            ? conf.name
            : conferenceName;
        collectStandingsEntries(conf, out, confName);
      }
    } else {
      collectStandingsEntries(child, out, conferenceName);
    }
  }
}

export async function fetchStandings(apiKey: string, warnings: string[]): Promise<TeamStat[]> {
  try {
    const year = new Date().getFullYear();
    const res = await fetch(sportradarUrl(`/seasons/${year}/REG/standings/season.json`, apiKey), {
      cache: "no-store",
    });
    if (!res.ok) {
      warnings.push(`SportRadar standings returned ${res.status}`);
      return [];
    }
    const data = await res.json();
    const out: TeamStat[] = [];
    collectStandingsEntries(data, out, null);
    if (out.length === 0) warnings.push("Parsed 0 teams from SportRadar standings response");
    return out;
  } catch (e: any) {
    warnings.push(`SportRadar standings fetch failed: ${e?.message ?? e}`);
    return [];
  }
}

// Only unique keys are kept -- an ambiguous name is dropped rather than
// guessed, so two similarly-named teams can never shadow each other.
export function buildTeamIdMap(teams: TeamStat[]): Map<string, string> {
  const keyCounts = new Map<string, number>();
  const candidates: Array<[string, string]> = [];
  for (const t of teams) {
    const keys = new Set(
      [`${t.market} ${t.name}`, t.market, t.alias].map(normalizeTeamName).filter((k) => k.length > 0)
    );
    for (const k of keys) {
      candidates.push([k, t.id]);
      keyCounts.set(k, (keyCounts.get(k) ?? 0) + 1);
    }
  }
  const map = new Map<string, string>();
  for (const [key, id] of candidates) {
    if (keyCounts.get(key) === 1) map.set(key, id);
  }
  return map;
}

export function lookupTeamId(teamName: string, idMap: Map<string, string>): string | null {
  return idMap.get(normalizeTeamName(teamName)) ?? null;
}

// Runs both SportRadar calls (sequentially -- trial keys are commonly
// limited to ~1 request/second) and returns everything needed to attach
// rank/record/PPG to a team by its display name.
export async function getSportradarData(apiKey: string, warnings: string[]) {
  const standings = await fetchStandings(apiKey, warnings);
  const rankMap = await fetchApRankings(apiKey, warnings);
  const teamIdMap = buildTeamIdMap(standings);
  const statsById = new Map(standings.map((t) => [t.id, t]));
  return { standings, rankMap, teamIdMap, statsById };
}
