import { pgTable, serial, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { matchesTable } from "./matches";

// 一場比賽裡的一局（排球通常打到三勝，所以最多 5 局）。
export const setsTable = pgTable("sets", {
  id: serial("id").primaryKey(),
  matchId: integer("match_id")
    .notNull()
    .references(() => matchesTable.id, { onDelete: "cascade" }),
  setNumber: integer("set_number").notNull(), // 第幾局，從 1 開始
});

export const insertSetSchema = createInsertSchema(setsTable).omit({ id: true });
export type InsertSet = z.infer<typeof insertSetSchema>;
// 命名為 MatchSet 而不是 Set，避免跟 JavaScript 內建的 Set（集合資料結構）撞名。
export type MatchSet = typeof setsTable.$inferSelect;
