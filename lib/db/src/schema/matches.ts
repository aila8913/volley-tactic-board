import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// 一場比賽，name 是這場比賽自己取的名字（跟對手 opponent 是兩個獨立欄位）。
// videoUrl 留空代表目前還沒有可以做「賽後補填」的影片連結。
export const matchesTable = pgTable("matches", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  date: timestamp("date", { withTimezone: true }).notNull(),
  opponent: text("opponent").notNull(),
  location: text("location"),
  videoUrl: text("video_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// createInsertSchema 會自動依照上面的資料表定義產生對應的 Zod 驗證規則（例如 opponent 不能是 undefined），
// 不用手動把每個欄位的驗證規則重寫一次。.omit 是因為新增資料時不該由使用者自己決定 id 跟建立時間。
export const insertMatchSchema = createInsertSchema(matchesTable).omit({ id: true, createdAt: true });
export type InsertMatch = z.infer<typeof insertMatchSchema>;
export type Match = typeof matchesTable.$inferSelect;
