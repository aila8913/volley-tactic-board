import { z } from "zod";

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
}

export const matchFormSchema = z.object({
  opponent: z.string().min(1, "請輸入對手名稱"),
  dateTime: z.string().min(1, "請選擇比賽日期時間"),
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
    players: match.players.map((p) => ({ id: p.id, name: p.name, number: p.number, role: p.role })),
  };
}
