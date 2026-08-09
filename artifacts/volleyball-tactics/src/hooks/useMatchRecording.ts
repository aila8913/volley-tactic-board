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
  useListMatchLineups,
  listRallies,
  getListRalliesQueryKey,
} from "@workspace/api-client-react";
import type { Rally } from "@workspace/api-client-react";
import { ScoreSheetState } from "@/types/scoresheet";
import { reconstructRecording } from "@/lib/scoreSheetMapping";

export function useMatchRecording(
  matchId: string,
  // 這場比賽是不是已完賽（#218，來自 matches.status）。這支 hook 自己不抓 match（它只負責
  // 「記錄內容」那幾支 query），所以由呼叫端把已經拿到的 match 換算成布林傳進來——分析頁
  // 本來就用 useMatchWithRoster 拿了 match，不需要在這裡重複抓一次。
  // 預設 false＝比賽進行中，也就是維持原本的重建行為（理由見 splitCompletedAndCurrent）。
  isFinished = false,
): {
  record: ScoreSheetState | undefined;
  // 額外把「每一局的原始 rally 陣列」也交給呼叫端（key＝setNumber），跟 allRallies（整場攤平）
  // 一起用來算「各輪次得失分」——分析頁要能依局篩選那份統計（#65），而 record 重建時已經把
  // 每分的輪次資訊丟掉了（PointRecord 不存輪次），所以這裡直接把 rallies 原封不動遞出去，
  // 讓頁面用 buildRotationStats 自己算（見 MatchAnalytics.tsx 的用法）。
  ralliesBySetNumber: Map<number, Rally[]>;
  allRallies: Rally[];
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
  // 各局的先發快照（#349 Bug B）。這支 hook 原本不抓它，因為分析頁剛做出來時確實用不到；
  // 但 #193 之後分析頁右欄長出了「場上站位」，而那個面板讀的正是這裡重建出來的 record，
  // 沒抓就等於每一局的 lineup 永遠是 null——面板從加上去那天起就是空的，而且不會噴錯，
  // 因為 reconstructRecording 的 lineups 參數有預設值 []。
  const lineupsQuery = useListMatchLineups(numericMatchId);

  const setsReady = setsQuery.isSuccess;
  const ralliesReady = ralliesQueries.every((q) => q.isSuccess);
  const eventsReady = eventsQuery.isSuccess;
  const subsReady = subsQuery.isSuccess;
  // lineups 也要進閘門：少了它就會先用「每局都沒先發」重建一次，畫面閃一下空球場再補上。
  const lineupsReady = lineupsQuery.isSuccess;
  const isLoading =
    !setsReady || !eventsReady || !subsReady || !lineupsReady || (sets.length > 0 && !ralliesReady);

  // 資料還沒到位時回傳 undefined，讓頁面顯示載入狀態，避免用半份資料重建出誤導性的統計。
  if (isLoading) {
    return {
      record: undefined,
      ralliesBySetNumber: new Map(),
      allRallies: [],
      isLoading: true,
    };
  }

  const ralliesBySetIndex = ralliesQueries.map((q) => q.data ?? []);
  const record = reconstructRecording(
    sets,
    ralliesBySetIndex,
    eventsQuery.data ?? [],
    subsQuery.data ?? [],
    lineupsQuery.data ?? [],
    // timeouts 這支唯讀 hook 仍然不抓：分析頁目前沒有任何地方顯示暫停（「暫停統計」是可以
    // 做的東西，但那是另一件事，要做的時候再照 lineups 這樣補一支 query）。沿用預設的空陣列，
    // 但因為 isFinished 是第 7 個參數，這個位置要明確寫出來。
    // 這裡刻意不順手把 timeouts 也抓進來——多一支 query 就是分析頁每次進頁都多打一次 API，
    // 為了一個沒人在看的欄位付這個成本不划算。
    [],
    isFinished,
  );

  // sets 跟 ralliesBySetIndex 是「同索引對齊」的（見上方 useQueries）。把它整理成
  // 「setNumber → 該局 rallies」的 Map，讓頁面用 setNumber（使用者選的局）直接查得到；
  // allRallies 則是整場攤平，給「全場」範圍算輪次統計用。
  const ralliesBySetNumber = new Map<number, Rally[]>(
    sets.map((s, i) => [s.setNumber, ralliesBySetIndex[i] ?? []]),
  );
  const allRallies = ralliesBySetIndex.flat();

  return { record, ralliesBySetNumber, allRallies, isLoading: false };
}
