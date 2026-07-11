import { pgTable, serial, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// people 是「人」的唯一身分，跟 players 不一樣：players 是「某場比賽的名單列」，
// 每場比賽都可能各自有一筆（同一個人這場穿 5 號、下場可能穿 12 號、甚至換到別隊）。
// people 才是跨比賽、跨球隊「這是同一個人」的錨點 —— 之後要做「這個人打了幾場」
// 「這個人跨隊的生涯數據」（#65 視圖二、視圖三規劃的球員個人分析）時，
// 就是靠 players.personId 指回同一筆 people，把散落在各場比賽的紀錄串起來。
// 目前先建表但還不強制使用（players.personId 是 nullable），前端也還沒接。
export const peopleTable = pgTable("people", {
  id: serial("id").primaryKey(),
  // 跟 matches 一樣，mock auth 階段固定存 "mock-user-001"，之後換成真正的 JWT sub。
  // 沒有 users 表，所以這裡也只是存純文字，不是外鍵。
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
});

// createInsertSchema 依照上面資料表定義自動產生對應的 Zod 驗證規則；
// .omit id 是因為新增資料時不該由使用者自己決定 id（由資料庫的 serial 自動遞增）。
export const insertPersonSchema = createInsertSchema(peopleTable).omit({ id: true });
export type InsertPerson = z.infer<typeof insertPersonSchema>;
export type Person = typeof peopleTable.$inferSelect;
