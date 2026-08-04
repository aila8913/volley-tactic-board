import express, { type Express, type Request, type Response } from "express";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import path from "path";
import router from "./routes";
import { errorHandler } from "./middleware/errorHandler";
import { logger } from "./lib/logger";
import { getCookieSecret } from "./lib/session";

// import.meta.dirname は Node 21.2+ の ESM 専用のグローバル。
// ESM の __dirname 相当。
const FRONTEND_DIST = path.resolve(import.meta.dirname, "../../volleyball-tactics/dist/public");

const app: Express = express();

// 雲端平台（Render 等）不會讓外界直接連到我們的 Node 行程——中間隔著一層它自己的
// 反向代理（reverse proxy）。代理負責 HTTPS，然後用普通 HTTP 把請求轉進來。
// 對 Express 來說，這造成兩個「它看到的」跟「事實」不符：
//   - req.ip 會是代理的內網 IP，不是真正使用者的 IP（log 因此全是同一個位址）
//   - req.protocol 會是 "http"，即使使用者其實是走 HTTPS 連進來的
//
// 真正的資訊被代理放在 X-Forwarded-For / X-Forwarded-Proto 這兩個 header 裡，
// 而 Express 預設**不信任**它們——這是對的預設值，因為 header 是誰都能偽造的東西，
// 在沒有代理的環境下相信它等於讓任何人自稱來自任何 IP。
//
// `trust proxy` 就是告訴 Express「我確實在代理後面，可以信這些 header」。數字 1 的意思是
// 「只信最靠近我的那一層」，而不是無條件全信（`true`）——中間只有 Render 一層代理，
// 多信的每一層都是多一個可被偽造的環節。
//
// 這行現在影響的是 log 的正確性，但接上 OAuth（#26 PR2）之後會變成安全相關：
// 帶 `secure` 旗標的 cookie 只在 Express 認為連線是 HTTPS 時才會被送出，
// 少了這行，正式環境的登入 cookie 會安靜地發不出去。
app.set("trust proxy", 1);

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
// cookie-parser(secret) 除了把 Cookie header 解析成 req.cookies，帶了 secret 之後還會
// 額外驗證簽章過的 cookie，通過的放進 req.signedCookies（lib/session.ts 讀的就是這包）。
// getCookieSecret() 在這裡就會執行——沒設 COOKIE_SECRET 的話，服務開機時就直接炸掉，
// 不會等到第一個要簽 cookie 的請求進來才發現，跟 lib/db/src/index.ts 對 DATABASE_URL
// 的態度一致：寧可啟動失敗得明明白白。
app.use(cookieParser(getCookieSecret()));

// 這裡不再掛 cors()：#26 PR1 之後前後端是同一個 origin（同一個 Express 行程同時吐 API
// 跟前端靜態檔），瀏覽器的同源請求本來就不受 CORS 限制，開著它只是多一個攻擊面——
// 一個全開的 cors() 等於告訴瀏覽器「任何網域都可以帶著憑證打這支 API」，接上 session
// cookie 之後這個洞從「讀得到本來就公開的資料」升級成「能代替使用者操作」，必須收掉。
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
