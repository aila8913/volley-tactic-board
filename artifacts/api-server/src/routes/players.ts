import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, playersTable } from "@workspace/db";
import { requireAuth } from "../middleware/requireAuth";
import { matchBelongsToUser, playerBelongsToMatch, personBelongsToUser } from "../lib/ownership";
import { handler } from "../lib/handler";
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
router.use(requireAuth);

// GET /matches/:matchId/players — 列出這場比賽的球員
// owns 檢查直接查一次「這個 matchId 是不是這個 userId 的」——跟 matches.ts 的
// GET /matches/:matchId 同一套邏輯，只是這裡驗完之後查的是掛在這個 match 底下的球員名單，
// 不是 match 本身。
router.get(
  "/matches/:matchId/players",
  handler(
    {
      params: ListPlayersParams,
      owns: ({ params, userId }) => matchBelongsToUser(params.matchId, userId),
    },
    async ({ res, params }) => {
      const players = await db
        .select()
        .from(playersTable)
        .where(eq(playersTable.matchId, params.matchId));

      res.json(players);
    },
  ),
);

// POST /matches/:matchId/players — 新增一名球員到名單
// owns 陣列：先驗這場 match 是不是這個使用者的，再驗 body.personId（若有帶且是數字）
// 是不是這個使用者名下的「人」——理由同 matches.ts 的 tournamentId/teamId 檢查：外鍵只保證
// personId 指到一列存在的 person，不保證那是這個使用者的（見 lib/ownership.ts）。
// personId 可能是 null（明確不對應）或整個沒帶（不對應），這兩種情況都沒有東西可驗，
// 所以用 `typeof body.personId !== "number"` 直接視為通過。
router.post(
  "/matches/:matchId/players",
  handler(
    {
      params: CreatePlayerParams,
      body: CreatePlayerBody,
      owns: [
        ({ params, userId }) => matchBelongsToUser(params.matchId, userId),
        ({ body, userId }) =>
          typeof body.personId !== "number" || personBelongsToUser(body.personId, userId),
      ],
    },
    async ({ res, params, body }) => {
      const [created] = await db
        .insert(playersTable)
        // matchId 來自路徑（已驗證擁有權），不是 body——避免 client 亂塞別場比賽的 id。
        // id 則相反：body.id 有帶就用前端自己生的 uuid（client-mintable，見
        // lib/db/src/schema/players.ts 的說明）；沒帶就交給資料庫的 defaultRandom() 生一個。
        .values({
          ...(body.id !== undefined && { id: body.id }),
          matchId: params.matchId,
          name: body.name,
          number: body.number,
          role: body.role,
          // 沿用「有帶才寫」慣例，判斷 !== undefined 而不是 truthy——見 PATCH 那邊的詳細說明。
          ...(body.personId !== undefined && { personId: body.personId }),
        })
        .returning();

      res.status(201).json(created);
    },
  ),
);

// PATCH /matches/:matchId/players/:playerId — 改名單裡某名球員（改名/背號/位置）。
// 三層 owns 檢查：先確認這場 match 是你的，再確認這個 player 真的在這場 match 底下
// （擋掉 playerId 存在、但其實掛在別場比賽底下的情況），最後同 POST 驗 body.personId。
router.patch(
  "/matches/:matchId/players/:playerId",
  handler(
    {
      params: UpdatePlayerParams,
      body: UpdatePlayerBody,
      owns: [
        ({ params, userId }) => matchBelongsToUser(params.matchId, userId),
        ({ params }) => playerBelongsToMatch(params.playerId, params.matchId),
        ({ body, userId }) =>
          typeof body.personId !== "number" || personBelongsToUser(body.personId, userId),
      ],
    },
    async ({ res, params, body }) => {
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
        .where(and(eq(playersTable.id, params.playerId), eq(playersTable.matchId, params.matchId)))
        .returning();

      res.json(updated);
    },
  ),
);

// DELETE /matches/:matchId/players/:playerId — 從名單移除一名球員。
// owns 陣列同 PATCH 的前兩項：match 是你的、player 真的屬於這場 match。
router.delete(
  "/matches/:matchId/players/:playerId",
  handler(
    {
      params: DeletePlayerParams,
      owns: [
        ({ params, userId }) => matchBelongsToUser(params.matchId, userId),
        ({ params }) => playerBelongsToMatch(params.playerId, params.matchId),
      ],
    },
    async ({ res, params }) => {
      // where 一樣綁 matchId：別人（或別場比賽）的 player 刪不到。owns 檢查已經先確認過
      // 這名球員存在且屬於這場 match，理論上這裡一定會刪到一列；.returning() + 長度檢查
      // 保留下來是不改變原本「靠實際刪掉幾列判斷成功與否」的防禦性寫法（同 people.ts，#225 的教訓）。
      const deleted = await db
        .delete(playersTable)
        .where(and(eq(playersTable.id, params.playerId), eq(playersTable.matchId, params.matchId)))
        .returning({ id: playersTable.id });

      if (deleted.length === 0) {
        res.status(404).json({ error: "Not found" });
        return;
      }

      res.status(204).end();
    },
  ),
);

export default router;
