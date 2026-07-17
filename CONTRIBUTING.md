# 貢獻指南

這是一個排球戰術板 + 比賽記錄的學習型專案，目前兩人協作。這份文件是給新加入的夥伴看的
「怎麼實際開始做事」說明——找任務、label 是什麼意思、commit/PR 的慣例。

- 完全沒碰過 Git/GitHub/AI Agent？先看 [`docs/onboarding.md`](./docs/onboarding.md) 補概念。
- 技術棧、環境安裝、指令請看 [`README.md`](./README.md) 的「快速上手」。
- 這份文件本身：假設環境已經架好，要開始找任務、送 PR 時看。

## 從哪裡開始

1. 先照 [`README.md`](./README.md) 的「快速上手」把環境架起來。
2. 到 [Issues](../../issues) 頁面，用左側的 label 篩選器找 `area:frontend` 或
   `area:design`，這兩個大致對應前端/UI-UX 的工作範圍。
3. 想找一個範圍小、規格寫得清楚、不用先搞懂整個系統就能動手的任務，篩 `good first issue`。

## Issue Label 說明

一個 issue 通常會貼「1 個類型 + 1 個範疇 + 0~1 個流程 + 0~1 個優先程度」，最多 4 個
label。看到陌生的 label 可以回來查這張表。

開新 issue 時優先用 [issue 表單](../../issues/new/choose)（Bug 回報／功能提案）——表單會
強制填必要欄位並自動貼上對應的 type label，你只需要再補一個 `area:*`。chore／question
這類不適合表單的，仍可開空白 issue 手動貼 label。

### 類型 Type（這是什麼性質的工作）

| label           | 說明                                          |
| --------------- | --------------------------------------------- |
| `bug`           | 程式運作不如預期、壞掉的東西                  |
| `enhancement`   | 新功能或功能改進的需求                        |
| `chore`         | 重構、工具鏈、雜項維護，不算 bug 也不算新功能 |
| `documentation` | 文件撰寫或修改                                |
| `question`      | 待釐清、還沒決定怎麼做的討論                  |

### 範疇 Area（屬於技術棧哪一塊）

| label           | 說明                                                                           |
| --------------- | ------------------------------------------------------------------------------ |
| `area:frontend` | React 前端元件與互動邏輯                                                       |
| `area:design`   | 視覺設計、UX 流程                                                              |
| `area:backend`  | Express API 與後端邏輯                                                         |
| `area:db`       | 資料庫 schema、Drizzle 相關                                                    |
| `area:infra`    | 部署、build、環境變數設定                                                      |
| `area:product`  | 產品層次：定位、使用者場景、功能分層等概念設計（動程式碼之前的「想清楚」工作） |

### 流程 Workflow（目前卡在哪個階段）

| label              | 說明                                                |
| ------------------ | --------------------------------------------------- |
| `needs-plan`       | 動手寫之前要先進 Plan mode 討論，範圍或設計還沒定案 |
| `help wanted`      | 想找夥伴一起討論或幫忙的 issue                      |
| `good first issue` | 適合新加入的夥伴上手的入門任務——範圍小、規格清楚    |
| `blocked`          | 卡住了，需要等其他 issue 先有進展                   |

### 優先程度 Priority（不是每個 issue 都會有，沒貼代表「有空再做」）

| label                | 說明                                                             |
| -------------------- | ---------------------------------------------------------------- |
| `priority:urgent`    | 緊急：卡住其他進度或有明顯問題，需要優先處理                     |
| `priority:essential` | 核心必要：專案不可或缺的一環，遲早都要做，不能略過（但不一定急） |

## Commit 與 PR 慣例

- Commit 標題用**繁體中文**，動詞開頭（例如「修正」「新增」「重構」）。
- 開新工作前先開 feature branch，不要直接在 `main` 上 commit——細節跟原因見
  `.claude/skills/ship/SKILL.md` 的「Why branch before commit」章節，簡單說是為了避免
  squash merge 之後 local `main` 跟 `origin/main` 分歧。
- PR 描述照 `.github/PULL_REQUEST_TEMPLATE.md` 的結構填（開 PR 時 GitHub 會自動帶入）。
- PR 用 squash merge 合併進 `main`，合併後會自動刪除來源分支。
- PR 開啟後 CI（GitHub Actions，見 `.github/workflows/ci.yml`）會自動跑
  `pnpm run typecheck` + `pnpm run test`，等綠燈再合併即可，不用在本地重跑。
  （`pnpm run lint` 和 `prettier --check` 還沒進 CI——存量程式碼尚未全數通過，
  清完之後才會加進去。）

## 協作與溝通

兩人協作之後，「用訊息軟體來回聊」會變成瓶頸——訊息即時但沒有結構、跟程式碼脫節，過幾天
就翻不到了。原則：**跟專案有關的討論，留在 GitHub 上對應的物件旁邊**，讓未來的自己
（和雙方的 Claude）都翻得到。

### 討論放哪裡（依討論的性質分流）

| 要討論的東西                                       | 放哪裡                                            | 為什麼                                                            |
| -------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------- |
| 某張 issue 的做法、範圍、卡點                      | 該 issue 底下留言，`@對方帳號` 提及               | 討論跟任務綁在一起，未來翻 issue 就看得到前因後果                 |
| 某個 PR 的程式碼／畫面寫法                         | PR 的 Review（Files changed 頁可以逐行留言）      | 意見直接釘在該行程式碼上，比截圖貼訊息精準                        |
| 還沒變成任務的新問題或決策（例如「配色要不要換」） | 開一張新 issue，貼 `question` label               | 會進 backlog 被追蹤；討論出結論後直接轉成工作項，或關掉並留下結論 |
| 緊急、需要對方馬上看到的事                         | 訊息軟體，但**討論出的結論要回填到對應 issue/PR** | 即時工具負責「叫人」，GitHub 負責「留記錄」，兩者分工             |

為什麼不用 GitHub Discussions：兩人專案再多開一個要檢查的收件匣，只會讓討論碎掉。
Issues 已經能掛 label（`question`）、進 milestone 和 project board、被 `catch-up` 流程
自動讀到——Discussions 這些整合都沒有。等哪天真的出現大量「跟任務無關的開放式討論」
再考慮開。

**@提及（mention）是通知的開關**：在 issue/PR 留言打 `@帳號`，對方會收到 GitHub 通知
（鈴鐺 + email）。沒有 @ 的留言對方很可能不會看到——想要對方回應，一定要 @。

### 關 issue 的規則

Issue 是這個專案的共用 TODO 帳本，關掉一張 = 對所有人宣告「這件事處理完了」。所以：

- **做完的**：優先讓 PR 自動關——PR body 寫 `Closes #編號`，merge 時 GitHub 會自動關掉
  issue 並留下「被哪個 PR 解掉」的連結。
- **決定不做／被取代的**：可以手動關，但**關之前一定要留一句 comment 說明原因**
  （「決定不做，因為…」「被 #NN 取代」），並選 "Close as not planned"。
- **不要無聲手動關**——沒有 comment、也沒有對應 commit/PR 的關閉，未來翻到時無從判斷
  是做完了、不做了、還是誤關，等於帳本破洞。
- 要關**對方開的** issue 之前，先在底下 @ 對方確認一聲——除非那張 issue 明顯就是被你
  這次的 PR 直接做完的。
- 一個工作段落結束時，跟 Claude Code 說「收工」（觸發 `wrap-up` 流程），它會幫你把
  issue 狀態和 `docs/PROGRESS.md` 一起同步好——手動關 issue 最常見的遺漏（progress
  沒更新、milestone 沒對齊）它都會檢查。

### 跨領域改動：留一句知會就好，不用等對方 approve

每個人有自己主要負責的範圍（見下方分工表），但**我們不設 approve 關卡**——每個人都可以
自己 merge 自己的 PR，包含動到對方範圍或共用約定的那種，不用停下來等對方看過再合。

理由：兩人專案、又是邊做邊學，硬性的「合併前一定要等對方 approve」只會在有人沒空的時候
卡住進度，壓力大於價值。與其擋在 merge 前面，不如合完讓對方非同步追上——真有意見，
再開一張 follow-up PR 或在原 PR 留言即可。

只有一件事還是要做：**動到對方範圍、或動到共用約定檔時，在 PR（或 issue）留一句 `@對方`
知會**，讓對方知道這塊被動過、能回頭看。這只是通知，不是關卡——貼完就能合，沒有人要等。
「共用約定」指這些檔案：

- `CLAUDE.md`、`CONTRIBUTING.md`、`.claude/skills/` —— 雙方（和雙方 Claude）的行為規範
- `docs/design-spec.md` —— 設計語言的定義
- `lib/api-spec/openapi.yaml`、`lib/db/src/schema/` —— 前後端之間的介面契約

只動自己範圍內的東西，連知會都不用，照常自己 merge。

### 跟「對方的 Claude」溝通：改檔案，不是傳訊息

想讓對方的 Claude Code 遵守某個約定（commit 格式、流程習慣、程式風格），**不是**傳訊息
請對方轉告——是把約定寫進版本控制裡的規範檔。雙方的 Claude 每次開新對話都會自動載入
`CLAUDE.md`，對應流程觸發時也會讀 `.claude/skills/` 裡的 skill，所以規範檔就是兩邊
Claude 的共用大腦：

- 專案級規範（技術棧、目錄結構、對 Claude 的行為要求）→ `CLAUDE.md`
- 人類協作慣例（label 分類、commit/PR 格式、本章）→ `CONTRIBUTING.md`
- 特定流程的步驟（ship／wrap-up／catch-up）→ `.claude/skills/<名稱>/SKILL.md`

改這些檔案本身就是「動到共用約定」，照上一節走：開 PR、留一句 `@對方` 知會，然後照常
merge——不用等對方 approve。這樣每一條約定的變更都有 PR 記錄可查、對方也被通知到，
兩邊的 Claude 永遠讀到同一份。

### 目前分工

| 成員 | GitHub 帳號   | 主要範圍                                                 |
| ---- | ------------- | -------------------------------------------------------- |
| aila | `@aila8913`   | 全端（backend／db／infra／product），專案 owner          |
| tang | `@tangyi1025` | 視覺設計與 UI（`area:design`、`area:frontend` 的視覺面） |

## 標籤/流程之後要調整怎麼辦

這套 label 分類是隨專案規模設計的，不是釘死不能改。如果用起來卡卡的（例如某個 area 太籠統、
priority 沒人在用),直接在對話裡提出來調整即可，不用另外開會討論。
