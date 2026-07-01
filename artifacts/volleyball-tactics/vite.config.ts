import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

// 本機開發預設 5173；Replit / 正式環境透過 PORT env var 覆蓋。
const rawPort = process.env.PORT ?? "5173";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// 本機開發預設 "/"；部署到子路徑時透過 BASE_PATH env var 覆蓋。
// 注意：Git for Windows 會把 BASE_PATH 設成 "/Program Files/Git/"（安裝路徑），
// 這個值包含空格，不是合法的 URL base path。
// 用簡單規則過濾：合法的 web base path 不會含有空格。
const rawBasePath = process.env.BASE_PATH;
const basePath = rawBasePath && !rawBasePath.includes(" ") ? rawBasePath : "/";

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" && process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) => m.devBanner()),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    // SPA 的所有頁面路由（/matches/:id/board 等）都在前端由 wouter 處理，
    // 但直接在瀏覽器重新整理時，瀏覽器會向 Vite dev server 發請求，
    // server 不知道這些路由，會回 404。historyApiFallback 讓 server 把
    // 所有「找不到檔案」的請求都改回傳 index.html，讓前端路由接手。
    historyApiFallback: true,
    fs: {
      strict: true,
    },
    // /api/* を API server に転送（CORS・cookie の設定不要になる）
    proxy: {
      "/api": {
        target: `http://localhost:${process.env.API_PORT ?? 3000}`,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
