import { pgTable, serial, integer, text, timestamp, uuid, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { teamsTable } from "./teams";
import { tournamentsTable } from "./tournaments";

// 賽制：三戰兩勝（先拿 2 局）或五戰三勝（先拿 3 局）。
// 用 pgEnum 而不是普通文字欄位，是 repo 既有慣例（見 players.ts 的 playerRoleEnum 註解）：
// 讓 DB 層直接擋掉打錯字的值（例如 "best-of-3" 或 "bo3"），不用每個地方都手動檢查。
export const matchFormatEnum = pgEnum("match_format", ["best_of_3", "best_of_5"]);

// 比賽狀態（#218）：這場比賽記錄者有沒有明確按下「結束比賽」。
//
// 為什麼需要這個欄位、而不是繼續從局比數推導：這個 repo 有一條散在三處的慣例
// ——「sets 陣列的最後一局＝進行中，其餘＝已結束」（前端 volleyballRules.ts 的
// splitCompletedAndCurrent、後端 analysis.ts 的 slice(0, -1)）。那條慣例的存在理由，
// 當初的註解寫得很白：「schema 沒有『這局結束了嗎』的旗標」。代價是**打完的最後一局
// 永遠會被當成進行中而被丟掉**，局比數、分析頁、資料夾戰績全都少算一局；測試資料
// 甚至要靠「補一局空 set」才能讓完賽的比賽顯示正確（見 #215）——等於慣例本身在逼
// 資料造假。這個欄位就是當初缺的那個旗標：有了它，「最後一局算不算完」變成讀一個
// 明確的值，不是猜。決策記錄見 docs/adr/0005-match-status-column.md。
//
// 目前只做兩個值。棄賽／提前結束（abandoned）確實是「推導做不到、只有欄位能表達」的
// 情境，但現在沒有任何 UI 會產生它，先加就是死欄位——之後要做，往這個 enum 補一個
// 值即可（pgEnum 加值是相容的異動，既有資料不受影響）。
export const matchStatusEnum = pgEnum("match_status", ["in_progress", "finished"]);

// 一場比賽。videoUrl 留空代表目前還沒有可以做「賽後補填」的影片連結。
export const matchesTable = pgTable("matches", {
  id: serial("id").primaryKey(),
  // 擁有這場比賽的使用者。跟 tactics 表一樣，mock auth 階段固定是 "mock-user-001"，
  // 之後換成真正的 JWT sub。巢狀資源（players/sets/rallies/events）不各自存 userId，
  // 而是靠「往上追到所屬 match 的 userId」來驗證擁有權，避免每張表都重複一份。
  userId: text("user_id").notNull(),
  // name 改成 nullable：前端已經決定「對手名稱本身就是比賽標題」，沒有獨立的比賽名稱欄位
  // （見 artifacts/volleyball-tactics/src/types/match.ts）。保留欄位但不強制，之後若要自訂
  // 標題可以再用；現在不填也不會擋住建立比賽。
  name: text("name"),
  date: timestamp("date", { withTimezone: true }).notNull(),
  opponent: text("opponent").notNull(),
  location: text("location"),
  videoUrl: text("video_url"),
  // 比賽所屬的資料夾（Tournament）。#117 前這裡是不帶 FK 的 text、只存前端 localStorage 資料夾的
  // 不透明字串；現在資料夾進了 DB（tournaments 表），這裡改成真正的 uuid 外鍵指過去。
  // nullable：null 代表這場比賽放在最上層、沒歸到任何資料夾。
  // onDelete: "cascade"（PO 拍板：刪資料夾＝連同裡面的比賽一起刪）—— 刪掉一個 tournament，
  // 資料庫會自動把指著它的 matches 一併刪除（再往下 cascade 到 players/sets/rallies/events）。
  // 這把「刪資料夾要不要順便刪比賽」的邏輯下沉到 DB 一次做對，前端不必再手動逐場刪、也就不會
  // 留下孤兒比賽（#117 的病根）。注意這跟 teamId 的 set null 是刻意相反的取捨：team 只是可選的
  // 分組標籤，刪標籤不該牽連比賽；但資料夾是使用者主動的收納容器，「刪掉整個資料夾」的語意本就
  // 包含裡面的東西。
  tournamentId: uuid("tournament_id").references(() => tournamentsTable.id, {
    onDelete: "cascade",
  }),
  // teamId 指回 teams 表，標記這場比賽是哪支隊伍打的（用來之後按球隊切片統計）。
  // nullable：PO 決定建立比賽時不強制選球隊 —— 優先求「隨手就能記」，球隊標籤是可選的補充資訊。
  // onDelete: "set null"：刪掉一個 team 時，只把指著它的 matches.teamId 設回 null
  // （比賽變成「未分類」），不會連帶刪掉比賽本身 —— 比賽紀錄比球隊標籤更重要，不該被牽連刪除。
  teamId: integer("team_id").references(() => teamsTable.id, { onDelete: "set null" }),
  // 賽制是「這場比賽」固有的屬性，不能從局比數反推——例如看到 2:1，沒辦法分辨這是
  // 三戰兩勝已經打完（決勝局 2:1）、還是五戰三勝打到一半（還沒到決勝局）。#215 之前
  // matchOutcome.ts 曾經把「贏 3 局才算贏」寫死當全站唯一規則，結果三戰兩勝的比賽在
  // 比賽列表被誤標成「進行中」——這就是「用局數猜賽制」猜不準的實例，所以賽制得存成
  // 欄位，由使用者在建立比賽時明確選定，而不是靠事後推算。
  // notNull + default("best_of_3")：這個 app 主要使用者是系隊/校隊，練習賽跟盃賽初賽
  // 絕大多數是三戰兩勝，預設值對準最常見情境；同時 notNull 讓既有資料（#215 之前建立、
  // 根本沒有這個概念的舊比賽）在 push 這次 schema 異動時，DB 自動幫每一列補上這個預設值，
  // 不用另外寫遷移腳本去逐筆回填。
  format: matchFormatEnum("format").notNull().default("best_of_3"),
  // 這場比賽結束了沒（#218）。語意見上面 matchStatusEnum 的說明。
  // notNull + default("in_progress")：跟 format 同一個理由——既有資料（#218 之前建立、
  // 根本沒有這個概念的舊比賽）在 push 這次 schema 異動時，DB 會自動幫每一列補上預設值，
  // 不用另外寫遷移腳本逐筆回填；而預設「進行中」對舊資料也是安全的一邊（頂多是使用者
  // 要回去補按一次「結束比賽」，不會把還在打的比賽誤標成已完賽）。
  status: matchStatusEnum("status").notNull().default("in_progress"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// createInsertSchema 會自動依照上面的資料表定義產生對應的 Zod 驗證規則（例如 opponent 不能是 undefined），
// 不用手動把每個欄位的驗證規則重寫一次。.omit 是因為新增資料時不該由使用者自己決定 id 跟建立時間。
export const insertMatchSchema = createInsertSchema(matchesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertMatch = z.infer<typeof insertMatchSchema>;
export type Match = typeof matchesTable.$inferSelect;
