import { pgTable, integer, uuid, real, text, pgEnum } from "drizzle-orm/pg-core";
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
// cover（掩護）＝ 攔網後的防守，是 #51 談出來的第四類（docs/event-grammar-spec.md 對照表 D7）。
// pgEnum「加值」是相容的異動（既有資料照舊、舊值都還在），所以可以放心 additive 加；
// 反過來「刪值」不可逆（存過那個值的列會變成非法），這就是下面 serveType 只先鎖三個值的理由。
export const ballTypeEnum = pgEnum("ball_type", ["serve", "spike", "tip", "chance", "cover"]);

// 發球種類（#51／event-grammar-spec 決策 6）：純進階版欄位，簡易版不分類。
// 值用英文 snake_case 跟本 repo 其他 enum 一致；中文對照是
// jump = 跳發、float = 飄球、jump_float = 跳飄。
// 先只鎖這三個值：加值相容、刪值不可逆，所以「先窄後寬」永遠是安全的一邊。
export const serveTypeEnum = pgEnum("serve_type", ["jump", "float", "jump_float"]);

export const eventSourceEnum = pgEnum("event_source", ["live", "review"]);

// 這一球的「結果」，判準是「執行這球的一方」（events.side），不是「我方」：
//   outcome = (event.side === rally.winner) ? "point" : "loss"
// 例：我方扣球被攔死 → side=home、winner=away → loss（不是「我方失分」這種以我方為基準
// 的講法，而是「執行這球的 home 方沒有贏得這分」）；對手攔網得分 → side=away、winner=away
// → point。in_play = 球還在來回中（既不是得分也不是失分的中間過程球，例如一次成功的
// 接發、一次到位的舉球），只會出現在進階版逐球記錄——簡易版一個 rally 只記一顆決定球，
// 所以簡易版的 outcome 永遠是 point 或 loss，不會是 in_play。
// 對應 docs/event-grammar-spec.md 決策 7。簡易版錄球手勢第 3 步本來就會問「得分/失分」，
// 所以簡易版也一起存這個欄位（不是進階版才有）—— 反正使用者已經按過那個按鈕了，
// 存起來是零額外成本，之後才能直接拿來做「失分結構」（哪一種動作最常造成失分）這類統計。
// nullable：保留給「還沒補填 / 目前不確定」的中繼狀態；正常情況下，一個完整記錄完的
// rally，裡面每一球的 outcome 都應該不是 null，且整個 rally 剛好有一球是 point 或 loss
// （這是資料完整性的不變量，但目前先不用資料庫層的 constraint 去強制，靠應用層檢查）。
export const eventOutcomeEnum = pgEnum("event_outcome", ["point", "loss", "in_play"]);

// 這一球是哪一方執行的（home = 我方、away = 對方）。跟 rallies.winner（誰得分）是不同概念：
// 例如對方發球、我方接發，這球的 side 是 home（我方接的），但這分最後可能 away 贏。
// 簡易版的「對手(全體)」動作會用 away 記錄，且沒有球員可指（見下方 playerId 改 nullable）。
export const eventSideEnum = pgEnum("event_side", ["home", "away"]);

// 一個 rally 裡的單獨一球。座標系統跟前端球場 SVG 完全一致：
// viewBox 0~100（寬）x 0~200（長），見 artifacts/volleyball-tactics/src/components/Court.tsx。
// 這樣前端畫面上點的座標可以直接存進來，不用再做任何座標轉換。
export const eventsTable = pgTable("events", {
  // id 改成 uuid，理由同 sets.ts / rallies.ts：離線記錄一球的當下就要能決定 eventId，
  // 不用等後端回應才知道自己是第幾號。
  id: uuid("id").primaryKey().defaultRandom(),
  rallyId: uuid("rally_id")
    .notNull()
    .references(() => ralliesTable.id, { onDelete: "cascade" }),
  sequence: integer("sequence").notNull(), // 這個 rally 裡的第幾球，從 1 開始
  // 哪一方執行這球，見上方 eventSideEnum。notNull：每一球一定屬於某一邊。
  side: eventSideEnum("side").notNull(),
  // playerId 改成 nullable：只有我方（side = home）動作才對得到名單裡的球員；
  // 對方（side = away）沒有球員名單，簡易版的「對手(全體)」也不指定特定球員，所以留空。
  // onDelete: "set null"：刪掉一名球員（或刪整場比賽連帶清名單）時，把引用他的 event 的
  // playerId 設為 null，而不是擋下刪除。這一球「發生過」的事實仍保留，只是失去球員歸屬；
  // 若不設，預設 NO ACTION 會讓「刪比賽 → 連帶刪名單」因為 event 還指著球員而觸發外鍵違反。
  playerId: uuid("player_id").references(() => playersTable.id, { onDelete: "set null" }),
  action: eventActionEnum("action").notNull(),
  ballType: ballTypeEnum("ball_type"), // nullable：只有接球動作才需要填
  // 發球種類。nullable：只有 action = "serve" 且是進階版補填時才會有值——簡易版記發球
  // 不分跳發/飄球（停下來分類會打斷計分節奏，見 event-grammar-spec 決策 8）。
  serveType: serveTypeEnum("serve_type"),
  // 0~3 的品質評分，沿用排球記錄的慣例刻度：0 分 = 直接失誤、3 分 = 完美到位（舉球員可以自由選戰術）。
  // nullable 是因為不是每種動作都需要評分（例如單純記錄一次攻擊落點，不一定要評分）。
  quality: integer("quality"),
  // 四個座標改成 nullable：只有進階版（賽後精確記落點）才會填座標；簡易版只記「誰做了什麼動作」，
  // 不點座標，所以留空。座標系統仍跟前端球場 SVG 一致（viewBox 0~100 x 0~200）。
  fromX: real("from_x"),
  fromY: real("from_y"),
  toX: real("to_x"),
  toY: real("to_y"),
  // Postgres 原生陣列型別：預設清單的標籤跟使用者自訂的標籤都存在同一個欄位，不需要另外開一張標籤表。
  tags: text("tags").array().notNull().default([]),
  note: text("note"),
  // 秒數，對應 YouTube 播放時間；只有 source = 'review'（賽後補填）時才會有值。
  videoTimestamp: integer("video_timestamp"),
  source: eventSourceEnum("source").notNull(),
  // 見上方 eventOutcomeEnum 註解：這一球是得分/失分/還在來回中。nullable。
  outcome: eventOutcomeEnum("outcome"),
});

// 不再 .omit({ id: true })：理由同上——id 是 uuid + defaultRandom()，drizzle-zod
// 自動把它標成選填，前端可以自己塞 uuid（client-mintable，離線寫入佇列需要）。
export const insertEventSchema = createInsertSchema(eventsTable);
export type InsertEvent = z.infer<typeof insertEventSchema>;
// 命名為 MatchEvent 而不是 Event，避免跟瀏覽器內建的 DOM Event 型別撞名。
export type MatchEvent = typeof eventsTable.$inferSelect;
