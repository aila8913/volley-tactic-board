// 球隊（Team＝分組標籤）的資料存取層，跟 useTournaments.ts 同一套「API adapter」模式：
// 底層用 @workspace/api-client-react 生成的 React Query hooks 打後端，對外給元件一個乾淨的
// 讀（useTeamList）＋寫（useCreateTeam）介面。
//
// 目前只需要「列出」＋「新增」：新增比賽的表單要能挑既有球隊、也要能臨時建一支新的
// （見 MatchFormDialog）。改名／刪除的管理 UI 這一輪還沒做，所以先不包這兩支 hook——
// 後端的 PATCH/DELETE /teams 已經在了，之後要做球隊管理頁再補對應 hook 即可。
import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListTeams,
  useCreateTeam as useCreateTeamMutation,
  getListTeamsQueryKey,
} from "@workspace/api-client-react";
import type { Team } from "@workspace/api-client-react";

// ── 讀取 ──
// 後端回傳的 Team（id/name）結構單純，不需要 mapping 層，直接當 domain 型別用。
export function useTeamList() {
  const { data, isLoading, isError } = useListTeams();
  const teams: Team[] = data ?? [];
  return { teams, isLoading, isError };
}

// ── 寫入 ──
// 新增球隊，回傳後端給的整數 id，讓呼叫端（表單）拿去當這場比賽的 teamId。成功後 invalidate
// 球隊列表，讓下拉選單自動看到新建的球隊。
export function useCreateTeam() {
  const queryClient = useQueryClient();
  const createTeam = useCreateTeamMutation();

  return useCallback(
    async (name: string): Promise<number> => {
      const created = await createTeam.mutateAsync({ data: { name } });
      queryClient.invalidateQueries({ queryKey: getListTeamsQueryKey() });
      return created.id;
    },
    [queryClient, createTeam],
  );
}
