import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, teamsTable } from "@workspace/db";
import { mockAuth } from "../middleware/mockAuth";
import { teamBelongsToUser } from "../lib/ownership";
import { handler } from "../lib/handler";
import {
  CreateTeamBody,
  UpdateTeamParams,
  UpdateTeamBody,
  DeleteTeamParams,
} from "@workspace/api-zod";

// 球隊（team）的 CRUD。team 只是「分組標籤」——標記一場比賽是哪支隊伍打的，之後才能
// 按球隊切片統計（#65 視圖二）。跟 tournaments 同一套 mockAuth + userId 擁有權隔離。
//
// 跟 tournaments 兩處刻意不同：
//   1. teams.id 是 serial 整數（DB 自動遞增），不是 client-mintable 的 uuid，所以 POST
//      不收 body.id、URL 參數用整數。整數 id 對「標籤」這種輕量分組已足夠，也讓
//      matches.teamId 這個外鍵是便宜的整數比對。
//   2. DELETE 不 cascade：matches.teamId 的外鍵是 onDelete: "set null"（見
//      lib/db/src/schema/matches.ts），刪掉一支球隊只會把指著它的比賽 teamId 設回 null
//      （變「未分類」），比賽本體不受影響——標籤沒了不該牽連比賽紀錄。
const router: IRouter = Router();
router.use(mockAuth);

// GET /teams — 列出目前使用者的所有球隊。teams 沒有 createdAt 欄位，用 serial id 排序
// 當作「建立順序」的近似（id 遞增＝越後面建立）。
// owns: "public" ——理由跟 matches.ts 的 GET /matches 一樣：這支路由查的是
// 「這個 userId 名下的球隊」，擁有權篩選發生在下面的 where 條件
// （eq(teamsTable.userId, ...)），不是靠單一資源的 owns 檢查擋。owns 是必填欄位
// （見 handler.ts 的說明），所以用 "public" 明講。
router.get(
  "/teams",
  handler({ owns: "public" }, async ({ req, res }) => {
    const teams = await db
      .select()
      .from(teamsTable)
      .where(eq(teamsTable.userId, req.userId))
      .orderBy(teamsTable.id);

    res.json(teams);
  }),
);

// POST /teams — 建立球隊。userId 由後端從 auth 注入，不是 client 送的；id 交給 DB 的 serial
// 自動遞增（不像 tournaments 收 client 生的 uuid）。
// owns: "public" ——這裡是建立一筆全新的資源、掛在 req.userId 底下，沒有既有資料要驗
// 擁有權（不像 matches.ts 的 POST 要驗 body.tournamentId / body.teamId 是不是這個使用者的），
// 所以跟 GET 一樣明講 "public"，而不是留白讓人誤以為漏寫。
router.post(
  "/teams",
  handler({ body: CreateTeamBody, owns: "public" }, async ({ res, body, userId }) => {
    const [created] = await db
      .insert(teamsTable)
      .values({
        userId,
        name: body.name,
      })
      .returning();

    res.status(201).json(created);
  }),
);

// PATCH /teams/:teamId — 改名（球隊目前也只有名稱可改）。
// owns 檢查直接查一次「這個 teamId 是不是這個 userId 的」，跟原本 where 裡的
// and(eq(id), eq(userId)) 邏輯等價，只是挪到 owns closure 裡先驗證一次（同 matches.ts）。
// owns 已經先確認過這支球隊存在且是這個使用者的，所以不再像遷移前那樣另外判斷
// `if (!updated)` 404——跟 matches.ts 的 PATCH 一致，兩者都選擇信任 owns 檢查、
// 不重複防禦（DELETE 則保留 returning-length 檢查，理由見下方 DELETE 的註解）。
router.patch(
  "/teams/:teamId",
  handler(
    {
      params: UpdateTeamParams,
      body: UpdateTeamBody,
      owns: ({ params, userId }) => teamBelongsToUser(params.teamId, userId),
    },
    async ({ res, params, body, userId }) => {
      const [updated] = await db
        .update(teamsTable)
        .set({
          // 沿用 matches/tournaments 的「欄位在 body 才寫」技巧，判斷 !== undefined。
          ...(body.name !== undefined && { name: body.name }),
        })
        .where(and(eq(teamsTable.id, params.teamId), eq(teamsTable.userId, userId)))
        .returning();

      res.json(updated);
    },
  ),
);

// DELETE /teams/:teamId — 刪球隊標籤。DB 外鍵 onDelete: "set null" 會把指著這支球隊的
// matches.teamId 自動設回 null（比賽變「未分類」），不會連帶刪比賽——跟 tournaments 的
// cascade 刪除刻意相反（見上方檔案頂註解）。
router.delete(
  "/teams/:teamId",
  handler(
    {
      params: DeleteTeamParams,
      owns: ({ params, userId }) => teamBelongsToUser(params.teamId, userId),
    },
    async ({ res, params, userId }) => {
      // where 一樣綁 userId：別人的球隊刪不到。owns 檢查已經先確認過這支球隊存在
      // 且是這個使用者的，理論上這裡一定會刪到一列；.returning() + 長度檢查保留下來
      // 是不改變原本「靠實際刪掉幾列判斷成功與否」的防禦性寫法（同 matches.ts，#225 的教訓）。
      const deleted = await db
        .delete(teamsTable)
        .where(and(eq(teamsTable.id, params.teamId), eq(teamsTable.userId, userId)))
        .returning({ id: teamsTable.id });

      if (deleted.length === 0) {
        res.status(404).json({ error: "Not found" });
        return;
      }

      res.status(204).end();
    },
  ),
);

export default router;
