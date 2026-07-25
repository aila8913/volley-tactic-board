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
    // 尚未拿到資料時給空陣列，讓呼叫端不用另外判斷 undefined。
    summaries: data ?? [],
    isLoading,
    isError,
  };
}
