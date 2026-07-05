import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, ralliesTable } from "@workspace/db";
import { mockAuth } from "../middleware/mockAuth";
import { setBelongsToUser } from "../lib/ownership";
import { ListRalliesParams, CreateRallyParams, CreateRallyBody } from "@workspace/api-zod";

// 一局（set）裡的各個 rally（一分）。掛在 set 底下，操作前先驗這個 set 屬於這個使用者，
// 驗的方式是往上追到 set 所屬 match 的 userId（見 lib/ownership.ts 的 setBelongsToUser）。
const router: IRouter = Router();
router.use(mockAuth);

// GET /sets/:setId/rallies — 列出這一局的所有 rally，依 rallyNumber 排序（第 1 分、第 2 分…）
router.get("/sets/:setId/rallies", async (req, res) => {
  const { setId } = ListRalliesParams.parse(req.params);

  if (!(await setBelongsToUser(setId, req.userId))) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const rallies = await db
    .select()
    .from(ralliesTable)
    .where(eq(ralliesTable.setId, setId))
    .orderBy(ralliesTable.rallyNumber);

  res.json(rallies);
});

// POST /sets/:setId/rallies — 記錄新的一分。
// 注意 openapi 的合約是「一次記一個 rally」，body 只有 rally 本身的欄位（分數、誰贏），
// 不含底下的 events——events 是之後用 POST /rallies/:rallyId/events 一球一球記。
// 因為只是單筆 insert，Postgres 本身就是原子操作，這裡不需要 db.transaction()。
router.post("/sets/:setId/rallies", async (req, res) => {
  const { setId } = CreateRallyParams.parse(req.params);
  const body = CreateRallyBody.parse(req.body);

  if (!(await setBelongsToUser(setId, req.userId))) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const [created] = await db
    .insert(ralliesTable)
    // setId 來自路徑（已驗擁有權），不吃 body 的，避免 client 把 rally 塞到別局去。
    .values({
      setId,
      rallyNumber: body.rallyNumber,
      homeScore: body.homeScore,
      awayScore: body.awayScore,
      winner: body.winner,
    })
    .returning();

  res.status(201).json(created);
});

export default router;
