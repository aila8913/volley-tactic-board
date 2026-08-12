import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, matchVideosTable } from "@workspace/db";
import { requireAuth } from "../middleware/requireAuth";
import { matchBelongsToUser, matchVideoBelongsToUser } from "../lib/ownership";
import { handler } from "../lib/handler";
import { insertIdempotent } from "../lib/insertIdempotent";
import type { EveryColumnOnInsert } from "../lib/everyColumn";
import {
  ListMatchVideosParams,
  CreateMatchVideoParams,
  CreateMatchVideoBody,
  DeleteMatchVideoParams,
} from "@workspace/api-zod";

// 一場比賽的影片段落（#390，拆自 #21）。取代原本 matches.video_url 那一欄——一場比賽
// 可能有好幾段影片（一局一段、錄到滿、換電池），一個欄位表達不了。設計理由見
// lib/db/src/schema/matchVideos.ts 與 docs/adr/0010-* 決定 5。
//
// 路由形狀跟 timeouts/substitutions 同一套：讀寫掛在 /matches/:matchId/videos（先驗 match
// 擁有權），刪除走 /videos/:videoId（路徑上沒有 match，靠 join 反推擁有權）。
const router: IRouter = Router();
router.use(requireAuth);

// GET /matches/:matchId/videos — 這場比賽的所有影片段落，依 sequence 排序。
// 依 sequence 而不是 id/建立時間排序：使用者可能事後才補貼漏掉的中間那一段，
// 建立的先後不等於影片內容的先後（見 schema 的 sequence 註解）。
router.get(
  "/matches/:matchId/videos",
  handler(
    {
      params: ListMatchVideosParams,
      owns: ({ params, userId }) => matchBelongsToUser(params.matchId, userId),
    },
    async ({ res, params }) => {
      const videos = await db
        .select()
        .from(matchVideosTable)
        .where(eq(matchVideosTable.matchId, params.matchId))
        .orderBy(matchVideosTable.sequence);

      res.json(videos);
    },
  ),
);

// POST /matches/:matchId/videos — 掛一段影片到這場比賽。
// 只需要驗 parent match，body 裡沒有其他要另外驗的第三方 id，所以是單一 owns 檢查。
router.post(
  "/matches/:matchId/videos",
  handler(
    {
      params: CreateMatchVideoParams,
      body: CreateMatchVideoBody,
      owns: ({ params, userId }) => matchBelongsToUser(params.matchId, userId),
    },
    async ({ res, params, body }) => {
      // 型別標註是 #368／ADR-0008 的守衛：EveryColumnOnInsert 讓 match_videos 的每一欄
      // 都變必填，漏列一欄就編譯不過（見 lib/everyColumn.ts）。
      const values: EveryColumnOnInsert<typeof matchVideosTable> = {
        // 選填的 client-mintable 主鍵（#64 PR2），做法與理由見 sets.ts 的 POST 註解。
        id: body.id ?? undefined,
        // matchId 來自路徑（已驗擁有權），不吃 body 的，避免把影片掛到別人的比賽底下。
        matchId: params.matchId,
        url: body.url,
        sequence: body.sequence,
        label: body.label ?? null,
      };

      // 冪等寫入 + 重送回既有列（#64 PR3）：做法與理由見 lib/insertIdempotent.ts。
      // scope 綁 matchId，讓「拿別人的 videoId 來 POST 換回那列內容」探不到東西。
      const row = await insertIdempotent(
        matchVideosTable,
        values,
        eq(matchVideosTable.matchId, params.matchId),
      );

      if (!row) {
        res.status(409).json({ error: "Conflict" });
        return;
      }

      res.status(201).json(row);
    },
  ),
);

// DELETE /videos/:videoId — 拿掉一段影片（例如網址貼錯）。
// rallies.videoId 是 onDelete: "set null"（不是 cascade），所以錨在這段影片上的那些分
// 只會失去錨點，記錄本身完好——比賽資料比影片連結重要得多。
router.delete(
  "/videos/:videoId",
  handler(
    {
      params: DeleteMatchVideoParams,
      owns: ({ params, userId }) => matchVideoBelongsToUser(params.videoId, userId),
    },
    async ({ res, params }) => {
      // owns 已經先確認過這段影片存在且屬於這個使用者，理論上這裡一定會刪到一列；
      // .returning() + 長度檢查保留下來是不改變「靠實際刪掉幾列判斷成功與否」的防禦性
      // 寫法（同 timeouts.ts/rallies.ts 的 DELETE，#225 的教訓）。
      const deleted = await db
        .delete(matchVideosTable)
        .where(eq(matchVideosTable.id, params.videoId))
        .returning({ id: matchVideosTable.id });

      if (deleted.length === 0) {
        res.status(404).json({ error: "Not found" });
        return;
      }

      res.status(204).end();
    },
  ),
);

export default router;
