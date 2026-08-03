import { Router, type IRouter } from "express";
import { eq, and, getTableColumns } from "drizzle-orm";
import { db, substitutionsTable, setsTable } from "@workspace/db";
import { mockAuth } from "../middleware/mockAuth";
import { setBelongsToUser, matchBelongsToUser, substitutionBelongsToUser } from "../lib/ownership";
import { handler } from "../lib/handler";
import {
  ListMatchSubstitutionsParams,
  CreateSubstitutionParams,
  CreateSubstitutionBody,
  DeleteSubstitutionParams,
} from "@workspace/api-zod";

// 一局（set）裡的換人紀錄（regular 換人 / libero 上下場，見 lib/db/src/schema/substitutions.ts）。
// 讀（bulk）掛在 /matches/:matchId/substitutions 底下（先驗 match 擁有權）；
// 寫掛在 /sets/:setId/substitutions 底下（先驗 set 擁有權，往上追到 match.userId）。
const router: IRouter = Router();
router.use(mockAuth);

// GET /matches/:matchId/substitutions — 一次拿整場比賽的所有換人紀錄（跨 set）。
// 前端進頁重建上場名單時用這一支，取代「對每個 set 各發一次請求」的 N+1
// （跟 GET /matches/:matchId/events 是同一個理由、同一種寫法）。
// substitutions 自己沒存 matchId，所以 join substitutions→sets，用 sets.matchId 過濾；
// owns 檢查跟 matches.ts/events.ts 的 GET 一樣，單一 matchBelongsToUser 就夠
// （沒有第三方 id 要另外驗）。
router.get(
  "/matches/:matchId/substitutions",
  handler(
    {
      params: ListMatchSubstitutionsParams,
      owns: ({ params, userId }) => matchBelongsToUser(params.matchId, userId),
    },
    async ({ res, params }) => {
      // getTableColumns(substitutionsTable) 讓 select 只回傳 substitutions 的欄位（扁平形狀），
      // 不會因為 join 而變成 { substitutions: {...}, sets: {...} } 的巢狀結構。
      // 依 setId、(homeScore+awayScore) 排序：換人是按「這局內比分快照」記錄時機的（見
      // substitutions.ts 的設計說明），比分嚴格遞增，所以這樣排序就能還原「換人發生的先後順序」，
      // 讓前端可以照順序重放（replay）出每個時間點的上場名單。
      // 最後再加 seq 當 tiebreak：同一分（homeScore/awayScore 完全相同）可能連續換好幾次人
      // （例如同一球剛結束、教練一次換兩個位置），這時候比分排不出先後，需要第二層依據讓
      // 「同分內誰先換」永遠是決定性的（deterministic）。
      // 為什麼不能再用主鍵 id 當 tiebreak（#64 PR1）：主鍵從自增整數改成 client-mintable
      // 的隨機 uuid 之後，id 本身不再帶任何時序資訊，拿它排序等於隨機排序——同一分內連續
      // 換兩個位置，每次重建出來的先後順序可能不一樣。所以另外留一個非主鍵、單純遞增的
      // seq 欄位（見 lib/db/src/schema/substitutions.ts）專門給排序用。
      // 為什麼 seq 在離線情境下仍然正確：這張表的寫入之後會走離線佇列（#75），但佇列
      // flush 時是嚴格依照本機記錄的操作順序、一筆一筆送給後端 insert 的——所以這裡的
      // insert 順序（seq 遞增的順序）等於使用者在本機實際換人的先後順序，不會因為
      // 「離線先記、之後才補送」而錯亂。
      const rows = await db
        .select(getTableColumns(substitutionsTable))
        .from(substitutionsTable)
        .innerJoin(setsTable, eq(substitutionsTable.setId, setsTable.id))
        .where(eq(setsTable.matchId, params.matchId))
        .orderBy(
          substitutionsTable.setId,
          substitutionsTable.homeScore,
          substitutionsTable.awayScore,
          substitutionsTable.seq,
        );

      res.json(rows);
    },
  ),
);

// POST /sets/:setId/substitutions — 記錄一次換人（一般換人或 libero 上/下場）。
// body 帶的是「當下的比分快照」而非 rallyId，理由見 substitutions.ts：換人發生在下一個
// rally 開始之前，那時下一個 rally 的 id 還不存在。
// 只需要驗 parent set，body 裡沒有其他要另外驗的第三方 id，所以跟 rallies.ts 的 POST 一樣
// 是單一 owns 檢查，不用像 players.ts 那樣包成陣列。
router.post(
  "/sets/:setId/substitutions",
  handler(
    {
      params: CreateSubstitutionParams,
      body: CreateSubstitutionBody,
      owns: ({ params, userId }) => setBelongsToUser(params.setId, userId),
    },
    async ({ res, params, body }) => {
      const [created] = await db
        .insert(substitutionsTable)
        // setId 來自路徑（已驗擁有權），不吃 body 的，避免 client 把換人紀錄塞到別局去。
        // playerInId/playerOutId 用 ?? null 把「body 沒帶」轉成 DB 的 null——
        // libero 上/下場時，其中一邊本來就可能沒有對應球員（見 substitutions.ts 的欄位註解）。
        .values({
          // 選填的 client-mintable 主鍵（#64 PR2），做法與理由見 sets.ts 的 POST 註解。
          // 注意這裡指定的是 id，不是 seq——seq 仍由 DB 自增，它守的是「同一分內的插入順序」
          // （見 lib/db/src/schema/substitutions.ts），跟前端鑄不鑄 id 是兩件事。
          ...(body.id ? { id: body.id } : {}),
          setId: params.setId,
          homeScore: body.homeScore,
          awayScore: body.awayScore,
          playerInId: body.playerInId ?? null,
          playerOutId: body.playerOutId ?? null,
          kind: body.kind,
        })
        // 冪等寫入 + 重送回既有列（#64 PR3），做法與理由見 sets.ts 的 POST 註解。
        // 重送不會多配一個 seq：DO NOTHING 代表那一列根本沒有再被 insert 一次。
        .onConflictDoNothing({ target: substitutionsTable.id })
        .returning();

      if (!created) {
        const existing = body.id
          ? await db
              .select()
              .from(substitutionsTable)
              .where(
                and(eq(substitutionsTable.id, body.id), eq(substitutionsTable.setId, params.setId)),
              )
              .limit(1)
          : [];

        if (existing.length === 0) {
          res.status(409).json({ error: "Conflict" });
          return;
        }
        res.status(201).json(existing[0]);
        return;
      }

      res.status(201).json(created);
    },
  ),
);

// DELETE /substitutions/:substitutionId — 刪掉一筆換人紀錄（前端「復原」退掉上一個換人動作用，
// 見 issue #41）。路徑上只有 substitutionId，所以擁有權要靠 substitutionBelongsToUser 往上
// join 兩層追到 match.userId。跟 DELETE /rallies/:rallyId 是同一套「undo 就 hard-delete」的作法。
router.delete(
  "/substitutions/:substitutionId",
  handler(
    {
      params: DeleteSubstitutionParams,
      owns: ({ params, userId }) => substitutionBelongsToUser(params.substitutionId, userId),
    },
    async ({ res, params }) => {
      // owns 已經先確認過這筆換人紀錄存在且屬於這個使用者，理論上這裡一定會刪到一列；
      // .returning() + 長度檢查保留下來是不改變「靠實際刪掉幾列判斷成功與否」的防禦性寫法
      // （同 people.ts/tournaments.ts/players.ts/rallies.ts/events.ts 的 DELETE，#225 的教訓）。
      const deleted = await db
        .delete(substitutionsTable)
        .where(eq(substitutionsTable.id, params.substitutionId))
        .returning({ id: substitutionsTable.id });

      if (deleted.length === 0) {
        res.status(404).json({ error: "Not found" });
        return;
      }

      res.status(204).end();
    },
  ),
);

export default router;
