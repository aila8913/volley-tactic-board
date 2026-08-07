// 分析頁（#65／#213）兩支彙總 endpoint 的「合併規則」，從 routes/analysis.ts 抽出來
// 獨立成純函式（#229）。
//
// 為什麼要抽：這裡面的規則才是真正容易寫錯、之後也最可能被改壞的部分——例如「進行中
// 的比賽要排除最後一局，已完賽的比賽反而要保留最後一局、但要砍掉沒開球的尾巴局」這種
// 規則，一旦寫錯，錯的不是「查詢寫錯 SQL」而是「合併邏輯想錯」。這段邏輯本來就長在
// Express 路由 handler 裡面：req/res 混在一起，Drizzle 查詢又要連真的 Postgres 才能跑，
// 結果就是想確認「這一條規則對不對」也得先把整個 DB 開起來、造測試資料、發 HTTP 請求，
// 才能看到結果。抽成這裡的兩個純函式之後，輸入是「查詢已經跑完、拿到的那幾個陣列」，
// 輸出是「回應要用的物件」，中間完全不碰 Express、不碰 DB——寫測試只要餵幾筆手打的
// literal rows 進去斷言結果，不用真的連 DB，規則改壞了測試馬上會紅。
//
// Drizzle 查詢本身（怎麼 join、怎麼 groupBy）刻意留在 routes/analysis.ts 沒有動——
// PO 已經拍板這次只抽「合併」這一層，不做 query-adapter 介面、不做 DI，避免過度抽象。

// ---------------------------------------------------------------------------
// GET /analysis/matches 用的列型別與合併函式
// ---------------------------------------------------------------------------

// 對應 routes/analysis.ts 裡 `matches` 查詢的每一列。欄位型別跟著
// lib/db/src/schema/matches.ts 的欄位定義：opponent/date/status 都是 notNull，
// teamId 允許 null（比賽可以不掛在任何球隊底下）。
export type MatchRow = {
  matchId: number;
  opponent: string;
  date: Date;
  teamId: number | null;
  status: "in_progress" | "finished";
};

// 對應 `setScoreRows` 查詢的每一列（grain = set，一局一列，含還沒開球的空局）。
export type SetScoreRow = {
  matchId: number;
  setNumber: number;
  // 這一局有沒有真的開過球，只用來判斷要不要被尾巴局砍掉，不會出現在回應裡。
  firstServer: "home" | "away" | null;
  ourScore: number;
  opponentScore: number;
};

// 對應 `lineupMatchRows` 查詢的每一列（grain = match，只要有 row 就代表這場排過先發）。
export type LineupMatchRow = {
  matchId: number;
};

// 對應 `setRows` 查詢的每一列（grain = match，setsPlayed 只數「真的開過球」的局數）。
export type SetRow = {
  matchId: number;
  setsPlayed: number;
};

export type MatchSummary = {
  matchId: number;
  opponent: string;
  date: Date;
  teamId: number | null;
  setsPlayed: number;
  ourPoints: number;
  opponentPoints: number;
  setResults: { ourScore: number; opponentScore: number }[];
  hasLineup: boolean;
};

// 把四支各自單一 grain 的查詢結果（matches / setScoreRows / lineupMatchRows / setRows）
// 合併成分析頁要的「每場比賽一列摘要」。為什麼要拆成四支查詢分別查、在這裡合併，
// 而不是一支多重 join 的 SQL：詳見 routes/analysis.ts 呼叫這支函式前面的「grain / 笛卡兒
// 積」長註解——那是查詢面的取捨，留在查詢那邊講；這裡只管「資料已經各自查好了，怎麼兜」。
export function summariseMatches(
  matches: MatchRow[],
  setScoreRows: SetScoreRow[],
  lineupMatchRows: LineupMatchRow[],
  setRows: SetRow[],
): MatchSummary[] {
  const matchesWithLineup = new Set(lineupMatchRows.map((r) => r.matchId));

  // 把逐局比分依 matchId 分組（setScoreRows 已照 matchId, setNumber 排好，所以每組內部
  // 天然就是第 1 局、第 2 局…的順序）。等下對 matches 的每一場查表 O(1) 合併。
  const setScoresByMatch = new Map<
    number,
    { ourScore: number; opponentScore: number; started: boolean }[]
  >();
  for (const row of setScoreRows) {
    const list = setScoresByMatch.get(row.matchId);
    // started＝這局有沒有真的開球（選過先發方）。只在下面砍尾巴時用，不會進回應。
    const entry = {
      ourScore: row.ourScore,
      opponentScore: row.opponentScore,
      started: row.firstServer !== null,
    };
    if (list) list.push(entry);
    else setScoresByMatch.set(row.matchId, [entry]);
  }
  const setsByMatch = new Map(setRows.map((r) => [r.matchId, r]));

  return matches.map((m) => {
    const sets = setsByMatch.get(m.matchId);
    // 這場所有局的比分（含進行中的最後一局），已依局序排好。
    const allSetScores = setScoresByMatch.get(m.matchId) ?? [];
    // setResults 只給「已結束局」，鏡射前端 splitCompletedAndCurrent 的慣例（見
    // artifacts/volleyball-tactics/src/lib/volleyballRules.ts，那裡有完整的理由說明）。
    // 這樣卡片用 setResults 算出來的局比數，會跟使用者點進計分頁後看到的完全一致。
    //
    // #218：這條慣例現在吃 matches.status——
    //   - 進行中：排除最後一局（那是還在打的那局）。slice(0, -1) 對空陣列或單一元素都
    //     安全（回空陣列），不用特判。
    //   - 已完賽：每一局都是已結束局，不排除任何一局——但要先砍掉「開了卻從沒開球」的
    //     尾巴局（使用者按了「下一局」才想起比賽已經結束、直接按「結束比賽」）。不砍的話
    //     各局比分會多出一行 0:0。這段跟前端 reconstructRecording 的 effectiveSets 是
    //     同一個處理，兩邊要一起改。
    //   這正是 #218 修掉的病灶：以前「打完的最後一局」永遠被當成進行中而被丟掉，
    //   比賽列表因此少算一局。
    // 兩邊是各自實作、靠註解互相指過去（理由見前端那支函式的註解與 ADR-0003），改一邊
    // 務必同時改另一邊。
    let setResults: { ourScore: number; opponentScore: number }[];
    if (m.status === "finished") {
      let end = allSetScores.length;
      while (end > 0 && !allSetScores[end - 1].started) end -= 1;
      setResults = allSetScores.slice(0, end).map(({ ourScore, opponentScore }) => ({
        ourScore,
        opponentScore,
      }));
    } else {
      setResults = allSetScores
        .slice(0, -1)
        .map(({ ourScore, opponentScore }) => ({ ourScore, opponentScore }));
    }
    // 整場總得失分＝把每一局的得分加起來（含進行中那局，跟舊 rallyRows 的整場 count 等價）。
    const ourPoints = allSetScores.reduce((sum, s) => sum + s.ourScore, 0);
    const opponentPoints = allSetScores.reduce((sum, s) => sum + s.opponentScore, 0);
    return {
      matchId: m.matchId,
      opponent: m.opponent,
      date: m.date,
      teamId: m.teamId,
      // 缺資料代表這場還沒有任何 set/rally（剛建立、還沒開始記錄），預設補 0/空——這樣
      // 「建了但還沒記過任何東西」的比賽也會出現在列表裡，摘要是 0:0、局數 0，而不是整場
      // 從結果裡消失（消失反而更讓人困惑：使用者明明建過這場比賽）。
      setsPlayed: sets?.setsPlayed ?? 0,
      ourPoints,
      opponentPoints,
      setResults,
      hasLineup: matchesWithLineup.has(m.matchId),
    };
  });
}

// ---------------------------------------------------------------------------
// GET /analysis/people/:personId 用的列型別與合併函式
// ---------------------------------------------------------------------------

// 對應 `person` 查詢（單筆或查無資料時為 undefined，跟 handler 解構 `const [person] = ...`
// 拿到的型別一致）。只取回應會用到的 name 欄位。
export type PersonRow = {
  name: string;
};

// 對應 `appearanceRows` 查詢的每一列（grain = player row，一場比賽正常只會有一筆）。
// role 型別對應 lib/db/src/schema/players.ts 的 playerRoleEnum。
export type AppearanceRow = {
  matchId: number;
  opponent: string;
  date: Date;
  teamId: number | null;
  playerId: string;
  number: number;
  role: "S" | "OH" | "MB" | "OPP" | "L";
};

// 對應 `actionRows` 查詢的每一列（grain = event，依 action 分組後的次數）。
// action 型別對應 lib/db/src/schema/events.ts 的 eventActionEnum。
export type ActionRow = {
  action: "serve" | "receive" | "set" | "attack" | "block" | "dig";
  count: number;
};

// 對應 `setsStartedRow` 查詢（單筆聚合，理論上一定有一列，但跟 handler 解構
// `const [setsStartedRow] = ...` 拿到的型別一致，允許 undefined）。
export type SetsStartedRow = {
  count: number;
};

export type TeamBreakdownEntry = {
  teamId: number | null;
  matchesPlayed: number;
};

export type PersonAnalysisResult = {
  personId: number;
  name: string;
  matchesPlayed: number;
  setsStarted: number;
  teamBreakdown: TeamBreakdownEntry[];
  actionCounts: ActionRow[];
  appearances: AppearanceRow[];
};

// 把「這個人跨場的名單列 + 觸球動作分布 + 先發局數」合併成視圖③要的一份回應。
//
// 呼叫端（routes/analysis.ts）在 appearanceRows 收集出的 playerIds 為空陣列時，會提前
// return、不發下面兩支查詢（inArray 對空陣列意義不明確，提前擋掉比較乾淨）——那是「要不要
// 發查詢」的效能決策，留在 handler 裡，不搬進這支純函式。但這支函式本身仍然要能正確處理
// 「actionRows 是空陣列、setsStartedRow 是 undefined」的輸入並算出同一種全零/空陣列形狀，
// 這樣測試才能直接拿空輸入釘住這個形狀，不用依賴 handler 有沒有真的提前 return。
export function summarisePerson(
  personId: number,
  person: PersonRow | undefined,
  appearanceRows: AppearanceRow[],
  actionRows: ActionRow[],
  setsStartedRow: SetsStartedRow | undefined,
): PersonAnalysisResult {
  // 這個人跨了幾場比賽（去重，因為理論上一場比賽也可能不小心留下這個人兩筆名單列——
  // 例如打錯字建了兩筆又都對到同一個 person，appearances 仍會照原樣兩筆都列出，但
  // 「出賽場數」不該被這種邊角情況灌水）。
  const matchesPlayed = new Set(appearanceRows.map((row) => row.matchId)).size;

  // 按球隊分組算出賽場數（grain = match，但要先去重成「不重複的 matchId+teamId」再數，
  // 理由跟上面 matchesPlayed 一樣：避免同場多筆名單列把場次算重複）。
  const matchTeamPairs = new Map(appearanceRows.map((row) => [row.matchId, row.teamId]));
  const teamMatchCounts = new Map<number | null, number>();
  for (const teamId of matchTeamPairs.values()) {
    teamMatchCounts.set(teamId, (teamMatchCounts.get(teamId) ?? 0) + 1);
  }
  const teamBreakdown = [...teamMatchCounts.entries()].map(([teamId, count]) => ({
    teamId,
    matchesPlayed: count,
  }));

  return {
    personId,
    name: person?.name ?? "",
    matchesPlayed,
    setsStarted: setsStartedRow?.count ?? 0,
    teamBreakdown,
    actionCounts: actionRows,
    appearances: appearanceRows,
  };
}
