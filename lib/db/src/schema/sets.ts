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
  // 唯獨「誰先發」推不出來，所以是唯一必須存的種子（notNull，開局選好先發方時就寫入）。
  firstServer: setFirstServerEnum("first_server").notNull(),
});

export const insertSetSchema = createInsertSchema(setsTable).omit({ id: true });
export type InsertSet = z.infer<typeof insertSetSchema>;
// 命名為 MatchSet 而不是 Set，避免跟 JavaScript 內建的 Set（集合資料結構）撞名。
export type MatchSet = typeof setsTable.$inferSelect;
