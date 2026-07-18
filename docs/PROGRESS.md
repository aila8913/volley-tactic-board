# Progress Snapshot

> This is a **rolling ~1-week snapshot, not a log**. The `wrap-up` skill **overwrites**
> the "Current state" section each session and prunes anything older than roughly a week —
> it does **not** append an ever-growing history.
>
> **Durable facts don't live here.** A decision, lesson, or fact that must still hold weeks
> from now belongs in its permanent home, not this file:
>
> - _why_ code/schema changed → `git log` + commit messages
> - a feature's design decisions → the GitHub issue's comments + `docs/*-spec.md`
> - collaboration lessons / product judgments → auto-memory (`memory/`)
> - static repo layout/commands/architecture → `CLAUDE.md`
> - the planned-but-not-done backlog → GitHub Issues / Milestones, not here
>
> Before pruning an old entry, check it already has one of those homes; if it's an orphan,
> promote it first, then drop it. Read this file + `gh issue list --state open` + recent
> `git log` at the start of a session instead of re-exploring the codebase.

\_Last updated: 2026-07-18 — **全域 store 去汙染家族收官**：`#119`（戰術板/輪轉表兩 store 改
`dataByMatch[matchId]` 分片、去 persist、`buildSnapshot` 過濾幽靈站位）**前端 `#145` 已 merge 進 main**
（commit `d18f69e`），三症狀（跨場汙染／幽靈站位／activeProjectId 誤覆寫）都有 `useTacticsBoard.test.ts`
釘住、整套驗證過 → **`#119` 已關**。PO 決策已定案：去 persist ⇒ 硬重整不還原「未存排版」（決策 4「只有
存檔才算數」）。**本 session 也修掉 `#147`**（戰術布置 Ctrl+Z 一次退兩步）：根因是每個動作「先記歷史
再改狀態」，`history[historyIndex]` 比畫面慢一拍、與 undo 的 `historyIndex-1` 約定對不上；改成「先改後記」
＋補回歸測試，**PR #149 已 merge（commit `3abb312`）→ `#147` 已關**（那條 stranded 的 `claude/catch-up-pa5s6a`
分支靠 catch-up 撿回、補開 PR）。此 bug 自 `#79` 就存在、與 `#145` 分片重構無關。**M1 實作項現在只剩
`#44`（暫停/timeout）。**\_

**戰術板視覺（`#134`）進行中，PO 已拍板四點方向**：球場地板毛玻璃、邊緣線條光（含放寬 design-spec §6
「動效輕量」→「每頁最多一個環境級動效，須慢且低亮度」）、球員標記重設計、對手隊色 `#EF4444`→暖珊瑚橘
`#FF8A5C`（跟錯誤紅分家、錯誤狀態仍用紅）。tang 的 Track B 材質強化（置中字標／低調光影／玻璃卡片加深）
**PR #140 已 merge（commit `72a3670`）**；#134 其餘方向續留 issue、保持 open。另外 tang 的**品牌 logo mark
已定案並 merge**（旋轉排球：三叉旋渦弧線＋發光外環，`public/favicon.svg`，**PR #148**），design-spec 新增
「品牌標誌」段——但品牌名稱未定、字標仍 `VOLLEY/BOARD` 佔位（spec 寫 `stroke-width 6.5`、實檔用 `9`，
已在 #148 留言請 tang 對齊）。`#131`（其他頁面套深色）剩計分表／分析頁／資料夾內頁，仍排在 `#134` 之後
——若結論動到 spec，剩餘頁面以更新後的 spec 為準。

**協作流程規範已放寬**：**PR #141 已 merge（commit `fa4e908`）**——把「跨領域 PR 要等對方 approve」硬關卡
拿掉、改成合併前 @ 知會一聲即可（notification 不是 blocker）。**現行生效的就是知會制**，規範本體住
CONTRIBUTING.md「協作與溝通」＋ CLAUDE.md「Team & collaboration rules」＋ ship 的協作確認步驟——細節以
那三處現行內容為準。「對方的 issue 不單方面關」的保護仍在。\_

## Current state

Where the project actually stands right now (durable "current" facts; per-session detail
lives in git log + the issues named):

- **Backend match-recording API is fully implemented and live (dev DB).** matches / players /
  sets / rallies / events / substitutions / **tournaments** CRUD + tactics/health,
  ownership-scoped. The frontend scoresheet is **fully off localStorage** (matches,
  scores/rotation, events read-back → per-player stats)；**資料夾（tournaments）也已脫離
  localStorage、進 DB**（#117 完整版已合併）——`matches.tournamentId` 是帶 `onDelete: cascade`
  的 uuid FK，刪資料夾自動連帶刪比賽、不再有孤兒。Design + phased history in
  `docs/backend-architecture.md`；#58 closed。
- **前端 store 已全面 per-match 分片、去汙染。** 計分表（`useScoreSheet`，#115）、戰術板／輪轉表
  （`useTacticsBoard`／`useRotationTable`，#119）都改成 `dataByMatch[matchId]` 分片，A 場的編輯不會污染
  B 場；戰術板/輪轉表工作狀態**不再 persist**（PO 決策：只有存成戰術才算數，硬重整不還原未存排版）。
  切輪次的跨 store 同步走 `RotationSwitcher → syncRotationChange` 明確呼叫，不再靠全域 subscribe。
- **Schema foundations for stats are in place:** `lineups`（起始先發，一局一 row）、
  `substitutions`（換人，存比分快照）、`events.outcome`（得/失/球續 enum）、`people`＋`teams`
  （跨場跨隊身分／分組標籤，`players.personId`/`matches.teamId` nullable FK、`onDelete: set null`
  保留歷史事實）全部 live。這些是 #65 數據分析頁往上長的地基。
- **#65 數據分析頁：視圖一（單場比賽分析）骨架已上線**（`pages/MatchAnalytics.tsx`，PR #101）。
  比分總覽＋球員決定球矩陣＋換人統計；比率統計（side-out%/輪次得失）與差異化區塊（到位率/球線
  熱區）目前是**誠實空狀態**，等進階記錄 #51/#21 落地才點亮。視圖二（隊伍）/視圖三（球員跨場跨隊）
  尚未做（需 #102 的 teams/people 接上前端）。
- **專案 roadmap 已上線。** 時間序住在 repo **Milestones M1–M5**（軟目標日 7/18→9/11，估自實測
  velocity、非死線），當下狀態住在 [GitHub Project #4](https://github.com/users/aila8913/projects/4)
  （Status 五欄，Todo＝當前 milestone 的 3–5 項）。**「下一步做什麼」直接看 Todo 欄／M1，不用再問。**
  維護規則與 CLI id 都在 `.claude/skills/wrap-up/SKILL.md` step 5；跨 milestone 移動是 PO 決定。
  尚待 PO 在網頁完成（API 做不到）：Workflows 自動化（auto-add／closed→Done）＋三個 view。
- **記錄成本預算（#74）設計定案並已「落地」關閉**（`docs/recording-cost-budget.md`）：簡易/進階是懸崖式
  硬分界——簡易版一分打完後在死球空檔記**恰好一筆決定球**＋排先發＋換人/暫停＋「沒看到」escape valve；
  任何 per-touch／座標／到位分／子分類全歸進階版（賽後影片補填）。PO 拍板嚴守此界、不開 simple+。
  分層歸屬結論已回灌 #50（零成本顯示層）/#51（子分類全進階）/#21（座標進階），#74 收工。
- **事件文法（#73）＝統計權威依據**（`docs/event-grammar-spec.md`）：每個統計 = events/rallies/sets
  欄位的純函數。對帳確認「必須早補」的結構缺口已全數落地；剩餘缺口都是故意延到進階版的欄位
  （#51/#21/#44）或教練待確認項（到位門檻 `quality>=2`、嗆司定義，皆有預設在跑、不擋實作——
  07-12 起兩項預設皆有外部標準出處：VIS 官方門檻背書／DV Freeball 候選定義，見該 spec
  〈外部標準對照〉一節，schema 設計亦獲 VIS/DV 慣例驗證）。
- **設計規範已落地兩頁（首頁＋戰術板），手繪風確定全退役**（`docs/design-spec.md`，PR #129/#135/#140）：
  深色儀表板語言（`#0a0b07` 底＋萊姆綠 `#C6F135`＋玻璃卡片＋Space Grotesk/JetBrains Mono）。戰術板再加
  材質強化（#134 Track B，PR #140），品牌 logo mark 已定案（`public/favicon.svg`，PR #148），design-spec
  多了「品牌標誌」段。剩計分表（`ScoreSheetCourt`/`RadialMenu`）、數據分析頁、資料夾內頁三處仍是手繪風，
  由 #131 追蹤，但**排在 #134（戰術板視覺定案，needs-plan）之後**——#134 可能改動 spec 本身。#132（首頁
  review 收尾）獨立進行。**寫 UI 前先讀 design-spec.md**；實作數值以該檔「實作微調」「實作決定」註記為準
  （背景 `#0a0b07`、邊框 `white/[0.12]`～`[0.26]`、球場深青漸層——非原始的 `#121310`/暖木色）。
- **兩人協作流程已上線並放寬**（PR #137 立、PR #141 放寬）：討論分流／關 issue 規則住 CONTRIBUTING.md
  「協作與溝通」，Claude 要主動把關的版本住 CLAUDE.md「Team & collaboration rules」。跨領域 PR **不再需要
  對方 approve**、只要合併前 @ 知會一聲（#141 拆掉 approve 硬關卡）；「對方的 issue 不單方面關」仍在。
  改協作規範＝開 PR 動那些檔案。
- **需求層的 pattern-language 分析住 `docs/requirements-pattern-language.md`**（Alexander 式，P1–P7）：
  把「為什麼要做這些功能／背後哪兩股力在打架」講清楚，是 product-vision（定位）／recording-cost-budget
  （記錄成本）／event-grammar-spec（統計可推導）三份 spec 的上位框架。每個 pattern 的「落點」都標了
  對應 issue，最後的「整體性評語」點名 P7 離線（假牆）與 P6 球線分布（wow 點的洞）是兩處待補的張力。
  （已 merge，PR #142，commit `c4e843f`。）

## Known gaps / next big pieces

Backlog lives in **GitHub Issues, phase-ordered via Milestones M1–M5** — this file no longer
duplicates it. Current phase = lowest-numbered milestone with open issues:

```
gh issue list --milestone "M1 簡易版收尾"   # 當前階段
gh issue list --state open                   # 全部
```

M1 收尾焦點：**全域 store 去汙染家族已收官**——#115/#117/#118/#119 全數 CLOSED（三條不變量的落地
記錄見各 issue＋git log）；#147（undo 一次退兩步）也已修完關閉（PR #149）。**M1 實作項現在只剩 #44**
（暫停/timeout，唯一舊 open 項）＝下一步。另 #120（純展示唯讀站位視圖）依賴 #119 定案的分片形狀、暫不排期；
#40（undo/redo 不涵蓋輪轉拖曳，與 #147 同塊邏輯但不同 store）、#64（背景寫入失敗不 reconcile，關聯部署
#26／離線契約 #75）、**#127（後端沒驗 tournamentId 擁有權，真 auth 後補）** 仍 open。
進階版差異化（M4）：#51 動作子分類、#21 球線座標、#99 站位快照——同屬 advanced tier，可一起設計。

## Recently closed (past ~week)

- **#119**（本 session 關）— 戰術板/輪轉表兩 store 改 `dataByMatch[matchId]` 分片、去 persist、
  `buildSnapshot` 過濾幽靈站位。前端 **PR #145 已 merge**（commit `d18f69e`），後端前置 **PR #143**
  （`tactics` 加 `matchId` integer FK＋`?matchId=` 過濾，commit `e905844`）。三症狀（跨場汙染／幽靈站位／
  activeProjectId 誤覆寫）有 `useTacticsBoard.test.ts` 釘住、整套綠 → 驗證後關閉。跨 store 全域 subscribe
  換成 `RotationSwitcher` 明確呼叫 `syncRotationChange`。型別坑：`matches.id` 是 `serial`（整數）不是 uuid，
  FK 要跟著用 integer。
- **PR #149**（**Closes #147**）— 修戰術板 undo 一次退兩步（commit `3abb312`，07-18）。根因：每個 action
  「先記歷史再改狀態」，`history[historyIndex]` 慢一拍、與 undo 的 `historyIndex-1` 對不上；改成「先改後記」
  ＋回歸測試。那條修好卻沒開 PR 的 stranded 分支靠 catch-up 撿回。
- **PR #148**（無對應 issue）— tang 的品牌 logo mark（旋轉排球）＋ design-spec「品牌標誌」段（commit
  `e920ac1`，07-18）。品牌名稱未定、字標佔位；spec `stroke-width 6.5` vs 實檔 `9` 已在 PR 留言請對齊。
- **PR #141**（無對應 issue）— 拿掉跨領域 PR 的 approve 硬關卡、改「合併前 @ 知會一聲」（commit `fa4e908`,
  07-18）。放寬先前 PR #137 立的規則，動 CLAUDE.md/CONTRIBUTING.md/ship skill；現行生效即知會制。
- **PR #140**（#134 Track B，**#134 保持 open**）— 戰術板材質強化：置中字標、低調光影、玻璃卡片加深
  （commit `72a3670`，07-18）。#134 微 3D／版面呼吸等其餘方向續留 issue。
- **PR #142**（無對應 issue）— 需求層 pattern-language 分析文件（commit `c4e843f`，07-17）。
- **PR #137**（無對應 issue）— 兩人協作流程規範（commit `ab626b1`，07-16）。CONTRIBUTING.md「協作與溝通」
  ＋ CLAUDE.md「Team & collaboration rules」＋ ship 協作確認步驟。**已於 PR #141 放寬成知會制**（見上）。
  ship skill 瘦身門檻＝超過 ~350 行時把 Step 6 坑史移去 `ship/reference.md`（先不動）。
- **PR #135 / #129**（#131 部分進度，該 issue 保持 open）— 戰術板＋首頁套深色語言、手繪風全退役、
  球場改深青漸層（commit `0d63ee3`／`bef0e14`）。方法論教訓（review 夥伴 PR 用）：落後 main 又同檔的
  PR，git 自動合併無衝突**不等於合對**，要讀合併後檔案確認雙方改動都活著；fork PR 的 CI 預設不跑、
  要手動核准。
- （更早的 #118/#117/#115/#41/#50/#74/#73/#63/#20 等已修剪——記錄住在各自 issue 留言、
  `docs/*-spec.md`、git log。）
