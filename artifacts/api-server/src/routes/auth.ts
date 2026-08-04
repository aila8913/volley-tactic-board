import { Router, type IRouter } from "express";
import { randomBytes } from "node:crypto";
import { buildGoogleAuthUrl, exchangeCodeForIdentity } from "../lib/googleAuth";
import {
  setSession,
  clearSession,
  readSession,
  setOAuthState,
  readAndClearOAuthState,
} from "../lib/session";
import { logger } from "../lib/logger";
import { resolveDevFallbackUserId } from "../middleware/requireAuth";

// 這支檔案掛在 /api/auth 底下，是整個 app 唯一「刻意不掛 requireAuth」的一群路由——
// 道理很直接：使用者連身分都還沒建立，當然不能要求他先證明自己是誰。GET /me 例外一點，
// 它自己內部判斷有沒有 session，而不是靠 middleware 統一擋，因為「沒登入」對這支路由
// 是合法答案（回 401 讓前端知道要顯示登入畫面），不是錯誤。
const router: IRouter = Router();

// 開始登入：導去 Google 的帳號選擇/同意畫面。
//
// 這支不是前端用 fetch 呼叫的 JSON API（所以刻意沒有寫進 openapi.yaml）——它是給瀏覽器
// 直接導覽用的，前端只要 `location.href = "/api/auth/google"` 或做成一個 <a href>，
// 讓瀏覽器自己走完整段跳轉。混進 JSON API 契約反而會誤導：這支的「回應」不是一包 JSON，
// 是一次 302 導向。
router.get("/auth/google", (_req, res) => {
  // state 是一次性亂數，等一下 callback 那支會要求收到的 state 跟這裡存的完全一致，
  // 不一致就代表這不是我們自己發起的登入流程（可能是別人偽造連結誘導使用者點擊），
  // 直接拒絕——這是 OAuth 規格定義的標準 CSRF 防護手法，不是這個專案自創的。
  const state = randomBytes(32).toString("hex");
  setOAuthState(res, state);
  res.redirect(buildGoogleAuthUrl(state));
});

// Google 登入完成後導回這裡（Google Cloud Console 設定的 redirect URI 就是這支路徑）。
router.get("/auth/google/callback", async (req, res) => {
  const { code, state, error } = req.query;

  if (typeof error === "string") {
    // 使用者在 Google 的畫面上按了「取消」，這不是程式錯誤，只是登入沒完成。
    logger.info({ error }, "Google OAuth flow was cancelled or denied");
    res.redirect("/?auth_error=cancelled");
    return;
  }

  const expectedState = readAndClearOAuthState(req, res);
  if (typeof state !== "string" || !expectedState || state !== expectedState) {
    logger.warn("Google OAuth callback state mismatch — possible CSRF attempt or expired flow");
    res.redirect("/?auth_error=state_mismatch");
    return;
  }

  if (typeof code !== "string") {
    res.redirect("/?auth_error=missing_code");
    return;
  }

  try {
    const identity = await exchangeCodeForIdentity(code);
    setSession(res, { userId: identity.sub, email: identity.email, name: identity.name });
    res.redirect("/");
  } catch (err) {
    // 換 token／驗簽失敗（過期的 code、網路問題、Google 那邊出狀況）：導回首頁並帶錯誤
    // 旗標，不要把底層錯誤細節（可能含 Google API 回應內容）直接回給瀏覽器。
    logger.error({ err }, "Failed to exchange Google OAuth code for identity");
    res.redirect("/?auth_error=exchange_failed");
  }
});

// 目前登入者是誰。前端開頁時打這支決定要顯示登入畫面還是正常畫面——刻意設計成
// 「沒登入回 401」而不是「回 200 + user: null」：401 讓 fetch 呼叫端能用同一套錯誤處理
// 邏輯（catch ApiError, status === 401）判斷未登入，不用額外檢查回應內容的形狀。
//
// 開發環境要退回跟 requireAuth 完全一致的假身分（resolveDevFallbackUserId）：這支路由
// 沒掛 requireAuth（見檔案開頭說明），如果只在 requireAuth 裡處理 dev fallback、這裡
// 沒有，本機開發時這支永遠回 401，AuthGate 會永遠卡在登入畫面——即使底下所有真正的
// API 都已經在用 mock-user-001 正常運作，前端也看不到，等於本機開發整個打不開。
router.get("/auth/me", (req, res) => {
  const session = readSession(req);
  if (session) {
    res.json({ userId: session.userId, email: session.email, name: session.name });
    return;
  }

  const fallbackUserId = resolveDevFallbackUserId(req);
  if (fallbackUserId) {
    res.json({ userId: fallbackUserId, email: "", name: "本機開發帳號" });
    return;
  }

  res.status(401).json({ error: "Not authenticated" });
});

router.post("/auth/logout", (_req, res) => {
  clearSession(res);
  res.status(204).end();
});

export default router;
