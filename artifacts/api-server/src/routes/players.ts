import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, playersTable } from "@workspace/db";
import { mockAuth } from "../middleware/mockAuth";
import { matchBelongsToUser, playerBelongsToMatch, personBelongsToUser } from "../lib/ownership";
import {
  ListPlayersParams,
  CreatePlayerParams,
  CreatePlayerBody,
  UpdatePlayerParams,
  UpdatePlayerBody,
  DeletePlayerParams,
} from "@workspace/api-zod";

// 一場比賽的球員名單。名單掛在 match 底下（不是獨立球隊），路徑本身就反映這個從屬關係。
// 每個 endpoint 都先驗 parent match 屬於這個使用者，才繼續往下做（見 lib/ownership.ts）。
const router: IRouter = Router();
router.use(mockAuth);

// GET /matches/:matchId/players — 列出這場比賽的球員
router.get("/matches/:matchId/players", async (req, res) => {
  const { matchId } = ListPlayersParams.parse(req.params);

  if (!(await matchBelongsToUser(matchId, req.userId))) {
    // 不是自己的（或根本不存在的）比賽，一律回 404——不用 403，
    // 是為了不洩漏「這個 matchId 其實存在、只是不是你的」這種資訊。
    res.status(404).json({ error: "Not found" });
    return;
  }

  const players = await db.select().from(playersTable).where(eq(playersTable.matchId, matchId));

  res.json(players);
});

// POST /matches/:matchId/players — 新增一名球員到名單
router.post("/matches/:matchId/players", async (req, res) => {
  const { matchId } = CreatePlayerParams.parse(req.params);
  const body = CreatePlayerBody.parse(req.body);

  if (!(await matchBelongsToUser(matchId, req.userId))) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  // body.personId 若是非 null 的數字，代表「新增這名球員時就順便對應到某個既有身分」，
  // 一樣要先驗擁有權——理由跟 teamId/tournamentId 一模一樣：外鍵只保證 personId 指到一列
  // 存在的 person，不保證那是這個使用者名下的 person（見 lib/ownership.ts 的說明）。
  if (
    typeof body.personId === "number" &&
    !(await personBelongsToUser(body.personId, req.userId))
  ) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const [created] = await db
    .insert(playersTable)
    // matchId 來自路徑（已驗證擁有權），不是 body——避免 client 亂塞別場比賽的 id。
    // id 則相反：body.id 有帶就用前端自己生的 uuid（client-mintable，見
    // lib/db/src/schema/players.ts 的說明）；沒帶就交給資料庫的 defaultRandom() 生一個。
    .values({
      ...(body.id !== undefined && { id: body.id }),
      matchId,
      name: body.name,
      number: body.number,
      role: body.role,
      // 沿用「有帶才寫」慣例，判斷 !== undefined 而不是 truthy——見 PATCH 那邊的詳細說明。
      ...(body.personId !== undefined && { personId: body.personId }),
    })
    .returning();

  res.status(201).json(created);
});

// PATCH /matches/:matchId/players/:playerId — 改名單裡某名球員（改名/背號/位置）。
// 兩層擁有權：先確認這場 match 是你的，再確認這個 player 真的在這場 match 底下。
router.patch("/matches/:matchId/players/:playerId", async (req, res) => {
  const { matchId, playerId } = UpdatePlayerParams.parse(req.params);
  const body = UpdatePlayerBody.parse(req.body);

  if (!(await matchBelongsToUser(matchId, req.userId))) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (!(await playerBelongsToMatch(playerId, matchId))) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  // 同 POST：body.personId 若是非 null 的數字，代表「把這個名單列改成對應到某個既有身分」，
  // 要先驗那個身分真的是這個使用者的（IDOR 防護，見 lib/ownership.ts）。
  if (
    typeof body.personId === "number" &&
    !(await personBelongsToUser(body.personId, req.userId))
  ) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const [updated] = await db
    .update(playersTable)
    .set({
      // 一樣「有帶才寫」，沒帶的欄位保持原值。
      ...(body.name !== undefined && { name: body.name }),
      ...(body.number !== undefined && { number: body.number }),
      ...(body.role !== undefined && { role: body.role }),
      // 這裡的判斷條件刻意是 `!== undefined`，不是 truthy（也就是不是單純 `body.personId &&`）。
      // 原因：personId 有三種合法的「帶了」狀態——一個數字（改對應到某人）、null（解除對應，
      // 這名單列變回「歸屬不明」）、或整個欄位沒出現在 body 裡（不動它，保留原值）。
      // 如果用 truthy 判斷，`personId: null` 會被當成 falsy 而整個被跳過，等於使用者按了
      // 「解除對應」的 UI，結果請求送出去卻悄悄地什麼都沒發生——這種「操作靜默失效」比報錯還危險。
      ...(body.personId !== undefined && { personId: body.personId }),
    })
    // where 綁 playerId 也綁 matchId，雙重保險（前面已驗過，這裡再多一層界線）。
    .where(and(eq(playersTable.id, playerId), eq(playersTable.matchId, matchId)))
    .returning();

  res.json(updated);
});

// DELETE /matches/:matchId/players/:playerId — 從名單移除一名球員。
router.delete("/matches/:matchId/players/:playerId", async (req, res) => {
  const { matchId, playerId } = DeletePlayerParams.parse(req.params);

  if (!(await matchBelongsToUser(matchId, req.userId))) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (!(await playerBelongsToMatch(playerId, matchId))) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  await db
    .delete(playersTable)
    .where(and(eq(playersTable.id, playerId), eq(playersTable.matchId, matchId)));

  res.status(204).end();
});

export default router;
