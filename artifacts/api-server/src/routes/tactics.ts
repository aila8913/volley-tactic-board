import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, tacticsTable } from "@workspace/db";
import { mockAuth } from "../middleware/mockAuth";
import {
  CreateTacticBody,
  UpdateTacticBody,
  GetTacticParams,
  UpdateTacticParams,
  DeleteTacticParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

// 所有戰術路由都套用 mock auth，userId 會被注入到 req.userId
router.use(mockAuth);

// GET /tactics — 取得目前使用者的所有戰術，按建立時間新→舊排列
router.get("/tactics", async (req, res) => {
  const tactics = await db
    .select()
    .from(tacticsTable)
    .where(eq(tacticsTable.userId, req.userId))
    .orderBy(tacticsTable.createdAt);

  res.json(tactics);
});

// POST /tactics — 新建戰術
router.post("/tactics", async (req, res) => {
  const body = CreateTacticBody.parse(req.body);

  const [created] = await db
    .insert(tacticsTable)
    .values({
      userId: req.userId,
      name: body.name,
      // data 欄位是 jsonb，Drizzle 直接接受 JS 物件
      data: body.data,
    })
    .returning();

  res.status(201).json(created);
});

// GET /tactics/:tacticId — 取得單一戰術
router.get("/tactics/:tacticId", async (req, res) => {
  const { tacticId } = GetTacticParams.parse(req.params);

  const [tactic] = await db
    .select()
    .from(tacticsTable)
    .where(
      // 同時驗證 id 和 userId，防止拿到別人的戰術
      and(eq(tacticsTable.id, tacticId), eq(tacticsTable.userId, req.userId)),
    );

  if (!tactic) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json(tactic);
});

// PUT /tactics/:tacticId — 覆寫更新戰術（name 和/或 data）
router.put("/tactics/:tacticId", async (req, res) => {
  const { tacticId } = UpdateTacticParams.parse(req.params);
  const body = UpdateTacticBody.parse(req.body);

  const [updated] = await db
    .update(tacticsTable)
    .set({
      ...(body.name !== undefined && { name: body.name }),
      ...(body.data !== undefined && { data: body.data }),
      // updatedAt 手動設定，因為 Postgres 不會自動更新
      updatedAt: new Date(),
    })
    .where(and(eq(tacticsTable.id, tacticId), eq(tacticsTable.userId, req.userId)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json(updated);
});

// DELETE /tactics/:tacticId — 刪除戰術
router.delete("/tactics/:tacticId", async (req, res) => {
  const { tacticId } = DeleteTacticParams.parse(req.params);

  await db
    .delete(tacticsTable)
    .where(and(eq(tacticsTable.id, tacticId), eq(tacticsTable.userId, req.userId)));

  res.status(204).send();
});

export default router;
