import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";

// 互動測試共用的「把元件放進它在正式 app 裡本來就有的外殼」helper（issue #168）。
//
// 為什麼需要這個而不是直接 render(<元件 />)：這個 app 的元件普遍假設身處兩個 context 之中，
// 缺了任何一個都不是「測試少測到東西」，而是**直接 throw**：
//   - React Query 的 QueryClientProvider：任何用到 generated hook（useListTactics、
//     useMatchList…）的元件，沒有 provider 會丟「No QueryClient set」。
//   - wouter 的 Router：<Link> 與 useLocation 需要一個 location 來源。正式 app 用的是
//     瀏覽器網址列，測試裡用 memoryLocation（wouter 內建的記憶體版路由）——它不碰
//     jsdom 的 history，導覽結果變成一個可以直接讀的值（見下面回傳的 history/location）。
//
// 回傳值把 testing-library 的 render 結果整包攤平之外，多給兩樣東西：
//   - `location()`：現在在哪一頁。用來驗「點了這顆按鈕之後有沒有導去戰術板頁」這種行為，
//     比 spy 掉 useLocation 誠實——我們驗的是**真的發生了導覽**，不是「某個 mock 被呼叫」。
//   - `history`：走過的每一站。有些行為要驗的是「**不應該**發生導覽」（例如按取消），
//     只看最終 location 有可能被「導去又導回來」蒙混過去，看完整軌跡才擋得住。
export function renderWithProviders(ui: ReactNode, options?: { initialPath?: string }) {
  // retry: false 很重要：測試裡的 query 十之八九是被 mock 掉或直接失敗的，預設的 3 次
  // 重試會讓每個測試多等好幾秒、失敗訊息還被重試蓋掉。
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const { hook, history } = memoryLocation({
    path: options?.initialPath ?? "/",
    record: true,
  });

  const result = render(
    <QueryClientProvider client={queryClient}>
      <Router hook={hook}>{ui}</Router>
    </QueryClientProvider>,
  );

  return {
    ...result,
    queryClient,
    history,
    location: () => history[history.length - 1],
  };
}
