import { pgTable, uuid, integer, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { matchesTable } from "./matches";

export const tacticsTable = pgTable("tactics", {
  id: uuid("id").primaryKey().defaultRandom(),
  // mock auth 階段固定是 "mock-user-001"，之後換成真正的 JWT sub
  userId: text("user_id").notNull(),
  // 這份戰術所屬的比賽（#119）。以前戰術庫是全域的：A 場存的戰術會出現在 B 場的面板、
  // 切場後按「儲存」還會覆寫別場的存檔。加上 matchId 後，面板列表用它過濾，戰術庫就變成
  // per-match、不再跨場汙染。
  // 型別是 integer 不是 uuid —— matches.id 是 serial（自增整數），FK 型別必須跟被指的欄位一致。
  // nullable：#119 之前存的舊戰術沒有 matchId，設 nullable 讓它們仍然合法（視為「未歸屬」），
  // 是零痛的向後相容。
  // onDelete: "cascade"：比照 tournamentId 的下沉決定 —— 戰術掛在某場比賽底下，刪掉比賽就該
  // 連同它的戰術一起刪，不留孤兒。（跟 teamId 的 set null 相反：team 是可選標籤、match 是所屬容器。）
  matchId: integer("match_id").references(() => matchesTable.id, { onDelete: "cascade" }),
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
