// 計分表 domain 型別（types/scoresheet.ts 的 PointRecord / SetRecordingState）跟後端計分
// API DTO（@workspace/api-client-react 產生的 Rally / NewRally / NewEvent / MatchSet）之間的
// 轉換都集中在這裡，比照 lib/matchMapping.ts 的做法，讓 hooks/元件只管流程、不管欄位對應。
//
// 三個主要落差：
//   1. 「哪一邊」：前端用 'us' / 'opponent'，後端用 'home' / 'away'。
//   2. 一分的結構：前端一個 PointRecord（誰得分 + 這一球誰做了什麼動作）→ 後端拆成
//      一個 rally（誰得這分）＋ 最多一個 event（那一球的動作／球員）。「沒看到」只有 rally、沒 event。
//   3. 輪轉/發球方不存在後端：sets 只多存一個「誰先發（firstServer）」的種子，其餘（比分、
//      發球方、輪轉、每球的 side-out 旗標）都由這裡 replay rally 序列重算回來。
import type {
  MatchSet,
  Rally,
  MatchEvent,
  NewRally,
  NewEvent,
  Substitution,
  NewSubstitution,
  Timeout,
  NewTimeout,
  Lineup,
  NewLineup,
} from "@workspace/api-client-react";
import type {
  Side,
  PointRecord,
  PlayAction,
  SetRecordingState,
  RegularSub,
  TimeoutRecord,
  ScoreSheetState,
  CompletedSet,
  LineupSnapshot,
} from "../types/scoresheet";
import { applyRally, applyRegularSub, splitCompletedAndCurrent } from "./volleyballRules";

// ── us/opponent ↔ home/away ──
// 後端所有計分相關的表（rallies.winner、events.side、sets.firstServer）都用 home/away，
// 前端一律用 us/opponent，進出後端就在這一層翻譯，其他地方不出現 home/away。
export function sideToApi(side: Side): "home" | "away" {
  return side === "us" ? "home" : "away";
}

export function apiToSide(value: "home" | "away"): Side {
  return value === "home" ? "us" : "opponent";
}

// ── 局末勝負判定（issue #45）──
// 排球規則：一般局先得 25 分、決勝局（第 5 局）先得 15 分，且都必須「淨勝 2 分以上」才算
// 贏下這一局（24:24 之後進入 deuce，要打到領先 2 分為止，理論上沒有上限）。
// 注意：這個 app 不會自動判定局末——「下一局」是教練手動按的按鈕——所以這裡不是用來
// 自動封局，只是給 UI 判斷「現在按下一局，比分到底達標了沒」，沒達標就跳出確認提醒，
// 避免 0:0 之類的空局被誤封存成一局。
export function isSetComplete(setNumber: number, ourScore: number, opponentScore: number): boolean {
  const target = setNumber >= 5 ? 15 : 25;
  const leader = Math.max(ourScore, opponentScore);
  const diff = Math.abs(ourScore - opponentScore);
  return leader >= target && diff >= 2;
}

// ── 動作選項的情境反灰（issue #50 規則#1：發球/接發互斥）──
// 記一球、選動作時，依「目前誰發球（serving）」跟「這一球的動作方（actorSide）」把當下
// 不可能的動作標成反灰。反灰≠刪掉：呼叫端六顆動作永遠留在固定方位，只是灰掉、點了沒反應
// ——PO 要記錄者靠肌肉記憶按方位，呼應簡易版節奏遊戲的手感（見 issue #50 討論）。
//
// 只有一條安全規則：排球規則裡「發球」「接發」是賽前狀態就綁死在某一方的動作——發球只可能
// 是發球方做的、接發只可能是接發方做的。所以動作方是發球方就反灰 receive、是接發方就反灰 serve。
// 其餘四個動作（舉球/攻擊/攔網/防守）在一分裡兩邊都可能做、也都可能是「決定球」，一律保留。
//
// （曾評估過「先記這分得/失分、得分時再多反灰接發/舉球/防守」的 C8 構想，但依 Data Volley 記錄
// 慣例站不住：防守反彈過網得分記防守、舉球失誤過網得分記舉球、接發直接得分是進階版才有的
// Freeball——得分的決定球六種都可能，多知道得失分換不到任何安全反灰，故不採用。詳見 issue #50。）
//
// 回傳「要反灰的動作」清單（規則#1 恰好一顆）；serving===null（還沒選先發方、理應還不能記球）
// 時不反灰任何動作，回空陣列，呼叫端六顆全亮。
export function disabledActions(serving: Side | null, actorSide: Side): PlayAction[] {
  if (serving === null) return [];
  return [actorSide === serving ? "receive" : "serve"];
}

// ── 「得分／失分」→ 這分實際算誰的（issue #226）──
// 記一球時使用者選的是「動作方這一球是得分還是失分」，不是「我方/對手直接得分」——
// 對手做了一個動作、這個動作是「得分」，代表對手拿到這一分；同一個動作若是「失分」，
// 代表對手沒拿到（我方拿到）。動作方是我方球員時邏輯相反過來，一樣是「這個動作方
// 自己得分還是失分」。這一行判斷原本寫在 ScoreSheet.tsx 的事件處理器裡（JSX 元件內部），
// 完全沒有測試覆蓋；抽成這支純函式後才測得到。
export function resolveScoringSide(actorSide: Side, outcome: "win" | "lose"): Side {
  if (outcome === "win") return actorSide;
  return actorSide === "us" ? "opponent" : "us";
}

// ── PointRecord → rally ──
// 一個 PointRecord 就是一分 = 一個 rally。homeScore/awayScore 存的是「這分開始前」的比分
// （後端設計，見 lib/db/src/schema/rallies.ts），所以呼叫端要把記這分之前的比分傳進來。
// homeRotation/awayRotation 同理，存的也是「這分開始前」的輪次快照，不是加分/輪轉後的值。
export function pointRecordToRally(
  point: PointRecord,
  rallyNumber: number,
  homeScoreBefore: number,
  awayScoreBefore: number,
  homeRotationBefore: number,
  awayRotationBefore: number,
): NewRally {
  return {
    rallyNumber,
    homeScore: homeScoreBefore,
    awayScore: awayScoreBefore,
    homeRotation: homeRotationBefore,
    awayRotation: awayRotationBefore,
    winner: sideToApi(point.side),
  };
}

// ── PointRecord → event ──
// 簡易版一分最多記一球（sequence 固定 1）：有選動作又有動作方時才產生 event。
// 「沒看到」/沒帶動作 → 回 null，代表這分只有 rally、底下不記任何一球。
// playerId 只有我方球員對得到；對手(全體)沒有球員 → null。前後端球員 id 現在都是字串 uuid
// （見 lib/db/src/schema/players.ts 的改動），不用再轉型別，undefined 轉成 null 即可。
// ballType/quality/座標都是進階版（賽後精確記）才填，簡易版一律留空。
export function pointRecordToEvent(point: PointRecord, sequence: number): NewEvent | null {
  if (!point.action || !point.touchedBy) return null;
  return {
    sequence,
    side: sideToApi(point.touchedBy.side),
    playerId: point.touchedBy.playerId ?? null,
    action: point.action,
    source: "live",
  };
}

// ── event → PointRecord 的動作資訊（pointRecordToEvent 的反向）──
// 重建時把後端 event 還原成 PointRecord 的 action/touchedBy。是 pointRecordToEvent 的逆：
//   - side：event.side（home/away）→ touchedBy.side（us/opponent）。
//   - playerId：後端 int（可為 null，代表對手(全體)沒有球員）→ 前端字串 / undefined。
//   - zone 不還原：events 沒存 zone（它是可由輪轉+球員衍生的顯示值，統計也用不到）。
// event.action 型別上是後端 EventAction，跟前端 PlayAction 是同一組字面值，斷言成 PlayAction。
export function eventToMeta(event: MatchEvent): Pick<PointRecord, "action" | "touchedBy"> {
  return {
    action: event.action as PlayAction,
    touchedBy: {
      side: apiToSide(event.side),
      playerId: event.playerId ?? undefined,
    },
  };
}

// ── 從後端重建一局的完整前端狀態 ──
// sets 表只存 setNumber + firstServer（誰先發）。比分、發球方、輪轉、每球的 wasSideOut
// 全部靠「從先發方開始、按 rallyNumber 依序 replay 每個 rally 的 winner」重算：
//   - 排球規則：只有原本沒發球的一方贏球（side-out，奪回發球權）才輪轉一個位置；
//     發球方自己續分只加分不輪轉。我方、對手各自獨立輪轉。（跟 useScoreSheet.scorePoint 同一套規則。）
//   - eventsByRallyId 帶進來時（3b-ii），每個 rally 若有 event 就把 action/touchedBy 補回 PointRecord，
//     reload / 跨場後球員統計才正確；不帶（或某 rally 沒 event，例如「沒看到」）就只重建
//     { side, wasSideOut, serverId }。簡易版一分最多一球，取 sequence 最小的那顆（呼叫端已排序）。
export function reconstructSetFromRallies(
  apiSet: MatchSet,
  rallies: Rally[],
  // key 是 rallyId，型別跟著 rallies.id 從 number 改成 string（#64 PR1：主鍵改 uuid）。
  eventsByRallyId?: Map<string, MatchEvent[]>,
): SetRecordingState {
  // 空局防呆（#63）：按「下一局」的當下就會先建一筆 firstServer=null 的空 set row
  // （見 lib/db/src/schema/sets.ts 的註解），此時教練還沒選先發方，這局理應完全沒有
  // rally。與其硬套下面的 replay 邏輯（apiToSide(null) 會炸），不如直接短路回傳一份
  // 空白的 SetRecordingState——serving: null 會讓畫面顯示「這局由誰先發球？」，
  // 跟一場比賽從沒記過任何一局時的空狀態（makeEmptySet）一致，只差 serverId 已經
  // 有後端 row 可以掛（選好先發方後就 PATCH 這個 id，不用再 POST 新 set）。
  if (apiSet.firstServer == null) {
    return { ...makeEmptySet(apiSet.setNumber), serverId: apiSet.id };
  }

  const sorted = [...rallies].sort((a, b) => a.rallyNumber - b.rallyNumber);

  // 用 lib/volleyballRules.ts 的 applyRally 逐分重放，取代這裡以前手寫的一份「side-out
  // 才輪轉」邏輯——跟 useScoreSheet.ts 的 scorePoint 現在共用同一個純函式，兩邊規則
  // 保證同步（見 volleyballRules.ts 開頭的說明；volleyballRules.test.ts 有 live/replay
  // parity 測試釘住這件事）。ruleState 從先發方起算，每分結束後更新成 applyRally 回傳的新值。
  let ruleState = {
    ourScore: 0,
    opponentScore: 0,
    serving: apiToSide(apiSet.firstServer),
    ourRotation: 0,
    opponentRotation: 0,
  };
  const history: PointRecord[] = [];

  for (const rally of sorted) {
    const winnerSide = apiToSide(rally.winner);
    const { state: nextRuleState, wasSideOut } = applyRally(ruleState, winnerSide);

    const events = eventsByRallyId?.get(rally.id);
    const meta = events && events.length > 0 ? eventToMeta(events[0]) : undefined;
    history.push({ side: winnerSide, wasSideOut, serverId: rally.id, ...meta });

    ruleState = nextRuleState;
  }

  return {
    setNumber: apiSet.setNumber,
    ourScore: ruleState.ourScore,
    opponentScore: ruleState.opponentScore,
    // 沒有任何 rally 時 ruleState.serving 還是先發方（迴圈沒跑，初始值原封不動），
    // 有 rally 時是最後一分的贏家（applyRally 每次都把 serving 設成贏家）。
    serving: ruleState.serving,
    ourRotation: ruleState.ourRotation,
    opponentRotation: ruleState.opponentRotation,
    history,
    serverId: apiSet.id,
  };
}

// ── RegularSub → 換人 API body ──
// 一般換人（issue #42 Phase B）跟 rally 一樣，時機記的是「這次操作當下的比分快照」
// （homeScore/awayScore），不是掛在某個 rally 底下——理由跟 substitutions.ts 的後端註解
// 一樣：換人可能發生在兩個 rally 之間（下一球都還沒開始），那時下一個 rally 的 id 還不存在，
// 沒辦法拿來當外鍵，只能記「發生時的比分」當時間戳記。
// 前端球員 id 跟後端一樣是字串 uuid（見 lib/db/src/schema/players.ts 的改動），不用再轉型別。
export function regularSubToApi(
  sub: RegularSub,
  homeScore: number,
  awayScore: number,
): NewSubstitution {
  return {
    homeScore,
    awayScore,
    playerInId: sub.inPlayerId,
    playerOutId: sub.outPlayerId,
    kind: "regular",
  };
}

// ── 後端 substitution rows → 前端 regularSubs 淨疊加清單（regularSubToApi 的反向、重建用）──
// 後端存的是 append-only 全歷史：教練每按一次「換人」，後端就多一筆 row，同一個位置
// 換過幾次人就有幾筆。但 UI 的 regularSubs 是「淨疊加」（見 types/scoresheet.ts 的註解）：
// 只關心「現在」場上實際站的是誰，不是完整的換人流水帳。
// 所以重建時要照發生順序（呼叫端已依 homeScore/awayScore 排序，等同時間順序）「重放」
// 一次淨疊加摺疊——這套摺疊邏輯本體現在是 lib/volleyballRules.ts 的 applyRegularSub，
// 跟 useScoreSheet.ts 的 recordRegularSub 共用同一份實作，不再是兩邊各寫一份、靠註解
// 提醒手動同步。連鎖換人（A→B 之後又 B→C）摺疊出來的確切結果、以及它跟直覺不一致的地方，
// 見 applyRegularSub 的函式註解，不在這裡重複一份（重複的下場就是這次要修的病）。
// 只處理 kind==='regular'（libero 上下場的重建是 #43 的範圍，不能混進一般換人清單）；
// playerInId/playerOutId 為 null 的 regular row 理論上不會出現（一般換人一定知道誰換誰），
// 保險起見直接跳過、不讓它污染清單。
//
// 這道過濾條件被 reconstructRegularSubs（淨疊加清單）跟 countRegularSubs（原始次數，
// issue #289）兩支函式共用：兩者「認定的是同一批換人 row」，只是一個摺疊、一個單純數數，
// 過濾條件一定要完全一致——這正是 #226 的教訓，複製貼上兩份的下場是之後改一邊、另一邊忘了跟著改。
function isRegularSubRow(
  s: Substitution,
): s is Substitution & { playerInId: string; playerOutId: string } {
  return s.kind === "regular" && s.playerInId != null && s.playerOutId != null;
}

export function reconstructRegularSubs(subs: Substitution[]): RegularSub[] {
  let result: RegularSub[] = [];
  for (const s of subs) {
    if (!isRegularSubRow(s)) continue;
    const inPlayerId = String(s.playerInId);
    const outPlayerId = String(s.playerOutId);
    result = applyRegularSub(result, { outPlayerId, inPlayerId });
  }
  return result;
}

// ── 後端 substitution rows → 這一局實際換人的原始次數（issue #289）──
// 跟 reconstructRegularSubs 用同一個 isRegularSubRow 過濾條件，差別只在這裡不摺疊、
// 單純數筆數——因為「換了幾次人」要的是原始計數，不是淨疊加後的清單長度（見
// types/scoresheet.ts 的 ScoreSheetState.subCount 註解：A→B→C 摺成 1 筆但換了 2 次，
// A→B→A 甚至摺成 0 筆但換了 2 次，這正是這支函式存在的理由）。
export function countRegularSubs(subs: Substitution[]): number {
  return subs.filter(isRegularSubRow).length;
}

// ── TimeoutRecord → 暫停 API body（issue #44）──
// 跟 regularSubToApi 同一套：時機記的是「這次操作當下的比分快照」（homeScore/awayScore），
// 不是掛在某個 rally 底下——暫停可能發生在兩個 rally 之間（下一球還沒開始），那時下一個
// rally 的 id 還不存在。side 從前端 us/opponent 翻成後端 home/away。
export function timeoutToApi(side: Side, homeScore: number, awayScore: number): NewTimeout {
  return {
    homeScore,
    awayScore,
    side: sideToApi(side),
  };
}

// ── 後端 timeout rows → 前端 timeouts 清單（timeoutToApi 的反向、重建用）──
// 暫停沒有換人那種「淨疊加去重」，每筆都是獨立事件，所以重建就是照後端回來的順序
// （呼叫端已依 homeScore/awayScore 排序＝時間順序）逐筆把 side 翻回 us/opponent。
export function reconstructTimeouts(timeouts: Timeout[]): TimeoutRecord[] {
  return timeouts.map((t) => ({ side: apiToSide(t.side) }));
}

// ── LineupSnapshot ↔ 後端 lineups DTO（issue #115）──
// 先發快照（號位 1~6 → 球員 id 字串）跟後端 lineups 表（zone1~6PlayerId 字串 uuid）之間的轉換。
// 前後端球員 id 現在都是字串 uuid（見 lib/db/src/schema/players.ts 的改動），型別一致，
// 這裡只是把「號位 → id」的物件形狀轉成 API 要的六個獨立欄位，不用再轉型別。
export function lineupSnapshotToApi(lineup: LineupSnapshot): NewLineup {
  return {
    zone1PlayerId: lineup[1],
    zone2PlayerId: lineup[2],
    zone3PlayerId: lineup[3],
    zone4PlayerId: lineup[4],
    zone5PlayerId: lineup[5],
    zone6PlayerId: lineup[6],
  };
}

export function apiLineupToSnapshot(row: Lineup): LineupSnapshot {
  return {
    1: row.zone1PlayerId,
    2: row.zone2PlayerId,
    3: row.zone3PlayerId,
    4: row.zone4PlayerId,
    5: row.zone5PlayerId,
    6: row.zone6PlayerId,
  };
}

// ── 依 setId 從整場的 lineups 裡找出某一局的先發快照（issue #174）──
// lineups 是「一局一 row」（見上方欄位對應），reconstructRecording 要替「進行中那一局」
// 跟「每個已結束局」各自找出自己的那一筆——兩處要的是同一個查找＋轉換邏輯，抽成共用函式，
// 不要複製貼上兩份（複製貼上的下場是規則之後改一邊、另一邊忘記跟著改，兩邊兜不起來）。
// 找不到（這局從沒選過先發方，例如已結束局理論上不該發生，但保守處理）就回傳 null。
export function findLineupSnapshotForSet(lineups: Lineup[], setId: string): LineupSnapshot | null {
  const row = lineups.find((l) => l.setId === setId);
  return row ? apiLineupToSnapshot(row) : null;
}

// ── 空白狀態的建構子 ──
// 一場比賽還沒記過任何一局時的初始狀態。原本 makeEmptySet/emptyRecord 只在
// useScoreSheet.ts 裡私有定義；reconstructRecording（下方）在「這場還沒有任何 set」
// 時也需要同一份空白狀態，抽到這裡讓兩處共用同一個定義，不會各自維護一份、
// 之後改欄位漏改一邊。
export const makeEmptySet = (setNumber: number): SetRecordingState => ({
  setNumber,
  ourScore: 0,
  opponentScore: 0,
  serving: null,
  ourRotation: 0,
  opponentRotation: 0,
  history: [],
});

export const emptyRecord = (): ScoreSheetState => ({
  currentSet: makeEmptySet(1),
  completedSets: [],
  // lineup 初始 null：先發快照要等教練實際開賽（選先發方）那一刻才擷取（見 useScoreSheet
  // 的 start()）。重建時若後端已有 lineups 就由 reconstructRecording 補回來。
  lineup: null,
  liberoSubstitution: null,
  regularSubs: [],
  subCount: 0,
  subCountsHistory: [],
  timeouts: [],
  timeoutCountsHistory: [],
});

// ── 從後端整場資料重建完整的 ScoreSheetState ──
// 這是 useScoreSheetController 進頁重建那段 useEffect 的「純計算」核心，抽出來讓
// useMatchRecording（分析頁的唯讀 hook，#65）能重用同一套規則，不用把重建邏輯
// 平行寫兩份（寫兩份最怕的就是規則之後改了一邊、另一邊忘記跟著改，兩個畫面顯示的
// 數字就會兜不起來）。
//
// 刻意不含的東西：
//   - 不碰 React Query／不發任何請求——呼叫端（controller／useMatchRecording）各自
//     負責用對應的 hook 把資料抓好，這裡只管「資料到位後怎麼組成 ScoreSheetState」。
//   - 不 seed currentSetIdRef / rallyIdsRef 這種「背景持久化記帳」用的 ref——那是
//     controller 專屬的動作（記分/復原要用），唯讀重建用不到，seed 這件事留在
//     controller 的 useEffect 裡自己做。
//
// 呼叫端要先把資料整理成這個形狀：
//   - sets：這場比賽的所有局（GET /matches/:id/sets）。
//   - ralliesBySetIndex：跟 sets 陣列「同索引」對齊的每局 rally 陣列（呼叫端用
//     useQueries 對每個 set 各自 GET 它的 rallies，取到的資料要照 sets 的順序排好）。
//   - events：整場所有 event（bulk endpoint 一次抓回來，不分局）。
//   - subs：整場所有一般換人紀錄（bulk endpoint，不分局）。
export function reconstructRecording(
  sets: MatchSet[],
  ralliesBySetIndex: Rally[][],
  events: MatchEvent[],
  subs: Substitution[],
  // 整場所有局的先發（GET /matches/:id/lineups）。issue #115：reload 後把計分表的先發快照
  // 讀回來，才不會又退回去讀（可能被污染的）全域 store。選填、預設空陣列——分析頁
  // （useMatchRecording）跟舊測試不帶它也能用，只是重建出來的 lineup 會是 null。
  lineups: Lineup[] = [],
  // 整場所有暫停紀錄（GET /matches/:id/timeouts，issue #44）。同樣選填、預設空陣列，讓
  // 分析頁與舊測試不帶它也能用（重建出來的 timeouts / timeoutCountsHistory 會是空的）。
  timeouts: Timeout[] = [],
): ScoreSheetState {
  // 把整場的 event 依 rallyId 分組，餵給 reconstruct 還原每一分的動作/球員。
  // endpoint 已依 rallyId、sequence 排序，所以同一組內是照 sequence 排好的。
  // key 是 rallyId，型別跟著 rallies.id 從 number 改成 string（#64 PR1：主鍵改 uuid）。
  const eventsByRallyId = new Map<string, MatchEvent[]>();
  for (const ev of events) {
    const list = eventsByRallyId.get(ev.rallyId);
    if (list) list.push(ev);
    else eventsByRallyId.set(ev.rallyId, [ev]);
  }

  // 把整場的一般換人紀錄依 setId 分組，重建各局的 regularSubs（見下方使用處）。
  // 後端 GET 已依 (setId, homeScore, awayScore, id) 排序，同一組內就是發生的先後順序，
  // 可以直接丟給 reconstructRegularSubs 照順序 replay。
  // key 是 setId，型別跟著 sets.id 從 number 改成 string（#64 PR1：主鍵改 uuid）。
  const subsBySetId = new Map<string, Substitution[]>();
  for (const sub of subs) {
    const list = subsBySetId.get(sub.setId);
    if (list) list.push(sub);
    else subsBySetId.set(sub.setId, [sub]);
  }

  // 暫停也依 setId 分組，重建各局的 timeouts（issue #44）。後端 GET 已依 (setId, homeScore,
  // awayScore, id) 排序，同一組內就是發生的先後順序，可直接丟給 reconstructTimeouts。
  // key 是 setId，型別同上跟著改成 string。
  const timeoutsBySetId = new Map<string, Timeout[]>();
  for (const t of timeouts) {
    const list = timeoutsBySetId.get(t.setId);
    if (list) list.push(t);
    else timeoutsBySetId.set(t.setId, [t]);
  }

  if (sets.length === 0) {
    // 這場還沒記過任何一局：給一份空白記錄，畫面會顯示「這局由誰先發球？」
    // （分析頁則是顯示「尚未開始記分」的空狀態）。
    return emptyRecord();
  }

  // 「最後一局＝進行中，其餘＝已結束」的慣例，理由與失效條件現在都寫在
  // lib/volleyballRules.ts 的 splitCompletedAndCurrent 裡，這裡只呼叫它。
  //
  // 只對 sets 切、不對 ralliesBySetIndex 切：這兩個陣列雖然「同索引對齊」，但長度不保證
  // 相同（呼叫端是各 set 各發一支 query，某支還沒回來時那格可能不存在——原本的碼到處寫
  // `?? []` 就是在防這件事）。如果對 ralliesBySetIndex 也呼叫一次 splitCompletedAndCurrent，
  // 切點會變成「它自己的最後一格」而不是「sets 的最後一格」，兩邊長度一旦不同，就會把某個
  // 已結束局的 rally 當成進行中那局的 rally——比原本的寫法更危險。所以 rally 一律還是用
  // sets 的索引去取，切分只發生在 sets 這一個陣列上。
  const { completed: completedSetRows, current: currentSetRow } = splitCompletedAndCurrent(sets);
  // sets.length > 0 已在上面提早 return 擋掉，所以 current 必定有值；但
  // splitCompletedAndCurrent 是泛型函式，簽名上表達不出這個保證，這裡用一道真的 guard
  // （而不是 `?? 假資料` 或 `as` 斷言）讓型別收斂——這樣萬一之後有人改動上面的
  // early return，這行會誠實地走進 emptyRecord()，而不是拿一份捏造的資料繼續算下去。
  if (!currentSetRow) return emptyRecord();
  const currentSetIndex = sets.length - 1;

  const completedSets: CompletedSet[] = completedSetRows.map((s, i) => {
    const st = reconstructSetFromRallies(s, ralliesBySetIndex[i] ?? [], eventsByRallyId);
    return {
      setNumber: st.setNumber,
      ourScore: st.ourScore,
      opponentScore: st.opponentScore,
      history: st.history,
      // 已結束局各自的先發快照（issue #174）：跟下面「進行中這一局」用的是同一個
      // findLineupSnapshotForSet，只是換一個 setId 查找——不要各寫一份查找邏輯。
      lineup: findLineupSnapshotForSet(lineups, s.id),
    };
  });
  // 已結束各局的換人次數：對每個已結束的 set，數它的換人紀錄原始筆數（issue #289：不是
  // 淨疊加清單的長度——跟 nextSet 動作把 record.subCount 推進 subCountsHistory 是同一個
  // 數字，只是這裡是從後端資料重算，而不是延續 store 裡當下的值）。陣列順序對齊 completedSets。
  const subCountsHistory: number[] = completedSetRows.map((s) =>
    countRegularSubs(subsBySetId.get(s.id) ?? []),
  );
  // 已結束各局的暫停次數，對齊 subCountsHistory 的作法：對每個已結束的 set 數它的暫停筆數。
  const timeoutCountsHistory: number[] = completedSetRows.map(
    (s) => (timeoutsBySetId.get(s.id) ?? []).length,
  );
  const currentSet = reconstructSetFromRallies(
    currentSetRow,
    ralliesBySetIndex[currentSetIndex] ?? [],
    eventsByRallyId,
  );
  // 進行中這一局的換人淨疊加清單，直接重放這一局的換人紀錄即可。
  const regularSubs = reconstructRegularSubs(subsBySetId.get(currentSetRow.id) ?? []);
  // 進行中這一局的原始換人次數（issue #289），跟上面淨疊加清單是同一批 row、不同算法。
  const subCount = countRegularSubs(subsBySetId.get(currentSetRow.id) ?? []);
  // 進行中這一局的暫停清單（issue #44），直接把這一局的暫停紀錄翻回前端形狀。
  const currentTimeouts = reconstructTimeouts(timeoutsBySetId.get(currentSetRow.id) ?? []);

  // 先發快照：一 row 一局（setId），只認「目前這一局自己的」先發（先發每局可不同，不沿用別局）。
  // 進行中這一局若已有先發（已選過先發方）就讀回它；若還沒（例如剛按下一局、firstServer=null 的
  // 空 set，此時還沒選先發方也就還沒寫 lineup）就給 null——此時畫面停在「這局由誰先發球？」、
  // 還不需要顯示球場，等教練選先發方時 start() 會從當下輪轉表擷取這一局的新先發。
  const lineup: LineupSnapshot | null = findLineupSnapshotForSet(lineups, currentSetRow.id);

  return {
    currentSet,
    completedSets,
    lineup,
    liberoSubstitution: null,
    regularSubs,
    subCount,
    subCountsHistory,
    timeouts: currentTimeouts,
    timeoutCountsHistory,
  };
}
