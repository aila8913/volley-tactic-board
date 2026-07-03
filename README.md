# 排球戰術板 (Volleyball Tactics Board)

一個給排球教練/球隊用的網頁工具，可以畫戰術布陣、管理輪轉順序、記錄比賽比分。目前是邊做邊學的
個人專案，架構會持續調整。

**先看這份，秒懂整個 app 在幹嘛：** 打開 [`docs/flow-diagrams.html`](docs/flow-diagrams.html)
（用瀏覽器直接開，不是純文字檔）——裡面畫了輪轉表 / 戰術板 / 計分表三個畫面怎麼互動、狀態怎麼
變化。比起讀程式碼，這是最快建立「這個 app 長怎樣、使用者會怎麼操作」的方式，特別推薦做 UI/UX
的人從這份開始看。

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
```

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
