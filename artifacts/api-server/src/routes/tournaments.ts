import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, tournamentsTable } from "@workspace/db";
import { mockAuth } from "../middleware/mockAuth";
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
router.get("/tournaments", async (req, res) => {
  const tournaments = await db
    .select()
    .from(tournamentsTable)
    .where(eq(tournamentsTable.userId, req.userId))
    .orderBy(tournamentsTable.createdAt);

  res.json(tournaments);
});

// POST /tournaments — 建立資料夾。userId 由後端從 auth 注入、不是 client 送的。
// id 則相反：body.id 有帶就用前端自己生的 uuid（client-mintable，見
// lib/db/src/schema/tournaments.ts）；沒帶就交給資料庫的 defaultRandom() 生一個。
router.post("/tournaments", async (req, res) => {
  const body = CreateTournamentBody.parse(req.body);

  const [created] = await db
    .insert(tournamentsTable)
    .values({
      ...(body.id !== undefined && { id: body.id }),
      userId: req.userId,
      name: body.name,
    })
    .returning();

  res.status(201).json(created);
});

// PATCH /tournaments/:tournamentId — 改名（目前資料夾只有名稱可改）。
router.patch("/tournaments/:tournamentId", async (req, res) => {
  const { tournamentId } = UpdateTournamentParams.parse(req.params);
  const body = UpdateTournamentBody.parse(req.body);

  const [updated] = await db
    .update(tournamentsTable)
    .set({
      // 只在 body 真的帶了 name 才寫（沿用 matches 的 !== undefined 展開技巧）。
      ...(body.name !== undefined && { name: body.name }),
    })
    .where(and(eq(tournamentsTable.id, tournamentId), eq(tournamentsTable.userId, req.userId)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json(updated);
});

// DELETE /tournaments/:tournamentId — 刪資料夾。DB 外鍵是 onDelete: "cascade"，
// 所以刪掉資料夾會連帶清掉裡面的 matches（再往下 cascade 到 players/sets/rallies/events）——
// 這正是 PO 拍板「刪資料夾＝連同比賽一起刪」，一次在 DB 層做對，前端不用再手動逐場刪。
// where 綁 userId：別人的資料夾刪不到，回傳 0 列 → 當成 404。
router.delete("/tournaments/:tournamentId", async (req, res) => {
  const { tournamentId } = DeleteTournamentParams.parse(req.params);

  const deleted = await db
    .delete(tournamentsTable)
    .where(and(eq(tournamentsTable.id, tournamentId), eq(tournamentsTable.userId, req.userId)))
    .returning({ id: tournamentsTable.id });

  if (deleted.length === 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.status(204).end();
});

export default router;
