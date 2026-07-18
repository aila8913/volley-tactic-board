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

\_Last updated: 2026-07-18 — **M1 去汙染家族收官**：#119 前端半段（兩 store 改
`dataByMatch[matchId]` 分片、去 persist）**已 merge**（PR #145，commit `d18f69e`）→ **#119
CLOSED**；連帶那顆「拿掉 persist ⇒ 未存排版不活過重整」的待拍板點，PO 直接放行合併＝
**已拍板接受**（等同決策 4「只有存檔才算數」）。同一 session：修戰術板 undo 一次退兩步
（根因「先記歷史再改狀態」→ 改成「先改再記」，含回歸測試，PR #149 commit `3abb312`）→
**#147 CLOSED**；tang 的品牌 logo mark（PR #148）＋戰術板材質強化（#134 Track B，PR #140）
合併；**協作規則放寬**：拿掉跨領域 PR 的 approve 硬關卡、改成「合併前知會一聲」（PR #141
commit `fa4e908`）。**M1「簡易版收尾」現在實質只剩 #44（暫停/timeout）**。\_

**#131 原本卡的 PO 決定已拍板：手繪風全拿掉**——戰術板已退役 `wobbly-border`/手繪字體，球場底色
改深青漸層（**非** spec 原始的暖木色 `#C9A25D`，理由記在 design-spec.md 第 5 節「實作決定」）。
#131 剩計分表／數據分析頁／資料夾內頁三處，但**先等 #134（戰術板視覺定案：微 3D／材質／版面呼吸，
needs-plan）討論定案**——若 #134 的結論動到 design-spec 本身（尤其第 6 節「動效輕量」），剩餘頁面
以更新後的 spec 為準，別急著套舊規範。#134 已有 Track B（材質強化）落地（PR #140），issue 保持 open。

**協作規則已放寬（PR #141）**：跨領域 PR 不再需要對方 approve 才能合併，改成**合併前知會一聲**即可
（先前 PR #137 立的 approve 硬關卡已拆）。規範本體仍住 CONTRIBUTING.md「協作與溝通」＋ CLAUDE.md
「Team & collaboration rules」＋ ship skill——**細節以那三個檔案的現行內容為準**，這裡只留指標。
「對方的 issue 不單方面關」的保護仍在。\_

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
  深色儀表板語言（`#0a0b07` 底＋萊姆綠 `#C6F135`＋玻璃卡片＋Space Grotesk/JetBrains Mono）。戰術板
  再加材質強化（置中字標／低調光影／玻璃卡片加深，#134 Track B，PR #140）。**品牌 logo mark 已定案**
  （旋轉排球：三叉旋渦弧線＋發光外環，`public/favicon.svg`，PR #148，tang），design-spec 新增「品牌標誌」
  段；但**品牌名稱本身未定**、字標仍是 `VOLLEY/BOARD` 佔位（spec 寫弧線 `stroke-width 6.5`、實檔用 `9`，
  已在 #148 留言請 tang 後續對齊）。剩計分表（`ScoreSheetCourt`/`RadialMenu`）、數據分析頁、資料夾內頁
  三處仍是手繪風，由 #131 追蹤，**排在 #134（戰術板視覺定案，needs-plan）之後**——#134 可能改動 spec 本身。
  **寫 UI 前先讀 design-spec.md**；實作數值以該檔「實作微調」「實作決定」註記為準（背景 `#0a0b07`、
  邊框 `white/[0.12]`～`[0.26]`、球場深青漸層——非原始的 `#121310`/暖木色）。
- **兩人協作流程已上線並放寬**（PR #137 立、PR #141 放寬）：討論分流／關 issue 規則住 CONTRIBUTING.md
  「協作與溝通」，Claude 要主動把關的版本住 CLAUDE.md「Team & collaboration rules」。跨領域 PR **不再需要
  對方 approve**、只要合併前知會一聲（#141 拆掉 approve 硬關卡）；「對方的 issue 不單方面關」仍在。
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

**全域 store 去汙染家族 #115/#117/#118/#119 已全部 CLOSED**（三條不變量與落地順序見 #117 錨點留言）：
最小止血 #122／`players.id→uuid` #124／`tournaments` uuid PK+cascade #128／`tactics` 加 matchId #143／
#118 前端半段／**#119 兩 store byMatch 分片+去 persist（PR #145，`d18f69e`）** 依序落地。剩下的 #120
（純展示唯讀站位視圖）依賴 #119 形狀定案，純 UI、暫不排期。

**M1「簡易版收尾」現在實質只剩 #44（暫停/timeout，唯一舊 open 項）＝下一步。** 另有跨階段的
#64（背景寫入失敗不 reconcile，關聯部署 #26／離線契約 #75）、**#127（後端沒驗 tournamentId 擁有權，
真 auth 後補）**。新 bug #40（undo/redo 不涵蓋輪轉拖曳）與 #147 同塊 undo 邏輯但屬不同 store，#147 已修、
#40 仍 open。（本 session 關閉 #119/#147；#118/#115/#41/#50 先前本週關閉；#20/#63/#74 更早關閉。）
進階版差異化（M4）：#51 動作子分類、#21 球線座標、#99 站位快照——同屬 advanced tier，可一起設計。

## Recently closed (past ~week)

- **PR #149**（**Closes #147**）— 修戰術板 undo 一次退兩步（commit `3abb312`，07-18）。根因：每個 action
  「先 `pushHistory` 記歷史、再 `set` 改狀態」，`history[historyIndex]` 比畫面慢一拍，第一次 Ctrl+Z 跳兩步。
  修法：所有會改動的 action 統一「先改、再記」，`history[historyIndex]` 永遠等於現況；補回歸測試。**注意：
  這條分支 stranded 過**——修好卻沒開 PR，靠 catch-up 撿回；也連帶合進一份對舊 main 寫的 PROGRESS，已於本次 wrap-up 校正。
- **PR #145**（**Closes #119**）— 兩 store（`useRotationTable`/`useTacticsBoard`）改 `dataByMatch[matchId]`
  分片、每 action 收 matchId、`activeProjectId` 進分片（症狀 C）、`buildSnapshot` 出口濾幽靈 `tacticPositions`
  （症狀 B）、去 persist（commit `d18f69e`，07-18）。「未存排版不活過重整」PO 放行合併＝接受（決策 4）。
- **PR #148**（無對應 issue）— tang 的品牌 logo mark（旋轉排球）＋ design-spec「品牌標誌」段（commit `e920ac1`，
  07-18）。品牌名稱未定、字標佔位；spec `stroke-width 6.5` vs 實檔 `9` 已在 PR 留言請對齊。
- **PR #141**（無對應 issue）— 拿掉跨領域 PR 的 approve 硬關卡、改「合併前知會一聲」（commit `fa4e908`，07-18）。
  放寬先前 PR #137 立的規則；動 CLAUDE.md/CONTRIBUTING.md/ship skill。
- **PR #140**（#134 Track B，**#134 保持 open**）— 戰術板材質強化：置中字標、低調光影、玻璃卡片加深
  （commit `72a3670`，07-18）。#134（微 3D／版面呼吸）其餘部分續留 issue。
- **PR #143**（#119 前置）— `tactics` 表加 `matchId` integer FK（`onDelete: cascade`、
  nullable 向後相容）＋ `GET /tactics?matchId=` 過濾＋ openapi/codegen 重生（commit `e905844`，07-17）。
  型別坑：`matches.id` 是 `serial`（整數）不是 uuid，FK 型別要跟著用 integer。
- **PR #142**（無對應 issue）— 需求層 pattern-language 分析文件（commit `c4e843f`，07-17）。
- **PR #137**（無對應 issue）— 兩人協作流程規範（commit `ab626b1`，07-16）。CONTRIBUTING.md
  「協作與溝通」＋ CLAUDE.md「Team & collaboration rules」＋ ship Step 7 ＋ wrap-up 對方 issue
  保護。tang review + approve，新流程用自己完成第一次演練。順帶評估過 ship skill 瘦身：**先不動**
  （Step 6 坑史是規則的威懾力來源），門檻＝超過 ~350 行或單一步驟一眼掃不完時，把 Step 6 的坑史
  ／通則移去 `ship/reference.md`（比照 wrap-up 的模式）。
- **PR #135**（#131 部分進度，該 issue 保持 open）— 戰術板套深色語言（commit `0d63ee3`，07-16）。
  手繪風全拿掉拍板、球場改深青漸層；進度與剩餘頁面記錄在 #131 body。後續視覺提案收斂進 #134。
- **#118** — 名單編輯新增球員的同人兩套 id（前端半段收尾）。`diffRoster` 送出前端鑄的 uuid
  ＋`RotationTable` 的名單回寫改 await＋失敗 toast。schema 半段是 PR #124；I3「一個實體一套 id
  只鑄造一次」到此在名單這條路徑上成立。「全域 store 去汙染」家族只剩 #119。
- **PR #129**（無對應 issue）— 首頁深色改版＋`docs/design-spec.md`（commit `bef0e14`）。**夥伴
  @tangyi1025 的第一個 PR**。review 四點未處理即合併→已由 **#132** 接住；其他頁面跟上→**#131**。
  方法論教訓（留給未來 review 夥伴 PR 時用）：落後 main 又同檔的 PR，git 自動合併無衝突**不等於
  合對**，要讀合併後的檔案確認雙方改動都活著；fork PR 的 CI 預設不跑、要手動核准 workflow，
  「本機跑過」不是綠燈。
- **#117** — 資料夾（tournaments）進 DB：uuid PK + cascade FK（PR #128，commit 241a7eb）。`tournaments`
  表 client-mintable uuid PK、`matches.tournamentId` text→uuid FK `onDelete: cascade`（刪資料夾＝連同
  比賽刪，PO 拍板下沉到 DB）；前端 `useTournaments` 從 Zustand+persist 改成 API adapter。#122 的孤兒
  fallback 一併拆除（cascade 保證孤兒結構上不可能）。留下 #127（tournamentId 擁有權未驗）。
- **#115** — 計分表擁有自己逐局的先發快照，與戰術板/輪轉表全域 store 解耦（PR #121，commit ce5c9f5）。
  這是「全域 store 去汙染」家族第一條落地；同根因兄弟 #117/#118/#119 皆已收官（見上方 Known gaps）。
- （更早的 #41/#50/#74/#63/#20/#73/#102/#42/#93 已修剪——記錄住在各自的 issue 留言、
  `docs/recording-cost-budget.md`/`docs/event-grammar-spec.md`、git log。）
