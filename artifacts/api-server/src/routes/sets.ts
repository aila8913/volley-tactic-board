import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, setsTable } from "@workspace/db";
import { mockAuth } from "../middleware/mockAuth";
import { matchBelongsToUser } from "../lib/ownership";
import { ListSetsParams, CreateSetParams, CreateSetBody } from "@workspace/api-zod";

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
    .values({ matchId, setNumber: body.setNumber })
    .returning();

  res.status(201).json(created);
});

export default router;
