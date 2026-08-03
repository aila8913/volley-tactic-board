import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, ralliesTable } from "@workspace/db";
import { mockAuth } from "../middleware/mockAuth";
import { setBelongsToUser, rallyBelongsToUser } from "../lib/ownership";
import { handler } from "../lib/handler";
import {
  ListRalliesParams,
  CreateRallyParams,
  CreateRallyBody,
  DeleteRallyParams,
} from "@workspace/api-zod";

// 一局（set）裡的各個 rally（一分）。掛在 set 底下，操作前先驗這個 set 屬於這個使用者，
// 驗的方式是往上追到 set 所屬 match 的 userId（見 lib/ownership.ts 的 setBelongsToUser）。
const router: IRouter = Router();
router.use(mockAuth);

// GET /sets/:setId/rallies — 列出這一局的所有 rally，依 rallyNumber 排序（第 1 分、第 2 分…）
// owns 檢查跟 sets.ts 的 GET 一樣：驗這個 setId 是不是這個 userId 的。
router.get(
  "/sets/:setId/rallies",
  handler(
    {
      params: ListRalliesParams,
      owns: ({ params, userId }) => setBelongsToUser(params.setId, userId),
    },
    async ({ res, params }) => {
      const rallies = await db
        .select()
        .from(ralliesTable)
        .where(eq(ralliesTable.setId, params.setId))
        .orderBy(ralliesTable.rallyNumber);

      res.json(rallies);
    },
  ),
);

// POST /sets/:setId/rallies — 記錄新的一分。
// 注意 openapi 的合約是「一次記一個 rally」，body 只有 rally 本身的欄位（分數、誰贏），
// 不含底下的 events——events 是之後用 POST /rallies/:rallyId/events 一球一球記。
// 因為只是單筆 insert，Postgres 本身就是原子操作，這裡不需要 db.transaction()。
// 只需要驗 parent set，body 裡沒有其他要另外驗的第三方 id，所以跟 sets.ts 的 POST 一樣
// 是單一 owns 檢查，不用像 players.ts 那樣包成陣列。
router.post(
  "/sets/:setId/rallies",
  handler(
    {
      params: CreateRallyParams,
      body: CreateRallyBody,
      owns: ({ params, userId }) => setBelongsToUser(params.setId, userId),
    },
    async ({ res, params, body }) => {
      const [created] = await db
        .insert(ralliesTable)
        // setId 來自路徑（已驗擁有權），不吃 body 的，避免 client 把 rally 塞到別局去。
        .values({
          // 選填的 client-mintable 主鍵（#64 PR2），做法與理由見 sets.ts 的 POST 註解。
          ...(body.id ? { id: body.id } : {}),
          setId: params.setId,
          rallyNumber: body.rallyNumber,
          homeScore: body.homeScore,
          awayScore: body.awayScore,
          homeRotation: body.homeRotation,
          awayRotation: body.awayRotation,
          winner: body.winner,
        })
        // 冪等寫入 + 重送回既有列（#64 PR3），做法與理由見 sets.ts 的 POST 註解。
        .onConflictDoNothing({ target: ralliesTable.id })
        .returning();

      if (!created) {
        const existing = body.id
          ? await db
              .select()
              .from(ralliesTable)
              .where(and(eq(ralliesTable.id, body.id), eq(ralliesTable.setId, params.setId)))
              .limit(1)
          : [];

        if (existing.length === 0) {
          res.status(409).json({ error: "Conflict" });
          return;
        }
        res.status(201).json(existing[0]);
        return;
      }

      res.status(201).json(created);
    },
  ),
);

// DELETE /rallies/:rallyId — 刪掉一整分（前端「復原上一球」用）。
// 路徑上只有 rallyId，所以擁有權檢查是單一一支 rallyBelongsToUser——它自己就做完
// rally → set → match → userId 的 join 鏈，不用像 players.ts 的多層陣列那樣分開驗。
// events.rallyId 是 onDelete: cascade（見 lib/db/src/schema/events.ts），所以刪 rally 會連帶
// 清掉它底下記的每一球，不用自己先刪 events。
router.delete(
  "/rallies/:rallyId",
  handler(
    {
      params: DeleteRallyParams,
      owns: ({ params, userId }) => rallyBelongsToUser(params.rallyId, userId),
    },
    async ({ res, params }) => {
      // owns 已經先確認過這個 rally 存在且屬於這個使用者，理論上這裡一定會刪到一列；
      // .returning() + 長度檢查保留下來是不改變原本「靠實際刪掉幾列判斷成功與否」的
      // 防禦性寫法（同 people.ts/tournaments.ts/players.ts 的 DELETE，#225 的教訓）。
      const deleted = await db
        .delete(ralliesTable)
        .where(eq(ralliesTable.id, params.rallyId))
        .returning({ id: ralliesTable.id });

      if (deleted.length === 0) {
        res.status(404).json({ error: "Not found" });
        return;
      }

      res.status(204).end();
    },
  ),
);

export default router;
