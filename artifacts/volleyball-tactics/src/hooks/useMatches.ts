// 比賽 + 名單的資料存取層。原本這裡是一個 Zustand + persist 的 localStorage store，
// 現在改成「API adapter」：底層用 @workspace/api-client-react 產生的 React Query hooks
// 打後端，對外仍以既有 domain 型別（Match / MatchPlayer）為介面，型別/資料的轉換都關在
// lib/matchMapping.ts。這樣各元件幾乎只需要把「同步讀 store」換成「非同步讀 query」。
//
// 為什麼用 React Query 而不是自己 fetch：它幫我們處理快取、載入/錯誤狀態、以及「寫入後
// 讓相關查詢自動重抓」（invalidateQueries）。戰術板存讀（TacticsBoardPanel.tsx）已經是這個
// 模式，這裡照抄。
import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListMatches,
  useGetMatch,
  useListPlayers,
  useCreateMatch as useCreateMatchMutation,
  useUpdateMatch as useUpdateMatchMutation,
  useDeleteMatch as useDeleteMatchMutation,
  useCreatePlayer,
  useUpdatePlayer,
  useDeletePlayer,
  getListMatchesQueryKey,
  getGetMatchQueryKey,
  getListPlayersQueryKey,
} from "@workspace/api-client-react";
import type { Match, MatchPlayer, MatchFormValues } from "../types/match";
import {
  serverMatchToDomain,
  serverPlayerToDomain,
  localInputToIso,
  diffRoster,
  type RosterInput,
} from "../lib/matchMapping";

// ── 讀取 ──

// 比賽列表。這裡不順便抓每場的名單（那會變成 N+1 個請求），domain Match 的 players 先給空陣列；
// 需要名單的畫面自己用 useRoster 抓自己那一場（#175 之後列表卡片不再顯示人數，右欄的
// MatchInfoRail 才是看名單的地方，所以列表這條路徑上已經沒有人需要逐場的名單了）。
export function useMatchList() {
  const { data, isLoading, isError } = useListMatches();
  const matches: Match[] = (data ?? []).map((m) => serverMatchToDomain(m));
  return { matches, isLoading, isError };
}

// 單場比賽的名單（給右欄站位面板、編輯彈窗做 diff 用）。
export function useRoster(matchId: number) {
  const { data, isLoading, isError } = useListPlayers(matchId);
  const players: MatchPlayer[] = (data ?? []).map(serverPlayerToDomain);
  return { players, isLoading, isError };
}

// 單場比賽 + 完整名單，組成一個 domain Match。合併兩個查詢（比賽本體 + 名單）。
// enabled=false 時兩個查詢都不會發（例如「新增比賽」彈窗還沒有 match id 可查）。
export function useMatchWithRoster(matchId: number, enabled = true) {
  // 這些 generated query hook 的 options 型別把 queryKey 列為必填，所以連同 enabled 一起帶上
  // 各自的預設 queryKey（用 getXxxQueryKey 產生，跟 hook 內部預設一致）。
  const matchQuery = useGetMatch(matchId, {
    query: { enabled, queryKey: getGetMatchQueryKey(matchId) },
  });
  const playersQuery = useListPlayers(matchId, {
    query: { enabled, queryKey: getListPlayersQueryKey(matchId) },
  });
  // 為什麼要 useMemo：serverMatchToDomain 每次呼叫都會 new 一個新的 domain 物件，
  // 即使底層資料沒變，參照也是全新的。編輯彈窗（MatchFormDialog）的 useEffect 把這個
  // match 放進依賴陣列，effect 內又呼叫 form.reset() 觸發重繪；若每次 render 都給新參照，
  // 就會「render → 新 match → effect 重跑 → reset → 再 render」無限迴圈
  // （Maximum update depth exceeded）。用 useMemo 綁在兩個 query 的 data 參照上，
  // 只有資料真的變（React Query 換了新的 data 物件）時才重算，參照才穩定。
  const match = useMemo(
    () =>
      matchQuery.data !== undefined
        ? serverMatchToDomain(matchQuery.data, playersQuery.data ?? [])
        : undefined,
    [matchQuery.data, playersQuery.data],
  );
  return {
    match,
    isLoading: matchQuery.isLoading || playersQuery.isLoading,
    isError: matchQuery.isError || playersQuery.isError,
  };
}

// ── 寫入 ──
// 每個寫入 hook 都回傳一個 async 函式；元件在事件處理器裡 await 它。成功後 invalidate 相關
// query key，讓列表/名單自動重抓最新資料。

// 新增比賽：先建 match、拿到 server 給的整數 id，再逐一建名單裡的球員（後端沒有「一次建整份
// 名單」的 endpoint，所以序列送）。回傳新 match 的整數 id，讓呼叫端可以導頁過去。
export function useCreateMatch() {
  const queryClient = useQueryClient();
  const createMatch = useCreateMatchMutation();
  const createPlayer = useCreatePlayer();

  return useCallback(
    async (values: MatchFormValues, tournamentId: string | null): Promise<number> => {
      const created = await createMatch.mutateAsync({
        data: {
          opponent: values.opponent,
          date: localInputToIso(values.dateTime),
          // 前端用 opponent 當標題，沒有獨立比賽名稱，name 一律留空。
          name: null,
          tournamentId,
        },
      });
      for (const p of values.players) {
        await createPlayer.mutateAsync({
          matchId: created.id,
          data: { name: p.name, number: p.number, role: p.role },
        });
      }
      queryClient.invalidateQueries({ queryKey: getListMatchesQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListPlayersQueryKey(created.id) });
      return created.id;
    },
    [queryClient, createMatch, createPlayer],
  );
}

// 共用的名單 diff 執行：把「新名單 next」對「伺服器現有 existing」的差異，拆成 create/patch/delete
// 打出去。給「編輯比賽」跟「編輯名單」兩處共用。
function useApplyRosterDiff() {
  const createPlayer = useCreatePlayer();
  const updatePlayer = useUpdatePlayer();
  const deletePlayer = useDeletePlayer();

  return useCallback(
    async (matchId: number, existing: MatchPlayer[], next: readonly RosterInput[]) => {
      const { toCreate, toUpdate, toDelete } = diffRoster(existing, next);
      for (const data of toCreate) {
        await createPlayer.mutateAsync({ matchId, data });
      }
      for (const { playerId, data } of toUpdate) {
        await updatePlayer.mutateAsync({ matchId, playerId, data });
      }
      for (const playerId of toDelete) {
        await deletePlayer.mutateAsync({ matchId, playerId });
      }
    },
    [createPlayer, updatePlayer, deletePlayer],
  );
}

// 編輯比賽：更新比賽本體（對手/時間/資料夾）＋ 依 diff 調整名單。
export function useUpdateMatch() {
  const queryClient = useQueryClient();
  const updateMatch = useUpdateMatchMutation();
  const applyRosterDiff = useApplyRosterDiff();

  return useCallback(
    async (matchId: number, values: MatchFormValues, existing: MatchPlayer[]): Promise<void> => {
      await updateMatch.mutateAsync({
        matchId,
        data: { opponent: values.opponent, date: localInputToIso(values.dateTime) },
      });
      await applyRosterDiff(matchId, existing, values.players);
      queryClient.invalidateQueries({ queryKey: getListMatchesQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetMatchQueryKey(matchId) });
      queryClient.invalidateQueries({ queryKey: getListPlayersQueryKey(matchId) });
    },
    [queryClient, updateMatch, applyRosterDiff],
  );
}

// 只改名單（戰術板的「編輯球員名單」彈窗用；不動比賽本體）。
export function useSaveRoster() {
  const queryClient = useQueryClient();
  const applyRosterDiff = useApplyRosterDiff();

  return useCallback(
    async (matchId: number, existing: MatchPlayer[], next: MatchPlayer[]): Promise<void> => {
      await applyRosterDiff(matchId, existing, next);
      queryClient.invalidateQueries({ queryKey: getGetMatchQueryKey(matchId) });
      queryClient.invalidateQueries({ queryKey: getListPlayersQueryKey(matchId) });
    },
    [queryClient, applyRosterDiff],
  );
}

// 刪除比賽（後端 FK cascade 會連帶清掉名單/局/分/球）。
export function useDeleteMatch() {
  const queryClient = useQueryClient();
  const deleteMatch = useDeleteMatchMutation();

  return useCallback(
    async (matchId: number): Promise<void> => {
      await deleteMatch.mutateAsync({ matchId });
      queryClient.invalidateQueries({ queryKey: getListMatchesQueryKey() });
    },
    [queryClient, deleteMatch],
  );
}
