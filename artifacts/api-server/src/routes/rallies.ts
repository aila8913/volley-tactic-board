import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, ralliesTable } from "@workspace/db";
import { requireAuth } from "../middleware/requireAuth";
import { setBelongsToUser, rallyBelongsToUser, videoBelongsToRallyMatch } from "../lib/ownership";
import { handler } from "../lib/handler";
import { insertIdempotent } from "../lib/insertIdempotent";
import type { EveryColumnOnInsert, EveryColumnOnUpdate } from "../lib/everyColumn";
import {
  ListRalliesParams,
  CreateRallyParams,
  CreateRallyBody,
  UpdateRallyParams,
  UpdateRallyBody,
  DeleteRallyParams,
} from "@workspace/api-zod";

// 一局（set）裡的各個 rally（一分）。掛在 set 底下，操作前先驗這個 set 屬於這個使用者，
// 驗的方式是往上追到 set 所屬 match 的 userId（見 lib/ownership.ts 的 setBelongsToUser）。
const router: IRouter = Router();
router.use(requireAuth);

// GET /sets/:setId/rallies — 列出這一局的所有 rally，依 rallyNumber 排序（第 1 分、第 2 分…）
// owns 檢查跟 sets.ts 的 GET 一樣：驗這個 setId 是不是這個 userId 的。
router.get(
  "/sets/:setId/rallies",
  handler(
    {
      params: ListRalliesParams,
      owns: ({ params, userId }) => setBelongsToUser(params.setId, userId),
    },
    async ({ res, params }) => {
      const rallies = await db
        .select()
        .from(ralliesTable)
        .where(eq(ralliesTable.setId, params.setId))
        .orderBy(ralliesTable.rallyNumber);

      res.json(rallies);
    },
  ),
);

// POST /sets/:setId/rallies — 記錄新的一分。
// 注意 openapi 的合約是「一次記一個 rally」，body 只有 rally 本身的欄位（分數、誰贏），
// 不含底下的 events——events 是之後用 POST /rallies/:rallyId/events 一球一球記。
// 因為只是單筆 insert，Postgres 本身就是原子操作，這裡不需要 db.transaction()。
// 只需要驗 parent set，body 裡沒有其他要另外驗的第三方 id，所以跟 sets.ts 的 POST 一樣
// 是單一 owns 檢查，不用像 players.ts 那樣包成陣列。
router.post(
  "/sets/:setId/rallies",
  handler(
    {
      params: CreateRallyParams,
      body: CreateRallyBody,
      owns: ({ params, userId }) => setBelongsToUser(params.setId, userId),
    },
    async ({ res, params, body }) => {
      // 型別標註是 #368 的守衛：EveryColumnOnInsert 讓 rallies 的每一欄都變必填，
      // 漏列一欄就編譯不過（見 lib/everyColumn.ts）。
      const values: EveryColumnOnInsert<typeof ralliesTable> = {
        // 選填的 client-mintable 主鍵（#64 PR2），做法與理由見 sets.ts 的 POST 註解。
        // `?? undefined` 取代了原本的條件展開 `...(body.id ? { id } : {})`：條件展開產生的是
        // optional key，窮舉檢查看不到它。drizzle 對 undefined 會送出 `default`，行為不變。
        id: body.id ?? undefined,
        // setId 來自路徑（已驗擁有權），不吃 body 的，避免 client 把 rally 塞到別局去。
        setId: params.setId,
        rallyNumber: body.rallyNumber,
        homeScore: body.homeScore,
        awayScore: body.awayScore,
        homeRotation: body.homeRotation,
        awayRotation: body.awayRotation,
        winner: body.winner,
        // 影片錨定（#390）：從空白開始補填時可以建立當下就帶上；簡易版計分不會帶，
        // 那時還沒有影片可指，之後用 PATCH 補（見下面那支）。
        videoId: body.videoId ?? null,
        videoTimestamp: body.videoTimestamp ?? null,
      };

      // 冪等寫入 + 重送回既有列（#64 PR3）：做法與理由見 lib/insertIdempotent.ts。
      const row = await insertIdempotent(
        ralliesTable,
        values,
        eq(ralliesTable.setId, params.setId),
      );

      if (!row) {
        res.status(409).json({ error: "Conflict" });
        return;
      }

      res.status(201).json(row);
    },
  ),
);

// PATCH /rallies/:rallyId — 把一分錨到「哪一段影片的第幾秒」（#390，進階版補填用）。
//
// 為什麼是 PATCH 既有的 rally 而不是另外建一筆：那一分在簡易版計分時就已經存在了，補填
// 是在同一列上補欄位——跟 ADR-0010 決定 3「補填是就地升級、不是並存」同一個道理。
//
// owns 是兩道：先驗這一分是不是這個使用者的，再驗 body 帶的 videoId 是不是「這一分所屬
// 那場比賽」的影片（ADR-0009：外鍵的範圍是比賽，不是使用者）。`== null` 一次涵蓋
// undefined（沒帶）與 null（明確清掉錨點）兩種「沒有東西可驗」的情況。
router.patch(
  "/rallies/:rallyId",
  handler(
    {
      params: UpdateRallyParams,
      body: UpdateRallyBody,
      owns: [
        ({ params, userId }) => rallyBelongsToUser(params.rallyId, userId),
        ({ params, body }) =>
          body.videoId == null || videoBelongsToRallyMatch(body.videoId, params.rallyId),
      ],
    },
    async ({ res, params, body }) => {
      // 型別標註是 #368／ADR-0008 的守衛：EveryColumnOnUpdate 讓 rallies 的每一欄都要在
      // 物件裡出現，「這欄不開放 PATCH」要明寫 undefined（見 lib/everyColumn.ts）。
      const patch: EveryColumnOnUpdate<typeof ralliesTable> = {
        // id 是主鍵、setId 決定這分屬於哪一局，都不是補填的對象。
        id: undefined,
        setId: undefined,
        // 這一分的比分／輪次／誰得分是計分時就定案的事實，補填只補影片錨點，不改它們。
        // 要改分數是另一件事（改比分會牽動後面每一分的快照），不從這支走。
        rallyNumber: undefined,
        homeScore: undefined,
        awayScore: undefined,
        homeRotation: undefined,
        awayRotation: undefined,
        winner: undefined,
        // 沒帶的欄位值是 undefined，drizzle 的 mapUpdateSet 會濾掉、維持原值；
        // 帶 null 就是明確把錨點清掉。
        videoId: body.videoId,
        videoTimestamp: body.videoTimestamp,
      };

      const [updated] = await db
        .update(ralliesTable)
        .set(patch)
        .where(eq(ralliesTable.id, params.rallyId))
        .returning();

      res.json(updated);
    },
  ),
);

// DELETE /rallies/:rallyId — 刪掉一整分（前端「復原上一球」用）。
// 路徑上只有 rallyId，所以擁有權檢查是單一一支 rallyBelongsToUser——它自己就做完
// rally → set → match → userId 的 join 鏈，不用像 players.ts 的多層陣列那樣分開驗。
// events.rallyId 是 onDelete: cascade（見 lib/db/src/schema/events.ts），所以刪 rally 會連帶
// 清掉它底下記的每一球，不用自己先刪 events。
router.delete(
  "/rallies/:rallyId",
  handler(
    {
      params: DeleteRallyParams,
      owns: ({ params, userId }) => rallyBelongsToUser(params.rallyId, userId),
    },
    async ({ res, params }) => {
      // owns 已經先確認過這個 rally 存在且屬於這個使用者，理論上這裡一定會刪到一列；
      // .returning() + 長度檢查保留下來是不改變原本「靠實際刪掉幾列判斷成功與否」的
      // 防禦性寫法（同 people.ts/tournaments.ts/players.ts 的 DELETE，#225 的教訓）。
      const deleted = await db
        .delete(ralliesTable)
        .where(eq(ralliesTable.id, params.rallyId))
        .returning({ id: ralliesTable.id });

      if (deleted.length === 0) {
        res.status(404).json({ error: "Not found" });
        return;
      }

      res.status(204).end();
    },
  ),
);

export default router;
