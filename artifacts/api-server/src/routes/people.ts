import { Router, type IRouter } from "express";
import { eq, and, inArray } from "drizzle-orm";
import {
  db,
  peopleTable,
  playersTable,
  matchesTable,
  teamsTable,
  personMergesTable,
} from "@workspace/db";
import { requireAuth } from "../middleware/requireAuth";
import { personBelongsToUser } from "../lib/ownership";
import { handler } from "../lib/handler";
import { groupMergeCandidates } from "../lib/personName";
import {
  CreatePersonBody,
  UpdatePersonParams,
  UpdatePersonBody,
  DeletePersonParams,
  MergePeopleParams,
  MergePeopleBody,
} from "@workspace/api-zod";

// 「人」（person）的 CRUD——幾乎是 teams.ts 的複製貼上，理由見 lib/db/src/schema/people.ts：
// person 代表一個跨比賽都認得出來的「真實身分」，players.personId 這個外鍵把某場比賽的
// 一列名單「對應」到某個 person，讓同一個人打了好幾場比賽時，統計能夠正確地把他的數據
// 加總在一起（而不是把每場的「王小明」都當成不同人）。跟 teams 同一套 requireAuth + userId
// 擁有權隔離。
//
// 跟 teams 幾乎一樣的設計選擇：
//   1. people.id 是 serial 整數，不是 client-mintable 的 uuid——理由同 teams：這是輕量的
//      分類用資料，整數 id 讓 players.personId 這個外鍵是便宜的整數比對。
//   2. DELETE 不 cascade：players.personId 的外鍵是 onDelete: "set null"（見
//      lib/db/src/schema/players.ts），刪掉一個「人」只會讓指著它的名單列 personId 變回
//      null（那個人在那場比賽的名單列變回「歸屬不明」），**不會刪除任何比賽紀錄**——
//      歷史比賽事實要保留，刪除的只是「這是同一個人」這個標記本身。
const router: IRouter = Router();
router.use(requireAuth);

// #224：people 管理頁的列表需要帶「出賽場次」「關聯球隊」才分得清楚同名的兩筆是誰是誰
// （見 issue #224 本文）。這支函式把原本只寫在 GET /people/merge-candidates 裡的
// join＋彙整邏輯抽出來共用——GET /people（列出全部）跟 GET /people/merge-candidates
// （只列出「同名重複」那些組）現在都需要同一份「這個使用者名下每個人的場次/球隊摘要」，
// 差別只在於後者多套一層 groupMergeCandidates 篩選，彙整本身的邏輯完全一樣，抽出來
// 避免兩支路由各寫一份、以後改 join 條件要改兩次還可能漏改。
//
// 回傳的是「這個 userId 名下所有 person」，不管有沒有同名重複——篩掉只留重複組是
// groupMergeCandidates 的責任，不屬於這支彙整函式該做的事。
async function getPersonSummaries(
  userId: string,
): Promise<Array<{ id: number; name: string; matchCount: number; teamNames: string[] }>> {
  // 一次 left join 拿到「這個使用者名下每個 person，各自出現在哪幾場比賽、哪支球隊」的
  // 扁平列表。用 left join（不是 inner join）是因為完全沒出賽過的 person（players 那邊
  // 一筆都沒有）也要出現在結果裡——不然這個人永遠不會出現在列表/候選組裡。
  const rows = await db
    .select({
      id: peopleTable.id,
      name: peopleTable.name,
      matchId: matchesTable.id,
      teamName: teamsTable.name,
    })
    .from(peopleTable)
    .leftJoin(playersTable, eq(playersTable.personId, peopleTable.id))
    .leftJoin(matchesTable, eq(playersTable.matchId, matchesTable.id))
    .leftJoin(teamsTable, eq(matchesTable.teamId, teamsTable.id))
    .where(eq(peopleTable.userId, userId));

  // 在 JS 端依 person id 把上面的扁平列表彙整成「這個人出賽幾場（去重 matchId）、
  // 屬於哪些球隊（去重、非 null、排序）」——一個 person 可能因為 join 出多筆比賽/球隊
  // 而在 rows 裡重複出現好幾次，這裡用 Map + Set 收斂成一筆。
  const byPersonId = new Map<
    number,
    { id: number; name: string; matchIds: Set<number>; teamNames: Set<string> }
  >();
  for (const row of rows) {
    let entry = byPersonId.get(row.id);
    if (!entry) {
      entry = { id: row.id, name: row.name, matchIds: new Set(), teamNames: new Set() };
      byPersonId.set(row.id, entry);
    }
    if (row.matchId !== null) entry.matchIds.add(row.matchId);
    if (row.teamName !== null) entry.teamNames.add(row.teamName);
  }

  // 依 id 排序——跟改版前 GET /people 的 .orderBy(peopleTable.id) 行為保持一致。
  // Map 的迭代順序理論上是插入順序，但插入順序是「rows 裡誰先出現」，不保證等於 id
  // 遞增（join 結果的列順序不一定照 person.id），所以這裡明講排序，不依賴 Map 的隱含順序。
  return [...byPersonId.values()]
    .map((entry) => ({
      id: entry.id,
      name: entry.name,
      matchCount: entry.matchIds.size,
      teamNames: [...entry.teamNames].sort(),
    }))
    .sort((a, b) => a.id - b.id);
}

// GET /people — 列出目前使用者建立過的所有「人」，帶上出賽場次/關聯球隊（#224）方便在
// 管理頁分辨同名的兩筆。
// owns: "public" ——理由跟 teams.ts 的 GET /teams 一樣：這支路由查的是
// 「這個 userId 名下的人」，擁有權篩選發生在 getPersonSummaries 內部的 where 條件
// （eq(peopleTable.userId, ...)），不是靠單一資源的 owns 檢查擋。owns 是必填欄位
// （見 handler.ts 的說明），所以用 "public" 明講。
router.get(
  "/people",
  handler({ owns: "public" }, async ({ req, res }) => {
    const people = await getPersonSummaries(req.userId);
    res.json(people);
  }),
);

// POST /people — 新增一個「人」。通常發生在球員名單去重 UX 裡：使用者打了一個沒對應到
// 既有身分的姓名，前端就會用這支 API 幫他建一個新身分再綁上去（見 MatchFormDialog.tsx）。
// owns: "public" ——這裡是建立一筆全新的資源、掛在 req.userId 底下，沒有既有資料要驗
// 擁有權，所以跟 GET 一樣明講 "public"，而不是留白讓人誤以為漏寫。
router.post(
  "/people",
  handler({ body: CreatePersonBody, owns: "public" }, async ({ res, body, userId }) => {
    const [created] = await db
      .insert(peopleTable)
      .values({
        userId,
        name: body.name,
      })
      .returning();

    res.status(201).json(created);
  }),
);

// GET /people/merge-candidates — #221 人員合併：列出「看起來像同一個人」的候選組
// （同一個正規化姓名底下有 2 筆以上的 person），給合併 UI（#224）當建議來源。
//
// 這支刻意寫在 router 裡 PATCH/DELETE /people/:personId 之前——理由見 openapi.yaml
// 裡同一支路徑的註解：Express 是照路由「註冊順序」比對，不是照路徑特異度，如果先註冊了
// 一支會吃掉 /people/:personId 的路由，寫死的 /people/merge-candidates 就可能被那個
// 萬用參數段誤攔截。這裡雖然 PATCH/DELETE 是不同方法、目前還踩不到，但先把順序排對。
//
// owns: "public" ——跟上面 GET /people 一樣，這支路由查的是「這個 userId 名下所有人」，
// 不是單一資源，擁有權篩選發生在 getPersonSummaries 內部的 where 條件裡。
//
// 為什麼用「一次查詢＋JS 端彙整」而不是在 SQL 裡直接 groupBy 算出 matchCount/teamNames：
// people 對單一使用者而言是幾十列量級的小資料（不像分析頁 rally/event 動輒成千上萬列），
// 在 JS 端用 Map 彙整可讀性明顯更好，效能差異可以忽略。這跟 ADR-0003「後端聚合留在 SQL」
// 並不衝突——那條講的是分析頁對大量 rally/event 做統計聚合，這裡是小量識別資訊的彙整，
// 是不同量級下的取捨。這份彙整邏輯本身現在住在上面的 getPersonSummaries()（#224 抽出來給
// GET /people 共用），這裡只負責再套一層 groupMergeCandidates 篩出「同名重複」的組。
router.get(
  "/people/merge-candidates",
  handler({ owns: "public" }, async ({ req, res }) => {
    const people = await getPersonSummaries(req.userId);
    res.json(groupMergeCandidates(people));
  }),
);

// PATCH /people/:personId — 改名（目前也只有名稱可改）。
// owns 檢查直接查一次「這個 personId 是不是這個 userId 的」，跟原本 where 裡的
// and(eq(id), eq(userId)) 邏輯等價，只是挪到 owns closure 裡先驗證一次（同 teams.ts）。
// owns 已經先確認過這個人存在且是這個使用者的，所以不再像遷移前那樣另外判斷
// `if (!updated)` 404——跟 teams.ts 的 PATCH 一致，兩者都選擇信任 owns 檢查、
// 不重複防禦（DELETE 則保留 returning-length 檢查，理由見下方 DELETE 的註解）。
router.patch(
  "/people/:personId",
  handler(
    {
      params: UpdatePersonParams,
      body: UpdatePersonBody,
      owns: ({ params, userId }) => personBelongsToUser(params.personId, userId),
    },
    async ({ res, params, body, userId }) => {
      const [updated] = await db
        .update(peopleTable)
        .set({
          ...(body.name !== undefined && { name: body.name }),
        })
        .where(and(eq(peopleTable.id, params.personId), eq(peopleTable.userId, userId)))
        .returning();

      res.json(updated);
    },
  ),
);

// DELETE /people/:personId — 刪掉一個「人」。DB 外鍵 onDelete: "set null" 會把指著這個人的
// players.personId 自動設回 null（那些名單列變回「歸屬不明」），**不會**連帶刪掉那些名單列、
// 更不會刪掉任何比賽紀錄——跟 tournaments 的 cascade 刪除刻意相反（見上方檔案頂註解）。
router.delete(
  "/people/:personId",
  handler(
    {
      params: DeletePersonParams,
      owns: ({ params, userId }) => personBelongsToUser(params.personId, userId),
    },
    async ({ res, params, userId }) => {
      // where 一樣綁 userId：別人的 person 刪不到。owns 檢查已經先確認過這個人存在
      // 且是這個使用者的，理論上這裡一定會刪到一列；.returning() + 長度檢查保留下來
      // 是不改變原本「靠實際刪掉幾列判斷成功與否」的防禦性寫法（同 teams.ts，#225 的教訓）。
      const deleted = await db
        .delete(peopleTable)
        .where(and(eq(peopleTable.id, params.personId), eq(peopleTable.userId, userId)))
        .returning({ id: peopleTable.id });

      if (deleted.length === 0) {
        res.status(404).json({ error: "Not found" });
        return;
      }

      res.status(204).end();
    },
  ),
);

// POST /people/:personId/merge — #221 人員合併：把 body.sourceIds 這幾個「來源」person
// 併進路徑上的 :personId（「目標」），來源那幾筆 people 列會被刪除。破壞性、不可逆操作，
// UI 落點在 #224，這裡只負責後端邏輯。
//
// owns 只驗了 target（:personId）是不是這個使用者的——sourceIds 是 body 帶進來的，
// handler() 的 owns closure 型別上只吃得到 params，驗不到 body 裡的一個陣列，所以來源的
// 擁有權檢查得自己在 handler 內手動做（見下面第 2 步的註解，這一步是防 IDOR 的關鍵）。
router.post(
  "/people/:personId/merge",
  handler(
    {
      params: MergePeopleParams,
      body: MergePeopleBody,
      owns: ({ params, userId }) => personBelongsToUser(params.personId, userId),
    },
    async ({ res, params, body, userId }) => {
      const targetId = params.personId;

      // 1. 去重 sourceIds，並濾掉等於 targetId 的——把自己併進自己是 no-op（語意上沒有
      //    意義），靜默濾掉即可，不需要因此報錯打斷整個合併操作。
      const sourceIds = [...new Set(body.sourceIds)].filter((id) => id !== targetId);

      if (sourceIds.length === 0) {
        res.status(400).json({ error: "No valid source people to merge" });
        return;
      }

      // 2. 確認這些 sourceIds 全部都是「這個使用者的」。owns 檢查只驗過 target，
      //    完全沒驗過 sourceIds——如果不在這裡補這一步，A 使用者可以把任意的、屬於 B 使用者
      //    的 personId 塞進 sourceIds，讓後面的邏輯把 B 的 person 併掉並刪除（IDOR：
      //    Insecure Direct Object Reference，跟 handler.ts 檔頭註解提到的 #225 是同一種漏洞）。
      //    查回來的筆數如果跟 sourceIds 的筆數不一致，代表至少有一個 id 不存在、或不屬於
      //    這個使用者——一律回通用的 404 "Not found"，不區分兩種情況，維持
      //    handler.ts 裡 PO 拍板的既有原則：不外洩「這個資源到底存不存在，只是不是你的」。
      const sources = await db
        .select({ id: peopleTable.id, name: peopleTable.name })
        .from(peopleTable)
        .where(and(inArray(peopleTable.id, sourceIds), eq(peopleTable.userId, userId)));

      if (sources.length !== sourceIds.length) {
        res.status(404).json({ error: "Not found" });
        return;
      }

      // 3. 整批包在一個 transaction 裡執行「改指向 → 寫稽核日誌 → 刪來源」。
      //    為什麼一定要包 transaction：這是「N 個來源」的單一邏輯操作，中途失敗不該留下
      //    半吊子狀態——例如來源 person 都被刪光了，但其中一個來源的名單列改指向 target
      //    卻沒成功寫入，那幾筆名單列的 personId 會因為外鍵 onDelete: "set null" 被資料庫
      //    自動設回 null，變成「歸屬不明」，資料就這樣散了、也沒有稽核紀錄能回頭查是怎麼
      //    發生的——比完全沒跑這次合併還糟。db.transaction 裡任何一步丟出例外，Drizzle
      //    就會自動 ROLLBACK，整批操作要嘛全部生效、要嘛完全沒發生，不會卡在中間狀態
      //    （同樣的取捨在 scripts/src/backfill-person-ids.ts 的回填邏輯也用過一次）。
      let movedPlayerCount = 0;
      await db.transaction(async (tx) => {
        for (const source of sources) {
          // 先查出這個來源底下有哪些名單列會被改指向 target，記錄下來才寫得進
          // person_merges 的 movedPlayerIds（稽核用，見 lib/db/src/schema/personMerges.ts）。
          const movedRows = await tx
            .select({ id: playersTable.id })
            .from(playersTable)
            .where(eq(playersTable.personId, source.id));
          const movedPlayerIds = movedRows.map((row) => row.id);
          movedPlayerCount += movedPlayerIds.length;

          await tx
            .update(playersTable)
            .set({ personId: targetId })
            .where(eq(playersTable.personId, source.id));

          await tx.insert(personMergesTable).values({
            userId,
            targetId,
            sourceName: source.name,
            movedPlayerIds,
          });
        }

        await tx
          .delete(peopleTable)
          .where(and(inArray(peopleTable.id, sourceIds), eq(peopleTable.userId, userId)));
      });

      // 4. 重新查一次 target：合併過程沒有動到 target 自己的欄位，但重新 select 一次
      //    才能回傳完整、跟 DB 現況一致的 Person 物件，而不是自己在記憶體裡拼一個。
      const [target] = await db
        .select()
        .from(peopleTable)
        .where(and(eq(peopleTable.id, targetId), eq(peopleTable.userId, userId)));

      res.json({
        target,
        mergedSourceNames: sources.map((source) => source.name),
        movedPlayerCount,
      });
    },
  ),
);

export default router;
