import { pgTable, serial, integer, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { setsTable } from "./sets";
import { playersTable } from "./players";

// 起始先發陣容：一局開始時，我方六個號位各站哪個球員。
// 詳見 docs/event-grammar-spec.md 的「硬缺口 (c)」：firstServer + rally winner 序列能重算
// 「輪到第幾輪」，但「第 3 輪時 4 號位站的是誰」需要一個推不出來的「種子」——就是這張表。
//
// 只記我方：對手沒有名單可對應，`sets.firstServer` 已足夠推導對方發球狀態。
// 自由球員（L）不出現在這六個號位：前端既有邏輯是「自由球員從場邊出發、換人上場」，
// 不算進開局先發站位。
export const lineupsTable = pgTable("lineups", {
  id: serial("id").primaryKey(),
  // 一局一 row：setId 加 unique，讓「這一局已經記過先發」在 DB 層就擋得住重複寫入，
  // 不用應用層自己查一次再決定要 insert 還是 update。
  setId: integer("set_id")
    .notNull()
    .unique()
    .references(() => setsTable.id, { onDelete: "cascade" }),
  // 六個號位（1~6 號位，排球輪轉的站位編號）各站哪個球員。
  // 六欄都 notNull，是刻意選「一 row 六欄」而非「正規化成六個 row」的理由之一：
  // 開局選定先發是一次 atomic 的決定，DB 層直接擋掉「只填了五個號位」這種半吊子寫入，
  // 不會留下不完整的陣容。
  //
  // onDelete 用 "cascade" 而不是 events.playerId 那種 "set null"：因為這裡是 notNull，
  // 球員被刪掉時没辦法把欄位設成 null（會違反 not null constraint），只能整筆處理。
  // 選擇連整局的 lineup 一起刪掉，維持「lineup 要嘛完整六人、要嘛不存在」這條不變量，
  // 不允許出現「陣容少一人」的中間狀態。
  zone1PlayerId: uuid("zone1_player_id")
    .notNull()
    .references(() => playersTable.id, { onDelete: "cascade" }),
  zone2PlayerId: uuid("zone2_player_id")
    .notNull()
    .references(() => playersTable.id, { onDelete: "cascade" }),
  zone3PlayerId: uuid("zone3_player_id")
    .notNull()
    .references(() => playersTable.id, { onDelete: "cascade" }),
  zone4PlayerId: uuid("zone4_player_id")
    .notNull()
    .references(() => playersTable.id, { onDelete: "cascade" }),
  zone5PlayerId: uuid("zone5_player_id")
    .notNull()
    .references(() => playersTable.id, { onDelete: "cascade" }),
  zone6PlayerId: uuid("zone6_player_id")
    .notNull()
    .references(() => playersTable.id, { onDelete: "cascade" }),
});

// 「六人不得重複」DB 層表達不了（沒有內建的「這六個欄位互不相等」約束），
// 留給 Zod（見 insertLineupSchema 使用處）或應用層檢查，跟 event-grammar-spec.md 的決策一致。
export const insertLineupSchema = createInsertSchema(lineupsTable).omit({ id: true });
export type InsertLineup = z.infer<typeof insertLineupSchema>;
export type Lineup = typeof lineupsTable.$inferSelect;
