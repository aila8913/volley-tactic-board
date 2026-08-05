import { pgTable, serial, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
import { peopleTable } from "./people";

// #221「人員合併」的稽核紀錄表。合併是刻意設計成破壞性且不可逆的操作：使用者把
// N 個來源 person 併進一個目標 person 之後，來源那幾筆 people 列會被直接刪掉，
// 名單列（players.personId）改指到目標。這正是 #213 當初設計 people 表時刻意迴避的
// 風險——如果併錯了（例如把兩個真的不同名同姓的人搞混），從併完那一刻起，目標 person
// 名下到底哪幾場比賽本來屬於哪個來源，一般查詢完全分不出來（players.personId 已經
// 全部指向同一個 target，原本的分界線消失了）。
//
// 這張表就是那道保險：append-only（只會 insert，程式碼裡沒有任何地方 update/delete
// 它自己），也刻意不被任何既有查詢 join——分析頁、名單列表等等統計邏輯完全不知道
// 這張表存在。多寫這張表的成本只有「合併當下多一次 insert」，換到的是誤併之後至少
// 能人工回頭查「這個 target 底下，movedPlayerIds 這幾筆名單列原本對應的名字是
// sourceName」，用來手動拆回去或至少弄清楚發生了什麼事。
//
// 一次合併操作如果併入 N 個來源 person，就在這裡寫 N 列（一個來源一列），而不是
// 一列塞一個陣列——這樣「這個來源何時被併進哪個 target」是一對一的單筆紀錄，
// 之後如果要查「某個來源人名的合併歷史」，直接一個 where 就查得到，不用去拆解
// jsonb 陣列。
export const personMergesTable = pgTable("person_merges", {
  id: serial("id").primaryKey(),
  // 跟 people/matches 一樣，mock auth 階段固定存 "mock-user-001"，之後換成真正的 JWT sub。
  userId: text("user_id").notNull(),
  // 合併之後留下來的目標 person。nullable + onDelete: "set null"——跟
  // players.personId 是同一套哲學（見 players.ts「歷史事實要保留」的註解）：
  // 就算 target 之後被使用者刪掉了，這一列「曾經有這些名單列被併過來」的稽核紀錄
  // 本身仍然是有意義的還原線索，不該因為 target 消失就整列被 cascade 刪掉。
  targetId: integer("target_id").references(() => peopleTable.id, { onDelete: "set null" }),
  // 來源 person 的名字快照，不是外鍵——來源那筆 people 列會在同一個 transaction 裡被
  // 刪掉（合併的定義就是「來源消失、併進目標」），刪掉之後外鍵已經無處可指，只能在
  // 合併當下把名字存成一份純文字快照，讓事後回頭看還認得出「這個來源原本叫什麼」。
  sourceName: text("source_name").notNull(),
  // 這次合併把哪些 players.id（名單列）從指向來源改指向 target，存一個 uuid 字串陣列。
  // 這是「誤併之後想拆回去」時真正有用的線索：知道具體是哪幾筆名單列被動過，
  // 而不是只知道「這個 target 曾經併過某個人」。
  movedPlayerIds: jsonb("moved_player_ids").$type<string[]>().notNull(),
  mergedAt: timestamp("merged_at", { withTimezone: true }).defaultNow().notNull(),
});

// 稽核用的旁支資料，不對外開放新增/修改（只有後端合併邏輯自己會寫入），所以刻意不生
// insert schema／zod 型別——沒有任何 API 需要接受使用者輸入來建立這張表的資料。
export type PersonMerge = typeof personMergesTable.$inferSelect;
