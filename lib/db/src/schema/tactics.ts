import { pgTable, uuid, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tacticsTable = pgTable("tactics", {
  id: uuid("id").primaryKey().defaultRandom(),
  // mock auth 階段固定是 "mock-user-001"，之後換成真正的 JWT sub
  userId: text("user_id").notNull(),
  // 自由輸入的戰術名稱，對應前端的 projectSituation 欄位
  name: text("name").notNull(),
  // 整份 TacticsState 快照（roster、6 個輪次的 positions/markers/defenseRanges）
  data: jsonb("data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertTacticSchema = createInsertSchema(tacticsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTactic = z.infer<typeof insertTacticSchema>;
export type Tactic = typeof tacticsTable.$inferSelect;
