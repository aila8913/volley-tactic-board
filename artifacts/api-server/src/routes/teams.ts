import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, teamsTable } from "@workspace/db";
import { mockAuth } from "../middleware/mockAuth";
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
router.get("/teams", async (req, res) => {
  const teams = await db
    .select()
    .from(teamsTable)
    .where(eq(teamsTable.userId, req.userId))
    .orderBy(teamsTable.id);

  res.json(teams);
});

// POST /teams — 建立球隊。userId 由後端從 auth 注入，不是 client 送的；id 交給 DB 的 serial
// 自動遞增（不像 tournaments 收 client 生的 uuid）。
router.post("/teams", async (req, res) => {
  const body = CreateTeamBody.parse(req.body);

  const [created] = await db
    .insert(teamsTable)
    .values({
      userId: req.userId,
      name: body.name,
    })
    .returning();

  res.status(201).json(created);
});

// PATCH /teams/:teamId — 改名（球隊目前也只有名稱可改）。
router.patch("/teams/:teamId", async (req, res) => {
  const { teamId } = UpdateTeamParams.parse(req.params);
  const body = UpdateTeamBody.parse(req.body);

  const [updated] = await db
    .update(teamsTable)
    .set({
      // 沿用 matches/tournaments 的「欄位在 body 才寫」技巧，判斷 !== undefined。
      ...(body.name !== undefined && { name: body.name }),
    })
    .where(and(eq(teamsTable.id, teamId), eq(teamsTable.userId, req.userId)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json(updated);
});

// DELETE /teams/:teamId — 刪球隊標籤。DB 外鍵 onDelete: "set null" 會把指著這支球隊的
// matches.teamId 自動設回 null（比賽變「未分類」），不會連帶刪比賽——跟 tournaments 的
// cascade 刪除刻意相反（見上方檔案頂註解）。where 綁 userId：別人的球隊刪不到 → 404。
router.delete("/teams/:teamId", async (req, res) => {
  const { teamId } = DeleteTeamParams.parse(req.params);

  const deleted = await db
    .delete(teamsTable)
    .where(and(eq(teamsTable.id, teamId), eq(teamsTable.userId, req.userId)))
    .returning({ id: teamsTable.id });

  if (deleted.length === 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.status(204).end();
});

export default router;
