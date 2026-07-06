import { Router, type IRouter } from "express";
import { eq, getTableColumns } from "drizzle-orm";
import { db, eventsTable, ralliesTable, setsTable } from "@workspace/db";
import { mockAuth } from "../middleware/mockAuth";
import { rallyBelongsToUser, eventBelongsToUser, matchBelongsToUser } from "../lib/ownership";
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
router.use(mockAuth);

// GET /matches/:matchId/events — 一次拿整場比賽的所有 event（跨 set/rally）。
// 前端進頁重建計分表時用這一支，取代「對每個 rally 各發一次請求」的 N+1。
// events 自己沒存 matchId，所以 join events→rallies→sets，用 sets.matchId 過濾；
// 先驗 match 屬於這個 user（跟 sets/players 一樣的擁有權檢查）。
// 依 rallyId、sequence 排序，前端拿到後就能直接依 rallyId 分組、每組取 sequence 最小的那球。
router.get("/matches/:matchId/events", async (req, res) => {
  const { matchId } = ListMatchEventsParams.parse(req.params);

  if (!(await matchBelongsToUser(matchId, req.userId))) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  // getTableColumns(eventsTable) 讓 select 只回傳 events 的欄位（扁平的 MatchEvent 形狀），
  // 不會因為 join 而變成 { events: {...}, rallies: {...} } 的巢狀結構。
  const events = await db
    .select(getTableColumns(eventsTable))
    .from(eventsTable)
    .innerJoin(ralliesTable, eq(eventsTable.rallyId, ralliesTable.id))
    .innerJoin(setsTable, eq(ralliesTable.setId, setsTable.id))
    .where(eq(setsTable.matchId, matchId))
    .orderBy(eventsTable.rallyId, eventsTable.sequence);

  res.json(events);
});

// GET /rallies/:rallyId/events — 列出這一分的所有球，依 sequence 排序（第 1 球、第 2 球…）
router.get("/rallies/:rallyId/events", async (req, res) => {
  const { rallyId } = ListEventsParams.parse(req.params);

  if (!(await rallyBelongsToUser(rallyId, req.userId))) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const events = await db
    .select()
    .from(eventsTable)
    .where(eq(eventsTable.rallyId, rallyId))
    .orderBy(eventsTable.sequence);

  res.json(events);
});

// POST /rallies/:rallyId/events — 記錄一球。
// 同一個 endpoint 兩用：source = 'live'（比賽當下即時記）或 'review'（賽後看影片補記），
// 差別只在 body 帶不帶座標 / videoTimestamp，路由邏輯一樣。
router.post("/rallies/:rallyId/events", async (req, res) => {
  const { rallyId } = CreateEventParams.parse(req.params);
  const body = CreateEventBody.parse(req.body);

  if (!(await rallyBelongsToUser(rallyId, req.userId))) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const [created] = await db
    .insert(eventsTable)
    // rallyId 來自路徑（已驗擁有權）。其餘欄位大多是 nullable：簡易版只記「誰做了什麼動作」，
    // 座標 / ballType / quality 都留空，用 ?? null 把「body 沒帶」轉成 DB 的 null。
    // tags 沒帶時給 []，對齊 DB 欄位的 default（notNull，預設空陣列）。
    .values({
      rallyId,
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
    })
    .returning();

  res.status(201).json(created);
});

// PATCH /events/:eventId — 部分更新一球（例如賽後補上座標、改動作分類、加註解）。
// 跟 matches 的 PATCH 一樣用「欄位有帶才寫」的展開技巧，沒帶的維持原值。
router.patch("/events/:eventId", async (req, res) => {
  const { eventId } = UpdateEventParams.parse(req.params);
  const body = UpdateEventBody.parse(req.body);

  if (!(await eventBelongsToUser(eventId, req.userId))) {
    res.status(404).json({ error: "Not found" });
    return;
  }

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
    .where(eq(eventsTable.id, eventId))
    .returning();

  res.json(updated);
});

// DELETE /events/:eventId — 刪一球（記錯了、多記了）。event 是最末端資料，
// 底下沒有更深的東西會被連帶刪，所以直接刪掉即可。成功回 204 No Content（無 body）。
router.delete("/events/:eventId", async (req, res) => {
  const { eventId } = DeleteEventParams.parse(req.params);

  if (!(await eventBelongsToUser(eventId, req.userId))) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  await db.delete(eventsTable).where(eq(eventsTable.id, eventId));

  res.status(204).end();
});

export default router;
