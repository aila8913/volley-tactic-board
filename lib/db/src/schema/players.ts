import { pgTable, serial, integer, text, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { matchesTable } from "./matches";
import { peopleTable } from "./people";

// 跟前端比賽名單的角色定義保持一致
// (artifacts/volleyball-tactics/src/types/match.ts 的 PLAYER_ROLES)。
// 位置只分 5 大類，同一類可以有任意人數；戰術板畫面內部會把名單對應到場上固定的站位，
// 但那是戰術板自己的概念，不需要存進資料庫。
// 用 pgEnum 而不是普通文字欄位，是讓資料庫層直接擋掉打錯字的角色（例如 "OH3"），
// 不用每個地方都手動檢查。
export const playerRoleEnum = pgEnum("player_role", ["S", "OH", "MB", "OPP", "L"]);

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
  // personId 指回 people 表的「這個人」，讓同一個人跨比賽/跨球隊的紀錄可以串起來
  // （見 people.ts 註解）。nullable，因為這一列本質上是「這場比賽的名單事實」——
  // 「某個人這場穿幾號、打什麼位置」——就算之後這個人被刪掉，這筆歷史紀錄也不該消失。
  // onDelete: "set null"（而不是 cascade）正是為了保留這個事實：
  // 刪掉 people 裡的一筆身分，只會把這裡的 personId 設回 null（變成「歸屬不明的名單列」），
  // 不會連帶刪掉這場比賽的球員列 —— 更不會往下牽連到已經指著這個 player.id 的
  // events / lineups / substitutions（它們指的是 player 這一列本身，不是 personId，
  // 所以完全不受影響，繼續指著同一個 player.id）。
  personId: integer("person_id").references(() => peopleTable.id, { onDelete: "set null" }),
});

export const insertPlayerSchema = createInsertSchema(playersTable).omit({ id: true });
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type Player = typeof playersTable.$inferSelect;
