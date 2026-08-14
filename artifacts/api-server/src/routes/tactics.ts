import { Router, type IRouter } from "express";
import { eq, and, isNull, desc } from "drizzle-orm";
import { db, tacticsTable } from "@workspace/db";
import { requireAuth } from "../middleware/requireAuth";
import { matchBelongsToUser, tacticBelongsToUser } from "../lib/ownership";
import { handler } from "../lib/handler";
import type { EveryColumnOnInsert, EveryColumnOnUpdate } from "../lib/everyColumn";
import {
  CreateTacticBody,
  UpdateTacticBody,
  GetTacticParams,
  UpdateTacticParams,
  DeleteTacticParams,
  ListTacticsQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

// 所有戰術路由都套用 mock auth，userId 會被注入到 req.userId
router.use(requireAuth);

// GET /tactics — 取得目前使用者的戰術，按最近修改時間新→舊排列。
// 排序原本是 orderBy(createdAt)（遞增），代表「最早建立的排最前面」——這對一個瀏覽用的
// 列表來說是反的（使用者通常想先看到最近動過的那份），#372 決策④ 順手把它釘成
// 「最近修改優先」：desc(updatedAt)。
//
// 三種篩選模式（詳細理由寫在 openapi.yaml 的 parameters 註解，這裡只列行為）：
//   - 帶 ?matchId=<n>：只回那場比賽的戰術（#119：戰術庫 per-match，面板不再跨場汙染）
//   - 帶 ?scope=global：只回 matchId 是 null 的戰術（空板進去看到的戰術庫，#372 決策④）
//   - 都不帶：回全部（保留舊行為）
//   - 兩者都帶：matchId 贏（前端不會這樣送，這裡只是講清楚優先序）
// owns: "public" ——這支路由本身不驗證任何單一資源的擁有權，因為它查的是
// 「這個 userId 名下的戰術」，擁有權篩選就發生在下面的 where 條件裡（eq(tacticsTable.userId, ...)），
// 不是靠 handler() 的 owns 機制擋。用 "public" 而不是留空，是因為 owns 是必填欄位（見 handler.ts 的說明）。
router.get(
  "/tactics",
  handler({ owns: "public" }, async ({ req, res }) => {
    const { matchId, scope } = ListTacticsQueryParams.parse(req.query);

    const tactics = await db
      .select()
      .from(tacticsTable)
      .where(
        // 一律先鎖 userId（擁有權），再依情況多疊一個條件：
        // 有 matchId 就等值比對；沒有 matchId 但 scope 是 global 就篩 matchId IS NULL；
        // 都沒有就是 undefined（and() 會自動略過，等同只剩 userId 條件）。
        and(
          eq(tacticsTable.userId, req.userId),
          matchId !== undefined
            ? eq(tacticsTable.matchId, matchId)
            : scope === "global"
              ? isNull(tacticsTable.matchId)
              : undefined,
        ),
      )
      .orderBy(desc(tacticsTable.updatedAt));

    res.json(tactics);
  }),
);

// POST /tactics — 新建戰術
// owns 檢查：要把戰術歸屬到某場比賽的話，先確認那場比賽是「這個使用者的」（#225，同 #127 的判準）。
// tacticsTable.matchId 是真的外鍵，但**外鍵保證的是 referential integrity（這個 id 真的指到
// 一列存在的比賽），不保證 ownership（那場是不是你的）**——少了這關，A 就能把自己的戰術掛到
// B 的 matchId 底下（IDOR），之後 B 刪掉那場比賽，A 的戰術就會被 FK 的 onDelete 動到
// （改成 set null 之後是「標籤被清掉」，不再是整份消失——見 ADR-0007——但仍然是 A 不該
// 承受的副作用，所以這關照樣要守）。
// body.matchId 是 nullish（可不帶＝全域戰術、可為 null），`!= null` 這個寬鬆比較剛好一次
// 涵蓋 undefined 與 null 兩種「沒有比賽可驗」的情況——這種情況下直接視為通過（回傳 true）。
router.post(
  "/tactics",
  handler(
    {
      body: CreateTacticBody,
      owns: ({ body, userId }) => body.matchId == null || matchBelongsToUser(body.matchId, userId),
    },
    async ({ res, body, userId }) => {
      // 型別標註是 #368 的守衛：EveryColumnOnInsert 讓 tactics 的每一欄都變必填，
      // 漏列一欄就編譯不過（見 lib/everyColumn.ts）。
      const values: EveryColumnOnInsert<typeof tacticsTable> = {
        // id 是 uuid + defaultRandom()，交給資料庫生。
        id: undefined,
        userId,
        // 歸屬到哪一場比賽（#119）。前端存檔時帶當前 matchId；沒帶就是 null（全域戰術）。
        matchId: body.matchId,
        name: body.name,
        // data 欄位是 jsonb，Drizzle 直接接受 JS 物件
        data: body.data,
        // 建立/更新時間都交給資料庫的 defaultNow() 填。
        createdAt: undefined,
        updatedAt: undefined,
      };

      const [created] = await db.insert(tacticsTable).values(values).returning();

      res.status(201).json(created);
    },
  ),
);

// GET /tactics/:tacticId — 取得單一戰術
// owns 檢查直接查一次「這個 tacticId 是不是這個 userId 的」，跟原本 where 裡的
// and(eq(id), eq(userId)) 邏輯等價，只是挪到 owns closure 裡先驗證一次。
router.get(
  "/tactics/:tacticId",
  handler(
    {
      params: GetTacticParams,
      owns: ({ params, userId }) => tacticBelongsToUser(params.tacticId, userId),
    },
    async ({ res, params, userId }) => {
      const [tactic] = await db
        .select()
        .from(tacticsTable)
        .where(
          // 同時驗證 id 和 userId，防止拿到別人的戰術
          and(eq(tacticsTable.id, params.tacticId), eq(tacticsTable.userId, userId)),
        );

      res.json(tactic);
    },
  ),
);

// PUT /tactics/:tacticId — 覆寫更新戰術（name 和/或 data）
router.put(
  "/tactics/:tacticId",
  handler(
    {
      params: UpdateTacticParams,
      body: UpdateTacticBody,
      owns: [
        ({ params, userId }) => tacticBelongsToUser(params.tacticId, userId),
        // PUT 開放改 matchId 之後（#385），這道就跟 POST /tactics 的那道完全同義：
        // 外鍵只保證「這個 id 指到一列存在的比賽」，不保證「那是你的比賽」。少了它，
        // 就是 #225 那個 IDOR 換一支端點重演——A 能把自己的戰術改掛到 B 的比賽底下。
        ({ body, userId }) => body.matchId == null || matchBelongsToUser(body.matchId, userId),
      ],
    },
    async ({ res, params, body, userId }) => {
      // 型別標註是 #368 的守衛：EveryColumnOnUpdate 讓 tactics 的每一欄都要在物件裡出現，
      // 「這欄不開放 PATCH」現在要明寫 undefined（見 lib/everyColumn.ts）。
      const patch: EveryColumnOnUpdate<typeof tacticsTable> = {
        // id/userId 由路徑與 where 條件鎖定，不開放改。
        id: undefined,
        userId: undefined,
        // matchId 是 #368 的窮舉檢查照出來的合約缺口，已於 #385 補上：可以把一份戰術改掛
        // 到別場、或帶 null 改成全域戰術。ADR-0007 之後 matchId 是「可選標籤」而不是擁有
        // 關係，改標籤因此是正當操作——沒有 matchId 的戰術是一級公民，不是待清理的孤兒。
        // 新 matchId 的擁有權由上面的 owns 驗過（跟 POST /tactics 同一道檢查）。
        matchId: body.matchId,
        name: body.name,
        data: body.data,
        // updatedAt 手動設定，因為 Postgres 不會自動更新——這欄無條件寫入，不是「body 有帶
        // 才改」，維持原本的既有行為。
        updatedAt: new Date(),
        // createdAt 是建立時的時間戳，PUT 不該動它。
        createdAt: undefined,
      };

      const [updated] = await db
        .update(tacticsTable)
        .set(patch)
        .where(and(eq(tacticsTable.id, params.tacticId), eq(tacticsTable.userId, userId)))
        .returning();

      res.json(updated);
    },
  ),
);

// DELETE /tactics/:tacticId — 刪除戰術
router.delete(
  "/tactics/:tacticId",
  handler(
    {
      params: DeleteTacticParams,
      owns: ({ params, userId }) => tacticBelongsToUser(params.tacticId, userId),
    },
    async ({ res, params, userId }) => {
      // where 綁了 userId，所以刪不到別人的戰術——但「刪不到」和「刪掉了」在 SQL 層長得一模一樣：
      // 兩者都是不報錯地跑完。owns 檢查已經先確認過這筆戰術存在且是這個使用者的，
      // 所以這裡的刪除理論上一定會刪到一列；.returning() 保留下來是為了不改變原本
      // 「靠實際刪掉幾列判斷成功與否」的防禦性寫法（#225 的教訓）。
      const deleted = await db
        .delete(tacticsTable)
        .where(and(eq(tacticsTable.id, params.tacticId), eq(tacticsTable.userId, userId)))
        .returning({ id: tacticsTable.id });

      if (deleted.length === 0) {
        res.status(404).json({ error: "Not found" });
        return;
      }

      res.status(204).end();
    },
  ),
);

export default router;
