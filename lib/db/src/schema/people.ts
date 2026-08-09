import { pgTable, serial, text, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// people 是「人」的唯一身分，跟 players 不一樣：players 是「某場比賽的名單列」，
// 每場比賽都可能各自有一筆（同一個人這場穿 5 號、下場可能穿 12 號、甚至換到別隊）。
// people 才是跨比賽、跨球隊「這是同一個人」的錨點 —— 之後要做「這個人打了幾場」
// 「這個人跨隊的生涯數據」（#65 視圖二、視圖三規劃的球員個人分析）時，
// 就是靠 players.personId 指回同一筆 people，把散落在各場比賽的紀錄串起來。
// players.personId 維持 nullable（不強制綁人，隨手建的名單不必先想身分），
// 但前端已接：名單去重與跨場/跨隊球員分析（#213）就是靠它串的。
export const peopleTable = pgTable("people", {
  id: serial("id").primaryKey(),
  // 跟 matches 一樣，mock auth 階段固定存 "mock-user-001"，之後換成真正的 JWT sub。
  // 沒有 users 表，所以這裡也只是存純文字，不是外鍵。
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  // #336：跟 matches.isDemo 同一套設計，理由也寫在那邊（lib/db/src/schema/matches.ts）——
  // 只有 `/demo-data` 路由的刪除邏輯會讀這個欄位，一般查詢完全不碰它，示範人員在畫面上
  // 就跟使用者自己建的人員一視同仁地出現。
  isDemo: boolean("is_demo").notNull().default(false),
});

// createInsertSchema 依照上面資料表定義自動產生對應的 Zod 驗證規則；
// .omit id 是因為新增資料時不該由使用者自己決定 id（由資料庫的 serial 自動遞增）。
export const insertPersonSchema = createInsertSchema(peopleTable).omit({ id: true });
export type InsertPerson = z.infer<typeof insertPersonSchema>;
export type Person = typeof peopleTable.$inferSelect;
