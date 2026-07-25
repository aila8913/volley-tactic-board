// 分析頁「各輪次得失分」的資料存取層（#65 M2）。純讀取、不碰任何全域 store，
// 跟 MatchAnalytics.tsx 開頭註解說的一樣：這一頁是唯讀頁，避免意外污染正在進行中
// 的計分表快取（#115/#117 的教訓）。
//
// 這裡只是薄薄包一層 codegen 產生的 useGetMatchRotationStats（見
// lib/api-client-react，operationId 對應 openapi.yaml 的 getMatchRotationStats），
// 讓呼叫端不用知道底層 hook 叫什麼名字，也方便之後要加轉換邏輯時有地方放。
import { useGetMatchRotationStats } from "@workspace/api-client-react";

export function useMatchRotationStats(matchId: number) {
  const { data, isLoading, isError } = useGetMatchRotationStats(matchId);
  return {
    // 尚未拿到資料時給空陣列，讓呼叫端不用另外判斷 undefined。
    rotationStats: data ?? [],
    isLoading,
    isError,
  };
}
