import { OAuth2Client } from "google-auth-library";

// google-auth-library 是 Google 官方維護的 OAuth client——選它而不是自己手刻「跟 Google
// 換 token、驗 id_token 簽章」這兩件事，理由是安全考量：id_token 是一個 JWT，驗證它
// 需要拿 Google 公開金鑰（會定期輪替）驗簽章、檢查 audience/issuer/過期時間，這些步驟
// 任何一步漏掉都是可以被偽造身分的洞。這個套件把這整套邏輯包好、隨 Google 金鑰輪替
// 自動更新，自己重寫不會比較安全，只會比較容易出錯。
//
// 這裡刻意包成一個小函式而不是在 routes/auth.ts 裡直接 `new OAuth2Client(...)`：
// 三個環境變數要不要有值只在啟動時該檢查一次，而不是每次收到請求才發現忘了設。
let client: OAuth2Client | null = null;

function getClient(): OAuth2Client {
  if (client) return client;

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI must all be set to use Google OAuth.",
    );
  }

  client = new OAuth2Client({ clientId, clientSecret, redirectUri });
  return client;
}

// 產生「去 Google 登入」的網址。state 是呼叫端（routes/auth.ts）產生的一次性亂數，
// 用來防 CSRF——見 lib/session.ts 對 oauth_state cookie 的說明。
export function buildGoogleAuthUrl(state: string): string {
  return getClient().generateAuthUrl({
    // "online" 而不是 "offline"：offline 會多要一個 refresh_token，是給「伺服器要在使用者
    // 不在場時，代表使用者持續存取 Google API」這種情境用的（例如背景同步 Google
    // Calendar）。這個 app 只是借 Google 登入來確認「你是誰」，登入當下驗一次身分就夠，
    // 不需要長期代表使用者做任何事，要 refresh_token 只是白白多一份要保護的憑證。
    access_type: "online",
    scope: ["openid", "email", "profile"],
    state,
    // prompt: "select_account" 讓使用者每次都看得到帳號選擇畫面，而不是自動用瀏覽器裡
    // 上次登入的那個帳號悄悄登進來——這個 app 的帳號模型是「一人可能有多個 Google 帳號
    // 分開記錄不同球隊」，讓選擇畫面每次都出現，使用者才不會登錯帳號而不自知。
    prompt: "select_account",
  });
}

export interface GoogleIdentity {
  sub: string;
  email: string;
  name: string;
}

// 用授權碼（code）跟 Google 換 token，再驗證裡面的 id_token，回傳驗證過的身分資訊。
// 這兩步（換 token、驗簽）都可能因為各種原因失敗（code 過期、被重放、網路問題），
// 呼叫端（routes/auth.ts）用 try/catch 包起來，失敗就導去登入失敗頁，不讓錯誤直接
// 冒泡成 500——那會把「Google 回應了什麼」洩漏在錯誤訊息裡。
export async function exchangeCodeForIdentity(code: string): Promise<GoogleIdentity> {
  const oauthClient = getClient();
  const { tokens } = await oauthClient.getToken(code);

  if (!tokens.id_token) {
    throw new Error("Google token response did not include an id_token.");
  }

  const ticket = await oauthClient.verifyIdToken({
    idToken: tokens.id_token,
    audience: process.env.GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();
  if (!payload || !payload.sub || !payload.email) {
    throw new Error("Google id_token payload is missing required claims (sub/email).");
  }

  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name ?? payload.email,
  };
}
