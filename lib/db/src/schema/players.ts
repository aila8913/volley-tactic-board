import { pgTable, serial, integer, text, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { matchesTable } from "./matches";

// 跟前端戰術板的角色定義保持一致
// (artifacts/volleyball-tactics/src/types/tactics.ts 的 Player.role)。
// 用 pgEnum 而不是普通文字欄位，是讓資料庫層直接擋掉打錯字的角色（例如 "OH3"），
// 不用每個地方都手動檢查。
export const playerRoleEnum = pgEnum("player_role", ["S", "OH1", "OH2", "MB1", "MB2", "OPP", "L"]);

// 球員名單掛在「比賽」底下，不是獨立的「球隊」實體 —— 同一支隊伍每場比賽的先發/名單都可能不同，
// 目前不需要跨比賽共用球員資料，所以先用最簡單的模型。
export const playersTable = pgTable("players", {
  id: serial("id").primaryKey(),
  matchId: integer("match_id")
    .notNull()
    .references(() => matchesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  number: integer("number").notNull(),
  role: playerRoleEnum("role").notNull(),
});

export const insertPlayerSchema = createInsertSchema(playersTable).omit({ id: true });
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type Player = typeof playersTable.$inferSelect;
