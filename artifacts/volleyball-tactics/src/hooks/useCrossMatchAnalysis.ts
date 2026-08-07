// 分析頁「視圖②：跨場彙總」的資料存取層（#65 M2）。純讀取、不碰任何全域 store——
// 這種唯讀彙總頁不該意外污染正在進行中的計分表 optimistic 快取（#115/#117 的教訓）。
//
// 這裡只是薄薄包一層 codegen 產生的 useListMatchAnalysis（見 lib/api-client-react，
// operationId 對應 openapi.yaml 的 listMatchAnalysis），讓呼叫端不用知道底層 hook
// 叫什麼名字，也方便之後要加轉換邏輯時有地方放。
//
// （這份「唯讀彙總頁的資料存取層」寫法本來還有一個姊妹檔 useMatchRotationStats.ts，
// #229 時因為零呼叫端被刪掉了；這裡是現存的「範本」，usePersonAnalysis.ts 也依樣畫葫蘆。）
import { useListMatchAnalysis } from "@workspace/api-client-react";

export function useCrossMatchAnalysis() {
  const { data, isLoading, isError } = useListMatchAnalysis();
  return {
    // 一律回陣列：用 Array.isArray 而不是 `data ?? []`，才擋得掉「後端回了非陣列」——
    // 例如 api-server 沒重啟（dev 是 build 一次就跑、沒有熱重載）、這支新 endpoint 還沒
    // 掛上時，請求會掉進後端 SPA fallback 回一頁 index.html（200 + text/html），
    // customFetch 依 content-type 自動判成文字、就把整頁 HTML 當字串塞進 data。字串沒有
    // .map，頁面就白屏噴「summaries.map is not a function」；用 Array.isArray 兜底，
    // 這種「後端回了非預期東西」的情況會退成空狀態，而不是整頁崩掉。
    summaries: Array.isArray(data) ? data : [],
    isLoading,
    isError,
  };
}
