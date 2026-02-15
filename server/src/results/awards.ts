export interface ResultPlayerSnapshot {
  name: string;
  score_total: number;
  best_fish_weight: number;
  best_fish_length: number;
  best_fish_id: string;
  best_fish_achieved_ms: number;
  species_caught_count: number;
  species_count_achieved_ms: number;
}

export interface LeaderboardEntry {
  name: string;
  score_total: number;
}

export interface AwardEntry {
  title: string;
  winner_name: string;
  detail: string;
  achieved_server_ms: number;
}

export interface MatchResultsPayload {
  leaderboard: LeaderboardEntry[];
  awards: AwardEntry[];
}

export function compareScoreThenNameDesc(a: LeaderboardEntry, b: LeaderboardEntry): number {
  if (a.score_total !== b.score_total) {
    return b.score_total - a.score_total;
  }
  return a.name.localeCompare(b.name);
}

export function buildLeaderboard(players: ResultPlayerSnapshot[]): LeaderboardEntry[] {
  return players
    .map((player) => ({
      name: player.name,
      score_total: player.score_total
    }))
    .sort(compareScoreThenNameDesc);
}

export function computeAwards(
  players: ResultPlayerSnapshot[],
  leaderboard: LeaderboardEntry[],
  matchEndMs: number
): AwardEntry[] {
  const champion = leaderboard[0] ?? { name: "TBD", score_total: 0 };
  const biggestFishWinner = pickBiggestFishWinner(players);
  const mostSpeciesWinner = pickMostSpeciesWinner(players);

  const biggestFishDetail = biggestFishWinner
    ? biggestFishWinner.best_fish_weight > 0
      ? `${biggestFishWinner.best_fish_id} ${biggestFishWinner.best_fish_weight.toFixed(2)}lb`
      : "No fish caught"
    : "No players";

  const mostSpeciesDetail = mostSpeciesWinner ? `${mostSpeciesWinner.species_caught_count} species` : "No players";

  return [
    {
      title: "Champion",
      winner_name: champion.name,
      detail: `${champion.score_total} pts`,
      achieved_server_ms: matchEndMs
    },
    {
      title: "Biggest Fish",
      winner_name: biggestFishWinner?.name ?? "TBD",
      detail: biggestFishDetail,
      achieved_server_ms: biggestFishWinner?.best_fish_achieved_ms ?? 0
    },
    {
      title: "Most Species",
      winner_name: mostSpeciesWinner?.name ?? "TBD",
      detail: mostSpeciesDetail,
      achieved_server_ms: mostSpeciesWinner?.species_count_achieved_ms ?? 0
    }
  ];
}

export function computeMatchResults(players: ResultPlayerSnapshot[], matchEndMs: number): MatchResultsPayload {
  const leaderboard = buildLeaderboard(players);
  const awards = computeAwards(players, leaderboard, matchEndMs);
  return { leaderboard, awards };
}

function pickBiggestFishWinner(players: ResultPlayerSnapshot[]): ResultPlayerSnapshot | null {
  if (players.length === 0) {
    return null;
  }

  return [...players].sort((a, b) => {
    if (a.best_fish_weight !== b.best_fish_weight) {
      return b.best_fish_weight - a.best_fish_weight;
    }
    return compareAchievedThenName(a.best_fish_achieved_ms, b.best_fish_achieved_ms, a.name, b.name);
  })[0]!;
}

function pickMostSpeciesWinner(players: ResultPlayerSnapshot[]): ResultPlayerSnapshot | null {
  if (players.length === 0) {
    return null;
  }

  return [...players].sort((a, b) => {
    if (a.species_caught_count !== b.species_caught_count) {
      return b.species_caught_count - a.species_caught_count;
    }
    return compareAchievedThenName(a.species_count_achieved_ms, b.species_count_achieved_ms, a.name, b.name);
  })[0]!;
}

function compareAchievedThenName(aMs: number, bMs: number, aName: string, bName: string): number {
  const aHasAchieved = aMs > 0;
  const bHasAchieved = bMs > 0;

  if (aHasAchieved && bHasAchieved && aMs !== bMs) {
    return aMs - bMs;
  }

  return aName.localeCompare(bName);
}
