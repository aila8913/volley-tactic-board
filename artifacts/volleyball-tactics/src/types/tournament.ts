import { z } from "zod";

// 「資料夾」概念——把多場比賽收在一起（例如一個聯賽底下有好幾場對戰）。
// 故意設計成很單薄的型別：只有名稱，沒有對手/日期等欄位，那些都是底下每一場 Match 自己的事。
export interface Tournament {
  id: string;
  name: string;
  createdAt: string;
}

export const tournamentFormSchema = z.object({
  name: z.string().min(1, "請輸入資料夾名稱"),
});

export type TournamentFormValues = z.infer<typeof tournamentFormSchema>;
