import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, tacticsTable } from "@workspace/db";
import { requireAuth } from "../middleware/requireAuth";
import { matchBelongsToUser, tacticBelongsToUser } from "../lib/ownership";
import { handler } from "../lib/handler";
import {
  CreateTacticBody,
  UpdateTacticBody,
  GetTacticParams,
  UpdateTacticParams,
  DeleteTacticParams,
  ListTacticsQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

// 所有戰術路由都套用 mock auth，userId 會被注入到 req.userId
router.use(requireAuth);

// GET /tactics — 取得目前使用者的戰術，按建立時間新→舊排列。
// 帶 ?matchId=<n> 就只回那場比賽的戰術（#119：戰術庫 per-match，面板不再跨場汙染）；
// 不帶就回全部（保留舊行為）。
// owns: "public" ——這支路由本身不驗證任何單一資源的擁有權，因為它查的是
// 「這個 userId 名下的戰術」，擁有權篩選就發生在下面的 where 條件裡（eq(tacticsTable.userId, ...)），
// 不是靠 handler() 的 owns 機制擋。用 "public" 而不是留空，是因為 owns 是必填欄位（見 handler.ts 的說明）。
router.get(
  "/tactics",
  handler({ owns: "public" }, async ({ req, res }) => {
    const { matchId } = ListTacticsQueryParams.parse(req.query);

    const tactics = await db
      .select()
      .from(tacticsTable)
      .where(
        // 一律先鎖 userId（擁有權），有帶 matchId 再多疊一個等值條件。
        // and(...) 接受 undefined 會自動略過，所以沒帶 matchId 時等同只有 userId 條件。
        and(
          eq(tacticsTable.userId, req.userId),
          matchId !== undefined ? eq(tacticsTable.matchId, matchId) : undefined,
        ),
      )
      .orderBy(tacticsTable.createdAt);

    res.json(tactics);
  }),
);

// POST /tactics — 新建戰術
// owns 檢查：要把戰術歸屬到某場比賽的話，先確認那場比賽是「這個使用者的」（#225，同 #127 的判準）。
// tacticsTable.matchId 是真的外鍵，但**外鍵保證的是 referential integrity（這個 id 真的指到
// 一列存在的比賽），不保證 ownership（那場是不是你的）**——少了這關，A 就能把自己的戰術掛到
// B 的 matchId 底下（IDOR），而且 FK 是 onDelete: cascade，B 刪掉那場比賽會連帶刪掉 A 的戰術。
// body.matchId 是 nullish（可不帶＝全域戰術、可為 null），`!= null` 這個寬鬆比較剛好一次
// 涵蓋 undefined 與 null 兩種「沒有比賽可驗」的情況——這種情況下直接視為通過（回傳 true）。
router.post(
  "/tactics",
  handler(
    {
      body: CreateTacticBody,
      owns: ({ body, userId }) => body.matchId == null || matchBelongsToUser(body.matchId, userId),
    },
    async ({ res, body, userId }) => {
      const [created] = await db
        .insert(tacticsTable)
        .values({
          userId,
          // 歸屬到哪一場比賽（#119）。前端存檔時帶當前 matchId；沒帶就是 null（全域戰術）。
          matchId: body.matchId,
          name: body.name,
          // data 欄位是 jsonb，Drizzle 直接接受 JS 物件
          data: body.data,
        })
        .returning();

      res.status(201).json(created);
    },
  ),
);

// GET /tactics/:tacticId — 取得單一戰術
// owns 檢查直接查一次「這個 tacticId 是不是這個 userId 的」，跟原本 where 裡的
// and(eq(id), eq(userId)) 邏輯等價，只是挪到 owns closure 裡先驗證一次。
router.get(
  "/tactics/:tacticId",
  handler(
    {
      params: GetTacticParams,
      owns: ({ params, userId }) => tacticBelongsToUser(params.tacticId, userId),
    },
    async ({ res, params, userId }) => {
      const [tactic] = await db
        .select()
        .from(tacticsTable)
        .where(
          // 同時驗證 id 和 userId，防止拿到別人的戰術
          and(eq(tacticsTable.id, params.tacticId), eq(tacticsTable.userId, userId)),
        );

      res.json(tactic);
    },
  ),
);

// PUT /tactics/:tacticId — 覆寫更新戰術（name 和/或 data）
router.put(
  "/tactics/:tacticId",
  handler(
    {
      params: UpdateTacticParams,
      body: UpdateTacticBody,
      owns: ({ params, userId }) => tacticBelongsToUser(params.tacticId, userId),
    },
    async ({ res, params, body, userId }) => {
      const [updated] = await db
        .update(tacticsTable)
        .set({
          ...(body.name !== undefined && { name: body.name }),
          ...(body.data !== undefined && { data: body.data }),
          // updatedAt 手動設定，因為 Postgres 不會自動更新
          updatedAt: new Date(),
        })
        .where(and(eq(tacticsTable.id, params.tacticId), eq(tacticsTable.userId, userId)))
        .returning();

      res.json(updated);
    },
  ),
);

// DELETE /tactics/:tacticId — 刪除戰術
router.delete(
  "/tactics/:tacticId",
  handler(
    {
      params: DeleteTacticParams,
      owns: ({ params, userId }) => tacticBelongsToUser(params.tacticId, userId),
    },
    async ({ res, params, userId }) => {
      // where 綁了 userId，所以刪不到別人的戰術——但「刪不到」和「刪掉了」在 SQL 層長得一模一樣：
      // 兩者都是不報錯地跑完。owns 檢查已經先確認過這筆戰術存在且是這個使用者的，
      // 所以這裡的刪除理論上一定會刪到一列；.returning() 保留下來是為了不改變原本
      // 「靠實際刪掉幾列判斷成功與否」的防禦性寫法（#225 的教訓）。
      const deleted = await db
        .delete(tacticsTable)
        .where(and(eq(tacticsTable.id, params.tacticId), eq(tacticsTable.userId, userId)))
        .returning({ id: tacticsTable.id });

      if (deleted.length === 0) {
        res.status(404).json({ error: "Not found" });
        return;
      }

      res.status(204).end();
    },
  ),
);

export default router;
