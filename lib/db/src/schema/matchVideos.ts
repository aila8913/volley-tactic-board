import { pgTable, integer, text, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { matchesTable } from "./matches";

// 一場比賽的一段影片（#390，拆自 #21）。
//
// 為什麼是一張表、不是 matches 上的一欄：這張表推翻了原本的 `matches.video_url`。
// 「一場比賽 = 一支影片」在現場根本不成立——一局錄一段、手機儲存空間錄到滿、中途換電池，
// 都會把一場比賽切成好幾段。一個欄位只能存一支網址，多出來的段落無處可放。這是典型的
// 「一對多關係被硬塞進一個欄位」，正解就是把「多」的那一邊獨立成表、用外鍵指回「一」。
//
// 舊欄位 `matches.video_url` 在這次一併刪除。可以直接刪不用搬資料，是因為查過全 repo
// 沒有任何前端／種子資料在寫它（只有 API 合約與一個測試 fixture 提到），正式資料全是 null。
export const matchVideosTable = pgTable("match_videos", {
  // uuid + defaultRandom：跟 sets/rallies/events 同一套理由，前端可以自己先決定 id
  // （client-mintable），不用等後端回應才知道這段影片的 id。
  id: uuid("id").primaryKey().defaultRandom(),
  // 這段影片屬於哪一場比賽。matches.id 是 serial 整數，所以這裡是 integer 不是 uuid。
  // onDelete: "cascade"：刪掉比賽，它的影片段落跟著消失（影片段落離開比賽沒有任何意義），
  // 語意跟 sets/rallies/events 掛在 match 底下完全一致。
  matchId: integer("match_id")
    .notNull()
    .references(() => matchesTable.id, { onDelete: "cascade" }),
  // 影片連結（目前是 YouTube；欄位本身不限定平台，之後要接別的來源不用改 schema）。
  url: text("url").notNull(),
  // 這是這場比賽的第幾段（從 1 開始）。用明確的順序欄位而不是靠 createdAt 排序，是因為
  // 使用者可能事後才補貼漏掉的中間那一段——建立時間的先後不等於影片內容的先後。
  sequence: integer("sequence").notNull(),
  // 人看的標籤（例如「第一局」「第三局後半」）。nullable：不填就由前端顯示「第 N 段」。
  label: text("label"),
});

// id 不 omit：uuid + defaultRandom() 讓 drizzle-zod 自動把它標成選填，前端可自己塞 uuid。
export const insertMatchVideoSchema = createInsertSchema(matchVideosTable);
export type InsertMatchVideo = z.infer<typeof insertMatchVideoSchema>;
export type MatchVideo = typeof matchVideosTable.$inferSelect;
