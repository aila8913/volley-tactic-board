// 分析頁「視圖②：跨場彙總」的資料存取層（#65 M2）。純讀取、不碰任何全域 store——
// 跟 useMatchRotationStats.ts 是同一套理由（見該檔開頭註解）：這種唯讀彙總頁不該
// 意外污染正在進行中的計分表 optimistic 快取（#115/#117 的教訓）。
//
// 這裡只是薄薄包一層 codegen 產生的 useListMatchAnalysis（見 lib/api-client-react，
// operationId 對應 openapi.yaml 的 listMatchAnalysis），讓呼叫端不用知道底層 hook
// 叫什麼名字，也方便之後要加轉換邏輯時有地方放。
import { useListMatchAnalysis } from "@workspace/api-client-react";

export function useCrossMatchAnalysis() {
  const { data, isLoading, isError } = useListMatchAnalysis();
  return {
    // 一律回陣列（跟 useMatchRotationStats 同一套理由，見該檔註解）：用 Array.isArray
    // 而不是 `data ?? []`，才擋得掉「後端回了非陣列」——例如 api-server 沒重啟、endpoint
    // 還沒掛上時掉進 SPA fallback 回 HTML 字串的情況，避免 summaries.map 白屏崩潰。
    summaries: Array.isArray(data) ? data : [],
    isLoading,
    isError,
  };
}
