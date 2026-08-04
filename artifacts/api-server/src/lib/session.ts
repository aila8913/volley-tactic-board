import type { CookieOptions, Request, Response } from "express";

// Session 存放方式：簽章過的 cookie（signed cookie），不是伺服器端 session store
// （沒有 Redis、沒有 DB 裡的 sessions 表）。
//
// 為什麼選這個而不是伺服器端 session：這個 app 現在單一 Node 行程、沒有水平擴充的需求，
// 伺服器端 session 換來的好處（可以隨時把某個 session 強制作廢、不怕 cookie 被偷看內容）
// 目前都用不到，代價卻要多養一個 store（Redis）或多一張表。簽章 cookie 把「使用者是誰」
// 整包放在 cookie 裡，伺服器不用記任何東西，天生無狀態（stateless）、天生撐得住重啟/多副本。
//
// 「簽章」在防什麼：cookie 內容本身不是加密的，瀏覽器/使用者看得到（只是 base64）。
// 簽章只保證「這串內容沒有被竄改過」——cookie-parser 用 HMAC 對內容算一個雜湊值附在後面，
// 伺服器收到時重算一次比對，對不上就代表被改過，直接視為無效。所以絕對不能把密碼、
// API 金鑰這種真正敏感的東西放進 session payload——這裡放的 userId 是 Google 帳號的
// 公開識別碼（sub），洩漏出去頂多讓人知道「這串 cookie 屬於哪個 Google 帳號」，不是機密。
const SESSION_COOKIE = "session";

// CSRF（跨站請求偽造）防護用的一次性亂數，只在 OAuth 導向期間存在（見 routes/auth.ts）。
// 跟 session cookie 分開命名、分開簽章，是因為兩者生命週期完全不同：這個活不過一次登入
// 流程（幾十秒），session 要活好幾天。混在同一個 cookie 裡會讓「這個值什麼時候該清掉」
// 變得曖昧不清。
const STATE_COOKIE = "oauth_state";

export interface SessionPayload {
  userId: string;
  email: string;
  name: string;
}

function getCookieSecret(): string {
  const secret = process.env.COOKIE_SECRET;
  if (!secret) {
    // 跟 lib/db/src/index.ts 對 DATABASE_URL 的態度一致：寧可開機就炸得明明白白，
    // 也不要讓服務半殘地跑起來、等第一個要簽 cookie 的請求才發現沒有金鑰。
    throw new Error("COOKIE_SECRET must be set. Session cookies cannot be signed without it.");
  }
  return secret;
}

// production 環境的 cookie 一定要帶 secure（只在 HTTPS 連線送出）；
// 本機開發用 http://localhost，帶了 secure 瀏覽器會直接不儲存這個 cookie，開發者會
// 白白卡在「明明 code 邏輯正確、cookie 卻永遠設不上」——所以本機刻意不帶。
// app.ts 的 `trust proxy` 設定讓 Express 在正式環境正確判斷連線是不是真的走 HTTPS。
const isProduction = process.env.NODE_ENV === "production";

const BASE_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true, // JS 讀不到這個 cookie（document.cookie 看不見），擋掉 XSS 偷 session 的路徑
  secure: isProduction,
  // sameSite: "lax"——單一服務、前後端同源，本來就不需要 "none"（那是給跨站請求準備的，
  // 還要求一定得搭 secure）。"lax" 允許使用者從外部連結點進來時仍帶著 cookie（例如分享
  // 出去的比賽連結），但擋掉真正的跨站 POST 偽造請求，是這個情境的正確預設值。
  sameSite: "lax",
  path: "/",
  signed: true,
};

export function setSession(res: Response, payload: SessionPayload): void {
  res.cookie(SESSION_COOKIE, JSON.stringify(payload), {
    ...BASE_COOKIE_OPTIONS,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 天——比賽紀錄這種用途不需要每天重新登入
  });
}

export function clearSession(res: Response): void {
  res.clearCookie(SESSION_COOKIE, BASE_COOKIE_OPTIONS);
}

// 讀 session：cookie-parser 驗簽失敗時（內容被竄改、或用的是舊金鑰簽的）會把值放進
// req.cookies（未簽章那一包）並設成字串 "false"，而不是完全不給值——所以不能只判斷
// req.signedCookies.session 是不是 undefined，驗簽失敗時它就是 undefined，這裡的判斷式
// 已經涵蓋這個情況（undefined 直接 return null）。剩下要擋的是「有值但格式壞掉」
// （例如手動改過 cookie、或改版時 payload 形狀變了），用 try/catch 一併擋掉，
// 壞掉的 session 一律視為沒登入，不要讓一個解析錯誤變成 500。
export function readSession(req: Request): SessionPayload | null {
  const raw = req.signedCookies?.[SESSION_COOKIE];
  if (typeof raw !== "string") return null;

  try {
    const parsed = JSON.parse(raw) as Partial<SessionPayload>;
    if (typeof parsed.userId !== "string") return null;
    return {
      userId: parsed.userId,
      email: typeof parsed.email === "string" ? parsed.email : "",
      name: typeof parsed.name === "string" ? parsed.name : "",
    };
  } catch {
    return null;
  }
}

// state 的存活時間很短（OAuth 導向來回通常幾秒到一兩分鐘），5 分鐘給足使用者在 Google
// 那頭選帳號、輸入密碼的時間，又不會長到變成一個可被重放的長效 token。
const STATE_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  // "lax" 而非 "strict"：使用者是從我們的網站導去 accounts.google.com、再被導回
  // callback，這個回程請求在瀏覽器眼中是「從別的網域跳轉過來的頂層導覽」。"strict"
  // 在這種情境下會整個不送 cookie（比對不到 state，登入直接失敗）；"lax" 對「使用者主動
  // 點擊/被導覽產生的頂層 GET」放行，剛好是 OAuth 回呼這種情境要的行為。
  sameSite: "lax",
  path: "/api/auth",
  signed: true,
  maxAge: 5 * 60 * 1000,
};

export function setOAuthState(res: Response, state: string): void {
  res.cookie(STATE_COOKIE, state, STATE_COOKIE_OPTIONS);
}

export function readAndClearOAuthState(req: Request, res: Response): string | null {
  const raw = req.signedCookies?.[STATE_COOKIE];
  res.clearCookie(STATE_COOKIE, STATE_COOKIE_OPTIONS);
  return typeof raw === "string" ? raw : null;
}

// 兩個 cookie 的簽章都要用同一把金鑰，統一在這裡讀取，app.ts 掛 cookie-parser 時也用它。
export { getCookieSecret };
