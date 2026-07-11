import { pgTable, serial, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { matchesTable } from "./matches";

// 這一局由哪一方先發球（home = 我方、away = 對方）。跟 rallies.winner / events.side 都用
// home/away 這組詞是刻意的（見那兩張表），但語意不同，所以各自一個獨立的 enum type。
export const setFirstServerEnum = pgEnum("set_first_server", ["home", "away"]);

// 一場比賽裡的一局（排球通常打到三勝，所以最多 5 局）。
export const setsTable = pgTable("sets", {
  id: serial("id").primaryKey(),
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

export const insertSetSchema = createInsertSchema(setsTable).omit({ id: true });
export type InsertSet = z.infer<typeof insertSetSchema>;
// 命名為 MatchSet 而不是 Set，避免跟 JavaScript 內建的 Set（集合資料結構）撞名。
export type MatchSet = typeof setsTable.$inferSelect;
