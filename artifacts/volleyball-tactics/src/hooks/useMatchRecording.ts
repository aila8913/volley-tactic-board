// 分析頁（#65 視圖一：單場比賽分析）用的唯讀重建 hook。
//
// 跟 useScoreSheet.ts 的 useScoreSheetController 差在哪？controller 除了重建，還要
// 負責「本地即時更新 + 背景寫回後端」那整套記帳（currentSetIdRef/rallyIdsRef、
// 排隊寫入……），那是給計分表畫面「邊記邊看」用的。分析頁只需要「把這場目前為止
// 記錄了什麼，讀出來看」，不會有人在分析頁按「下一球」，所以不需要那些寫入邏輯、
// 不需要 seed 任何 ref、也不碰 Zustand store（useScoreSheet 那份 optimistic 快取
// 是給正在記錄的那一場用的，分析頁不該去動它，兩邊職責分清楚，之後才不會互相干擾）。
//
// 抓資料用的 query hook 跟 controller 是同一組（同一批 API endpoint），純計算則直接
// 重用 reconstructRecording（lib/scoreSheetMapping.ts）——這樣「同一份 sets/rallies/
// events/substitutions 資料，重建出來的比分/球員統計」在計分表跟分析頁一定是同一個
// 答案，不會有兩邊各寫一套邏輯、算出兩種數字的風險。
import { useQueries } from "@tanstack/react-query";
import {
  useListSets,
  useListMatchEvents,
  useListMatchSubstitutions,
  listRallies,
  getListRalliesQueryKey,
} from "@workspace/api-client-react";
import { ScoreSheetState } from "@/types/scoresheet";
import { reconstructRecording } from "@/lib/scoreSheetMapping";

export function useMatchRecording(matchId: string): {
  record: ScoreSheetState | undefined;
  isLoading: boolean;
} {
  const numericMatchId = Number(matchId);

  const setsQuery = useListSets(numericMatchId);
  const sets = setsQuery.data ?? [];
  // 跟 controller 一樣用 useQueries 對每個 set 各發一個 rallies 查詢（動態長度的清單，
  // 不能用固定數量的 useQuery 疊起來，違反 hooks 規則，所以用 useQueries）。
  const ralliesQueries = useQueries({
    queries: sets.map((s) => ({
      queryKey: getListRalliesQueryKey(s.id),
      queryFn: () => listRallies(s.id),
    })),
  });
  const eventsQuery = useListMatchEvents(numericMatchId);
  const subsQuery = useListMatchSubstitutions(numericMatchId);

  const setsReady = setsQuery.isSuccess;
  const ralliesReady = ralliesQueries.every((q) => q.isSuccess);
  const eventsReady = eventsQuery.isSuccess;
  const subsReady = subsQuery.isSuccess;
  const isLoading = !setsReady || !eventsReady || !subsReady || (sets.length > 0 && !ralliesReady);

  // 資料還沒到位時回傳 undefined，讓頁面顯示載入狀態，避免用半份資料重建出誤導性的統計。
  if (isLoading) {
    return { record: undefined, isLoading: true };
  }

  const ralliesBySetIndex = ralliesQueries.map((q) => q.data ?? []);
  const record = reconstructRecording(
    sets,
    ralliesBySetIndex,
    eventsQuery.data ?? [],
    subsQuery.data ?? [],
  );

  return { record, isLoading: false };
}
