// 資料夾層級的跨場戰績彙總（issue #174 Stage B）。
//
// 跟 matchSummary.ts / matchOutcome.ts 同一個理由抽成純函式：這是「一個資料夾底下這幾場
// 比賽合起來戰績多少」的規則，跟 UI 怎麼排版無關，抽出來才能脫離元件單獨測試，也才不會
// 之後資料頁（M2）要用同一份戰績數字時，右欄跟資料頁各自重寫一份、慢慢飄成兩套答案。
import {
  countSetWins,
  getMatchWinner,
  winsNeededFor,
  type MatchFormat,
  type SetScoreLike,
} from "./matchOutcome";

// 算一場比賽戰績需要的最小欄位——刻意不吃完整的 Match/MatchAnalysisSummary 型別，
// 跟 matchOutcome.ts 開頭的理由一樣：這裡只認識「排球賽制」這個 domain 概念，不該
// 反過來認識資料夾/比賽列表/API 回應長什麼樣子，呼叫端自己從各自的資料源組出這個形狀。
export interface TournamentMatchInput {
  matchId: string;
  opponent: string;
  // 排序鍵；直接沿用 Match.dateTime（<input type="datetime-local"> 的原始字串），
  // 零填的年月日時分格式本身就能直接用字串比較排出時間先後，不需要另外轉成 Date。
  dateTime: string;
  format: MatchFormat;
  // 只給「已經打完」的局（跟 matchResultText / formatMatchResult 吃的 setResults 是同一份
  // 語意——進行中的最後一局不算在內），呼叫端負責篩好再傳進來。
  completedSets: SetScoreLike[];
  // 這場比賽「真的開打過」的局數，來自後端 GET /analysis/matches 的 setsPlayed
  // （artifacts/api-server/src/routes/analysis.ts）——它只數 firstServer 不是 null 的
  // set，也就是真的有人發過球的局。這是判斷「有沒有實際開打」最誠實的訊號：一場比賽
  // 可能已經建立、甚至已經排好先發，但 sets 表裡對應的那一列還是「空局」（firstServer
  // 是 null），這種空局不該被算成「已經開打」。不能直接用 completedSets.length 代替，
  // 因為 completedSets 只含「已經打完」的局，打到一半（仍在進行中）的那一局不會出現在
  // completedSets 裡，但那局照樣算「開打過」，所以要另外傳這個數字。
  setsPlayed: number;
  // 這場比賽有沒有排過先發名單（後端 hasLineup）。單獨看 hasLineup 不夠判斷「有沒有開打」——
  // 教練很常見的流程是先把先發排好、比賽當天才真的開球，中間那段「先發排好但還沒開賽」
  // 的等待期不該顯示成「進行中」，所以要跟 setsPlayed 分開看：setsPlayed > 0 才代表真的
  // 有發過球，hasLineup 只用來在「還沒開打」的前提下，進一步區分「排好先發、等開賽」跟
  // 「連先發都還沒排」這兩種更早的狀態。
  hasLineup: boolean;
}

// 逐場戰績的五種狀態，判斷優先序見 deriveMatchStatus 的註解。獨立成 exported type 是因為
// UI 端（MatchInfoRail.tsx）要拿它當 lookup table 的 key，不想讓 UI 自己重新列一次這五個
// 字面值字串、跟這裡的定義兩邊各寫一份容易飄掉。
export type TournamentMatchStatus = "won" | "lost" | "in_progress" | "lineup_only" | "not_started";

export interface TournamentMatchResult {
  matchId: string;
  opponent: string;
  dateTime: string;
  // null＝這場還沒打完（兩邊都還沒拿到贏球所需的局數），不歸進 ourWins/opponentWins，
  // 逐場清單要把它標成「進行中」而不是硬歸給某一方。
  winner: "us" | "opponent" | null;
  ourSetWins: number;
  opponentSetWins: number;
  // 給逐場清單直接渲染用的狀態，比 winner 更細——winner 只分「贏/輸/還沒分勝負」三種，
  // 但「還沒分勝負」底下其實藏著三種完全不同的情境（打到一半／排好先發還沒開賽／連先發
  // 都還沒排），過去只看 winner === null 就一律顯示「進行中」，把後面兩種也誤標成
  // 「進行中」，這個欄位就是為了修這個問題而加的。
  status: TournamentMatchStatus;
}

export interface TournamentStats {
  matchCount: number;
  // 只數「已經分出勝負」的場次；還在進行中的場次兩邊都不計，避免資料夾戰績因為一場
  // 打到一半的比賽而被灌水。
  ourWins: number;
  opponentWins: number;
  // 資料夾底下所有比賽「已完成局」的局數加總（不分這場比賽本身有沒有打完）——
  // 跟上面 ourWins/opponentWins 是不同單位：那是「贏了幾場」，這是「贏了幾局」。
  totalOurSets: number;
  totalOpponentSets: number;
  // 依 dateTime 由舊到新排序，給右欄逐場清單直接渲染用。
  matches: TournamentMatchResult[];
}

// 依優先序判斷這場比賽該顯示成哪一種狀態。優先序很重要，不能拆成五個獨立的 if 各自回傳：
// 例如 winner 已經是 "us" 的比賽，setsPlayed 一定 > 0（贏球必然發生在打過球之後），但這裡
// 刻意先判 winner，是因為「贏/輸」是終局狀態、比「有沒有開打」更值得優先呈現給使用者，
// 而不是恰好也能用 setsPlayed 分支涵蓋就偷懶不分先後。
function deriveMatchStatus(
  winner: "us" | "opponent" | null,
  setsPlayed: number,
  hasLineup: boolean,
): TournamentMatchStatus {
  if (winner === "us") return "won";
  if (winner === "opponent") return "lost";
  if (setsPlayed > 0) return "in_progress";
  if (hasLineup) return "lineup_only";
  return "not_started";
}

export function computeTournamentStats(inputs: TournamentMatchInput[]): TournamentStats {
  let ourWins = 0;
  let opponentWins = 0;
  let totalOurSets = 0;
  let totalOpponentSets = 0;

  const matches: TournamentMatchResult[] = inputs.map((m) => {
    // 這場比賽「贏了幾局」。這裡沒有直接呼叫 formatMatchResult，是因為那支回的是給人看的
    // 一句話，這裡要的是拆開的兩個數字，方便加總進 totalOurSets/totalOpponentSets——
    // #226 PR2 之後兩支都走 countSetWins，所以「同一套算法」是靠共用實作保證的，
    // 不再只是註解上的口頭約定。
    const { ourWins: ourSetWins, opponentWins: opponentSetWins } = countSetWins(m.completedSets);
    totalOurSets += ourSetWins;
    totalOpponentSets += opponentSetWins;

    const winner = getMatchWinner(m.completedSets, winsNeededFor(m.format));
    if (winner === "us") ourWins++;
    else if (winner === "opponent") opponentWins++;

    return {
      matchId: m.matchId,
      opponent: m.opponent,
      dateTime: m.dateTime,
      winner,
      ourSetWins,
      opponentSetWins,
      status: deriveMatchStatus(winner, m.setsPlayed, m.hasLineup),
    };
  });

  matches.sort((a, b) => a.dateTime.localeCompare(b.dateTime));

  return {
    matchCount: inputs.length,
    ourWins,
    opponentWins,
    totalOurSets,
    totalOpponentSets,
    matches,
  };
}
