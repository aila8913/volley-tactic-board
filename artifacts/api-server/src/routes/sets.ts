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
        // 冪等寫入（#64 PR3）：離線佇列的保證是「至少送一次」——後端已經寫進去、但回應在
        // 半路掉了的時候，前端重連後會用**同一個 id** 再送一次。沒有這行的話那次重送會撞主鍵、
        // 回 409，那筆就永遠卡在佇列裡；有了它，重複的第二次就安靜地什麼都不做。
        // 這正是「主鍵由前端鑄造」的附加價值：id 本身就是冪等鑰匙（idempotency key），
        // 不必再另外設計一個 request id 欄位。
        .onConflictDoNothing({ target: setsTable.id })
        .returning();

      if (!created) {
        // 走到這裡代表這個 id 已經存在。回既有那一列，讓「重送」跟「第一次送」對前端來說
        // 結果一致。但要先確認它真的掛在這個 match 底下——否則等於提供了一個
        // 「拿別人的 row id 來換取那列內容」的探測管道（IDOR，同 #225 的教訓）。
        const existing = body.id
          ? await db
              .select()
              .from(setsTable)
              .where(and(eq(setsTable.id, body.id), eq(setsTable.matchId, params.matchId)))
              .limit(1)
          : [];

        if (existing.length === 0) {
          res.status(409).json({ error: "Conflict" });
          return;
        }
        // 照樣回 201：對呼叫端而言「這一列照你說的存在了」，跟第一次送沒有差別，
        // 也讓 openapi 合約維持單一成功狀態碼（不必為重送多開一個 200 分支）。
        res.status(201).json(existing[0]);
        return;
      }

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
