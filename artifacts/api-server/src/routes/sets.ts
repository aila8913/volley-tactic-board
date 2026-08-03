import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, setsTable } from "@workspace/db";
import { mockAuth } from "../middleware/mockAuth";
import { matchBelongsToUser, setBelongsToUser } from "../lib/ownership";
import { handler } from "../lib/handler";
import {
  ListSetsParams,
  CreateSetParams,
  CreateSetBody,
  UpdateSetParams,
  UpdateSetBody,
} from "@workspace/api-zod";

// 一場比賽裡的各局（set）。跟 players 一樣掛在 match 底下，先驗擁有權再操作。
const router: IRouter = Router();
router.use(mockAuth);

// GET /matches/:matchId/sets — 列出這場比賽的所有局，依局數排序
// owns 檢查跟 players.ts 的 GET 一樣：驗這個 matchId 是不是這個 userId 的。
router.get(
  "/matches/:matchId/sets",
  handler(
    {
      params: ListSetsParams,
      owns: ({ params, userId }) => matchBelongsToUser(params.matchId, userId),
    },
    async ({ res, params }) => {
      const sets = await db
        .select()
        .from(setsTable)
        .where(eq(setsTable.matchId, params.matchId))
        .orderBy(setsTable.setNumber);

      res.json(sets);
    },
  ),
);

// POST /matches/:matchId/sets — 開新的一局
// 只需要驗 parent match，沒有像 players.ts 那樣要另外驗 body 裡的第三方 id。
router.post(
  "/matches/:matchId/sets",
  handler(
    {
      params: CreateSetParams,
      body: CreateSetBody,
      owns: ({ params, userId }) => matchBelongsToUser(params.matchId, userId),
    },
    async ({ res, params, body }) => {
      const [created] = await db
        .insert(setsTable)
        // firstServer 從 body 帶進來（開局時前端已知道誰先發）；matchId 從路徑取（已驗擁有權）。
        .values({
          // client-mintable 主鍵（#64 PR2）：前端離線記錄時得先有 id 才能把「建立」與之後的
          // 「刪除」排進同一條有序 write log，所以允許 body 指定 id。用條件展開而不是直接寫
          // `id: body.id`，是為了不依賴「drizzle 遇到 undefined 會自動退回 default」這個隱性
          // 行為——沒帶 id 時這個 key 根本不存在，DB 的 defaultRandom() 一定生效。
          ...(body.id ? { id: body.id } : {}),
          matchId: params.matchId,
          setNumber: body.setNumber,
          firstServer: body.firstServer,
        })
        .returning();

      res.status(201).json(created);
    },
  ),
);

// PATCH /matches/:matchId/sets/:setId — 補上開空局時還沒選的先發方（見 lib/db 的 schema 註解 #63）。
// 目前只用來填 firstServer，所以 body 只有這一個欄位，直接寫入即可（不用 players.ts 那種
// 「有帶才寫」的 partial update pattern）。
// owns 陣列：先驗這場 match 是不是這個使用者的，再驗這個 set 真的屬於這場 match 底下
// （setBelongsToUser 已經是 set→match→userId 一路 join 過去驗證）。
router.patch(
  "/matches/:matchId/sets/:setId",
  handler(
    {
      params: UpdateSetParams,
      body: UpdateSetBody,
      owns: [
        ({ params, userId }) => matchBelongsToUser(params.matchId, userId),
        ({ params, userId }) => setBelongsToUser(params.setId, userId),
      ],
    },
    async ({ res, params, body }) => {
      const [updated] = await db
        .update(setsTable)
        .set({ firstServer: body.firstServer })
        // setBelongsToUser 已經驗過 set→match→userId，這裡再帶 matchId 進 where
        // 只是多一層保險，跟 players.ts 的 PATCH 一致。
        .where(and(eq(setsTable.id, params.setId), eq(setsTable.matchId, params.matchId)))
        .returning();

      res.json(updated);
    },
  ),
);

export default router;
