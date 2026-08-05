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
  useListTeamRosterSuggestions,
  getListTeamsQueryKey,
  getListTeamRosterSuggestionsQueryKey,
} from "@workspace/api-client-react";
import type { Team, RosterSuggestion } from "@workspace/api-client-react";

// ── 讀取 ──
// 後端回傳的 Team（id/name）結構單純，不需要 mapping 層，直接當 domain 型別用。
export function useTeamList() {
  const { data, isLoading, isError } = useListTeams();
  // Array.isArray 而不是 `data ?? []`，理由見 usePeople.ts 的同一段註解（#213 踩到）：
  // 後端 endpoint 沒掛上時會掉進 SPA fallback 回 HTML 字串，`?? []` 擋不掉，會一路傳到
  // teams.map(...) 才炸。這支目前不會發生（/teams 早就上線了），但同一個形狀留著同一個坑。
  const teams: Team[] = Array.isArray(data) ? data : [];
  return { teams, isLoading, isError };
}

// #287：這支球隊之前登錄過的人（見 artifacts/api-server/src/routes/teams.ts 的
// GET /teams/:teamId/roster-suggestions），給「新增比賽」表單在選定既有球隊後，用一顆顆
// chip 讓使用者「勾選＋微調」帶入名單，取代每場都重打一次。
//
// teamId 可能是 null（表單還沒選定既有球隊，或選的是「未指定」／「建立新球隊」）——但底下
// orval 生成的 useListTeamRosterSuggestions 簽章要求 teamId: number（跟 useGetMatch 一樣，
// 見 useMatches.ts 的 useMatchWithRoster 那段同樣的取捨），所以 teamId 為 null 時傳一個
// 佔位值 0，並且明講 query.enabled: false 蓋掉 generated hook 內建的 `enabled: !!teamId`
// 預設值——0 剛好也是 falsy，內建預設本來就會關閉查詢，這裡明講是為了「teamId 為 null」
// 這個語意讓判斷點只有一處、不用依賴剛好巧合為 falsy 這件事。
export function useTeamRosterSuggestions(teamId: number | null) {
  const { data, isLoading, isError } = useListTeamRosterSuggestions(teamId ?? 0, {
    query: {
      enabled: teamId != null,
      queryKey: getListTeamRosterSuggestionsQueryKey(teamId ?? 0),
    },
  });
  // Array.isArray 而不是 `data ?? []`，理由見 usePeople.ts 的同一段註解（#213 踩到的坑）：
  // 後端 endpoint 沒掛上時會掉進 SPA fallback 拿到一整份 HTML 字串，`?? []` 擋不住，
  // 會一路傳到 .map(...) 才炸成難查的白屏。
  const suggestions: RosterSuggestion[] = Array.isArray(data) ? data : [];
  return { suggestions, isLoading, isError };
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
