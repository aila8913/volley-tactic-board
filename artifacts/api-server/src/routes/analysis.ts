import { Router, type IRouter } from "express";
import { sql, eq } from "drizzle-orm";
import { db, ralliesTable, setsTable } from "@workspace/db";
import { mockAuth } from "../middleware/mockAuth";
import { matchBelongsToUser } from "../lib/ownership";
import { GetMatchRotationStatsParams } from "@workspace/api-zod";

// 分析頁（M2，#65）用的「報表型」路由：跟 matches/players/sets/rallies/events 那些
// 「一資源一 CRUD」的路由不一樣，這裡的每一支都是跨資源、唯讀的聚合查詢（例如這支要把
// 一整場比賽底下所有 rally 依輪次分組算得失分），不對應單一資料表，所以刻意獨立成一個
// analysis.ts，不硬塞進 rallies.ts——塞進去的話 rallies.ts 會同時混雜「單筆 CRUD」跟
// 「跨局聚合報表」兩種完全不同的職責，之後不好維護。
const router: IRouter = Router();
router.use(mockAuth);

// GET /analysis/matches/:matchId/rotations — 這場比賽「我方各輪次」的得失分。
//
// 為什麼只用 rallies、不碰 events：events.outcome（這一球的攻防結果）目前恆為 null——
// 即時記錄的路徑（lib/scoreSheetMapping.ts 的 pointRecordToEvent）根本沒有寫這個欄位，
// 所以沒辦法從 events 算出「哪一種攻擊得分/失分」這種更細的統計。rallies 就不同：
// homeRotation（這分開始前我方的輪次快照）跟 winner（這分誰贏）兩欄本來就是每筆 rally
// 必填、隨計分即時寫入的，資料完整可靠，用它們算「第 N 輪得幾分/失幾分」很穩。
//
// 為什麼不做 side-out% / 破發率：那需要知道「這一分開始時是誰在發球」，但 rallies 沒有
// 直接存這欄——發球方要從發球序（誰先發、每次 side-out 才輪轉）反推，邏輯複雜到不適合
// 用一支 SQL 聚合算，先留給之後的 issue。
router.get("/analysis/matches/:matchId/rotations", async (req, res) => {
  const { matchId } = GetMatchRotationStatsParams.parse(req.params);

  if (!(await matchBelongsToUser(matchId, req.userId))) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  // rallies 自己沒存 matchId（只有 setId），所以要 join sets 才能用 matchId 過濾——
  // 跟 events.ts 的 /matches/:matchId/events 是同一個道理。
  //
  // groupBy(ralliesTable.homeRotation) 是 SQL 的「依這個欄位的值分組」：值相同的 rally
  // 會被歸成同一組，後面的 count(*) 就是「在算這一組裡有幾筆」，而不是全部 rally 的總數。
  //
  // count(*) filter (where 條件) 是 Postgres 的「條件式聚合」寫法：同一次 groupBy 掃描裡，
  // 用 filter 分別數出「winner = 'home' 的筆數」跟「winner = 'away' 的筆數」，效果等同
  // SQL 標準寫法 count(case when 條件 then 1 end)，但 Postgres 的 filter 語法更直白、
  // 效能也通常更好，所以這裡選用它。這是這個 repo 第一次寫 drizzle 的 sql`` 聚合查詢——
  // drizzle 的型別安全 query builder（.select({...})）沒有內建「條件式 count」這種語法，
  // 所以要用 sql`` 逃生艙口直接寫一小段 SQL 片段，接回 drizzle 的查詢鏈。
  //
  // .mapWith(Number) 是因為 Postgres 的 count(...) 回傳型別是 bigint，node-postgres
  // 為了不讓超大數字精度悄悄失真，預設會把它當成字串傳回來（"12" 而不是 12）。這裡的分數
  // 不可能大到超過 JS number 安全整數的範圍，所以直接轉回 number 比較好用，不用在前端
  // 到處補 Number(...)。
  const rows = await db
    .select({
      rotation: ralliesTable.homeRotation,
      pointsWon: sql<number>`count(*) filter (where ${ralliesTable.winner} = 'home')`.mapWith(
        Number,
      ),
      pointsLost: sql<number>`count(*) filter (where ${ralliesTable.winner} = 'away')`.mapWith(
        Number,
      ),
    })
    .from(ralliesTable)
    .innerJoin(setsTable, eq(ralliesTable.setId, setsTable.id))
    .where(eq(setsTable.matchId, matchId))
    .groupBy(ralliesTable.homeRotation)
    .orderBy(ralliesTable.homeRotation);

  // 只回傳「有 rally 資料」的輪次——沒發生過的輪次（例如這場比賽從來沒輪到過第 5 輪）
  // 不會出現在結果裡，前端就依實際回傳筆數畫幾列，不用自己補「這輪是 0:0」的空列。
  res.json(rows);
});

export default router;
