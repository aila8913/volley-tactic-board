import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, matchesTable } from "@workspace/db";
import { mockAuth } from "../middleware/mockAuth";
import { tournamentBelongsToUser, teamBelongsToUser } from "../lib/ownership";
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

  // 要放進某個資料夾的話，先確認那個資料夾是「這個使用者的」（#127）。
  // null／沒帶＝放最上層，沒有資料夾可驗，直接跳過。
  // 回 404 而不是 403：對不屬於你的資源，回「不存在」比回「存在但你不能碰」更保守——
  // 後者等於用錯誤碼幫攻擊者確認了那個 uuid 真的有東西。
  if (
    body.tournamentId != null &&
    !(await tournamentBelongsToUser(body.tournamentId, req.userId))
  ) {
    res.status(404).json({ error: "Tournament not found" });
    return;
  }

  // 同理，要標成某支球隊的話，先確認那支球隊是「這個使用者的」（跟 tournamentId 同一套
  // ownership 檢查，見 lib/ownership.ts 的 teamBelongsToUser）。null／沒帶＝未分類，跳過。
  if (body.teamId != null && !(await teamBelongsToUser(body.teamId, req.userId))) {
    res.status(404).json({ error: "Team not found" });
    return;
  }

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
      // 資料夾 id（可為 null＝放最上層）。擁有權已在上面驗過，這裡才敢直接存。
      tournamentId: body.tournamentId ?? null,
      // 球隊標籤 id（可為 null＝未分類）。擁有權同樣已在上面驗過。
      teamId: body.teamId ?? null,
      // 賽制（#215）：跟 teamId 不同，這欄不是外鍵、不用驗擁有權，也不用像其他欄位一樣
      // 給 ?? null 的 fallback——沒帶就直接不寫進這個 key，讓 DB 的 default("best_of_3")
      // 自己接手。如果這裡改成 body.format ?? "best_of_3"，就會多出「應用層也記一份預設值」
      // 的第二個地方，之後兩邊的預設值一旦想法飄開（例如只改了 DB 沒改到這裡）就會出現
      // 兩套不一致的行為，所以刻意讓「沒給值」這件事只由 DB 處理一次。
      ...(body.format !== undefined && { format: body.format }),
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

  // 同 POST：搬進某個資料夾前先驗那個資料夾的擁有權（#127）。
  // 這裡要分清楚 undefined 和 null 兩種「沒有值」——undefined ＝ body 根本沒帶這欄、
  // 資料夾維持原樣；null ＝ 明確要求搬到最上層。兩者都沒有資料夾可驗，`!= null`
  // （寬鬆比較）剛好一次涵蓋，但下面 set 裡的展開仍必須用嚴格的 !== undefined，
  // 否則 null 會被誤判成「沒帶」、搬到最上層就失效了。
  if (
    body.tournamentId != null &&
    !(await tournamentBelongsToUser(body.tournamentId, req.userId))
  ) {
    res.status(404).json({ error: "Tournament not found" });
    return;
  }

  // 改標球隊時同樣先驗擁有權（`!= null` 一次涵蓋 undefined＝沒帶 與 null＝改成未分類，
  // 兩者都沒有球隊可驗）。下面 set 的展開仍用嚴格 !== undefined，讓 null（清成未分類）寫得進去。
  if (body.teamId != null && !(await teamBelongsToUser(body.teamId, req.userId))) {
    res.status(404).json({ error: "Team not found" });
    return;
  }

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
      ...(body.teamId !== undefined && { teamId: body.teamId }),
      // 賽制（#215）：沒帶就不動這一欄，維持原本的賽制不變。
      ...(body.format !== undefined && { format: body.format }),
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
