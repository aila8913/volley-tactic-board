import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, tacticsTable } from "@workspace/db";
import { mockAuth } from "../middleware/mockAuth";
import { matchBelongsToUser } from "../lib/ownership";
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
router.use(mockAuth);

// GET /tactics — 取得目前使用者的戰術，按建立時間新→舊排列。
// 帶 ?matchId=<n> 就只回那場比賽的戰術（#119：戰術庫 per-match，面板不再跨場汙染）；
// 不帶就回全部（保留舊行為）。
router.get("/tactics", async (req, res) => {
  const { matchId } = ListTacticsQueryParams.parse(req.query);

  const tactics = await db
    .select()
    .from(tacticsTable)
    .where(
      // 一律先鎖 userId（擁有權），有帶 matchId 再多疊一個等值條件。
      // and(...) 接受 undefined 會自動略過，所以沒帶 matchId 時等同只有 userId 條件。
      and(
        eq(tacticsTable.userId, req.userId),
        matchId !== undefined ? eq(tacticsTable.matchId, matchId) : undefined,
      ),
    )
    .orderBy(tacticsTable.createdAt);

  res.json(tactics);
});

// POST /tactics — 新建戰術
router.post("/tactics", async (req, res) => {
  const body = CreateTacticBody.parse(req.body);

  // 要把戰術歸屬到某場比賽的話，先確認那場比賽是「這個使用者的」（#225，同 #127 的判準）。
  // tacticsTable.matchId 是真的外鍵，但**外鍵保證的是 referential integrity（這個 id 真的指到
  // 一列存在的比賽），不保證 ownership（那場是不是你的）**——少了這關，A 就能把自己的戰術掛到
  // B 的 matchId 底下（IDOR），而且 FK 是 onDelete: cascade，B 刪掉那場比賽會連帶刪掉 A 的戰術。
  // matchId 在 CreateTacticBody 是 nullish（可不帶＝全域戰術、可為 null），`!= null` 這個寬鬆
  // 比較剛好一次涵蓋 undefined 與 null 兩種「沒有比賽可驗」的情況。
  // 回 404 而不是 403：對不屬於你的資源回「不存在」比回「存在但你不能碰」保守——
  // 後者等於用錯誤碼幫攻擊者確認了那個 id 真的有東西。
  if (body.matchId != null && !(await matchBelongsToUser(body.matchId, req.userId))) {
    res.status(404).json({ error: "Match not found" });
    return;
  }

  const [created] = await db
    .insert(tacticsTable)
    .values({
      userId: req.userId,
      // 歸屬到哪一場比賽（#119）。前端存檔時帶當前 matchId；沒帶就是 null（全域戰術）。
      matchId: body.matchId,
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

  // where 綁了 userId，所以刪不到別人的戰術——但「刪不到」和「刪掉了」在 SQL 層長得一模一樣：
  // 兩者都是不報錯地跑完。要分辨只能看**實際刪掉幾列**，所以加 .returning() 把被刪的列要回來
  // （#225）。少了這一步，DELETE 不存在的／別人的戰術都會回 204「成功」，等於對呼叫端說謊。
  // 這是 DELETE /matches/:matchId 早就有的做法（matches.ts:159-167），tactics 是漏網的那份。
  const deleted = await db
    .delete(tacticsTable)
    .where(and(eq(tacticsTable.id, tacticId), eq(tacticsTable.userId, req.userId)))
    .returning({ id: tacticsTable.id });

  if (deleted.length === 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.status(204).end();
});

export default router;
