import { z } from "zod";
import type { MatchFormat } from "@/lib/matchOutcome";

// 跟 lib/db/src/schema/players.ts 的 playerRoleEnum 保持一致。
// 位置只分 5 大類，同一類可以有任意人數（例如板凳上可能有 3 個 OH、0 個 MB），
// 不像球場站位那樣需要剛好分清楚「第幾個 OH/MB」——那是戰術板畫面內部才需要的概念
// （見 types/tactics.ts 的 Player.role，戰術板會把這份名單對應到場上固定的 7 個站位）。
export const PLAYER_ROLES = ["S", "OH", "MB", "OPP", "L"] as const;
export type PlayerRole = (typeof PLAYER_ROLES)[number];

export interface MatchPlayer {
  id: string;
  name: string;
  number: number;
  role: PlayerRole;
  // 這名單列對應到哪個跨場「真實身分」（見 lib/db/src/schema/people.ts 的 Person）。
  // null＝這名單列還沒被對應到任何人（例如剛新增、或使用者手動解除對應）。#213 的名單去重
  // UX 就是圍繞著這個欄位：使用者確認「這是同一人」才會把它填上一個 person id。
  personId: number | null;
}

export interface Match {
  id: string;
  // 對手名稱本身就是這場比賽的標題（不再有獨立的「比賽名稱」欄位）。
  opponent: string;
  // 直接存 <input type="datetime-local"> 給的原始字串（例如 "2026-06-24T15:30"），
  // 不轉成 ISO，這樣讀回表單時可以直接塞回 input 的 value，不用處理時區轉換。
  dateTime: string;
  players: MatchPlayer[];
  createdAt: string;
  // null 代表這場比賽直接放在最上層，沒有歸到任何資料夾(Tournament)底下。
  // 不放進 matchFormSchema：使用者不會在表單裡選資料夾，是由「從哪個畫面建立」決定的。
  tournamentId: string | null;
  // 這場比賽標到哪支球隊（分組標籤），null＝未分類。跟 tournamentId 一樣不放進 matchFormSchema：
  // 球隊是用「下拉挑既有／臨時建新」的選擇器管理，不是普通的受控欄位（新建的球隊在送出前還沒有
  // id），所以 MatchFormDialog 用獨立的本地 state 處理，見該檔案。
  teamId: number | null;
  // 賽制（#215）：三戰兩勝／五戰三勝，決定「贏幾局才算贏」（見 lib/matchOutcome.ts 的
  // winsNeededFor）。DB 是 notNull，所以這裡不是 nullable。
  format: MatchFormat;
}

export const matchFormSchema = z.object({
  opponent: z.string().min(1, "請輸入對手名稱"),
  dateTime: z.string().min(1, "請選擇比賽日期時間"),
  // 跟 teamId/tournamentId 不一樣，賽制放得進表單 schema：teamId/tournamentId 是
  // 「挑既有／臨時建立」的非同步選擇器（新建的球隊/資料夾在送出前還沒有 id，得用獨立的
  // 本地 state 管，見上面 Match.teamId 的註解跟 MatchFormDialog.tsx），但賽制只是一個
  // 從固定兩個選項中選一個的受控下拉欄位，沒有「還沒建立好」這種中間狀態，跟 opponent、
  // dateTime 這些欄位是同一類東西，所以直接讓 react-hook-form 管它就好。
  format: z.enum(["best_of_3", "best_of_5"]),
  players: z
    .array(
      z.object({
        // 編輯既有比賽時帶著原本的 id，讓 store 更新時可以保留同一個球員的身份；
        // 新增比賽或新增球員列時沒有 id，store 會在儲存時補一個新的。
        id: z.string().optional(),
        name: z.string().min(1, "請輸入球員姓名"),
        // 背號的 <input type="number"> 在 DOM 上拿到的是字串，用 z.coerce 在驗證時轉成數字，
        // 不用在表單欄位本身處理型別轉換。
        number: z.coerce
          .number()
          .int("背號需為整數")
          .min(0, "背號不能是負數")
          .max(99, "背號最大 99"),
        role: z.enum(PLAYER_ROLES),
        // 這一列目前對應到哪個既有身分（Person）。故意不是 optional、而是「有預設值的必填
        // 欄位」——讓每一列的表單資料都明確帶著這個欄位，不會出現「undefined 到底是沒填，
        // 還是使用者要解除對應」這種歧義（undefined 在這裡永遠代表「還沒處理過」，null 才是
        // 「明確地沒有對應」）。#213 去重 UX：使用者按下「是同一人」才會把它改成一個數字。
        personId: z.number().nullable().default(null),
      }),
    )
    .min(1, "至少需要一名球員"),
});

export type MatchFormValues = z.infer<typeof matchFormSchema>;

// 把已存在的 Match 轉成表單可以吃的初始值，編輯比賽時用來預填表單。
export function matchToFormValues(match: Match): MatchFormValues {
  return {
    opponent: match.opponent,
    dateTime: match.dateTime,
    format: match.format,
    players: match.players.map((p) => ({
      id: p.id,
      name: p.name,
      number: p.number,
      role: p.role,
      personId: p.personId,
    })),
  };
}
