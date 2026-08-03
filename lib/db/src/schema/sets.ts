import { pgTable, uuid, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { matchesTable } from "./matches";

// 這一局由哪一方先發球（home = 我方、away = 對方）。跟 rallies.winner / events.side 都用
// home/away 這組詞是刻意的（見那兩張表），但語意不同，所以各自一個獨立的 enum type。
export const setFirstServerEnum = pgEnum("set_first_server", ["home", "away"]);

// 一場比賽裡的一局（排球通常打到三勝，所以最多 5 局）。
export const setsTable = pgTable("sets", {
  // id 從自動遞增整數（serial）改成 uuid，理由跟 players.ts 的 id 完全一樣：
  // 離線寫入佇列（#75）需要「開新的一局」這個動作在沒有網路的當下就能決定 setId，
  // 好讓接下來記錄的每一個 rally / event 可以馬上引用這個 setId，不用等 POST /sets
  // 回應回來才知道自己是第幾號。詳細動機見 players.ts:19-28 的完整說明，這裡不重複。
  id: uuid("id").primaryKey().defaultRandom(),
  matchId: integer("match_id")
    .notNull()
    .references(() => matchesTable.id, { onDelete: "cascade" }),
  setNumber: integer("set_number").notNull(), // 第幾局，從 1 開始
  // 誰先發球。前端的比分/輪轉/發球方全都能從「這個種子 + 各 rally 的 winner 序列」重算出來，
  // 唯獨「誰先發」推不出來，所以是這張表裡最關鍵的種子欄位。
  // 允許 null（沒加 notNull）：按「下一局」的當下就會先建這筆 row（讓「使用者已經進到的每一
  // 局」都有對應的 DB row），但那一刻使用者還沒選先發方，所以先寫 null，
  // 之後選好先發方再用 PATCH 補上。這樣「還沒選先發方的空局」也是 DB 裡最後一筆 set，
  // reload 時才不會被誤判成「上一局還在進行中」（#63）。
  firstServer: setFirstServerEnum("first_server"),
});

// 不再 .omit({ id: true })：理由跟 players.ts 的 insertPlayerSchema 一樣——id 改成
// uuid + defaultRandom() 之後，drizzle-zod 會自動把它標成選填欄位，前端可以自己塞一個
// uuid 進來（client-mintable，離線情境需要），也可以不傳交給資料庫生。
export const insertSetSchema = createInsertSchema(setsTable);
export type InsertSet = z.infer<typeof insertSetSchema>;
// 命名為 MatchSet 而不是 Set，避免跟 JavaScript 內建的 Set（集合資料結構）撞名。
export type MatchSet = typeof setsTable.$inferSelect;
