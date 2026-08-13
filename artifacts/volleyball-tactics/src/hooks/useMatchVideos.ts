// 一場比賽的影片段落（#391，表是 #390 開的）。跟 useTeams.ts / useTournaments.ts 同一套
// 「API adapter」模式：底層用 @workspace/api-client-react 生成的 React Query hooks 打後端，
// 對外給元件一個乾淨的讀＋寫介面，元件不用知道 queryKey、invalidate 這些細節。
import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListMatchVideos,
  useCreateMatchVideo,
  useDeleteMatchVideo,
  getListMatchVideosQueryKey,
} from "@workspace/api-client-react";
import type { MatchVideo } from "@workspace/api-client-react";

// 這一輪 UI 只支援掛一段影片（#391 明文範圍）。表跟 API 從第一天就是「一場多段」
//（sequence 欄位、GET 回陣列），所以之後要做多段管理不用搬資料、也不用改後端——
// 差別只在這個檔案要多一支「新增第 N 段」而已。這個常數就是「現在只用第一段」這件事
// 的唯一出處，之後刪掉它就等於解除限制。
const SINGLE_SEGMENT_SEQUENCE = 1;

export function useMatchVideos(matchId: number | null) {
  const queryClient = useQueryClient();

  // matchId 為 null（路由參數還沒到手）時傳佔位值 0 並關掉查詢，做法與理由見
  // useTeams.ts 的 useTeamRosterSuggestions——生成的 hook 簽章要求 number，
  // 「還不知道要查哪一場」這件事只能靠 enabled 表達。
  const { data, isLoading, isError } = useListMatchVideos(matchId ?? 0, {
    query: {
      enabled: matchId != null,
      queryKey: getListMatchVideosQueryKey(matchId ?? 0),
    },
  });

  // Array.isArray 而不是 `data ?? []`：後端 endpoint 沒掛上時會掉進 SPA fallback 回一整份
  // HTML 字串，`?? []` 擋不掉，會一路傳到 .map(...) 才炸成難查的白屏（#213 踩過，
  // 見 usePeople.ts 的同一段註解）。
  const videos: MatchVideo[] = Array.isArray(data) ? data : [];

  const createVideo = useCreateMatchVideo();
  const deleteVideo = useDeleteMatchVideo();

  const invalidate = useCallback(() => {
    if (matchId == null) return;
    queryClient.invalidateQueries({ queryKey: getListMatchVideosQueryKey(matchId) });
  }, [queryClient, matchId]);

  // 掛上這場比賽的影片。回傳 Promise 讓呼叫端能 await 完再收掉輸入框。
  const attachVideo = useCallback(
    async (url: string) => {
      if (matchId == null) return;
      await createVideo.mutateAsync({
        matchId,
        data: { url, sequence: SINGLE_SEGMENT_SEQUENCE },
      });
      invalidate();
    },
    [matchId, createVideo, invalidate],
  );

  // 拿掉影片（多半是網址貼錯）。後端的 rallies.videoId 是 onDelete: "set null"，
  // 所以錨在這段影片上的球不會跟著消失，只是失去錨點——比賽資料比影片連結重要得多。
  const detachVideo = useCallback(
    async (videoId: string) => {
      await deleteVideo.mutateAsync({ videoId });
      invalidate();
    },
    [deleteVideo, invalidate],
  );

  return {
    // 這一輪只有一段，所以直接把「那一段」端出來，元件不用自己去挑陣列的第 0 個
    //（挑法散在元件裡的話，之後要改成多段就得回頭找所有挑法）。
    video: videos[0] ?? null,
    videos,
    isLoading,
    isError,
    attachVideo,
    detachVideo,
    // 寫入進行中：給輸入框反灰用，避免使用者連按兩次貼出兩段。
    isSaving: createVideo.isPending || deleteVideo.isPending,
  };
}
