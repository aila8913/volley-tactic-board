// 資料夾（Tournament）的資料存取層。#117 前這裡是一個 Zustand + persist 的 localStorage store；
// 現在資料夾進了後端 DB，改成跟 useMatches.ts 同一套「API adapter」：底層用
// @workspace/api-client-react 生成的 React Query hooks 打後端，對外仍以既有的 domain 型別
// Tournament 為介面。這樣消費端只要把「同步讀 store」換成「非同步讀 query」。
//
// 為什麼要搬進 DB：資料夾原本只存在這台裝置的 localStorage，比賽卻在 DB——兩層真相來源脫鉤，
// 換裝置/清 storage 後資料夾整批消失、比賽變孤兒（#117，違反 invariant I1）。搬進 DB 後資料夾
// 跟比賽同一個權威來源，這類「資料無聲消失」才根治。
import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListTournaments,
  useCreateTournament as useCreateTournamentMutation,
  useUpdateTournament as useUpdateTournamentMutation,
  useDeleteTournament as useDeleteTournamentMutation,
  getListTournamentsQueryKey,
  getListMatchesQueryKey,
} from "@workspace/api-client-react";
import type { Tournament, TournamentFormValues } from "../types/tournament";

// ── 讀取 ──

// 資料夾列表。後端回傳的型別（id/name/createdAt）跟 domain Tournament 結構相同，直接用、
// 不需要 mapping 層。
export function useTournamentList() {
  const { data, isLoading, isError } = useListTournaments();
  const tournaments: Tournament[] = data ?? [];
  return { tournaments, isLoading, isError };
}

// ── 寫入 ──
// 每個寫入 hook 回傳一個 async 函式；元件在事件處理器裡 await 它。成功後 invalidate 相關
// query key，讓列表自動重抓最新資料。

// 新增資料夾。回傳後端建好的資料夾 id（沿用舊 addTournament 回傳 id 的介面，方便呼叫端之後
// 若要導頁過去）。id 交給後端 defaultRandom() 生。
export function useCreateTournament() {
  const queryClient = useQueryClient();
  const createTournament = useCreateTournamentMutation();

  return useCallback(
    async (values: TournamentFormValues): Promise<string> => {
      const created = await createTournament.mutateAsync({ data: { name: values.name } });
      queryClient.invalidateQueries({ queryKey: getListTournamentsQueryKey() });
      return created.id;
    },
    [queryClient, createTournament],
  );
}

// 改名（目前資料夾只有名稱可改）。
export function useUpdateTournament() {
  const queryClient = useQueryClient();
  const updateTournament = useUpdateTournamentMutation();

  return useCallback(
    async (id: string, values: TournamentFormValues): Promise<void> => {
      await updateTournament.mutateAsync({ tournamentId: id, data: { name: values.name } });
      queryClient.invalidateQueries({ queryKey: getListTournamentsQueryKey() });
    },
    [queryClient, updateTournament],
  );
}

// 刪資料夾。後端外鍵是 onDelete: "cascade"，刪資料夾會連帶刪掉裡面的比賽（DB 層一次做對，
// 前端不用再手動逐場刪）——所以這裡除了 invalidate 資料夾列表，也要 invalidate 比賽列表，
// 讓首頁那些被連帶刪掉的比賽卡片一起消失。
export function useDeleteTournament() {
  const queryClient = useQueryClient();
  const deleteTournament = useDeleteTournamentMutation();

  return useCallback(
    async (id: string): Promise<void> => {
      await deleteTournament.mutateAsync({ tournamentId: id });
      queryClient.invalidateQueries({ queryKey: getListTournamentsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListMatchesQueryKey() });
    },
    [queryClient, deleteTournament],
  );
}
