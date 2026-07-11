import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, setsTable } from "@workspace/db";
import { mockAuth } from "../middleware/mockAuth";
import { matchBelongsToUser, setBelongsToUser } from "../lib/ownership";
import {
  ListSetsParams,
  CreateSetParams,
  CreateSetBody,
  UpdateSetParams,
  UpdateSetBody,
} from "@workspace/api-zod";

// 一場比賽裡的各局（set）。跟 players 一樣掛在 match 底下，先驗擁有權再操作。
const router: IRouter = Router();
router.use(mockAuth);

// GET /matches/:matchId/sets — 列出這場比賽的所有局，依局數排序
router.get("/matches/:matchId/sets", async (req, res) => {
  const { matchId } = ListSetsParams.parse(req.params);

  if (!(await matchBelongsToUser(matchId, req.userId))) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const sets = await db
    .select()
    .from(setsTable)
    .where(eq(setsTable.matchId, matchId))
    .orderBy(setsTable.setNumber);

  res.json(sets);
});

// POST /matches/:matchId/sets — 開新的一局
router.post("/matches/:matchId/sets", async (req, res) => {
  const { matchId } = CreateSetParams.parse(req.params);
  const body = CreateSetBody.parse(req.body);

  if (!(await matchBelongsToUser(matchId, req.userId))) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const [created] = await db
    .insert(setsTable)
    // firstServer 從 body 帶進來（開局時前端已知道誰先發）；matchId 從路徑取（已驗擁有權）。
    .values({ matchId, setNumber: body.setNumber, firstServer: body.firstServer })
    .returning();

  res.status(201).json(created);
});

// PATCH /matches/:matchId/sets/:setId — 補上開空局時還沒選的先發方（見 lib/db 的 schema 註解 #63）。
// 目前只用來填 firstServer，所以 body 只有這一個欄位，直接寫入即可（不用 players.ts 那種
// 「有帶才寫」的 partial update pattern）。
router.patch("/matches/:matchId/sets/:setId", async (req, res) => {
  const { matchId, setId } = UpdateSetParams.parse(req.params);
  const body = UpdateSetBody.parse(req.body);

  if (!(await matchBelongsToUser(matchId, req.userId))) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  // setBelongsToUser 已經是 set→match→userId 一路 join 過去驗證，這裡再帶 matchId 進 where
  // 只是多一層保險，跟 players.ts 的 PATCH 一致。
  if (!(await setBelongsToUser(setId, req.userId))) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const [updated] = await db
    .update(setsTable)
    .set({ firstServer: body.firstServer })
    .where(and(eq(setsTable.id, setId), eq(setsTable.matchId, matchId)))
    .returning();

  res.json(updated);
});

export default router;
