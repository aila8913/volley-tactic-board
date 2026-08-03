import { pgTable, uuid, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { setsTable } from "./sets";

export const rallyWinnerEnum = pgEnum("rally_winner", ["home", "away"]);

// 一個 rally = 從發球開始，到球落地/出界/犯規（也就是這一球死掉、產生一分）為止的完整來回。
export const ralliesTable = pgTable("rallies", {
  // id 改成 uuid，理由同 sets.ts：離線記一分的當下就要能決定 rallyId，讓緊接著的每一顆
  // event（見 events.ts）馬上有 rallyId 可以引用，不用等後端回應。
  id: uuid("id").primaryKey().defaultRandom(),
  setId: uuid("set_id")
    .notNull()
    .references(() => setsTable.id, { onDelete: "cascade" }),
  rallyNumber: integer("rally_number").notNull(), // 這一局裡的第幾個 rally，從 1 開始
  // 這裡存的是這個 rally 開始前的比分，不是結束後的——這樣每筆紀錄都能獨立還原當下的比賽情境，
  // 不需要把所有 rally 加總起來才能知道某一球發生時的比分。
  homeScore: integer("home_score").notNull(),
  awayScore: integer("away_score").notNull(),
  // 跟比分同一套語意：存的是這個 rally「開始前」的輪次快照（0–5），不是打完轉完之後的值。
  // 這樣未來分析頁（#65）要用「某個輪次時發生了什麼」當 join key 時，不用回推整局歷史來重建當下輪次。
  homeRotation: integer("home_rotation").notNull(),
  awayRotation: integer("away_rotation").notNull(),
  winner: rallyWinnerEnum("winner").notNull(),
});

// 不再 .omit({ id: true })：理由同 sets.ts / players.ts——id 是 uuid + defaultRandom()，
// drizzle-zod 自動把它標成選填，前端可以自己塞 uuid（client-mintable）。
export const insertRallySchema = createInsertSchema(ralliesTable);
export type InsertRally = z.infer<typeof insertRallySchema>;
export type Rally = typeof ralliesTable.$inferSelect;
