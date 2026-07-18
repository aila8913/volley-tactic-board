import { Router, type IRouter } from "express";
import { eq, getTableColumns } from "drizzle-orm";
import { db, timeoutsTable, setsTable } from "@workspace/db";
import { mockAuth } from "../middleware/mockAuth";
import { setBelongsToUser, matchBelongsToUser, timeoutBelongsToUser } from "../lib/ownership";
import {
  ListMatchTimeoutsParams,
  CreateTimeoutParams,
  CreateTimeoutBody,
  DeleteTimeoutParams,
} from "@workspace/api-zod";

// 一局（set）裡的暫停紀錄（issue #44）。整體結構刻意抄 substitutions.ts——暫停就是「更簡單的
// 換人」：也是掛在 set 底下、用比分快照當時機、undo 靠 hard-delete，只是不牽涉球員也沒有 kind。
// 讀（bulk）掛在 /matches/:matchId/timeouts 底下（先驗 match 擁有權）；
// 寫掛在 /sets/:setId/timeouts 底下（先驗 set 擁有權，往上追到 match.userId）。
const router: IRouter = Router();
router.use(mockAuth);

// GET /matches/:matchId/timeouts — 一次拿整場比賽的所有暫停紀錄（跨 set）。
// 前端進頁重建計分表時用這一支，跟 GET /matches/:matchId/substitutions 是同一個理由、同一種寫法。
// timeouts 自己沒存 matchId，所以 join timeouts→sets，用 sets.matchId 過濾；先驗 match 屬於這個 user。
router.get("/matches/:matchId/timeouts", async (req, res) => {
  const { matchId } = ListMatchTimeoutsParams.parse(req.params);

  if (!(await matchBelongsToUser(matchId, req.userId))) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  // getTableColumns(timeoutsTable) 讓 select 只回傳 timeouts 的欄位（扁平形狀），不會因 join
  // 變成 { timeouts: {...}, sets: {...} } 的巢狀結構。依 setId、(homeScore+awayScore)、id 排序：
  // 比分嚴格遞增，這樣排就還原了「暫停發生的先後順序」，讓前端照順序重放；id 當 tiebreak，
  // 讓同分內的順序也是決定性的（跟 substitutions 的排序理由完全一樣）。
  const rows = await db
    .select(getTableColumns(timeoutsTable))
    .from(timeoutsTable)
    .innerJoin(setsTable, eq(timeoutsTable.setId, setsTable.id))
    .where(eq(setsTable.matchId, matchId))
    .orderBy(
      timeoutsTable.setId,
      timeoutsTable.homeScore,
      timeoutsTable.awayScore,
      timeoutsTable.id,
    );

  res.json(rows);
});

// POST /sets/:setId/timeouts — 記錄一次暫停。body 帶的是「當下的比分快照」而非 rallyId，
// 理由見 timeouts.ts：暫停發生在下一個 rally 開始之前，那時下一個 rally 的 id 還不存在。
router.post("/sets/:setId/timeouts", async (req, res) => {
  const { setId } = CreateTimeoutParams.parse(req.params);
  const body = CreateTimeoutBody.parse(req.body);

  if (!(await setBelongsToUser(setId, req.userId))) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const [created] = await db
    .insert(timeoutsTable)
    // setId 來自路徑（已驗擁有權），不吃 body 的，避免 client 把暫停紀錄塞到別局去。
    .values({
      setId,
      homeScore: body.homeScore,
      awayScore: body.awayScore,
      side: body.side,
    })
    .returning();

  res.status(201).json(created);
});

// DELETE /timeouts/:timeoutId — 刪掉一筆暫停紀錄（前端「復原」退掉上一個暫停動作用，見 #41）。
// 路徑上只有 timeoutId，所以擁有權要靠 timeoutBelongsToUser 往上 join 兩層追到 match.userId。
// 跟 DELETE /substitutions/:id 是同一套「undo 就 hard-delete」的作法。
router.delete("/timeouts/:timeoutId", async (req, res) => {
  const { timeoutId } = DeleteTimeoutParams.parse(req.params);

  if (!(await timeoutBelongsToUser(timeoutId, req.userId))) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  await db.delete(timeoutsTable).where(eq(timeoutsTable.id, timeoutId));
  res.status(204).end();
});

export default router;
