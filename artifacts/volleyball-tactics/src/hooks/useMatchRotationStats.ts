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
    // 一律回陣列，讓呼叫端可以直接 .map 不用防呆。這裡刻意用 Array.isArray 而不是
    // `data ?? []`：後者只擋 null/undefined，擋不掉「拿到的不是陣列」。實際踩過的坑是
    // ——當 api-server 沒重啟（沒有熱重載，dev 是 build 一次就跑）、這支新 endpoint 還沒
    // 掛上時，請求會掉進後端的 SPA fallback 回一頁 index.html（200 + text/html），
    // customFetch 依 content-type 自動判成文字、就把整頁 HTML 當字串塞進 data。字串沒有
    // .map，頁面就白屏噴 "rotationStats.map is not a function"。用 Array.isArray 兜底，
    // 這種「後端回了非預期東西」的情況會退成空狀態，而不是整頁崩掉。
    rotationStats: Array.isArray(data) ? data : [],
    isLoading,
    isError,
  };
}
