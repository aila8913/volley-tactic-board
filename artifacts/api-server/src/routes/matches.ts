import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, matchesTable } from "@workspace/db";
import { mockAuth } from "../middleware/mockAuth";
import {
  CreateMatchBody,
  GetMatchParams,
  UpdateMatchParams,
  UpdateMatchBody,
  DeleteMatchParams,
} from "@workspace/api-zod";

// 比賽本體的 CRUD。跟 tactics 一樣用 mockAuth 把 userId 注入到 req.userId，
// 每個查詢都額外比對 userId，確保使用者只能碰到自己的比賽（擁有權隔離）。
const router: IRouter = Router();
router.use(mockAuth);

// GET /matches — 列出目前使用者的所有比賽，依建立時間排序
router.get("/matches", async (req, res) => {
  const matches = await db
    .select()
    .from(matchesTable)
    .where(eq(matchesTable.userId, req.userId))
    .orderBy(matchesTable.createdAt);

  res.json(matches);
});

// POST /matches — 建立新比賽。userId 由後端從 auth 注入，不是 client 送的，
// 所以 body 只驗 name/date/opponent/location/videoUrl（見 CreateMatchBody）。
router.post("/matches", async (req, res) => {
  const body = CreateMatchBody.parse(req.body);

  const [created] = await db
    .insert(matchesTable)
    .values({
      userId: req.userId,
      name: body.name ?? null,
      // CreateMatchBody 的 date 是 zod.coerce.date()，parse 後已經是 Date 物件，
      // Drizzle 的 timestamp 欄位直接吃 Date。
      date: body.date,
      opponent: body.opponent,
      location: body.location ?? null,
      videoUrl: body.videoUrl ?? null,
      // 前端資料夾 id（可為 null＝放最上層）。後端只是原封不動存起來。
      tournamentId: body.tournamentId ?? null,
    })
    .returning();

  res.status(201).json(created);
});

// GET /matches/:matchId — 取得單場比賽
router.get("/matches/:matchId", async (req, res) => {
  // GetMatchParams 的 matchId 是 zod.coerce.number()，會把 URL 字串轉成整數，
  // 順便擋掉 /matches/abc 這種亂打（parse 會失敗 → 400，由 errorHandler 處理）。
  const { matchId } = GetMatchParams.parse(req.params);

  const [match] = await db
    .select()
    .from(matchesTable)
    .where(and(eq(matchesTable.id, matchId), eq(matchesTable.userId, req.userId)));

  if (!match) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json(match);
});

// PATCH /matches/:matchId — 部分更新（例如補上 videoUrl 開啟賽後補填模式）。
// 只更新 body 有帶的欄位，沒帶的維持原值。
router.patch("/matches/:matchId", async (req, res) => {
  const { matchId } = UpdateMatchParams.parse(req.params);
  const body = UpdateMatchBody.parse(req.body);

  const [updated] = await db
    .update(matchesTable)
    .set({
      // 用「欄位在 body 裡才寫」的展開技巧：body 沒帶的 key 不會出現在 set 物件裡，
      // Drizzle 就不會去動那一欄。注意要判斷 !== undefined 而不是 truthy，
      // 否則像 videoUrl: null（想清空影片連結）這種合法值會被誤判成「沒帶」。
      ...(body.opponent !== undefined && { opponent: body.opponent }),
      // UpdateMatchBody 的 date 是 zod.coerce.date()，parse 後已是 Date 物件，timestamp 欄位直接吃。
      ...(body.date !== undefined && { date: body.date }),
      ...(body.location !== undefined && { location: body.location }),
      ...(body.videoUrl !== undefined && { videoUrl: body.videoUrl }),
      ...(body.tournamentId !== undefined && { tournamentId: body.tournamentId }),
    })
    .where(and(eq(matchesTable.id, matchId), eq(matchesTable.userId, req.userId)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json(updated);
});

// DELETE /matches/:matchId — 刪整場比賽。DB 的外鍵是 onDelete: "cascade"，
// 所以刪掉 match 會連帶清掉它底下的 players/sets/rallies/events，不會留孤兒。
// where 一樣綁 userId：別人的比賽刪不到，回傳 0 列 → 當成 404。
router.delete("/matches/:matchId", async (req, res) => {
  const { matchId } = DeleteMatchParams.parse(req.params);

  const deleted = await db
    .delete(matchesTable)
    .where(and(eq(matchesTable.id, matchId), eq(matchesTable.userId, req.userId)))
    .returning({ id: matchesTable.id });

  if (deleted.length === 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.status(204).end();
});

export default router;
