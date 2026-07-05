import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import router from "./routes";
import { errorHandler } from "./middleware/errorHandler";
import { logger } from "./lib/logger";

// import.meta.dirname は Node 21.2+ の ESM 専用のグローバル。
// ESM の __dirname 相当。
const FRONTEND_DIST = path.resolve(import.meta.dirname, "../../volleyball-tactics/dist/public");

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API routes — 先掛，讓 /api/* 不被下面的靜態中介軟體攔截
app.use("/api", router);

// 靜態檔案：前端打包後的 dist/public（JS/CSS/assets）
app.use(express.static(FRONTEND_DIST));

// SPA fallback：所有剩下的 GET 請求都回傳 index.html，
// 讓 wouter 在前端接手路由（/matches/:id/board 重整頁面就是靠這個）。
// 如果前端還沒 build，回傳提示訊息而不是靜默 500。
// Express 5 + path-to-regexp v8 不允許裸露的 `*`，需要具名萬用字元 `/{*path}`。
app.get("/{*path}", (req: Request, res: Response) => {
  res.sendFile(path.join(FRONTEND_DIST, "index.html"), (err) => {
    if (err) {
      logger.warn({ path: req.path }, "Frontend not built — run `pnpm run build` first");
      res.status(404).json({
        error:
          "Frontend not found. In development use the Vite dev server; in production run `pnpm run build` first.",
      });
    }
  });
});

// 錯誤處理中介層一定要掛在最後（所有路由之後）：Express 靠「4 個參數 + 註冊在最後」
// 來認出這是收尾的錯誤處理器，路由裡冒泡上來的錯誤（含 zod 驗證失敗）都會轉交給它。
app.use(errorHandler);

export default app;
