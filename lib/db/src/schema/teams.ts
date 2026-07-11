import { pgTable, serial, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// teams 只是一個「分組標籤」，不是複雜的球隊實體（沒有球隊底下的固定球員名單、
// 沒有賽季概念）。存在的目的是讓 matches 可以標記「這場比賽是哪支隊伍打的」，
// 之後才能把數據依球隊切片統計（例如「這學期 A 隊 vs 其他隊的攻擊成功率」）。
// 一場比賽可以不屬於任何 team（見 matches.teamId 是 nullable）—— PO 決定建立比賽時
// 不強制選隊伍，先求「隨手就能記」，之後要不要補標籤是使用者自己的選擇。
export const teamsTable = pgTable("teams", {
  id: serial("id").primaryKey(),
  // 跟 matches / people 一樣，mock auth 階段固定存 "mock-user-001"，純文字、不是外鍵。
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
});

export const insertTeamSchema = createInsertSchema(teamsTable).omit({ id: true });
export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type Team = typeof teamsTable.$inferSelect;
