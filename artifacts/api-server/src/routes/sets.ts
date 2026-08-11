import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, setsTable } from "@workspace/db";
import { requireAuth } from "../middleware/requireAuth";
import { matchBelongsToUser, setBelongsToUser } from "../lib/ownership";
import { handler } from "../lib/handler";
import { insertIdempotent } from "../lib/insertIdempotent";
import type { EveryColumnOnInsert, EveryColumnOnUpdate } from "../lib/everyColumn";
import {
  ListSetsParams,
  CreateSetParams,
  CreateSetBody,
  UpdateSetParams,
  UpdateSetBody,
} from "@workspace/api-zod";

// 一場比賽裡的各局（set）。跟 players 一樣掛在 match 底下，先驗擁有權再操作。
const router: IRouter = Router();
router.use(requireAuth);

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
      // 型別標註是 #368 的守衛：EveryColumnOnInsert 讓 sets 的每一欄都變必填，
      // 漏列一欄就編譯不過（見 lib/everyColumn.ts）。
      const values: EveryColumnOnInsert<typeof setsTable> = {
        // client-mintable 主鍵（#64 PR2）：前端離線記錄時得先有 id 才能把「建立」與之後的
        // 「刪除」排進同一條有序 write log，所以允許 body 指定 id。`?? undefined` 取代了
        // 原本的條件展開 `...(body.id ? { id } : {})`：條件展開產生的是 optional key，
        // 窮舉檢查看不到它；drizzle 遇到 undefined 一樣會送出 SQL 的 `default`，
        // DB 的 defaultRandom() 照樣生效，行為不變。
        id: body.id ?? undefined,
        // firstServer 從 body 帶進來（開局時前端已知道誰先發）；matchId 從路徑取（已驗擁有權）。
        matchId: params.matchId,
        setNumber: body.setNumber,
        firstServer: body.firstServer,
      };

      // 冪等寫入 + 重送回既有列的整套邏輯收在 lib/insertIdempotent.ts（原本這裡有一份、
      // 另外四張表各抄一份）。第三個參數是重讀既有列時的 scope：確認那列真的掛在這個
      // 已驗過擁有權的 match 底下，否則就是一條 IDOR 探測管道——理由詳見那支模組的說明。
      const row = await insertIdempotent(setsTable, values, eq(setsTable.matchId, params.matchId));

      if (!row) {
        res.status(409).json({ error: "Conflict" });
        return;
      }

      // 新建與重送都回 201：對呼叫端而言「這一列照你說的存在了」，兩者沒有差別，
      // openapi 合約也才能維持單一成功狀態碼（不必為重送多開一個 200 分支）。
      res.status(201).json(row);
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
      // 型別標註是 #368 的守衛：EveryColumnOnUpdate 讓 sets 的每一欄都要在物件裡出現，
      // 「這欄不開放 PATCH」現在要明寫 undefined（見 lib/everyColumn.ts）。
      const patch: EveryColumnOnUpdate<typeof setsTable> = {
        // id 是主鍵、matchId 由路徑決定、setNumber 是這局在比賽裡的順序，三者都不開放改。
        id: undefined,
        matchId: undefined,
        setNumber: undefined,
        firstServer: body.firstServer,
      };

      const [updated] = await db
        .update(setsTable)
        .set(patch)
        // setBelongsToUser 已經驗過 set→match→userId，這裡再帶 matchId 進 where
        // 只是多一層保險，跟 players.ts 的 PATCH 一致。
        .where(and(eq(setsTable.id, params.setId), eq(setsTable.matchId, params.matchId)))
        .returning();

      res.json(updated);
    },
  ),
);

export default router;
