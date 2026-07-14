import { pgTable, serial, integer, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { teamsTable } from "./teams";
import { tournamentsTable } from "./tournaments";

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
