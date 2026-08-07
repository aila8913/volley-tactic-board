// 分析頁「視圖③：球員跨場/跨隊分析」的資料存取層（#213）。純讀取、不碰任何全域 store——
// 跟 useCrossMatchAnalysis.ts 是同一套理由（見該檔開頭註解）：這種唯讀彙總頁不該
// 意外污染正在進行中的計分表 optimistic 快取（#115/#117 的教訓）。
//
// 這裡只是薄薄包一層 codegen 產生的 useGetPersonAnalysis（見 lib/api-client-react，
// operationId 對應 openapi.yaml 的 getPersonAnalysis），讓呼叫端不用知道底層 hook
// 叫什麼名字，也方便之後要加轉換邏輯時有地方放。
//
// enabled 參數：這頁要先讓使用者從下拉選單挑一個人，選了才發請求——personId 是
// undefined 時就不該打 /analysis/people/undefined。用 codegen hook 的第二個參數
// （query options）把 enabled 傳下去，React Query 就不會在 personId 還沒選好時發請求。
import { useGetPersonAnalysis, getGetPersonAnalysisQueryKey } from "@workspace/api-client-react";

export function usePersonAnalysis(personId: number | undefined) {
  const { data, isLoading, isError } = useGetPersonAnalysis(personId ?? 0, {
    // queryKey 要顯式帶上（跟 useMatches.ts 的 useGetMatch 是同一套寫法）：codegen 產生的
    // query options 型別在這個版本要求 queryKey 必填，不能只傳 enabled 就算了——顯式帶上
    // 用真正的 personId 算出來的 key，也確保 personId 還沒選定時（傳 0 頂著）不會跟
    // 「id=0 的 person」的快取意外撞在一起。
    query: {
      enabled: personId !== undefined,
      queryKey: getGetPersonAnalysisQueryKey(personId ?? 0),
    },
  });

  return {
    // 後端回的是單一物件（不是陣列），所以防呆邏輯跟 useCrossMatchAnalysis
    // 的「用 Array.isArray 擋非陣列」不同：這裡改成檢查
    // 「拿到的東西是不是一個有 personId 欄位的物件」。理由一樣——api-server 若還沒重啟、
    // 這支新 endpoint 還沒掛上時，請求會掉進 SPA fallback 回一頁 index.html（200 +
    // text/html），customFetch 依 content-type 判成文字塞進 data，此時 data 會是字串，
    // 不是我們預期的物件形狀，若不擋、後面 analysis.teamBreakdown.map 之類的存取就會
    // 直接噴錯把整頁弄崩，而不是乾淨地退成「載入失敗/空狀態」。
    analysis:
      data && typeof data === "object" && "personId" in data && !Array.isArray(data)
        ? data
        : undefined,
    isLoading,
    isError,
  };
}
