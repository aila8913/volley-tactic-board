import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    // useMatches.ts/useTournaments.ts 用 zustand 的 persist middleware 讀寫 localStorage，
    // 這個全域物件在 vitest 預設的 node 環境裡不存在，要用 jsdom 模擬瀏覽器環境才有。
    environment: "jsdom",
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
});
