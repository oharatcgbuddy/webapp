export type MatchStat = {
  participation_id: string;
  result: "win" | "loss" | "draw";
  won_dice: boolean | null;
  opponent_leader_code: string | null;
};

export type Bucket = { code: string; games: number; wins: number; losses: number; draws: number };

export type Stats = {
  games: number;
  diceKnown: number;
  diceWon: number;
  byMyLeader: Bucket[];
  byOpponent: Bucket[];
};

export function winRate(b: { games: number; wins: number }): number {
  return b.games === 0 ? 0 : Math.round((100 * b.wins) / b.games);
}

function add(map: Map<string, Bucket>, code: string, result: MatchStat["result"]) {
  const b = map.get(code) ?? { code, games: 0, wins: 0, losses: 0, draws: 0 };
  b.games += 1;
  if (result === "win") b.wins += 1;
  else if (result === "loss") b.losses += 1;
  else b.draws += 1;
  map.set(code, b);
}

const byGames = (a: Bucket, b: Bucket) => b.games - a.games || a.code.localeCompare(b.code);

// `myLeader` associa ogni partecipazione al leader usato dall'utente.
export function computeStats(matches: MatchStat[], myLeader: Map<string, string | null>): Stats {
  const mine = new Map<string, Bucket>();
  const opp = new Map<string, Bucket>();
  let diceKnown = 0;
  let diceWon = 0;

  for (const m of matches) {
    const leader = myLeader.get(m.participation_id);
    if (leader) add(mine, leader, m.result);
    if (m.opponent_leader_code) add(opp, m.opponent_leader_code, m.result);
    if (m.won_dice !== null) {
      diceKnown += 1;
      if (m.won_dice) diceWon += 1;
    }
  }

  return {
    games: matches.length,
    diceKnown,
    diceWon,
    byMyLeader: [...mine.values()].sort(byGames),
    byOpponent: [...opp.values()].sort(byGames),
  };
}
