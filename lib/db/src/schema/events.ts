import { pgTable, serial, integer, real, text, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { ralliesTable } from "./rallies";
import { playersTable } from "./players";

export const eventActionEnum = pgEnum("event_action", [
  "serve",
  "receive",
  "set",
  "attack",
  "block",
  "dig",
]);

// ballType 只在「接球」類動作（receive/dig）才有意義，用來把一傳/防守細分成
// 接發 / 接扣(S) / 嗆司 / 接吊(T) 四類做統計（見 docs/product-spec.md 的防守數據分析章節）。
export const ballTypeEnum = pgEnum("ball_type", ["serve", "spike", "tip", "chance"]);

export const eventSourceEnum = pgEnum("event_source", ["live", "review"]);

// 一個 rally 裡的單獨一球。座標系統跟前端球場 SVG 完全一致：
// viewBox 0~100（寬）x 0~200（長），見 artifacts/volleyball-tactics/src/components/Court.tsx。
// 這樣前端畫面上點的座標可以直接存進來，不用再做任何座標轉換。
export const eventsTable = pgTable("events", {
  id: serial("id").primaryKey(),
  rallyId: integer("rally_id")
    .notNull()
    .references(() => ralliesTable.id, { onDelete: "cascade" }),
  sequence: integer("sequence").notNull(), // 這個 rally 裡的第幾球，從 1 開始
  playerId: integer("player_id")
    .notNull()
    .references(() => playersTable.id),
  action: eventActionEnum("action").notNull(),
  ballType: ballTypeEnum("ball_type"), // nullable：只有接球動作才需要填
  // 0~3 的品質評分，沿用排球記錄的慣例刻度：0 分 = 直接失誤、3 分 = 完美到位（舉球員可以自由選戰術）。
  // nullable 是因為不是每種動作都需要評分（例如單純記錄一次攻擊落點，不一定要評分）。
  quality: integer("quality"),
  fromX: real("from_x").notNull(),
  fromY: real("from_y").notNull(),
  toX: real("to_x").notNull(),
  toY: real("to_y").notNull(),
  // Postgres 原生陣列型別：預設清單的標籤跟使用者自訂的標籤都存在同一個欄位，不需要另外開一張標籤表。
  tags: text("tags").array().notNull().default([]),
  note: text("note"),
  // 秒數，對應 YouTube 播放時間；只有 source = 'review'（賽後補填）時才會有值。
  videoTimestamp: integer("video_timestamp"),
  source: eventSourceEnum("source").notNull(),
});

export const insertEventSchema = createInsertSchema(eventsTable).omit({ id: true });
export type InsertEvent = z.infer<typeof insertEventSchema>;
// 命名為 MatchEvent 而不是 Event，避免跟瀏覽器內建的 DOM Event 型別撞名。
export type MatchEvent = typeof eventsTable.$inferSelect;
