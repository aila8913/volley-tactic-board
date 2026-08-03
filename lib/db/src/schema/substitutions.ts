import { pgTable, serial, integer, uuid, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { setsTable } from "./sets";
import { playersTable } from "./players";

// 換人的種類：regular = 一般換人；libero = 自由球員上/下。
// 自由球員上下場排球規則上不算「正式換人次數」，但記錄結構跟一般換人一樣（一筆 in、一筆 out），
// 所以用同一張表、用 kind 區分，而不是另開一張表。libero 上場時該筆的 playerIn/playerOut
// 對調（L 上場 = playerIn 是 L；L 下場 = playerOut 是 L），詳見 docs/event-grammar-spec.md。
export const substitutionKindEnum = pgEnum("substitution_kind", ["regular", "libero"]);

// 一次換人紀錄。詳見 docs/event-grammar-spec.md 的「時機為何存比分快照」一節——
// 這張表的設計是那一節分析後鎖定的結果，不要重新設計。
export const substitutionsTable = pgTable("substitutions", {
  // id 改成 uuid，理由同 sets.ts / rallies.ts：離線記一次換人的當下就要能決定這筆的 id，
  // 不用等後端回應。
  id: uuid("id").primaryKey().defaultRandom(),
  setId: uuid("set_id")
    .notNull()
    .references(() => setsTable.id, { onDelete: "cascade" }),
  // seq：非主鍵的插入順序流水號，只給「同一分內排序」用，跟 id 是完全不同的用途。
  // 為什麼 id 不能再兼職當排序 tiebreaker：id 從 serial 改成 uuid 之後，id 已經是隨機值、
  // 不帶任何時序資訊，用它排序等於隨機排序——會讓「同一分內連續換兩次人」這種情境的
  // replay 結果每次都不一樣（見 artifacts/api-server/src/routes/substitutions.ts 的
  // orderBy 註解）。所以另外留一個「單純遞增、只給排序用」的欄位。
  // 為什麼在離線情境下 seq 仍然正確：離線佇列 flush 時是嚴格依照本機紀錄的順序、一筆一筆
  // 送出去給後端 insert 的（這個 PR 不改佇列行為，但契約如此），所以 DB 這裡的 insert
  // 順序＝使用者在本機實際操作的順序，seq 遞增剛好等於「這幾筆事件真正發生的先後」。
  seq: serial("seq").notNull(),
  // 換人發生的「時機」，存的是比分快照而不是 rallyId。
  // 為什麼不能存 rallyId：換人發生在下一個 rally 開始「之前」，但 rally row 要等那一分
  // 打完才會 insert（見 rallies.ts 的比分快照設計同理）——換人當下，下一個 rally 的 id
  // 根本還不存在，硬塞會逼 rallyId 變成 nullable，而 notNull → nullable 是單向門，
  // 一旦放寬就再也收不緊。
  // 為什麼比分快照可行：一局內比分對 (homeScore, awayScore) 唯一且嚴格遞增
  // （每一分只會有一邊 +1），所以例如 (3,5) 精準對應「第 9 分開球前」這個時間點，
  // 單筆就能自我描述完整、不依賴任何其他 row 先存在，適合 local-first 情境下
  // 一筆一筆 atomic insert（不用等前一筆或後一筆先寫進去）。
  // 這跟 rallies 表「存這一分開始前的比分」是同一個設計理念的鏡射。
  homeScore: integer("home_score").notNull(),
  awayScore: integer("away_score").notNull(),
  // 上場、下場的球員。兩者都設 nullable + onDelete: "set null"，跟 lineups 六個號位欄位
  // （notNull + onDelete: "cascade"）刻意做出不同選擇：
  // - lineups 的邏輯是「一 row 就是一組完整先發，六人缺一就沒有意義」，所以球員被刪掉時
  //   寧可把整筆 lineup 一起刪掉，也不留下殘缺的先發名單。
  // - substitutions 的邏輯相反：即使不知道當時是「誰」上場/下場，「這一局在第 9 分發生過
  //   一次換人」這件事本身仍然有意義（例如統計「這局換了幾次人」），所以球員被刪掉時
  //   不該連帶刪掉這筆換人紀錄，只需要把指向他的欄位設成 null。
  // 這跟 events.playerId 用 "set null" 的理由完全一樣：刪一名球員（或刪整場比賽連帶清
  // 名單）時，若外鍵是預設的 NO ACTION，會因為這裡還指著那名球員而擋下刪除，
  // 引發「刪比賽卻刪不掉」的 FK 錯誤（Phase 3b-ii 修過的那個 bug）。
  playerInId: uuid("player_in_id").references(() => playersTable.id, { onDelete: "set null" }),
  playerOutId: uuid("player_out_id").references(() => playersTable.id, {
    onDelete: "set null",
  }),
  kind: substitutionKindEnum("kind").notNull(),
});

// id 不再 .omit：id 是 uuid + defaultRandom()，drizzle-zod 自動把它標成選填，前端可以
// 自己塞 uuid（client-mintable）。但 seq 要繼續 omit——它是伺服器插入時才決定的排序
// 流水號，前端不該也不能自己指定。
export const insertSubstitutionSchema = createInsertSchema(substitutionsTable).omit({
  seq: true,
});
export type InsertSubstitution = z.infer<typeof insertSubstitutionSchema>;
export type Substitution = typeof substitutionsTable.$inferSelect;
