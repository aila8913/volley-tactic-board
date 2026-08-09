// 示範資料的 API adapter hook（issue #336 PR3）。跟 useMatches.ts 是同一種寫法：
// 底層包 @workspace/api-client-react 產生的三支 React Query hook（GET/POST/DELETE
// /api/demo-data），對外只露出畫面真正需要的介面。
import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetDemoDataStatus,
  useLoadDemoData,
  useDeleteDemoData,
} from "@workspace/api-client-react";

export function useDemoData() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useGetDemoDataStatus();
  const loadMutation = useLoadDemoData();
  const deleteMutation = useDeleteDemoData();

  // 為什麼「載入」跟「重設」共用同一支 POST：後端 seedDemoData 的語意本來就是
  // 「先把示範資料整批刪掉、再重新種一份」（見 PR1/PR2），不管呼叫當下 present 是
  // true 還是 false 都一樣安全——這裡不需要、也不應該在前端另外分兩支流程去判斷
  // 「現在是要新增還是要重設」，那只是把後端已經處理好的邏輯在前端重寫一次，
  // 徒增一種前後端狀態可能對不上的風險。
  const loadOrReset = useCallback(async () => {
    await loadMutation.mutateAsync();
    // 為什麼這裡整包 invalidateQueries、不像 useMatches.ts 那樣精準列出 queryKey：
    // 種一份示範資料會一次動到 matches / players / sets / rallies / events / lineups /
    // tactics / teams / people，還有三支 analysis 彙總端點——幾乎是這個帳號的全部資料。
    // 逐一列舉 queryKey 的話，漏掉一個就是畫面停在舊資料，而且會漏得很安靜（例如分析頁
    // 還是空的，使用者只會以為功能壞掉，不會想到是快取沒清）。「整個帳號的資料都換掉了」
    // 是少數幾個值得為它犧牲一點效能、換取「不會漏」的情境，所以刻意不精準失效。
    await queryClient.invalidateQueries();
  }, [loadMutation, queryClient]);

  const remove = useCallback(async () => {
    await deleteMutation.mutateAsync();
    // 理由同上：刪除示範資料一樣是整包資料被清空，一樣整包失效快取。
    await queryClient.invalidateQueries();
  }, [deleteMutation, queryClient]);

  return {
    present: data?.present ?? false,
    matchIds: data?.matchIds ?? [],
    isLoading,
    loadOrReset,
    remove,
    isMutating: loadMutation.isPending || deleteMutation.isPending,
  };
}
