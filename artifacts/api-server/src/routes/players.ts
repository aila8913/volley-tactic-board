import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, playersTable } from "@workspace/db";
import { mockAuth } from "../middleware/mockAuth";
import { matchBelongsToUser } from "../lib/ownership";
import { ListPlayersParams, CreatePlayerParams, CreatePlayerBody } from "@workspace/api-zod";

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

  const [created] = await db
    .insert(playersTable)
    // matchId 來自路徑（已驗證擁有權），不是 body——避免 client 亂塞別場比賽的 id。
    .values({ matchId, name: body.name, number: body.number, role: body.role })
    .returning();

  res.status(201).json(created);
});

export default router;
