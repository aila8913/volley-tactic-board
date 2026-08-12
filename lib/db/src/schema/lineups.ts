import { pgTable, serial, uuid } from "drizzle-orm/pg-core";
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
// 不算進開局先發站位——但它另外有自己的兩欄（#359，見下面 startingLiberoId 的說明）。
export const lineupsTable = pgTable("lineups", {
  id: serial("id").primaryKey(),
  // 一局一 row：setId 加 unique，讓「這一局已經記過先發」在 DB 層就擋得住重複寫入，
  // 不用應用層自己查一次再決定要 insert 還是 update。
  // setId 型別跟著 sets.id 從 integer 改成 uuid（sets.ts 的 id 已改成 client-mintable
  // uuid，見該檔案註解），否則外鍵型別對不上、drizzle-kit push 會失敗。lineups 本身
  // 不在離線寫入契約範圍內（id 仍是 serial），這裡只是被動跟著改型別。
  setId: uuid("set_id")
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
  // ── 自由球員先發（#359）─────────────────────────────────────────────────────────
  //
  // 為什麼 L 不能跟六個號位一樣記成第七欄「L 站幾號位」：六個號位不只是六個位子，它就是
  // **輪轉序列本身**——每拿一次發球權六個人整組轉一格。自由球員不進輪轉，它是「上場頂替某個
  // 後排球員」，被頂替者輪到前排時 L 就下場。所以「L 站幾號位」是會變的推導值，
  // **「L 頂替誰」才是那個推不出來的原始事實**（#326 定的模型）。
  //
  // 兩欄都可為 null，而且是三種合法狀態而不是兩種：
  //   (a) 兩欄都 null      → 這局沒排自由球員（很多隊記錄時根本不排 L）
  //   (b) 只有 starting    → 指定了先發 L，但開局時他在場外（頂替的人還沒輪到後排）
  //   (c) 兩欄都有         → 開局 L 就在場上，頂替 replaces 那個人
  // 「只有 replaces 沒有 starting」是無效的（頂替總得有人來頂），這條 DB 表達不了，
  // 由 PUT /sets/:setId/lineup 擋（跟「六人不得重複」同一個地方、同一個理由）。
  //
  // onDelete 用 "set null" 而不是六個號位那種 "cascade"：這兩欄本來就允許 null，球員被刪掉時
  // 「這局沒有 L」是個完全合法的狀態，沒必要為此把整局的先發連坐刪掉。六個號位不能這樣做，
  // 是因為那六欄 notNull、清成 null 會違反約束，只能整筆處理（見上面的說明）。
  startingLiberoId: uuid("starting_libero_id").references(() => playersTable.id, {
    onDelete: "set null",
  }),
  liberoReplacesPlayerId: uuid("libero_replaces_player_id").references(() => playersTable.id, {
    onDelete: "set null",
  }),
});

// 「六人不得重複」DB 層表達不了（沒有內建的「這六個欄位互不相等」約束），
// 留給 Zod（見 insertLineupSchema 使用處）或應用層檢查，跟 event-grammar-spec.md 的決策一致。
export const insertLineupSchema = createInsertSchema(lineupsTable).omit({ id: true });
export type InsertLineup = z.infer<typeof insertLineupSchema>;
export type Lineup = typeof lineupsTable.$inferSelect;
