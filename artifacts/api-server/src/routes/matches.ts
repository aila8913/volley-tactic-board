import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, matchesTable } from "@workspace/db";
import { requireAuth } from "../middleware/requireAuth";
import { matchBelongsToUser, tournamentBelongsToUser, teamBelongsToUser } from "../lib/ownership";
import { handler } from "../lib/handler";
import type { EveryColumnOnInsert, EveryColumnOnUpdate } from "../lib/everyColumn";
import {
  CreateMatchBody,
  GetMatchParams,
  UpdateMatchParams,
  UpdateMatchBody,
  DeleteMatchParams,
} from "@workspace/api-zod";

// 比賽本體的 CRUD。跟 tactics 一樣用 requireAuth 把 userId 注入到 req.userId，
// 每個查詢都額外比對 userId，確保使用者只能碰到自己的比賽（擁有權隔離）。
const router: IRouter = Router();
router.use(requireAuth);

// GET /matches — 列出目前使用者的所有比賽，依建立時間排序
// owns: "public" ——理由跟 tactics.ts 的 GET /tactics 一樣：這支路由查的是
// 「這個 userId 名下的比賽」，擁有權篩選發生在下面的 where 條件（eq(matchesTable.userId, ...)），
// 不是靠單一資源的 owns 檢查擋。owns 是必填欄位（見 handler.ts 的說明），所以用 "public" 明講。
router.get(
  "/matches",
  handler({ owns: "public" }, async ({ req, res }) => {
    const matches = await db
      .select()
      .from(matchesTable)
      .where(eq(matchesTable.userId, req.userId))
      .orderBy(matchesTable.createdAt);

    res.json(matches);
  }),
);

// POST /matches — 建立新比賽。userId 由後端從 auth 注入，不是 client 送的，
// 所以 body 只驗 name/date/opponent/location/videoUrl（見 CreateMatchBody）。
// owns 檢查：要放進某個資料夾、或標成某支球隊的話，先確認那個資料夾／球隊是
// 「這個使用者的」（#127）。body.tournamentId / body.teamId 都是 nullish（可不帶＝
// 沒有資料夾／球隊可驗、可為 null＝明確不分類），`!= null` 這個寬鬆比較剛好一次涵蓋
// undefined 與 null 兩種「沒有東西可驗」的情況，這種情況下直接視為通過（回傳 true）。
// 兩項都放進 owns 陣列，任何一項沒過就整體視為沒有擁有權，統一回 404 "Not found"
// （由 handler() 統一處理，不再各自回「Tournament not found」「Team not found」）。
router.post(
  "/matches",
  handler(
    {
      body: CreateMatchBody,
      owns: [
        ({ body, userId }) =>
          body.tournamentId == null || tournamentBelongsToUser(body.tournamentId, userId),
        ({ body, userId }) => body.teamId == null || teamBelongsToUser(body.teamId, userId),
      ],
    },
    async ({ res, body, userId }) => {
      // 型別標註是 #368 的守衛：EveryColumnOnInsert 讓 matches 的每一欄都變必填，
      // 漏列一欄就編譯不過（見 lib/everyColumn.ts）。
      const values: EveryColumnOnInsert<typeof matchesTable> = {
        // id 是 serial 主鍵，交給資料庫自動遞增。
        id: undefined,
        userId,
        name: body.name ?? null,
        // CreateMatchBody 的 date 是 zod.coerce.date()，parse 後已經是 Date 物件，
        // Drizzle 的 timestamp 欄位直接吃 Date。
        date: body.date,
        opponent: body.opponent,
        location: body.location ?? null,
        videoUrl: body.videoUrl ?? null,
        // 資料夾 id（可為 null＝放最上層）。擁有權已在上面的 owns 檢查驗過，這裡才敢直接存。
        tournamentId: body.tournamentId ?? null,
        // 球隊標籤 id（可為 null＝未分類）。擁有權同樣已在上面驗過。
        teamId: body.teamId ?? null,
        // 賽制（#215）：跟 teamId 不同，這欄不是外鍵、不用驗擁有權，也不用像其他欄位一樣
        // 給 ?? null 的 fallback——沒帶就給 undefined，讓 DB 的 default("best_of_3")
        // 自己接手。如果這裡改成 body.format ?? "best_of_3"，就會多出「應用層也記一份預設值」
        // 的第二個地方，之後兩邊的預設值一旦想法飄開（例如只改了 DB 沒改到這裡）就會出現
        // 兩套不一致的行為，所以刻意讓「沒給值」這件事只由 DB 處理一次。
        format: body.format,
        // 比賽狀態（#218）：新建比賽一律是「進行中」，不開放在建立當下就指定成 finished，
        // 交給 DB 的 default("in_progress") 處理。
        status: undefined,
        // 是不是示範資料（#336）：一般使用者建立的比賽一律不是，交給 DB 的 default(false)。
        // 只有 demoData.ts 那支種子腳本會直接寫這一欄，不會經過這支路由。
        isDemo: undefined,
        // 建立時間交給資料庫的 defaultNow() 填。
        createdAt: undefined,
      };

      const [created] = await db.insert(matchesTable).values(values).returning();

      res.status(201).json(created);
    },
  ),
);

// GET /matches/:matchId — 取得單場比賽
// owns 檢查直接查一次「這個 matchId 是不是這個 userId 的」，跟原本 where 裡的
// and(eq(id), eq(userId)) 邏輯等價，只是挪到 owns closure 裡先驗證一次（同 tactics.ts）。
router.get(
  "/matches/:matchId",
  handler(
    {
      // GetMatchParams 的 matchId 是 zod.coerce.number()，會把 URL 字串轉成整數，
      // 順便擋掉 /matches/abc 這種亂打（parse 會失敗 → 400，由 errorHandler 處理）。
      params: GetMatchParams,
      owns: ({ params, userId }) => matchBelongsToUser(params.matchId, userId),
    },
    async ({ res, params, userId }) => {
      const [match] = await db
        .select()
        .from(matchesTable)
        .where(
          // 同時驗證 id 和 userId，防止拿到別人的比賽
          and(eq(matchesTable.id, params.matchId), eq(matchesTable.userId, userId)),
        );

      res.json(match);
    },
  ),
);

// PATCH /matches/:matchId — 部分更新（例如補上 videoUrl 開啟賽後補填模式）。
// 只更新 body 有帶的欄位，沒帶的維持原值。
// owns 陣列：先驗這場比賽是不是這個使用者的，再同 POST 驗要搬進去的資料夾／要標的球隊
// 是不是這個使用者的（`== null` 一次涵蓋 undefined＝沒帶 與 null＝明確清空，兩者都沒有
// 東西可驗，視為通過）——注意下面 set 裡的展開仍必須用嚴格的 !== undefined，
// 否則 null 會被誤判成「沒帶」，搬到最上層／清成未分類就失效了。
router.patch(
  "/matches/:matchId",
  handler(
    {
      params: UpdateMatchParams,
      body: UpdateMatchBody,
      owns: [
        ({ params, userId }) => matchBelongsToUser(params.matchId, userId),
        ({ body, userId }) =>
          body.tournamentId == null || tournamentBelongsToUser(body.tournamentId, userId),
        ({ body, userId }) => body.teamId == null || teamBelongsToUser(body.teamId, userId),
      ],
    },
    async ({ res, params, body, userId }) => {
      // 型別標註是 #368 的守衛：EveryColumnOnUpdate 讓 matches 的每一欄都要在物件裡出現，
      // 「這欄不開放 PATCH」現在要明寫 undefined，而不是靠沒寫這件事本身表達（見
      // lib/everyColumn.ts）。
      const patch: EveryColumnOnUpdate<typeof matchesTable> = {
        // id 是主鍵、userId 由 where 條件鎖定（不是 PATCH 的對象），兩者都不開放改。
        id: undefined,
        userId: undefined,
        // name 是這次窮舉檢查照出來的合約缺口：UpdateMatchBody 根本沒有 name 這個欄位，
        // 所以 PATCH 目前改不了它——是合約缺口不是實作缺口，記在 #368 的留言。
        name: undefined,
        // body 沒帶的欄位直接給 body.x，值是 undefined（drizzle 的 mapUpdateSet 會濾掉，
        // 維持原值）；帶了就是新值。跟舊寫法的條件展開完全等價，見 lib/everyColumn.ts。
        opponent: body.opponent,
        // UpdateMatchBody 的 date 是 zod.coerce.date()，parse 後已是 Date 物件，timestamp 欄位直接吃。
        date: body.date,
        location: body.location,
        videoUrl: body.videoUrl,
        tournamentId: body.tournamentId,
        teamId: body.teamId,
        // 賽制（#215）：沒帶就不動這一欄，維持原本的賽制不變。
        format: body.format,
        // 比賽狀態（#218）：計分頁的「結束比賽」送 finished、「重新開啟比賽」送
        // in_progress。收尾／重新開啟刻意不另開端點（例如 POST /matches/:id/finish）——
        // 它就是「把一個欄位改成另一個值」，跟改對手名稱沒有本質差別，用既有的 PATCH
        // 表達就夠；開專用端點反而要多維護一條路由、多一份擁有權檢查。
        status: body.status,
        // isDemo/createdAt 是資料庫維護的中繼資訊（示範資料標記、建立時間），
        // 不開放使用者透過 PATCH 更動。
        isDemo: undefined,
        createdAt: undefined,
      };

      const [updated] = await db
        .update(matchesTable)
        .set(patch)
        .where(and(eq(matchesTable.id, params.matchId), eq(matchesTable.userId, userId)))
        .returning();

      res.json(updated);
    },
  ),
);

// DELETE /matches/:matchId — 刪整場比賽。DB 的外鍵是 onDelete: "cascade"，
// 所以刪掉 match 會連帶清掉它底下的 players/sets/rallies/events，不會留孤兒。
router.delete(
  "/matches/:matchId",
  handler(
    {
      params: DeleteMatchParams,
      owns: ({ params, userId }) => matchBelongsToUser(params.matchId, userId),
    },
    async ({ res, params, userId }) => {
      // where 一樣綁 userId：別人的比賽刪不到。owns 檢查已經先確認過這場比賽存在
      // 且是這個使用者的，理論上這裡一定會刪到一列；.returning() + 長度檢查保留下來
      // 是不改變原本「靠實際刪掉幾列判斷成功與否」的防禦性寫法（同 tactics.ts，#225 的教訓）。
      const deleted = await db
        .delete(matchesTable)
        .where(and(eq(matchesTable.id, params.matchId), eq(matchesTable.userId, userId)))
        .returning({ id: matchesTable.id });

      if (deleted.length === 0) {
        res.status(404).json({ error: "Not found" });
        return;
      }

      res.status(204).end();
    },
  ),
);

export default router;
