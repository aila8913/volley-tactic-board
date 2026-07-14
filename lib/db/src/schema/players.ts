import { pgTable, uuid, integer, text, pgEnum } from "drizzle-orm/pg-core";
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
  // id 從自動遞增整數（serial）改成 uuid：讓「前端」也能自己生一個 id，而不是永遠要等後端
  // insert 完、拿到 DB 配的號碼才知道這個球員的 id 是誰。
  // 為什麼這樣改：戰術板在「離線/樂觀更新」情境下，使用者新增球員的當下畫面要馬上能用
  // 這個 id（例如立刻把他畫上場、掛進輪轉表），但如果 id 是後端才決定的號碼，前端只能
  // 先用一個「暫時 id」頂著，等後端回應後再把畫面上所有引用這個暫時 id 的地方換成真正的
  // id —— 這就是「兩套 id 系統」的競態問題（前端暫時 id vs 後端真正 id，若換頭沒做乾淨
  // 就會兜不起來）。uuid 全域唯一、不用等資料庫配號，前端可以直接生一個當作「這個球員的
  // 真正 id」，離線先用、之後同步上去也不用再換頭 —— 這消掉了整類「換頭」bug（對應
  // invariant I3：一個實體從建立到刪除，id 全程不變）。
  // defaultRandom()：即使前端沒傳 id，資料庫也會自己生一個隨機 uuid 頂著，兩種情境都撐得住。
  id: uuid("id").primaryKey().defaultRandom(),
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

// 不再 .omit({ id: true })：id 欄位改成 uuid + defaultRandom() 之後，drizzle-zod 會自動把
// 「有 default 值的欄位」在 insert schema 裡標成 optional（見 drizzle-zod insertConditions.optional：
// !column.notNull || column.hasDefault），所以這裡什麼都不用做，id 就已經是「可傳可不傳」的
// 選填欄位 —— 前端可以自己塞一個 uuid 進來（client-mintable），也可以完全不傳、交給資料庫生。
export const insertPlayerSchema = createInsertSchema(playersTable);
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type Player = typeof playersTable.$inferSelect;
