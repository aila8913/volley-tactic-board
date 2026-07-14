import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// 「資料夾」——把多場比賽收在一起（例如一個聯賽底下有好幾場對戰）。
// 以前這個概念只活在前端 localStorage、後端沒有對應的表，matches.tournamentId 只是存一個
// 不透明的字串指過去。問題是：比賽在 DB、資料夾在 localStorage，兩層真相來源脫鉤——換裝置
// 或清 storage 後資料夾整批消失、底下的比賽變成指向不存在資料夾的「孤兒」（issue #117，
// 違反 invariant I1：有後端 id 的資料，DB 才是唯一權威）。這張表就是把資料夾收進 DB、
// 讓它跟比賽同一個真相來源。
export const tournamentsTable = pgTable("tournaments", {
  // id 用 uuid + defaultRandom()，理由跟 players.id 改 uuid 一樣：讓前端也能自己「鑄造」一個
  // id（client-mintable），離線新增資料夾的當下就有一個全程不變的真正 id 可用，不必先頂一個
  // 暫時 id、等後端回應再換頭（invariant I3）。沿用 uuid 還有一個現實好處：前端本來就是用
  // uuidv4() 生資料夾 id，欄位型別對得上，既有資料的 id 字串本身就是合法 uuid。
  id: uuid("id").primaryKey().defaultRandom(),
  // 擁有這個資料夾的使用者。跟 matches / teams 一樣，mock auth 階段固定是 "mock-user-001"，
  // 純文字、不是外鍵。列表查詢都會用 userId 過濾，做到「只看得到自己的資料夾」。
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  // 前端的 Tournament 型別有 createdAt（ISO 字串），首頁把「資料夾」和「最上層比賽」混排時
  // 用它排序，所以這裡也存一份。defaultNow()：後端 insert 時自動填當下時間。
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// 不 omit id：id 有 defaultRandom()，drizzle-zod 會自動把「有 default 的欄位」在 insert schema
// 裡標成 optional，所以 id 已經是「可傳可不傳」——前端可以自己塞 uuid（client-mintable），
// 也可以不傳交給資料庫生。createdAt 同理（有 defaultNow），也是自動選填。
export const insertTournamentSchema = createInsertSchema(tournamentsTable);
export type InsertTournament = z.infer<typeof insertTournamentSchema>;
export type Tournament = typeof tournamentsTable.$inferSelect;
