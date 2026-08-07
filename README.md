# 排球戰術板 (Volleyball Tactics Board)

一個給排球教練/球隊用的網頁工具，可以畫戰術布陣、管理輪轉順序、記錄比賽比分。目前是邊做邊學的
個人專案，架構會持續調整。

**想知道這個 app 在幹嘛：** 最快的方式是照 [`docs/onboarding.md`](docs/onboarding.md) 把它跑起來
點一遍。想知道「為什麼要做這些功能」，讀
[`docs/requirements-pattern-language.md`](docs/requirements-pattern-language.md)；做 UI/UX 的人
從 [`docs/design-spec.md`](docs/design-spec.md) 開始。

**要動筆之前先看兩份：**

- [`CONTEXT.md`](CONTEXT.md)——領域詞彙表。這個專案的排球術語有一份官方用詞（例如記錄模式叫
  「簡易版」不叫「基礎版」；「陣容」一律拆成「先發」與「在場六人」）。寫文件、註解、UI 文案時
  照這份用，不要自己另創同義詞。
- [`docs/adr/`](docs/adr/)——架構決策紀錄。每一張都是已經吵完拍板的決定，結尾有「不要重新提議」
  一節。覺得某個設計很怪、想改掉之前，先確認它是不是已經有 ADR 講過為什麼不能改回去。

（曾經有一份 `docs/flow-diagrams.html` 畫三個畫面的操作流程與狀態機，2026-07-21 移除——它描述的是
「程式碼現在的行為」，而那種衍生文件只會落後、落後時還會主動誤導人實作出已被禁止的資料流。行為以
程式碼為準，決策理由住在 `docs/*-spec.md` 與 GitHub issue。）

## 技術棧

這是一個 pnpm monorepo（一個 repo 裡放多個彼此獨立又互相引用的專案），大致分工如下：

| 領域         | 用什麼                                                                         |
| ------------ | ------------------------------------------------------------------------------ |
| 前端框架     | React 19 + Vite                                                                |
| 前端狀態管理 | Zustand                                                                        |
| 前端路由     | wouter                                                                         |
| UI 元件庫    | shadcn/ui + Tailwind CSS 4                                                     |
| 後端         | Express 5                                                                      |
| 資料庫       | PostgreSQL + Drizzle ORM                                                       |
| API 規格     | OpenAPI（`lib/api-spec/openapi.yaml`），前端的呼叫程式碼是從這份規格自動產生的 |
| 開發語言     | TypeScript                                                                     |

不需要現在就搞懂每一項是什麼——真的要動手改某一塊時再回來查就好。

## 快速上手

需要先裝好：[Node.js](https://nodejs.org/)（24 版以上）、[pnpm](https://pnpm.io/)、
[PostgreSQL](https://www.postgresql.org/)（本機跑一個資料庫）。

```bash
# 1. 安裝所有套件（monorepo 只要在根目錄跑一次）
pnpm install

# 2. 設定環境變數（根目錄新增 .env，內容參考下方）
# 3. 啟動後端 API
pnpm --filter @workspace/api-server run dev

# 4. 另開一個終端機，啟動前端
pnpm --filter @workspace/volleyball-tactics run dev
```

`.env` 需要的內容（`DATABASE_URL` 換成你自己本機資料庫的帳密）：

```
DATABASE_URL=postgres://<user>:<password>@localhost:5432/<db-name>
PORT=5173
BASE_PATH=/
API_PORT=3000
COOKIE_SECRET=dev-only-not-a-real-secret
```

（根目錄的 `.env.example` 是同一份清單的可複製版本：`cp .env.example .env` 之後只要換掉
`DATABASE_URL` 就好，`COOKIE_SECRET` 本機開發直接沿用範本裡的值即可。Google OAuth 相關的
三個變數本機不設也沒關係，見 `.env.example` 裡的說明。）

**手動點畫面測試時，建議另外開一顆「試驗沙盒」資料庫**（例如 `volleyboard_scratch`），
`DATABASE_URL` 指過去，跟平常開發用的那顆分開——這樣隨手點來點去不會把自己的開發資料越
測越亂。測到一團亂之後，`pnpm run db:reset` 可以把它一鍵重灌回「內容豐富、可預期」的
種子資料（2 支球隊、4 場比賽，其中 2 場附先發站位與已存戰術），詳見
[`lib/db/src/seed-testdata.ts`](lib/db/src/seed-testdata.ts) 檔頭的說明。

⚠️ `db:reset` 會**整個清空** `DATABASE_URL` 當下指到的那顆資料庫——所以跑之前先確認
`.env` 指的是試驗沙盒、不是你平常開發的那顆。腳本本身只准對著本機資料庫執行（非本機
host 會直接拒絕），但它分不出本機的兩顆資料庫誰是誰，那條界線要你自己顧。

想把它部署到雲端上讓別人試用，見 **[`docs/deploy.md`](docs/deploy.md)**。

## Repo 結構導覽

```
artifacts/
  volleyball-tactics/  ← 主要前端，UI/UX 相關的改動幾乎都在這裡
  api-server/          後端 Express API
  mockup-sandbox/      設計/mockup 沙盒，不會上線，適合拿來試版面、對元件
lib/
  db/                  資料庫 schema（Drizzle）
  api-spec/            OpenAPI 規格，是 API 的「真理來源」
  api-client-react/    ⚠️ 自動產生的，不要手改——改 api-spec 再重新產生
  api-zod/             ⚠️ 同上，自動產生的
docs/                  各種規格文件、進度紀錄
```

## 新手上路

第一次接觸這個專案、或是還不熟 Git / GitHub / AI Agent 協作的，看
**[`docs/onboarding.md`](docs/onboarding.md)**。

環境架好、準備開始實際找任務來做時，看 **[`CONTRIBUTING.md`](CONTRIBUTING.md)**——裡面有
Issue label 怎麼看、怎麼挑一個適合入門的任務、commit/PR 慣例。

## 跟 AI Agent（Claude Code）協作

這個專案大量使用 [Claude Code](https://claude.com/claude-code) 輔助開發。根目錄的
[`CLAUDE.md`](CLAUDE.md) 是寫給 AI Agent 看的專案規範（技術棧、目錄結構、目前有哪些坑），
每次開新的 Claude Code 對話都會自動讀取。專案裡也內建了幾個客製化流程（`ship` / `catch-up` /
`wrap-up`），細節同樣寫在 [`docs/onboarding.md`](docs/onboarding.md)。

## 目前進度

想知道現在做到哪、還有哪些已知問題，看 [`docs/PROGRESS.md`](docs/PROGRESS.md)（會持續更新的
進度快照）。規格類文件的總覽則在 [`docs/spec-index.md`](docs/spec-index.md)。
