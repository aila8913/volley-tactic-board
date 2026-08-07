import { RequestHandler } from "express";
import { readSession } from "../lib/session";

// 在 Express 的 Request 型別上擴充 userId 欄位。所有掛了 requireAuth 的路由都能安心讀
// req.userId，不用每次都判斷它是不是 undefined——這支 middleware 保證：能走到下一步的
// 請求，userId 一定有值；沒有值的請求會在這裡就被擋下（401），不會進到路由邏輯。
declare global {
  namespace Express {
    interface Request {
      userId: string;
    }
  }
}

// 開發環境的預設使用者：沒有真的登入過的本機開發流程照舊能動，不用每個人都先申請一組
// Google OAuth 憑證才能跑 `pnpm run dev`。這兩個常數的名字和值刻意跟 lib/db/src/seed-testdata.ts
// 手動抄的那份對齊（那邊有寫為什麼是抄的、不是 import 共用）。
export const MOCK_USER_ID = "mock-user-001";

// 第二個假使用者，只有種子資料會用到（見 lib/db/src/seed-testdata.ts）。存在的唯一理由：
// ownership 檢查防的是「A 拿得到 B 的資料嗎」，而只有一個使用者的時候這個情境根本擺不
// 出來——「查無此 id」和「這 id 不是你的」兩條路徑會長得一樣，測了也證明不了什麼。
export const OTHER_MOCK_USER_ID = "mock-user-002";

// 開發時可以用這個 header 假扮成另一個使用者，手動驗證跨使用者的擁有權檢查。
const MOCK_USER_HEADER = "x-mock-user-id";

// 開發環境沒有真 session 時要退回的假身分——抽成獨立函式而不是寫死在 requireAuth 裡面，
// 是因為 routes/auth.ts 的 GET /auth/me 也需要同一套邏輯。這兩個地方判斷「這個請求該
// 被當成誰」的規則必須完全一致：如果只有 requireAuth 有 dev fallback、/auth/me 沒有，
// 本機開發時 AuthGate 會永遠卡在「未登入」畫面（/auth/me 回 401）、但底下的 API 其實
// 都用 mock-user-001 正常運作——前端狀態跟後端狀態對不上，且使用者完全看不到 app。
export function resolveDevFallbackUserId(req: {
  header: (name: string) => string | undefined;
}): string | null {
  // ⚠️ 這道 gate 刻意寫成白名單（`=== "development"` 才放行），不是黑名單
  // （`!== "production"` 就放行）。差別不是風格問題：黑名單是在窮舉「我想得到的壞情況」，
  // 任何沒被想到的值都會預設放行。**這個選擇在 #225 當場就回本**——dev script 的
  // `cross-env NODE_ENV=development pnpm run build && pnpm run start` 因為 `&&` 讓
  // cross-env 的作用域只涵蓋 build，真正跑起來的 server 一直沒有 NODE_ENV。黑名單寫法
  // 會判定「不是 production」而正常運作，把這個身分冒用後門默默帶進正式環境；白名單則是
  // 直接失效、當場被測試抓到。
  // 同一套慣例也用在 lib/db/src/seed-testdata.ts 的 assertSafeDatabaseHost（#339）。
  if (process.env.NODE_ENV !== "development") return null;
  const override = req.header(MOCK_USER_HEADER);
  return override || MOCK_USER_ID;
}

// requireAuth 取代了 #26 PR1 之前的 mockAuth：兩者的角色一樣（往 req 上注入 userId），
// 但判斷「這個使用者是誰」的邏輯完全不同——mockAuth 一律回傳寫死的字串，requireAuth
// 讀的是 Google 登入後簽發的 session cookie（見 lib/session.ts）。
//
// 開發環境保留了舊 mockAuth 那一路當 fallback：`readSession` 讀不到有效 cookie 時，
// 如果是 NODE_ENV === "development" 就退回舊行為，本機開發不需要先申請 OAuth 憑證、
// 開瀏覽器走一次真登入才能測功能。正式環境沒有這條退路：讀不到合法 session 就是 401，
// 讓使用者被導去登入頁，而不是被靜靜地當成某個假帳號。
export const requireAuth: RequestHandler = (req, res, next) => {
  const session = readSession(req);
  if (session) {
    req.userId = session.userId;
    next();
    return;
  }

  const fallbackUserId = resolveDevFallbackUserId(req);
  if (fallbackUserId) {
    req.userId = fallbackUserId;
    next();
    return;
  }

  res.status(401).json({ error: "Not authenticated" });
};
