import { z } from 'zod';

// 跟 lib/db/src/schema/players.ts 的 playerRoleEnum 保持一致，也跟 types/tactics.ts 的
// Player.role 是同一組值——但這兩個型別是獨立的，故意沒有互相 import，因為比賽名單跟戰術板
// 編輯中的球員是兩個不同的概念（見 docs/db-schema-spec.md）。
export const PLAYER_ROLES = ['S', 'OH1', 'OH2', 'MB1', 'MB2', 'OPP', 'L'] as const;
export type PlayerRole = typeof PLAYER_ROLES[number];

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
  opponent: z.string().min(1, '請輸入對手名稱'),
  dateTime: z.string().min(1, '請選擇比賽日期時間'),
  players: z
    .array(
      z.object({
        // 編輯既有比賽時帶著原本的 id，讓 store 更新時可以保留同一個球員的身份；
        // 新增比賽或新增球員列時沒有 id，store 會在儲存時補一個新的。
        id: z.string().optional(),
        name: z.string().min(1, '請輸入球員姓名'),
        // 背號的 <input type="number"> 在 DOM 上拿到的是字串，用 z.coerce 在驗證時轉成數字，
        // 不用在表單欄位本身處理型別轉換。
        number: z.coerce.number().int('背號需為整數').min(0, '背號不能是負數').max(99, '背號最大 99'),
        role: z.enum(PLAYER_ROLES),
      })
    )
    .min(1, '至少需要一名球員'),
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
