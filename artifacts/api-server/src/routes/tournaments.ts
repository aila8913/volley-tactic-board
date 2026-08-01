import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, tournamentsTable } from "@workspace/db";
import { mockAuth } from "../middleware/mockAuth";
import { tournamentBelongsToUser } from "../lib/ownership";
import { handler } from "../lib/handler";
import {
  CreateTournamentBody,
  UpdateTournamentParams,
  UpdateTournamentBody,
  DeleteTournamentParams,
} from "@workspace/api-zod";

// 資料夾（tournament）的 CRUD。#117 前資料夾只活在前端 localStorage，這支把它收進 DB。
// 跟 matches 一樣用 mockAuth 注入 userId，每個查詢都比對 userId 做擁有權隔離
// （只碰得到自己的資料夾）。沒有 GET /tournaments/:id 單筆——前端列表一次抓全部就夠用。
const router: IRouter = Router();
router.use(mockAuth);

// GET /tournaments — 列出目前使用者的所有資料夾，依建立時間排序
// owns: "public" ——理由跟 teams.ts 的 GET /teams 一樣：這支路由查的是
// 「這個 userId 名下的資料夾」，擁有權篩選發生在下面的 where 條件
// （eq(tournamentsTable.userId, ...)），不是靠單一資源的 owns 檢查擋。owns 是必填欄位
// （見 handler.ts 的說明），所以用 "public" 明講。
router.get(
  "/tournaments",
  handler({ owns: "public" }, async ({ req, res }) => {
    const tournaments = await db
      .select()
      .from(tournamentsTable)
      .where(eq(tournamentsTable.userId, req.userId))
      .orderBy(tournamentsTable.createdAt);

    res.json(tournaments);
  }),
);

// POST /tournaments — 建立資料夾。userId 由後端從 auth 注入、不是 client 送的。
// id 則相反：body.id 有帶就用前端自己生的 uuid（client-mintable，見
// lib/db/src/schema/tournaments.ts）；沒帶就交給資料庫的 defaultRandom() 生一個。
// owns: "public" ——這裡是建立一筆全新的資源、掛在 req.userId 底下，沒有既有資料要驗
// 擁有權（不像 matches.ts 的 POST 要驗 body.tournamentId / body.teamId 是不是這個使用者的），
// 所以跟 GET 一樣明講 "public"，而不是留白讓人誤以為漏寫。
router.post(
  "/tournaments",
  handler({ body: CreateTournamentBody, owns: "public" }, async ({ res, body, userId }) => {
    const [created] = await db
      .insert(tournamentsTable)
      .values({
        ...(body.id !== undefined && { id: body.id }),
        userId,
        name: body.name,
      })
      .returning();

    res.status(201).json(created);
  }),
);

// PATCH /tournaments/:tournamentId — 改名（目前資料夾只有名稱可改）。
// owns 檢查直接查一次「這個 tournamentId 是不是這個 userId 的」，跟原本 where 裡的
// and(eq(id), eq(userId)) 邏輯等價，只是挪到 owns closure 裡先驗證一次（同 matches.ts/teams.ts）。
// owns 已經先確認過這個資料夾存在且是這個使用者的，所以不再像遷移前那樣另外判斷
// `if (!updated)` 404——跟 matches.ts/teams.ts 的 PATCH 一致，兩者都選擇信任 owns 檢查、
// 不重複防禦（DELETE 則保留 returning-length 檢查，理由見下方 DELETE 的註解）。
router.patch(
  "/tournaments/:tournamentId",
  handler(
    {
      params: UpdateTournamentParams,
      body: UpdateTournamentBody,
      owns: ({ params, userId }) => tournamentBelongsToUser(params.tournamentId, userId),
    },
    async ({ res, params, body, userId }) => {
      const [updated] = await db
        .update(tournamentsTable)
        .set({
          // 只在 body 真的帶了 name 才寫（沿用 matches 的 !== undefined 展開技巧）。
          ...(body.name !== undefined && { name: body.name }),
        })
        .where(
          and(eq(tournamentsTable.id, params.tournamentId), eq(tournamentsTable.userId, userId)),
        )
        .returning();

      res.json(updated);
    },
  ),
);

// DELETE /tournaments/:tournamentId — 刪資料夾。DB 外鍵是 onDelete: "cascade"，
// 所以刪掉資料夾會連帶清掉裡面的 matches（再往下 cascade 到 players/sets/rallies/events）——
// 這正是 PO 拍板「刪資料夾＝連同比賽一起刪」，一次在 DB 層做對，前端不用再手動逐場刪。
router.delete(
  "/tournaments/:tournamentId",
  handler(
    {
      params: DeleteTournamentParams,
      owns: ({ params, userId }) => tournamentBelongsToUser(params.tournamentId, userId),
    },
    async ({ res, params, userId }) => {
      // where 一樣綁 userId：別人的資料夾刪不到。owns 檢查已經先確認過這個資料夾存在
      // 且是這個使用者的，理論上這裡一定會刪到一列；.returning() + 長度檢查保留下來
      // 是不改變原本「靠實際刪掉幾列判斷成功與否」的防禦性寫法（同 matches.ts/teams.ts，#225 的教訓）。
      const deleted = await db
        .delete(tournamentsTable)
        .where(
          and(eq(tournamentsTable.id, params.tournamentId), eq(tournamentsTable.userId, userId)),
        )
        .returning({ id: tournamentsTable.id });

      if (deleted.length === 0) {
        res.status(404).json({ error: "Not found" });
        return;
      }

      res.status(204).end();
    },
  ),
);

export default router;
