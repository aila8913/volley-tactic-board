import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, playersTable } from "@workspace/db";
import { requireAuth } from "../middleware/requireAuth";
import { matchBelongsToUser, playerBelongsToMatch, personBelongsToUser } from "../lib/ownership";
import { handler } from "../lib/handler";
import type { EveryColumnOnInsert, EveryColumnOnUpdate } from "../lib/everyColumn";
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
      // 一定要明講 orderBy，不能靠「反正資料庫大概會照建立順序回」的直覺（issue #294）：
      // Postgres 沒有 ORDER BY 時完全不保證回傳順序，而且它用的 MVCC（多版本併發控制，
      // 為了讓讀寫不互相鎖住，UPDATE 不會「原地改」，而是把舊版本標記失效、在 heap 的
      // 尾端新插一份新版本）代表任何一次 PATCH（改背號/位置/名字）或
      // POST /people/:id/merge（會 update players.personId）都可能把那一列「physically」
      // 挪到回傳結果的最後面——使用者會看到名單順序無故跳動，即使他只是改了一個人的背號。
      //
      // 排序鍵選 number（背號）優先：最符合使用者對「名單」的直覺，紙本記錄表本來就是照
      // 背號排。但 number 在 schema 上只是 integer().notNull()，沒有 unique constraint，
      // 同一場比賽理論上可能出現重複背號（例如打字打錯、或球隊真的還沒分配好）——這種情況下
      // 光靠 number 排序仍然是「部分排序」，同背號的幾列彼此順序還是不保證穩定。所以再疊
      // name、最後疊 id 當 tiebreaker：id 是 uuid，對使用者沒有可讀意義，但它一定唯一、
      // 一定穩定，放在排序鏈最後一環，保證整條鍵是「全序」（total order）——不管背號/名字
      // 有沒有撞名，最終一定能排出唯一、每次查詢都一致的順序。
      const players = await db
        .select()
        .from(playersTable)
        .where(eq(playersTable.matchId, params.matchId))
        .orderBy(playersTable.number, playersTable.name, playersTable.id);

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
      // 型別標註是 #368 的守衛：EveryColumnOnInsert 讓 players 的每一欄都變必填，
      // 漏列一欄就編譯不過（見 lib/everyColumn.ts）。
      const values: EveryColumnOnInsert<typeof playersTable> = {
        // matchId 來自路徑（已驗證擁有權），不是 body——避免 client 亂塞別場比賽的 id。
        // id 則相反：body.id 有帶就用前端自己生的 uuid（client-mintable，見
        // lib/db/src/schema/players.ts 的說明）；沒帶就交給資料庫的 defaultRandom() 生一個。
        // `?? undefined` 取代了原本的條件展開 `...(body.id !== undefined && { id })`：
        // 條件展開產生的是 optional key，窮舉檢查看不到它。
        id: body.id ?? undefined,
        matchId: params.matchId,
        name: body.name,
        number: body.number,
        role: body.role,
        // 沒帶就是 undefined（維持 personId 沒有對應），帶了就是新值——跟 PATCH 那邊
        // 用 `!== undefined` 而不是 truthy 判斷的理由完全一樣（見下方 PATCH 的說明）。
        personId: body.personId,
      };

      const [created] = await db.insert(playersTable).values(values).returning();

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
      // 型別標註是 #368 的守衛：EveryColumnOnUpdate 讓 players 的每一欄都要在物件裡出現
      // （見 lib/everyColumn.ts）。
      const patch: EveryColumnOnUpdate<typeof playersTable> = {
        // id/matchId 由路徑與 where 條件鎖定，不開放 PATCH 改（改 matchId 等於把球員
        // 搬到別場比賽，同 events.ts 的 rallyId 不開放改）。
        id: undefined,
        matchId: undefined,
        // 「body 有帶的才改、沒帶的維持原值」，值直接給 body.x：沒帶就是 undefined
        // （被 mapUpdateSet 濾掉，維持原值）。
        name: body.name,
        number: body.number,
        role: body.role,
        // 這裡刻意跟舊寫法一樣用「值直接給 body.personId」而不是 truthy 判斷。
        // 原因：personId 有三種合法的「帶了」狀態——一個數字（改對應到某人）、null（解除對應，
        // 這名單列變回「歸屬不明」）、或整個欄位沒出現在 body 裡（不動它，保留原值）。
        // mapUpdateSet 只濾掉 undefined，null 會照常送進 SQL，所以這三種狀態都對得上。
        personId: body.personId,
      };

      const [updated] = await db
        .update(playersTable)
        .set(patch)
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
