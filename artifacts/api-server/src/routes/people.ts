import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, peopleTable } from "@workspace/db";
import { mockAuth } from "../middleware/mockAuth";
import { personBelongsToUser } from "../lib/ownership";
import { handler } from "../lib/handler";
import {
  CreatePersonBody,
  UpdatePersonParams,
  UpdatePersonBody,
  DeletePersonParams,
} from "@workspace/api-zod";

// 「人」（person）的 CRUD——幾乎是 teams.ts 的複製貼上，理由見 lib/db/src/schema/people.ts：
// person 代表一個跨比賽都認得出來的「真實身分」，players.personId 這個外鍵把某場比賽的
// 一列名單「對應」到某個 person，讓同一個人打了好幾場比賽時，統計能夠正確地把他的數據
// 加總在一起（而不是把每場的「王小明」都當成不同人）。跟 teams 同一套 mockAuth + userId
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
router.use(mockAuth);

// GET /people — 列出目前使用者建立過的所有「人」。跟 teams 一樣沒有 createdAt，
// 用 serial id 排序當作建立順序的近似。
// owns: "public" ——理由跟 teams.ts 的 GET /teams 一樣：這支路由查的是
// 「這個 userId 名下的人」，擁有權篩選發生在下面的 where 條件
// （eq(peopleTable.userId, ...)），不是靠單一資源的 owns 檢查擋。owns 是必填欄位
// （見 handler.ts 的說明），所以用 "public" 明講。
router.get(
  "/people",
  handler({ owns: "public" }, async ({ req, res }) => {
    const people = await db
      .select()
      .from(peopleTable)
      .where(eq(peopleTable.userId, req.userId))
      .orderBy(peopleTable.id);

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

export default router;
