import { Router, type IRouter } from "express";
import { eq, getTableColumns } from "drizzle-orm";
import { db, substitutionsTable, setsTable } from "@workspace/db";
import { mockAuth } from "../middleware/mockAuth";
import { setBelongsToUser, matchBelongsToUser } from "../lib/ownership";
import {
  ListMatchSubstitutionsParams,
  CreateSubstitutionParams,
  CreateSubstitutionBody,
} from "@workspace/api-zod";

// 一局（set）裡的換人紀錄（regular 換人 / libero 上下場，見 lib/db/src/schema/substitutions.ts）。
// 讀（bulk）掛在 /matches/:matchId/substitutions 底下（先驗 match 擁有權）；
// 寫掛在 /sets/:setId/substitutions 底下（先驗 set 擁有權，往上追到 match.userId）。
const router: IRouter = Router();
router.use(mockAuth);

// GET /matches/:matchId/substitutions — 一次拿整場比賽的所有換人紀錄（跨 set）。
// 前端進頁重建上場名單時用這一支，取代「對每個 set 各發一次請求」的 N+1
// （跟 GET /matches/:matchId/events 是同一個理由、同一種寫法）。
// substitutions 自己沒存 matchId，所以 join substitutions→sets，用 sets.matchId 過濾；
// 先驗 match 屬於這個 user。
router.get("/matches/:matchId/substitutions", async (req, res) => {
  const { matchId } = ListMatchSubstitutionsParams.parse(req.params);

  if (!(await matchBelongsToUser(matchId, req.userId))) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  // getTableColumns(substitutionsTable) 讓 select 只回傳 substitutions 的欄位（扁平形狀），
  // 不會因為 join 而變成 { substitutions: {...}, sets: {...} } 的巢狀結構。
  // 依 setId、(homeScore+awayScore) 排序：換人是按「這局內比分快照」記錄時機的（見
  // substitutions.ts 的設計說明），比分嚴格遞增，所以這樣排序就能還原「換人發生的先後順序」，
  // 讓前端可以照順序重放（replay）出每個時間點的上場名單。
  const rows = await db
    .select(getTableColumns(substitutionsTable))
    .from(substitutionsTable)
    .innerJoin(setsTable, eq(substitutionsTable.setId, setsTable.id))
    .where(eq(setsTable.matchId, matchId))
    .orderBy(substitutionsTable.setId, substitutionsTable.homeScore, substitutionsTable.awayScore);

  res.json(rows);
});

// POST /sets/:setId/substitutions — 記錄一次換人（一般換人或 libero 上/下場）。
// body 帶的是「當下的比分快照」而非 rallyId，理由見 substitutions.ts：換人發生在下一個
// rally 開始之前，那時下一個 rally 的 id 還不存在。
router.post("/sets/:setId/substitutions", async (req, res) => {
  const { setId } = CreateSubstitutionParams.parse(req.params);
  const body = CreateSubstitutionBody.parse(req.body);

  if (!(await setBelongsToUser(setId, req.userId))) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const [created] = await db
    .insert(substitutionsTable)
    // setId 來自路徑（已驗擁有權），不吃 body 的，避免 client 把換人紀錄塞到別局去。
    // playerInId/playerOutId 用 ?? null 把「body 沒帶」轉成 DB 的 null——
    // libero 上/下場時，其中一邊本來就可能沒有對應球員（見 substitutions.ts 的欄位註解）。
    .values({
      setId,
      homeScore: body.homeScore,
      awayScore: body.awayScore,
      playerInId: body.playerInId ?? null,
      playerOutId: body.playerOutId ?? null,
      kind: body.kind,
    })
    .returning();

  res.status(201).json(created);
});

export default router;
