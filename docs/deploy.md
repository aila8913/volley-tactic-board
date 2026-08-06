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

> **一定要複製「Direct connection」，不要複製「Pooled connection」**（Neon 的 Connection
> Details 面板兩個都有，差別只在主機名稱有沒有 `-pooler` 這段）。連線池版本走的是 PgBouncer
> transaction pooling，不支援 `drizzle-kit push` 內省 schema 時用到的 session 層級操作，
> 用連線池的字串跑 push 會卡在「Pulling schema from database...」然後安靜地失敗、幾乎看不到
> 有意義的錯誤訊息（#221/#224 那輪部署就在這裡卡了一段時間才查出來）。連線池字串本身沒錯，
> 是給部署後的應用程式（Render 上的 API server）在執行期用的一般查詢用的，只有 schema push
> 這種 DDL 操作要換成直連。

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
3. 它會問幾個 `sync: false` 的環境變數（`render.yaml` 裡列的那幾個，值不寫在檔案裡）。
   **這一步只填得出 `DATABASE_URL`**（貼上 Neon 的連線字串）——`GOOGLE_CLIENT_ID` /
   `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` 要等步驟 5 拿到正式網址才申請得到，
   先留白沒關係，Render 會用空字串佔位。
4. **`COOKIE_SECRET` 這一個現在就要填**，不能等——它是 `app.ts` 開機時強制要求的值
   （見 `lib/session.ts` 的 `getCookieSecret()`），沒填服務會直接啟動失敗、連
   `/api/healthz` 都連不上，不像 `GOOGLE_*` 那三個只在真的點登入時才用到。隨便一串夠長的
   亂數即可，例如用 PowerShell 產生：
   ```powershell
   -join ((48..57)+(97..122)|Get-Random -Count 40|%{[char]$_})
   ```
5. 按下 Apply，等第一次 build 跑完（約 3–5 分鐘）。

成功的話你會拿到一個 `https://volley-tactics-board.onrender.com` 之類的網址。

### 步驟 4：驗收（先驗「服務活著」，還沒有登入）

```powershell
curl https://volley-tactics-board.onrender.com/api/healthz   # 應回 {"status":"ok"}
```

然後用瀏覽器打開網址本身，確認：

- 首頁載得出來（代表靜態檔有被 serve）
- 直接開一個深層網址（例如 `/matches/1/board`）重新整理不會 404（代表 SPA fallback 有效）

> 這時候比賽列表應該是**空的**——雲端 Neon 資料庫是全新 push 出來的，沒有種子資料，
> 這是預期行為，不是壞掉。

### 步驟 5：在 Google Cloud Console 建 OAuth 用戶端

1. 到 [Google Cloud Console](https://console.cloud.google.com/)，建一個新專案（或沿用既有的）。
2. **OAuth 同意畫面（OAuth consent screen）**：User type 選「外部」，填應用程式名稱、
   支援電子郵件。發布狀態留在「測試中」就夠——issue #26 body 已經決定不設邀請碼，
   但 Google 的「測試中」狀態限制的是「有沒有審核」，不是「誰能登入」，公開網址仍然
   任何人都能連得到，只是 Google 會在同意畫面多顯示一行「未驗證的應用程式」提示。
3. **憑證 → 建立憑證 → OAuth 用戶端 ID**，應用程式類型選「網頁應用程式」。
4. **已授權的重新導向 URI** 填步驟 3 拿到的網址加上 callback 路徑，例如：
   `https://volley-tactics-board.onrender.com/api/auth/google/callback`
   ——這一串**必須跟伺服器實際送出的 redirect_uri 逐字元相同**（含 `https://`、
   不能有結尾多一個斜線），對不上 Google 會直接拒絕整個登入流程並顯示
   `redirect_uri_mismatch`。
5. 建立後複製「用戶端 ID」跟「用戶端密鑰」。

### 步驟 6：把 OAuth 憑證填回 Render，觸發重新部署

回到 Render 服務的 Environment 分頁，補上步驟 5 拿到的三個值：

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI` = 步驟 5 填的那串 callback 網址

存檔後 Render 會自動重新部署一次（環境變數變更本身就會觸發）。

### 步驟 7：驗收登入流程

瀏覽器開 `https://volley-tactics-board.onrender.com/`，應該會看到登入畫面（未登入時整個 app 被擋下）。
點登入 → 導去 Google 帳號選擇畫面 → 選帳號、同意 → 導回來後應該正常進到比賽列表，
且列表是空的（新帳號，還沒有任何比賽）。

再打一次 `GET /api/auth/me` 應該回你剛登入的帳號資訊：

```powershell
# 瀏覽器已經登入的話，直接開這個網址看得到 JSON；
# curl 沒帶 cookie 打這支會是 401，那是正確行為，不是壞掉。
curl https://volley-tactics-board.onrender.com/api/auth/me
```

---

## 日常部署：merge 到 main 之後會發生什麼

上面那七步是**一次性**的。服務建好之後，你不用再進 Render 按任何按鈕——`render.yaml`
綁了 `branch: main`，而 Render 的 auto-deploy 預設是開的，所以「在 GitHub 按下 merge」
就是這個專案的部署動作。

### 時間軸

```
你按 merge
   │
   ├─ GitHub Actions（.github/workflows/ci.yml）跑 lint / format / typecheck / test
   │  └─ 這條跟部署「無關」，Render 不會等它，兩條管線各跑各的
   │
   └─ GitHub webhook → Render 開始 build
         ├─ corepack enable && pnpm install --prod=false --frozen-lockfile && pnpm run build
         │  （monorepo 要裝完整 devDependencies 再 typecheck + build，free plan 約 3–6 分鐘）
         ├─ 起新的行程，跑 startCommand
         ├─ 打 /api/healthz 確認新版活著   ← 這關沒過就不切流量，舊版繼續服務
         └─ 切換流量，舊行程收掉
```

**重點一：CI 綠燈不等於部署成功。** 這是最容易誤判的地方。GitHub Actions 和 Render 是
兩條完全獨立的管線，Render 不看 CI 結果就開始 build——理論上 CI 紅燈的 commit 一樣會被
部署上去。反過來也一樣：CI 全綠但 Render build 掛掉（例如 lockfile 沒跟著更新、
`--frozen-lockfile` 就會失敗）也完全可能。要看部署狀態只能去 Render Dashboard。

**重點二：切換是零停機的。** health check 沒過之前流量還在舊版上，所以部署失敗不會讓
網站掛掉，只是「新功能沒上去」。

### 怎麼確認部署成功

1. **Render Dashboard → 你的服務 → Events 分頁**：看最新一筆 deploy 的狀態。
   `Live` = 成功，`Build failed` / `Deploy failed` 都會在這裡標紅，點進去有完整 log。
2. **對網址打一次 health check**：

   ```powershell
   curl https://volley-tactics-board.onrender.com/api/healthz
   ```

   > free plan 休眠的話這一發會等 30–60 秒才回應，那是冷啟動不是失敗。

3. **確認跑的是新版**：Events 裡那筆 deploy 會標出 commit SHA，跟你剛 merge 的
   commit 對一下就知道。

### merge 前要自己多做一步的情況

**動到 `lib/db/src/schema/` 的時候。** 這個 repo 用 `drizzle-kit push`、沒有 migration
檔，而 `buildCommand` 裡**沒有** push 這一步（刻意的：讓雲端資料庫的結構變更是一個需要
人明確按下去的動作，而不是 merge 的副作用）。所以 schema 改動 merge 上去之後，程式碼是
新的、Neon 的欄位還是舊的，會變成 runtime error。正確順序是：

```powershell
# 1. merge 之前（或至少 build 完成之前）先把 schema 推上雲端
# 記得用 Direct connection（不是 Pooled connection），理由見步驟 2 的提醒。
$env:DATABASE_URL = "<Neon 連線字串>"
pnpm --filter @workspace/db run push
# 2. 再去 GitHub 按 merge
```

> 為什麼是「先推 schema 再上程式碼」：新增欄位/新增表對舊版程式碼是無害的（它不知道那些
> 欄位存在，也就不會碰），反過來先上程式碼則會有一段時間新程式碼在找不存在的欄位。
> 這個順序在有真人資料之後會變得更重要——那時 `push` 遇到破壞性變更（改型別、刪欄位）
> 會要你確認資料怎麼處理，本機那套「砍掉重建」不再是選項，就得補上真正的 migration 流程了。

**改到環境變數的時候。** 那些 `sync: false` 的值（`DATABASE_URL`、`GOOGLE_*`、
`COOKIE_SECRET`）存在 Render 儀表板裡，不在 git 裡。改 `render.yaml` 的註解不會改到值；
要改值得進 Environment 分頁改，存檔後 Render 會自己重新部署一次。

### 想暫時關掉自動部署

Render 服務的 Settings → Build & Deploy → Auto-Deploy 可以關成 `No`，之後改成手動按
「Manual Deploy」。或是在 `render.yaml` 的服務底下加一行 `autoDeploy: false`——後者比較
符合這個 repo 的習慣（設定寫進檔案、有版本紀錄），但代價是「暫時關一下」也要開一張 PR。

---

## 已知限制（目前這一版）

### 冷啟動

Render 免費方案的服務**閒置 15 分鐘會被休眠**，下一個請求要等它醒（約 30–60 秒）。
issue #26 已經明確接受這個代價：試用是非同步的，第一次打開多等半分鐘不影響判斷。
Neon 的休眠是另一層（約一秒），兩者疊加最差情況大約一分鐘。

### 本機開發：`.env` 要多一個 `COOKIE_SECRET`

`app.ts` 開機一定會讀這個值（cookie-parser 初始化需要），本機開發也不例外，即使根本
沒有用到 Google 登入。`.env.example` 已經給了一個可直接使用的開發用預留值——複製過去
就好，不用自己產生。這是這張 PR 對既有本機工作流程唯一的一個 breaking change。

### OAuth 憑證只設定在 Render，本機開發預設不需要

`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` 三個都留白時，
本機開發完全不受影響——`requireAuth` 讀不到合法 session cookie、又偵測到
`NODE_ENV === "development"`，會退回舊的 `mockAuth` 行為（見
`middleware/requireAuth.ts`）。只有真的要在本機測完整登入流程時才需要另外申請一組
測試用的 Google OAuth 憑證（redirect URI 設 `http://localhost:3000/api/auth/google/callback`）。

### 目前只給自己或信任的人用

現在 OAuth 已經接上，任何人拿到網址都能用自己的 Google 帳號登入、開一份完全隔離的資料
——不再是所有人共用同一份 `mock-user-001` 的資料。可以視情況公開網址了。
