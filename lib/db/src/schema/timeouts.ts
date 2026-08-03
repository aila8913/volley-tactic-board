import { pgTable, serial, integer, uuid, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { setsTable } from "./sets";

// 暫停是哪一方叫的。跟 rallies.winner / events.side 一樣用 home/away（前端的 us/opponent
// 在 mapping 層翻譯，DB 一律 home/away）。每張表各自定義自己的 pgEnum（不共用 rally_winner）
// 是這個 repo 的慣例——語意不同的欄位用不同 enum，之後某一個要加值也不會牽動另一個。
export const timeoutSideEnum = pgEnum("timeout_side", ["home", "away"]);

// 一次暫停紀錄。這張表的形狀在 docs/event-grammar-spec.md 的 G 群（換人/暫停）一節已定案，
// 是 substitutions 的「更簡單版」：暫停不牽涉球員（沒有 in/out），也沒有 kind，只記
// 「哪一局、在第幾分、哪一方叫的」。issue #44 的產品範圍定為「純記錄事件」——記次數與時機，
// 不記時長（所以沒有 duration 欄位），跟換人一致。
export const timeoutsTable = pgTable("timeouts", {
  // id 改成 uuid，理由同 substitutions.ts：離線記一次暫停的當下就要能決定這筆的 id。
  id: uuid("id").primaryKey().defaultRandom(),
  setId: uuid("set_id")
    .notNull()
    .references(() => setsTable.id, { onDelete: "cascade" }),
  // seq：非主鍵的插入順序流水號，理由跟 substitutions.ts 的 seq 完全一樣——id 改成隨機
  // uuid 之後不再帶時序資訊，不能拿來當排序 tiebreaker，所以另外留一個單純遞增的欄位
  // 專門給排序用。離線佇列 flush 時嚴格依本機順序送出，所以 DB 插入順序＝使用者實際
  // 操作的先後順序，seq 遞增在離線情境下依然正確（見
  // artifacts/api-server/src/routes/timeouts.ts 的 orderBy 註解）。
  seq: serial("seq").notNull(),
  // 暫停發生的「時機」＝當下的比分快照，而不是 rallyId——理由跟 substitutions.ts 完全一樣：
  // 暫停發生在死球期間、下一個 rally 開始之前，那時下一個 rally 的 id 還不存在，硬掛外鍵
  // 會逼 rallyId 變 nullable（單向門，收不回來）。一局內 (homeScore, awayScore) 唯一且嚴格
  // 遞增，所以比分快照就足以精準標定「第幾分開球前叫的暫停」，也讓每筆紀錄能獨立 atomic
  // insert（不依賴任何其他 row 先存在），契合 local-first 的背景寫入。
  homeScore: integer("home_score").notNull(),
  awayScore: integer("away_score").notNull(),
  side: timeoutSideEnum("side").notNull(),
});

// id 不再 .omit（uuid + defaultRandom() 讓 drizzle-zod 自動標成選填，client-mintable）；
// seq 繼續 omit——它是伺服器插入時才決定的排序流水號，前端不該自己指定。
export const insertTimeoutSchema = createInsertSchema(timeoutsTable).omit({ seq: true });
export type InsertTimeout = z.infer<typeof insertTimeoutSchema>;
export type Timeout = typeof timeoutsTable.$inferSelect;
