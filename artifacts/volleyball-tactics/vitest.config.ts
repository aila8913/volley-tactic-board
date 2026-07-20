import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  // vite.config.ts（實際跑起來的 app）掛了 @vitejs/plugin-react，讓 .tsx 檔可以用
  // React 19 的「automatic JSX runtime」（不用手動 import React 就能寫 JSX，JSX
  // 會被編成 `jsx(...)` 呼叫並自動補上 import）。vitest 是獨立的測試 runner，有自己
  // 的一套 esbuild 轉譯設定，不會自動沿用 vite.config.ts 的 plugins——以前這裡沒掛
  // react()，純函式測試（lib/、hooks/）用不到 JSX 所以一直沒發現；這次（issue #120）
  // 第一次寫「渲染 React 元件」的測試（CourtReadOnlyView.test.tsx）才踩到：沒有這個
  // plugin，JSX 會被編成舊式的 `React.createElement(...)`，執行期就會噴
  // 「ReferenceError: React is not defined」。掛上 react() 之後，測試檔跟被測元件檔
  // 都能用跟正式建置一致的 automatic JSX runtime。
  plugins: [react()],
  test: {
    // 用 jsdom 模擬瀏覽器環境，讓需要 DOM/瀏覽器全域物件的測試（React 元件、還在用
    // localStorage 的 store 如 useScoreSheet）能跑。純函式測試不依賴它，但統一用 jsdom 最省事。
    environment: "jsdom",
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
});
