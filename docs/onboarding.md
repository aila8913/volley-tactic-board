# 新手上路

這份文件是給第一次加入這個專案、還沒有寫程式 / 用過 Git / 跟 AI Agent 協作經驗的人看的。目標是
用最短的時間讓你能實際動手改東西，細節不夠的地方都附了外部連結，自己延伸閱讀。

## 第 0 步：先搞懂這個 app 在幹嘛

打開 [`docs/flow-diagrams.html`](./flow-diagrams.html)（用瀏覽器開，不是純文字檔），裡面畫了
輪轉表 / 戰術板 / 計分表三個畫面怎麼互動、狀態怎麼變化。花十分鐘看完這份，會比讀程式碼快非常多
理解使用者實際上在畫面上做什麼。

## 第 1 步：環境安裝 checklist

依序裝好，裝完可以用括號裡的指令確認有沒有裝成功：

1. **Node.js**（24 版以上）— [下載頁](https://nodejs.org/)。確認：`node -v`
2. **pnpm** — 這個專案的套件管理工具，**不能用 npm 或 yarn**（repo 有機關會擋掉）。
   [安裝說明](https://pnpm.io/installation)。確認：`pnpm -v`
3. **Git** — [下載頁](https://git-scm.com/downloads)。確認：`git --version`
4. **GitHub 帳號** — 沒有的話先[註冊](https://github.com/join)，並請專案 owner 把你加進這個
   repo 的協作者名單。
5. **PostgreSQL** — 本機跑一個資料庫給後端連。[下載頁](https://www.postgresql.org/download/)。
6. **VS Code**（或其他編輯器）— [下載頁](https://code.visualstudio.com/)。
7. **Claude Code** — 這個專案主要用的 AI Agent 工具，見下方「AI Agent 是什麼」。
   [安裝說明](https://docs.claude.com/en/docs/claude-code/overview)。

裝完照 [`README.md`](../README.md) 的「快速上手」把專案跑起來，跑得起來再往下看。

## 第 2 步：Git / GitHub 是什麼

用最少的話講重點，細節看外部教學：

- **Git**：幫你的程式碼存檔、記錄每次修改歷史的工具。你在自己電腦上改東西，改完用
  `git commit` 存一個「版本快照」。
- **分支（branch）**：`main` 是大家共用的主線版本。你要改東西時，會先另外開一條「分支」在上面
  改，改完才把分支合併回 main——這樣就算改到一半也不會弄亂大家共用的版本。
- **GitHub**：把 Git 存的東西放到雲端、給大家一起看/協作的平台。
- **Pull Request（PR）**：你在分支上改完後，不會直接合併回 main，而是開一個 PR，讓別人（或你
  自己）看過、確認沒問題後才合併。這是團隊協作避免「改壞main」的機制。

想看完整教學：GitHub 官方的
[Hello World 教學](https://docs.github.com/en/get-started/quickstart/hello-world)，圖文並茂，
半小時內可以做完一輪。

**這個專案實際的流程**：分支 → commit → push → 開 PR → 合併，這五步都是請 Claude Code 帶著跑
（跟它說「幫我 ship」或「送 PR」就會觸發），每一步都會解釋在做什麼再執行、危險操作（push、
merge）一定會先跟你確認才動作。你不需要自己背指令，但看得懂 Claude Code 在做什麼比較安心。
具體的 commit 訊息格式、PR 慣例、怎麼從 Issue 找任務，看
[`CONTRIBUTING.md`](../CONTRIBUTING.md)。

## 第 3 步：AI Agent（Claude Code）是什麼、這裡怎麼用

**Claude Code** 是一個可以直接讀/寫程式碼、跑指令、開 PR 的 AI 助手，用命令列或編輯器擴充功能
操作。跟 ChatGPT 那種「複製貼上程式碼」的用法不同——它會直接在你的專案裡動手改檔案。
官方文件：<https://docs.claude.com/en/docs/claude-code/overview>

這個專案裡跟它協作要知道兩件事：

1. **[`CLAUDE.md`](../CLAUDE.md)**：放在根目錄，是寫給 Claude Code 看的「專案規範」，每次開新
   對話都會自動載入。裡面寫了技術棧、目錄結構、目前哪些功能還沒做完、以及一條特別規則——因為
   這是邊做邊學的專案，Claude Code 被要求在寫程式時多解釋「為什麼」，不只是「做了什麼」。
2. **內建的客製化流程（skills）**：專案裡預先寫好幾個常用的協作流程，直接打字觸發：
   - `catch-up`：新的一次對話開始時，跟它說「接續上次」或「catch me up」，它會讀
     `docs/PROGRESS.md`、GitHub Issues、最近的 git 紀錄，幫你快速搞懂上次做到哪，不用自己重新
     摸索一次。
   - `ship`：東西改完想送出去，跟它說「幫我 ship」或「送 PR」，會照 Git/GitHub 那套流程跑一輪，
     每步都解釋。
   - `wrap-up`：一個工作段落要結束時，跟它說「收工」或「wrap up」，會幫你把
     `docs/PROGRESS.md` 更新、同步 GitHub Issues 現況。

## 小辭典

| 詞                | 意思                                                                   |
| ----------------- | ---------------------------------------------------------------------- |
| repo              | repository 的縮寫，一個專案的程式碼倉庫                                |
| branch            | 分支，從主線岔出來的獨立修改版本                                       |
| commit            | 一次「存檔」，記錄了哪些檔案改了什麼                                   |
| push              | 把本機的 commit 上傳到 GitHub                                          |
| PR (Pull Request) | 請求把某個分支的修改合併回主線，合併前可以被檢視討論                   |
| merge             | 合併，把一個分支的修改併回另一個分支（通常是 main）                    |
| CLI               | Command Line Interface，用打字下指令操作的介面（Claude Code 就是一種） |
| Agent             | 這裡指 Claude Code——能自己讀寫檔案、跑指令的 AI                        |
