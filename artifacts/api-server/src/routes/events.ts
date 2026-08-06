import { Router, type IRouter } from "express";
import { eq, getTableColumns } from "drizzle-orm";
import { db, eventsTable, ralliesTable, setsTable } from "@workspace/db";
import { requireAuth } from "../middleware/requireAuth";
import { rallyBelongsToUser, eventBelongsToUser, matchBelongsToUser } from "../lib/ownership";
import { handler } from "../lib/handler";
import { insertIdempotent } from "../lib/insertIdempotent";
import {
  ListMatchEventsParams,
  ListEventsParams,
  CreateEventParams,
  CreateEventBody,
  UpdateEventParams,
  UpdateEventBody,
  DeleteEventParams,
} from "@workspace/api-zod";

// 一個 rally 裡的每一球（event）。這是最深的一層資料。
// 讀寫掛在 /rallies/:rallyId/events 底下（先驗 rally 擁有權）；
// 而 PATCH / DELETE 用扁平的 /events/:eventId（路徑上只有 event id，
// 所以改用 eventBelongsToUser 一路 join 回 match 驗擁有權）。
const router: IRouter = Router();
router.use(requireAuth);

// GET /matches/:matchId/events — 一次拿整場比賽的所有 event（跨 set/rally）。
// 前端進頁重建計分表時用這一支，取代「對每個 rally 各發一次請求」的 N+1。
// events 自己沒存 matchId，所以 join events→rallies→sets，用 sets.matchId 過濾；
// owns 檢查跟 matches.ts/sets.ts 的 GET 一樣，單一 matchBelongsToUser 就夠
// （沒有第三方 id 要另外驗）。
// 依 rallyId、sequence 排序，前端拿到後就能直接依 rallyId 分組、每組取 sequence 最小的那球。
router.get(
  "/matches/:matchId/events",
  handler(
    {
      params: ListMatchEventsParams,
      owns: ({ params, userId }) => matchBelongsToUser(params.matchId, userId),
    },
    async ({ res, params }) => {
      // getTableColumns(eventsTable) 讓 select 只回傳 events 的欄位（扁平的 MatchEvent 形狀），
      // 不會因為 join 而變成 { events: {...}, rallies: {...} } 的巢狀結構。
      const events = await db
        .select(getTableColumns(eventsTable))
        .from(eventsTable)
        .innerJoin(ralliesTable, eq(eventsTable.rallyId, ralliesTable.id))
        .innerJoin(setsTable, eq(ralliesTable.setId, setsTable.id))
        .where(eq(setsTable.matchId, params.matchId))
        .orderBy(eventsTable.rallyId, eventsTable.sequence);

      res.json(events);
    },
  ),
);

// GET /rallies/:rallyId/events — 列出這一分的所有球，依 sequence 排序（第 1 球、第 2 球…）
// owns 檢查跟 rallies.ts 的 GET 一樣，單一 rallyBelongsToUser 就夠。
router.get(
  "/rallies/:rallyId/events",
  handler(
    {
      params: ListEventsParams,
      owns: ({ params, userId }) => rallyBelongsToUser(params.rallyId, userId),
    },
    async ({ res, params }) => {
      const events = await db
        .select()
        .from(eventsTable)
        .where(eq(eventsTable.rallyId, params.rallyId))
        .orderBy(eventsTable.sequence);

      res.json(events);
    },
  ),
);

// POST /rallies/:rallyId/events — 記錄一球。
// 同一個 endpoint 兩用：source = 'live'（比賽當下即時記）或 'review'（賽後看影片補記），
// 差別只在 body 帶不帶座標 / videoTimestamp，路由邏輯一樣。
// owns 只驗 parent rally——body.playerId 目前沒有另外驗擁有權（維持遷移前的既有行為，
// 不在這次順便加新的檢查）。
router.post(
  "/rallies/:rallyId/events",
  handler(
    {
      params: CreateEventParams,
      body: CreateEventBody,
      owns: ({ params, userId }) => rallyBelongsToUser(params.rallyId, userId),
    },
    async ({ res, params, body }) => {
      // 冪等寫入 + 重送回既有列（#64 PR3）：做法與理由見 lib/insertIdempotent.ts。
      const row = await insertIdempotent(
        eventsTable,
        // rallyId 來自路徑（已驗擁有權）。其餘欄位大多是 nullable：簡易版只記「誰做了什麼動作」，
        // 座標 / ballType / quality 都留空，用 ?? null 把「body 沒帶」轉成 DB 的 null。
        // tags 沒帶時給 []，對齊 DB 欄位的 default（notNull，預設空陣列）。
        {
          // 選填的 client-mintable 主鍵（#64 PR2），做法與理由見 sets.ts 的 POST 註解。
          ...(body.id ? { id: body.id } : {}),
          rallyId: params.rallyId,
          sequence: body.sequence,
          side: body.side,
          playerId: body.playerId ?? null,
          action: body.action,
          ballType: body.ballType ?? null,
          quality: body.quality ?? null,
          fromX: body.fromX ?? null,
          fromY: body.fromY ?? null,
          toX: body.toX ?? null,
          toY: body.toY ?? null,
          tags: body.tags ?? [],
          note: body.note ?? null,
          videoTimestamp: body.videoTimestamp ?? null,
          source: body.source,
        },
        eq(eventsTable.rallyId, params.rallyId),
      );

      if (!row) {
        res.status(409).json({ error: "Conflict" });
        return;
      }

      res.status(201).json(row);
    },
  ),
);

// PATCH /events/:eventId — 部分更新一球（例如賽後補上座標、改動作分類、加註解）。
// 跟 matches 的 PATCH 一樣用「欄位有帶才寫」的展開技巧，沒帶的維持原值。
// 路徑上只有 eventId，用 eventBelongsToUser 一路 join 回 match 驗擁有權。
router.patch(
  "/events/:eventId",
  handler(
    {
      params: UpdateEventParams,
      body: UpdateEventBody,
      owns: ({ params, userId }) => eventBelongsToUser(params.eventId, userId),
    },
    async ({ res, params, body }) => {
      const [updated] = await db
        .update(eventsTable)
        .set({
          // !== undefined（而非 truthy）才能讓 note: null、quality: null 這種「想清空」的合法值寫得進去。
          ...(body.side !== undefined && { side: body.side }),
          ...(body.action !== undefined && { action: body.action }),
          ...(body.ballType !== undefined && { ballType: body.ballType }),
          ...(body.quality !== undefined && { quality: body.quality }),
          ...(body.fromX !== undefined && { fromX: body.fromX }),
          ...(body.fromY !== undefined && { fromY: body.fromY }),
          ...(body.toX !== undefined && { toX: body.toX }),
          ...(body.toY !== undefined && { toY: body.toY }),
          ...(body.tags !== undefined && { tags: body.tags }),
          ...(body.note !== undefined && { note: body.note }),
          ...(body.videoTimestamp !== undefined && { videoTimestamp: body.videoTimestamp }),
        })
        .where(eq(eventsTable.id, params.eventId))
        .returning();

      res.json(updated);
    },
  ),
);

// DELETE /events/:eventId — 刪一球（記錯了、多記了）。event 是最末端資料，
// 底下沒有更深的東西會被連帶刪，所以直接刪掉即可。成功回 204 No Content（無 body）。
// owns 已經先確認過這個 event 存在且屬於這個使用者，理論上這裡一定會刪到一列；
// .returning() + 長度檢查保留下來是不改變「靠實際刪掉幾列判斷成功與否」的防禦性寫法
// （同 people.ts/tournaments.ts/players.ts/rallies.ts 的 DELETE，#225 的教訓）。
router.delete(
  "/events/:eventId",
  handler(
    {
      params: DeleteEventParams,
      owns: ({ params, userId }) => eventBelongsToUser(params.eventId, userId),
    },
    async ({ res, params }) => {
      const deleted = await db
        .delete(eventsTable)
        .where(eq(eventsTable.id, params.eventId))
        .returning({ id: eventsTable.id });

      if (deleted.length === 0) {
        res.status(404).json({ error: "Not found" });
        return;
      }

      res.status(204).end();
    },
  ),
);

export default router;
