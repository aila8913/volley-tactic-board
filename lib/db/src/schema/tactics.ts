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
  // nullable 從一開始就是（#119 之前的舊戰術沒有 matchId），但語意變了：那時 null 是
  // 「未歸屬的舊資料」，現在 null 是一級公民——**沒有比賽的全域戰術**（ADR-0007）。
  // onDelete: "set null"（#372 從 "cascade" 改過來，理由見 ADR-0007）：戰術現在可以不經過
  // 任何一場比賽就被建立，所以 match 不再是它的容器、只是一個可選標籤，比照 teamId。
  // 維持 cascade 的話，刪掉一場舊比賽會**安靜地**連帶刪掉你從那場存下、之後一直在用的
  // 通用戰術——不可逆而且沒有聲音。
  matchId: integer("match_id").references(() => matchesTable.id, { onDelete: "set null" }),
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
