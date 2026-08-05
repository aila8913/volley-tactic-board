import { defineConfig } from "vitest/config";

// 仿照 artifacts/volleyball-tactics/vitest.config.ts，但這裡不需要那份設定裡的
// @vitejs/plugin-react（api-server 是純後端，沒有任何 .tsx / JSX 檔案）、也不需要
// jsdom 環境（沒有 DOM/瀏覽器全域物件可用，也用不到）——改用 "node"，貼近正式執行環境
// （這支後端本來就是跑在 Node.js 上的 Express 服務）。
export default defineConfig({
  test: {
    environment: "node",
  },
});
