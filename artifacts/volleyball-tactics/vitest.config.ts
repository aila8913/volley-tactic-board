import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
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
