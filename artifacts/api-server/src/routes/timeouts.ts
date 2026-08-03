import { Router, type IRouter } from "express";
import { eq, getTableColumns } from "drizzle-orm";
import { db, timeoutsTable, setsTable } from "@workspace/db";
import { mockAuth } from "../middleware/mockAuth";
import { setBelongsToUser, matchBelongsToUser, timeoutBelongsToUser } from "../lib/ownership";
import { handler } from "../lib/handler";
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
// timeouts 自己沒存 matchId，所以 join timeouts→sets，用 sets.matchId 過濾；
// owns 檢查跟 substitutions.ts 的 GET 一樣，單一 matchBelongsToUser 就夠（沒有第三方 id 要另外驗）。
router.get(
  "/matches/:matchId/timeouts",
  handler(
    {
      params: ListMatchTimeoutsParams,
      owns: ({ params, userId }) => matchBelongsToUser(params.matchId, userId),
    },
    async ({ res, params }) => {
      // getTableColumns(timeoutsTable) 讓 select 只回傳 timeouts 的欄位（扁平形狀），不會因 join
      // 變成 { timeouts: {...}, sets: {...} } 的巢狀結構。依 setId、(homeScore+awayScore)、seq 排序：
      // 比分嚴格遞增，這樣排就還原了「暫停發生的先後順序」，讓前端照順序重放。
      // 最後用 seq（而不是主鍵 id）當 tiebreak，理由跟 substitutions.ts 的 GET 完全一樣（#64
      // PR1）：id 改成 client-mintable 的隨機 uuid 之後不再帶時序資訊，不能拿來排序；seq
      // 是另外留的、單純遞增的插入順序欄位（見 lib/db/src/schema/timeouts.ts）。離線佇列
      // flush 時嚴格依本機順序送出，所以 seq 遞增在離線情境下依然等於「暫停實際發生的先後」。
      const rows = await db
        .select(getTableColumns(timeoutsTable))
        .from(timeoutsTable)
        .innerJoin(setsTable, eq(timeoutsTable.setId, setsTable.id))
        .where(eq(setsTable.matchId, params.matchId))
        .orderBy(
          timeoutsTable.setId,
          timeoutsTable.homeScore,
          timeoutsTable.awayScore,
          timeoutsTable.seq,
        );

      res.json(rows);
    },
  ),
);

// POST /sets/:setId/timeouts — 記錄一次暫停。body 帶的是「當下的比分快照」而非 rallyId，
// 理由見 substitutions.ts：暫停發生在下一個 rally 開始之前，那時下一個 rally 的 id 還不存在。
// 只需要驗 parent set，body 裡沒有其他要另外驗的第三方 id，所以是單一 owns 檢查。
router.post(
  "/sets/:setId/timeouts",
  handler(
    {
      params: CreateTimeoutParams,
      body: CreateTimeoutBody,
      owns: ({ params, userId }) => setBelongsToUser(params.setId, userId),
    },
    async ({ res, params, body }) => {
      const [created] = await db
        .insert(timeoutsTable)
        // setId 來自路徑（已驗擁有權），不吃 body 的，避免 client 把暫停紀錄塞到別局去。
        .values({
          setId: params.setId,
          homeScore: body.homeScore,
          awayScore: body.awayScore,
          side: body.side,
        })
        .returning();

      res.status(201).json(created);
    },
  ),
);

// DELETE /timeouts/:timeoutId — 刪掉一筆暫停紀錄（前端「復原」退掉上一個暫停動作用，見 #41）。
// 路徑上只有 timeoutId，所以擁有權要靠 timeoutBelongsToUser 往上 join 兩層追到 match.userId。
// 跟 DELETE /substitutions/:id 是同一套「undo 就 hard-delete」的作法。
router.delete(
  "/timeouts/:timeoutId",
  handler(
    {
      params: DeleteTimeoutParams,
      owns: ({ params, userId }) => timeoutBelongsToUser(params.timeoutId, userId),
    },
    async ({ res, params }) => {
      // owns 已經先確認過這筆暫停紀錄存在且屬於這個使用者，理論上這裡一定會刪到一列；
      // .returning() + 長度檢查保留下來是不改變「靠實際刪掉幾列判斷成功與否」的防禦性寫法
      // （同 substitutions.ts/rallies.ts/events.ts/players.ts 的 DELETE，#225 的教訓）。
      const deleted = await db
        .delete(timeoutsTable)
        .where(eq(timeoutsTable.id, params.timeoutId))
        .returning({ id: timeoutsTable.id });

      if (deleted.length === 0) {
        res.status(404).json({ error: "Not found" });
        return;
      }

      res.status(204).end();
    },
  ),
);

export default router;
