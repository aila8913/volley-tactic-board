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
  Lineup,
  NewLineup,
} from "@workspace/api-client-react";
import type {
  Side,
  PointRecord,
  PlayAction,
  SetRecordingState,
  RegularSub,
  ScoreSheetState,
  CompletedSet,
  LineupSnapshot,
} from "../types/scoresheet";

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

// ── PointRecord → rally ──
// 一個 PointRecord 就是一分 = 一個 rally。homeScore/awayScore 存的是「這分開始前」的比分
// （後端設計，見 lib/db/src/schema/rallies.ts），所以呼叫端要把記這分之前的比分傳進來。
export function pointRecordToRally(
  point: PointRecord,
  rallyNumber: number,
  homeScoreBefore: number,
  awayScoreBefore: number,
): NewRally {
  return {
    rallyNumber,
    homeScore: homeScoreBefore,
    awayScore: awayScoreBefore,
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
  eventsByRallyId?: Map<number, MatchEvent[]>,
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

  // server 一路追「目前發球方」：從先發方起算，每分結束後由這分的贏家發下一球。
  let server: Side = apiToSide(apiSet.firstServer);
  let ourScore = 0;
  let opponentScore = 0;
  let ourRotation = 0;
  let opponentRotation = 0;
  const history: PointRecord[] = [];

  for (const rally of sorted) {
    const winnerSide = apiToSide(rally.winner);
    const wasSideOut = winnerSide !== server;
    if (wasSideOut && winnerSide === "us") ourRotation = (ourRotation + 1) % 6;
    if (wasSideOut && winnerSide === "opponent") opponentRotation = (opponentRotation + 1) % 6;

    const events = eventsByRallyId?.get(rally.id);
    const meta = events && events.length > 0 ? eventToMeta(events[0]) : undefined;
    history.push({ side: winnerSide, wasSideOut, serverId: rally.id, ...meta });

    if (winnerSide === "us") ourScore++;
    else opponentScore++;
    server = winnerSide;
  }

  return {
    setNumber: apiSet.setNumber,
    ourScore,
    opponentScore,
    // 沒有任何 rally 時 server 還是先發方，發球方就是先發方；有 rally 時是最後一分的贏家。
    serving: server,
    ourRotation,
    opponentRotation,
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
// 一次 ScoreSheet.handleRegularSub 當初做的同一套 dedup 邏輯：每次換人都先把「(舊)inPlayerId
// 剛好等於這次 outPlayerId」的舊紀錄濾掉，再把這筆新紀錄接上去。
// 這樣 A 被換成 B、B 又被換成 C 時，會先把「out:A,in:B」那筆濾掉（因為它的 in=B=這次的
// out），只留下「out:A,in:C」——最終結果永遠是「原本場上是誰、現在場上是誰」，
// 不會纍積出一串中間過程。
// 只處理 kind==='regular'（libero 上下場的重建是 #43 的範圍，不能混進一般換人清單）；
// playerInId/playerOutId 為 null 的 regular row 理論上不會出現（一般換人一定知道誰換誰），
// 保險起見直接跳過、不讓它污染清單。
export function reconstructRegularSubs(subs: Substitution[]): RegularSub[] {
  let result: RegularSub[] = [];
  for (const s of subs) {
    if (s.kind !== "regular") continue;
    if (s.playerInId == null || s.playerOutId == null) continue;
    const inPlayerId = String(s.playerInId);
    const outPlayerId = String(s.playerOutId);
    const cleaned = result.filter((r) => r.inPlayerId !== outPlayerId);
    result = [...cleaned, { outPlayerId, inPlayerId }];
  }
  return result;
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
  subCountsHistory: [],
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
): ScoreSheetState {
  // 把整場的 event 依 rallyId 分組，餵給 reconstruct 還原每一分的動作/球員。
  // endpoint 已依 rallyId、sequence 排序，所以同一組內是照 sequence 排好的。
  const eventsByRallyId = new Map<number, MatchEvent[]>();
  for (const ev of events) {
    const list = eventsByRallyId.get(ev.rallyId);
    if (list) list.push(ev);
    else eventsByRallyId.set(ev.rallyId, [ev]);
  }

  // 把整場的一般換人紀錄依 setId 分組，重建各局的 regularSubs（見下方使用處）。
  // 後端 GET 已依 (setId, homeScore, awayScore, id) 排序，同一組內就是發生的先後順序，
  // 可以直接丟給 reconstructRegularSubs 照順序 replay。
  const subsBySetId = new Map<number, Substitution[]>();
  for (const sub of subs) {
    const list = subsBySetId.get(sub.setId);
    if (list) list.push(sub);
    else subsBySetId.set(sub.setId, [sub]);
  }

  if (sets.length === 0) {
    // 這場還沒記過任何一局：給一份空白記錄，畫面會顯示「這局由誰先發球？」
    // （分析頁則是顯示「尚未開始記分」的空狀態）。
    return emptyRecord();
  }

  // 慣例：最後一局（setNumber 最大）當「進行中」，前面的都當「已結束」。schema 沒有
  // 「這局結束了嗎」的旗標，但因為「按下一局」的當下就會建一筆 firstServer=null 的空
  // set row（#63 修法，見 lib/db/src/schema/sets.ts 與 reconstructSetFromRallies 的
  // 空局防呆），「使用者已經進到的每一局」都保證有對應的 DB row，所以這裡「最後一局
  // 當進行中」的假設永遠成立——不會再有「剛按下一局但還沒開球」卻沒寫進後端、
  // reload 後被誤判成上一局還在進行中的情況。
  const completedSets: CompletedSet[] = sets.slice(0, -1).map((s, i) => {
    const st = reconstructSetFromRallies(s, ralliesBySetIndex[i] ?? [], eventsByRallyId);
    return {
      setNumber: st.setNumber,
      ourScore: st.ourScore,
      opponentScore: st.opponentScore,
      history: st.history,
    };
  });
  // 已結束各局的換人次數：對每個已結束的 set，重放它的換人紀錄、取淨疊加清單的長度
  // （跟 nextSet 動作把 record.regularSubs.length 推進 subCountsHistory 是同一個數字，
  // 只是這裡是從後端資料重算，而不是延續 store 裡當下的值）。陣列順序對齊 completedSets。
  const subCountsHistory: number[] = sets
    .slice(0, -1)
    .map((s) => reconstructRegularSubs(subsBySetId.get(s.id) ?? []).length);
  const lastIdx = sets.length - 1;
  const currentSet = reconstructSetFromRallies(
    sets[lastIdx],
    ralliesBySetIndex[lastIdx] ?? [],
    eventsByRallyId,
  );
  // 進行中這一局的換人淨疊加清單，直接重放這一局的換人紀錄即可。
  const regularSubs = reconstructRegularSubs(subsBySetId.get(sets[lastIdx].id) ?? []);

  // 先發快照：一 row 一局（setId），只認「目前這一局自己的」先發（先發每局可不同，不沿用別局）。
  // 進行中這一局若已有先發（已選過先發方）就讀回它；若還沒（例如剛按下一局、firstServer=null 的
  // 空 set，此時還沒選先發方也就還沒寫 lineup）就給 null——此時畫面停在「這局由誰先發球？」、
  // 還不需要顯示球場，等教練選先發方時 start() 會從當下輪轉表擷取這一局的新先發。
  const currentLineupRow = lineups.find((l) => l.setId === sets[lastIdx].id);
  const lineup: LineupSnapshot | null = currentLineupRow
    ? apiLineupToSnapshot(currentLineupRow)
    : null;

  return {
    currentSet,
    completedSets,
    lineup,
    liberoSubstitution: null,
    regularSubs,
    subCountsHistory,
  };
}
