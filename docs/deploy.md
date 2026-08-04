# 部署手冊（issue #26）

把這個 app 放到一個「隨時連得到的公開網址」上，讓試用者自己找時間開來用。

---

## 部署形態：一個服務，不是兩個

最容易被誤導的一點：這個 repo **不需要**把前端和後端分開部署。

`artifacts/api-server/src/app.ts` 裡已經有這兩段：

```ts
app.use("/api", router); // API 先掛
app.use(express.static(FRONTEND_DIST)); // 再吐前端打包好的靜態檔
app.get("/{*path}", ...); // 剩下的全部回 index.html，交給 wouter 接手路由
```

也就是同一個 Express 行程既是 API 也是網頁伺服器。這帶來三個直接好處：

1. **`/api` 這個相對路徑不用改。** 生成的 API client（`lib/api-spec/orval.config.ts` 的
   `baseUrl: "/api"`）預設後端跟前端同一個 origin。如果前端上 Vercel、後端上 Render，
   這個假設會破掉，就得二選一：在 Vercel 設 rewrite 轉發，或改成環境變數 + 後端開 CORS。
   單一服務讓這題整個消失。
2. **沒有跨站 cookie 問題。** 接 Google 登入（PR2）之後，session cookie 只在同一個 origin
   底下進出，不用碰 `SameSite=None` / `Secure` / 第三方 cookie 封鎖那一串。
3. **少一個平台要顧。** 一份設定、一個 log、一個網址。

代價是前端不會被放到 CDN 邊緣節點，靜態檔要從新加坡機房拉。以現在的規模（前端 bundle 約
660 kB / gzip 204 kB）完全可以接受。

```
                   ┌─────────────────────────────┐
  瀏覽器 ──HTTPS──▶│ Render Web Service          │
                   │  Express                    │──▶ Neon Postgres
                   │   /api/*  → 路由            │
                   │   其他    → 前端靜態檔      │
                   └─────────────────────────────┘
```

---

## 一次性設定（需要你本人操作）

以下步驟都要註冊帳號、取得憑證，Claude 不會也不應該代做——連線字串和金鑰只該存在你的
瀏覽器和平台儀表板裡，不該經過對話紀錄。

### 步驟 1：在 Neon 開一個 Postgres

1. 到 [neon.tech](https://neon.tech) 用 GitHub 帳號登入，建一個 project。
2. 區域選離台灣近的（Singapore）。
3. 建好後複製 **connection string**，長得像
   `postgresql://<user>:<password>@ep-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`。

> **為什麼是 Neon 而不是 Supabase**：Supabase 免費專案連續 7 天沒有請求就會被暫停，
> 而且要進儀表板手動 restore。這個 app 的使用情境正是「不知道誰哪天會打開」，
> 那個失效模式剛好踩在最痛的地方。Neon 免費方案閒置也會休眠，但**連線進來就自己醒**
> （冷啟動約一秒），不需要人工介入。

### 步驟 2：把 schema 推上去

這個 repo 用 `drizzle-kit push`（schema-first，不產生 migration 檔），所以「建表」就是
拿本機的 schema 定義往雲端資料庫推一次。

在 PowerShell：

```powershell
$env:DATABASE_URL = "<剛剛複製的 Neon 連線字串>"
pnpm --filter @workspace/db run push
```

> `lib/db/drizzle.config.ts` 會用 dotenv 讀根目錄的 `.env`，但 **dotenv 預設不覆寫已經存在的
> 環境變數**——所以上面這樣設定，這一次會打到 Neon，而你 `.env` 裡的本機資料庫設定原封不動。
> 這是刻意利用的行為，不要為了推雲端而去改 `.env`，那太容易忘記改回來、然後某天把本機的
> 測試資料寫進正式庫。

推完後 Neon 儀表板的 Tables 應該看得到 `matches` / `players` / `sets` / `rallies` /
`events` / `substitutions` / `timeouts` / `lineups` / `people` / `teams` / `tournaments` /
`tactics`。

> 順帶一提，`push` 在**空的**資料庫上是安全的。之後改 schema 再推就要小心了：
> #64 PR1 把五張表主鍵從 `serial` 改成 `uuid` 時，本機是靠「砍掉重建」過關的，
> 雲端有真人資料時沒有這個選項，那時就得補上真正的 migration 流程。

### 步驟 3：在 Render 建服務

1. 到 [render.com](https://render.com) 用 GitHub 登入，授權這個 repo。
2. **New → Blueprint**，選這個 repo。Render 會讀根目錄的 `render.yaml`，
   build/start 指令、健康檢查路徑、機房都已經寫在裡面，不用手動填。
3. 它會問你 `DATABASE_URL`（`render.yaml` 裡標了 `sync: false`，代表「不寫在檔案裡」）。
   貼上 Neon 的連線字串。
4. 按下 Apply，等第一次 build 跑完（約 3–5 分鐘）。

成功的話你會拿到一個 `https://volley-tactics-board.onrender.com` 之類的網址。

### 步驟 4：驗收

```powershell
curl https://<你的網址>/api/healthz   # 應回 {"status":"ok"}
```

然後用瀏覽器打開網址本身，確認：

- 首頁載得出來（代表靜態檔有被 serve）
- 直接開一個深層網址（例如 `/matches/1/board`）重新整理不會 404（代表 SPA fallback 有效）
- 比賽列表載得出來（代表 API 打得到 Neon）

---

## 已知限制（目前這一版）

### 冷啟動

Render 免費方案的服務**閒置 15 分鐘會被休眠**，下一個請求要等它醒（約 30–60 秒）。
issue #26 已經明確接受這個代價：試用是非同步的，第一次打開多等半分鐘不影響判斷。
Neon 的休眠是另一層（約一秒），兩者疊加最差情況大約一分鐘。

### 還沒有登入 —— 網址先不要公開

**這一版跑的還是 `mockAuth`，所有請求都被當成同一個使用者 `mock-user-001`。**
也就是任何拿到網址的人，看到和改到的都是同一份資料。

這是刻意的分段：先確認「雲端環境跑得起來」這件事本身，再處理登入——把兩類第一次都會出錯的
東西分開來 debug，一次只查一個變因。

在 #26 PR2（Google OAuth）完成之前，**這個網址只給你自己驗，不要發給別人**。
好消息是 `mockAuth` 的 `x-mock-user-id` 後門在正式環境是關閉的（它用白名單判斷
`NODE_ENV === "development"`），所以至少沒有人能靠加一個 header 假扮成別人。

---

## 之後（#26 PR2）會補上的

- Google OAuth：`/api/auth/google` 導向、callback 驗證、簽章 httpOnly session cookie
- `mockAuth` 退役，換成 `requireAuth`（開發環境仍走 mockAuth，保留本機工作流程）
- 既有 `mock-user-001` 資料的歸屬處理
- `app.use(cors())` 目前是全開的——單一服務下前端根本不需要跨來源請求，接上 cookie 認證時
  應該一併收掉
- Google Cloud Console 上的 OAuth app 與 redirect URI 設定（也需要你本人操作，
  redirect URI 綁定步驟 3 拿到的正式網址）
