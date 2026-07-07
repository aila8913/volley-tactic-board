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

## 標籤/流程之後要調整怎麼辦

這套 label 分類是隨專案規模設計的，不是釘死不能改。如果用起來卡卡的（例如某個 area 太籠統、
priority 沒人在用),直接在對話裡提出來調整即可，不用另外開會討論。
