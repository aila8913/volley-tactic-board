// 球員「決定球」統計的共用純函數。原本是 ScoreSheetStats.tsx 裡的私有函式，
// #65 分析頁（單場分析頁）也需要同一套「history → 每位球員各動作得/失分次數」的
// 計算，所以抽出來放共用層，避免兩個畫面各寫一份、之後改規則要改兩次還可能兜不攏。
//
// 「純函數」是這裡的重點：輸入只有 history + players，輸出只算一次矩陣，不碰
// React state、不發 API、不讀任何全域狀態——這樣兩個畫面（ScoreSheetStats、
// MatchAnalytics）都能直接呼叫，也方便寫單元測試釘住規則（見 statsMapping.test.ts）。
import { MatchPlayer } from "@/types/match";
import { PlayAction, PointRecord } from "@/types/scoresheet";

// 跟 pages/ScoreSheet.tsx 的 ACTION_OPTIONS 用同一組 6 大類、同樣的順序跟用字，
// 這樣兩個畫面看到的動作分類才會一致。
export const ACTIONS: PlayAction[] = ["serve", "receive", "set", "attack", "block", "dig"];
export const ACTION_LABELS: Record<PlayAction, string> = {
  serve: "發球",
  receive: "接發",
  set: "舉球",
  attack: "攻擊",
  block: "攔網",
  dig: "防守",
};

export type PlayerMatrixRow = {
  playerId: string;
  number: number;
  stats: Record<PlayAction, { won: number; lost: number }>;
};

// 把所有球序依「我方球員」分組，算出每個動作的得/失分次數。
// touchedBy.playerId 有值代表是我方球員；point.side === 'us' 代表我方得分。
//
// 重要語意（也是分析頁 #65 要標註給使用者看的地方）：這是「決定球」統計，不是逐觸球
// 統計——一分只會記錄「終結那一球」是誰、做了什麼動作（見 types/scoresheet.ts 的
// PointRecord.touchedBy 只存一個動作方），接—舉—攻這種連續觸球，只有最後一人被記到，
// 所以像舉球員這種通常不是最後觸球的角色，數字會系統性偏低，不代表他表現差。
export function buildPlayerMatrix(
  history: PointRecord[],
  players: MatchPlayer[],
): PlayerMatrixRow[] {
  const map = new Map<string, PlayerMatrixRow>();

  for (const point of history) {
    if (!point.action || !point.touchedBy?.playerId) continue;
    const pid = point.touchedBy.playerId;
    const player = players.find((p) => p.id === pid);
    if (!player) continue;

    if (!map.has(pid)) {
      map.set(pid, {
        playerId: pid,
        number: player.number,
        stats: {
          serve: { won: 0, lost: 0 },
          receive: { won: 0, lost: 0 },
          set: { won: 0, lost: 0 },
          attack: { won: 0, lost: 0 },
          block: { won: 0, lost: 0 },
          dig: { won: 0, lost: 0 },
        },
      });
    }

    const row = map.get(pid)!;
    if (point.side === "us") {
      row.stats[point.action].won++;
    } else {
      row.stats[point.action].lost++;
    }
  }

  return [...map.values()].sort((a, b) => a.number - b.number);
}
