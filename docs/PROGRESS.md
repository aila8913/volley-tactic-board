# Progress Snapshot

> This is a **live snapshot**, not a log — the `wrap-up` skill overwrites the "Current
> state" section at the end of each work session, it doesn't append to it. For the
> permanent history of _why_ things changed, that's what `git log` and commit messages
> are for. For static repo layout/commands, see `CLAUDE.md`. For the backlog of
> planned-but-not-done work, see GitHub Issues (`gh issue list`), not this file.
>
> Read this file, plus `gh issue list --state open` and recent `git log`, at the start
> of a new session instead of re-exploring the whole codebase from scratch.

_Last updated: 2026-07-11 (session: **建立專案 roadmap——GitHub Milestones M1–M5（時間序）＋
GitHub Project #4（當下狀態看板）。** 20 個 open issues 全部掛好階段：M1 簡易版收尾（#20 #41 #63
#50 #44 #74，due 7/18）→ M2 數據分析價值（#76 #65，7/29）→ M3 部署給真人試用（#77 #75 #64 #26，
8/07）→ M4 進階版差異化（#51 #21 #99，8/28）→ M5 體驗重整與雜項（#17 #19 #24 #39 #40，9/11）。
PO 兩個拍板：**先分析再部署**（M2/M3 順序）、due date 是估自實測 velocity 的軟目標非死線。
Project 只管 Status 五欄（Backlog/Todo/In Progress/Blocked/Done），priority/area 沿用 labels；
Todo 紀律＝只放當前 milestone 的 3–5 項。wrap-up/catch-up 兩個 skill 已補 roadmap 同步/讀取步驟
（含全部 CLI id）。無程式碼變更。前一段 →)_

_Prev: (session: **#73 事件文法設計基石對帳收束（PR #105，已合併，`Closes #73`）。**
發現 #73 的 spec 產出（`docs/event-grammar-spec.md`）與 7 條決策早在 2026-07-09 就交付、issue 卻還
掛 `needs-plan` open——一開始誤當白紙決策場，讀完 issue 留言/產出物才確認真正工作是「對帳」而非重議
（教訓：`open + needs-plan ≠ 沒做`）。把 spec 標的每個缺口對到現在 schema：`lineups`/`substitutions`/
`events.outcome` 三個「必須早補」的結構缺口已於 #42/#97/#98/#102 全數落地，更新 G1/G2 對照表標記
（❌→✅）＋新增〈落地進度對帳〉一節，剩餘為進階版欄位（#51/#21/#44）與教練待確認項（到位門檻/嗆司
定義，有預設在跑）。純 docs、prettier/CI 綠。同 session 前半段已落地並關閉 **#102**（見下方 Current state
＋Recently closed）。前一段 →)_

## Current state

- **This session (2026-07-11, latest): 專案 roadmap 上線。** 時間序住在 repo **Milestones
  M1–M5**（軟目標日 7/18→9/11，估自實測 velocity），當下狀態住在
  [GitHub Project #4](https://github.com/users/aila8913/projects/4)（Status 五欄，Todo＝
  當前 milestone 的 3–5 項）。「下一步做什麼」直接看 Todo 欄／M1，不用再問。維護規則與
  CLI id 都在 `.claude/skills/wrap-up/SKILL.md` step 5；跨 milestone 移動是 PO 決定。
  尚待 PO 在網頁完成（API 做不到）：Workflows 自動化（auto-add／closed→Done）＋
  Roadmap/開發板/產品討論三個 view。
- **前一段 (2026-07-11): #73 事件文法設計基石對帳收束（PR #105，已合併，`Closes #73`）。**
  - 純 docs：把 `docs/event-grammar-spec.md`（2026-07-09 交付的統計反推對照表＋7 決策）對到現在
    的 schema。更新 G1/G2 兩條過期標記（換人/先發持久化早已落地，❌→✅）＋新增〈落地進度對帳
    （2026-07-11）〉一節。
  - **對帳結論**（#65 之後照這份算統計的權威依據）：必須早補的結構缺口 `lineups`(#42 一帶)／
    `substitutions`(#42/#97/#98)／`events.outcome`(#102)／`people`+`teams`(#102) **已全數落地**；
    仍缺的都是故意延到進階版的欄位（`timeouts`#44、`serveType`+`ballType=cover`#51、座標 #21、
    quality/攻擊 in_play #51）或教練待確認項（到位門檻 `quality>=2`、嗆司定義，皆有預設在跑、不擋實作）。
  - **流程教訓**：`open + needs-plan` 的 issue 不代表沒做——#73 早交付卻沒關，一開始被誤當白紙
    決策場，讀 issue 留言/產出物後才校正為對帳。catch-up 時要先讀 issue 的 comment 與 artifact。
- **This session (2026-07-11): 落地 #102 people+teams 身分/球隊 schema 地基（純 additive、
  schema-first）。**
  - **兩張新表**：`lib/db/src/schema/people.ts`（`id/userId/name`，跨場跨隊的唯一「人」身分——
    同一人這場穿 5 號、下場穿 12 號甚至換隊都是不同 `player` row，`people` 才是把散落各場的紀錄
    串起來的錨點）；`lib/db/src/schema/teams.ts`（`id/userId/name`，分組標籤，讓統計按隊切片）。
    兩張都用純文字 `userId`（無 users 表，mock auth 階段）。
  - **兩條 nullable FK 接上舊資料**：`players.personId → people.id`、`matches.teamId → teams.id`，
    皆 **`onDelete: "set null"`**。關鍵設計點：per-match 名單列/比賽是**歷史事實**（「這人那場穿幾號」），
    刪掉 canonical 身分/球隊只該斷連結、不該連帶刪掉歷史紀錄（`cascade` 會反過來抹掉那人打過的
    所有數據）——同 `events.playerId` 早先用 `set null` 的道理，一路延伸到 `personId`。
  - **順手補 `events.outcome`**：新 enum `eventOutcomeEnum`（`point/loss/in_play`＝得分/失分/球續），
    nullable（null＝尚未填）。event-grammar-spec 決策 7 缺口，簡易版記錄手勢第三步本就選得失分、
    寫入成本為零，是「失分結構」統計前置。
  - **PO 拍板三個待決事項（記在 #102 留言）**：建賽時隊**可選**（低門檻隨手記）、去重 UX 分階段
    （先「從既有 people 挑」、相似度提示留後續）、舊比賽**只填新資料不回填**。
  - **驗證**：`pnpm run typecheck` 綠、`pnpm --filter @workspace/db run push` 已套用 dev DB
    （純新增、無 drift）。委派 sonnet-engineer 實作，主 session 複查 FK 語意。
  - **刻意未做**（照決策留 #65 後面階段）：openapi/codegen、前端讀寫、建名單去重 UX、舊資料回填。
- On `main`, latest commit `a1f66a4` — the #73 event-grammar-spec reconciliation (PR #105).
  Recent chain: #104 (#102 people/teams schema), #103 (編輯比賽 infinite-loop fix), #101 (#65
  single-match analytics skeleton), #98 (#42 substitutions persistence fix), #97 (`substitutions`
  table), #96 (T2 record-cost-budget spec), #94 (`lineups` table), #92 (T1 event-grammar spec),
  #91/#90/#89/#88 (subagent unification), #87 (product deep-dive execution plan), #85/#84/#83
  (lint/format/CI chores), #78 (product positioning docs). **Phase 3 is fully done and #58 is
  closed** (see the match-recording bullet below). Working tree clean at wrap-up.
- **This session (2026-07-10, latest): 開工 #65 跨場數據分析頁——完成「視圖一＝單場比賽分析」
  骨架（PR #101，已合併）。**
  - **架構走 Option 3**：完全重用簡易版既有資料（sets/rallies/events/substitutions），零 schema
    變更、純前端。新頁 `pages/MatchAnalytics.tsx`：比分總覽＋球員決定球矩陣（標註「決定球歸屬」
    語意——接舉攻只記終結那球、舉球員數字系統性偏低）＋換人統計；差異化（防守到位率/對手球線
    熱區）與階段性統計（side-out%/破發、輪次得失）先做**誠實空狀態**、不放假資料（等進階記錄
    #51/#21 落地才點亮）。
  - **抽出共用純函數避免統計漂移**：`buildPlayerMatrix`→`lib/statsMapping.ts`；「從後端
    sets/rallies/events/subs 重建整場 `ScoreSheetState`」→`lib/scoreSheetMapping.ts` 的
    `reconstructRecording`。計分表 `useScoreSheetController` 改用同一份，行為等價（既有計分表
    測試全過為證）。新增唯讀 hook `useMatchRecording`（讀同一組 API＋reconstructRecording，
    不寫入、不 seed ref、不碰 Zustand store，職責與 controller 分離）。
  - **路由/入口**：`App.tsx` 加 `/matches/:id/analytics`；`MatchCard.tsx` 加第 3 顆「數據」按鈕。
  - **規劃定案（記在 #65 留言）**：三視圖（視圖一單場★核心 / 視圖二隊伍 / 視圖三球員跨場跨隊）、
    優先序 PO 反轉為**單場優先**、**不做 GA4 客製化**（固定視圖＋過濾器＋CSV）、樣本數 n= 標示＋
    低樣本降飽和（不整塊灰掉）、**schema 先落視圖後做（解耦）**、身分模型走顧問拍板的**選項 A**
    （不綁隊 `people` 表＋`players.personId`；`teams`＋`matches.teamId` 為分組標籤）。
  - **定位更正**：`docs/product-vision.md` 補「單帳號、但不是單隊」一節——單帳號 ≠ 單隊，一帳號
    分析多支球隊、「同一人跨隊」是一級分析情境（換隊因舉球手/接發效率不同、攻擊表現會變）。
    已在 #77 留言記錄。
  - **拆出 #102**：people+teams 身分/球隊 schema 地基（additive、解耦於視圖、止住 teamId/personId
    資料漂移）；順帶記 `events.outcome` 欄缺口（決策 7，「失分結構」前置）。
  - **驗證**：`typecheck`/`lint`/prettier 綠、51 測試全過（含新增）；CI 綠後 squash 合併 #101。
    **範圍外/未做**：瀏覽器實測畫面（合併時尚未跑起 app 開這頁看，低風險待補）；視圖二/三、
    比率統計、進階記錄留後續階段。
  - **併收另一並行 session 的修復：`useMatches.ts` 編輯比賽無限迴圈 bug（未追蹤、無 issue）。**
    比賽列表按卡片「編輯」→ React 拋 `Maximum update depth exceeded`：根因是 `useMatchWithRoster`
    每次 render 都用 `serverMatchToDomain(...)` 產生**新的 `match` 物件參照**，`MatchFormDialog`
    的 `useEffect` 依賴它、內部 `form.reset()` 觸發重繪 → 新參照 → effect 再跑 → 無限迴圈
    （`useEffect` 依賴用 `Object.is` 比參照）。修法：把 `match` 用 `useMemo` 綁在
    `matchQuery.data`/`playersQuery.data` 上，資料沒變回同一物件、參照穩定、迴圈斷。同類坑
    `useRotationTable.setRoster` 註解早記過。另一回報 bug（刪預設戰術表後無法放球員）本次無法
    重現、暫不開 issue。
- **前一段（2026-07-10）: 修完 #42 一般換人持久化 bug（Phase A 後端 REST +
  Phase B 前端持久化）。**
  - **Bug**：一般換人 `regularSubs`/`subCountsHistory` 是 `ScoreSheet.tsx` 本地 `useState`，
    reload 就歸零——場上比分/輪轉早就跨 reload 存活（走後端），唯獨換人沒有。
  - **Phase A（後端 REST）**：`substitutions` 表 #97 已落地（`kind` regular/libero、時機存比分快照、
    playerIn/Out 皆 nullable + `set null`）。本階段補 `GET /matches/:id/substitutions`（join sets
    過濾、依 setId+比分排序）＋`POST /sets/:id/substitutions`（setId 取自路徑、驗擁有權）＋
    openapi 兩條路徑/schema ＋ codegen 出 `useListMatchSubstitutions`/`useCreateSubstitution`。
  - **Phase B（前端持久化）**：`regularSubs`/`subCountsHistory` 搬進 `useScoreSheet` store（比照
    `liberoSubstitution`，單一 hydrate 路徑）；`substitute()` controller 走跟 `score()` 同一套
    「本地即時 + 背景 POST」；進頁時 `GET` 回來依 `setId` 分組、`reconstructRegularSubs` 重放
    **淨疊加 dedup**（append-only log → 「現在場上是誰」，A→B→C 收斂成單筆）重建每局。後端
    `orderBy` 加 `id` 尾破同分保重放穩定。
  - **驗證**：`typecheck` 綠、44 測試全過（新增 `regularSubToApi`/`reconstructRegularSubs` 測試，
    含手動 trace 過的連鎖 re-sub）；並跑起整套 stack 做 API round-trip（POST 兩筆 → GET 回來 →
    硬 reload record 頁），統計側欄換人數 **0/0 → 2/2** 正確重建，reload 後不消失，事後清掉測試列。
  - **範圍外**：libero 換人持久化留 #43、換人 undo 留 #41。
  - **流程**：延續「PROGRESS 折進功能分支、merge 前寫」（見 [[feedback_fold_progress_into_work_pr]]），
    本更新與程式碼同一個 PR。
  - **同場另開 backlog：站位快照（#99，進階版，只記想法不實作）。** 進階版某一刻擷取雙方站位＋
    手動畫球線＋匯出 PNG 溝通，存進獨立新表（暫名 `snapshots`，match-anchored + 比分快照）、
    比賽卡片第 4 顆入口看整場快照藝廊。PO 拍板：基礎版不加（守節奏遊戲純度），進階版才做。
    對手陣型可由 `opponentRotation` 勾稽推導、唯缺對手先發身分；球線一律手動（觸球貼球員／落點自由）。
- **前一段（2026-07-09）：產品設計 T2 記錄成本預算（#74），設計文件層，未動 schema／程式碼。**
  產出 `docs/recording-cost-budget.md`。
  - **量化模型**：兩個預算池——死球空檔（15–30s，可用 ⅓≈5–10s，視線可離場）vs live rally
    （5–15s，視線離場預算≈0，必須盯球）。成本量兩件事：點擊數＋**視線離場秒數**（真正的瓶頸）。
    成本估計已對照真實 recording code（`ScoreSheetCourt` 手勢 → `RadialMenu` 動作/得失分）grounding，
    非憑空。
  - **硬分界（主結論）**：簡易版＝一分打完後、在死球空檔記**恰好一筆決定球**（誰・動作・得失分）
    ＋開局排先發＋死球期換人/暫停＋「沒看到」escape valve；進階版＝任何 per-touch／座標／每觸到位分
    ／子分類（全 live×0 預算 → 賽後影片補填）。**界線是懸崖不是斜坡**：想多記一觸就被迫進 live
    （6 觸無法事後憑記憶重建位置順序），live 視線預算≈0，中間沒有「記 3 觸」的折衷可站。獨立驗證
    了 T1 從「不可逆性」畫的同一條線（兩個不同論證、同一結論）。
  - **答出下游分層**：**#50 情境過濾（依發球方）＝零點擊成本**（發球方可由 `firstServer`+`winner`
    推導，T1 B1，屬顯示層過濾不佔記錄預算）；#51/#21 進階；#20（換人/暫停持久化）簡易（死球期事件）。
  - **補填資料模型**（答 #74 三問，皆不動 schema，`events` 已 advanced-ready）：升級同一 rally 的
    additive events 標 `source='review'`（非另存複本，winner 是單一真相種子）；「已補填」＝
    `EXISTS(event WHERE rallyId=R AND source='review')`；待補清單＝「沒看到」產生的無 action-event
    rally，天生可推導。
  - **PO 拍板**：**嚴守 T1、不開 simple+**——`serveType` 雖是唯一夠便宜的候選（per-rally singleton
    ＋零判斷），但簡易版只記決定球、發球通常不是決定球，記它得每 rally 多一筆，破壞「一筆＝一節拍」
    純度，故留進階；「沒看到」維持唯一降級 escape valve。
  - **流程實驗**：本次採「PROGRESS 折進功能分支、merge 前寫」——本更新與 doc 同一個 PR，省一次
    #95 那樣的獨立 PROGRESS PR（見 [[feedback_fold_progress_into_work_pr]]）。
- **前一段（2026-07-09）：實作 `lineups` 起始先發表（#93 → PR #94，已合併）。**
  - 新增 `lib/db/src/schema/lineups.ts` + barrel export（`schema/index.ts`）。表結構：一局一
    row、`setId` unique FK（`onDelete: cascade`）、六個 `zone{1..6}PlayerId` 皆 notNull FK 到
    `players`（`onDelete: cascade`——因 notNull 不能像 `events.playerId` 用 `set null`，選整筆
    cascade 維持「陣容完整或不存在」不變量）＋ drizzle-zod `insertLineupSchema` / 型別。
  - schema-first，已 `pnpm --filter @workspace/db run push` 到 dev DB（純新增表、無 drift）。
    **「六人不得重複」DB 表達不了，留給下游 Zod／應用層**（前端寫入 lineup 時）。
  - 實作委派 sonnet-engineer；結構沿用 T1（#73）已拍板設計，未重新設計。CI（lint+prettier+
    typecheck+test）綠燈、squash merge、#93 隨 merge 自動關閉。
  - **意義**：這是 T1 挖出的第一個硬缺口落地。#42（換人重播）現在有了 DB 基態陣容可依賴；
    輪次統計的種子就位。下一個 T1 下游是 #42（`substitutions` 表）或 #44（`timeouts` 表）。
- **前一段（2026-07-09 稍早）：產品設計 T1 事件文法領域模型（#73），設計文件層，未動 schema。**
  - 產出 `docs/event-grammar-spec.md`（PR #92）：統計反推對照表（群組 A–G，每個統計 =
    events/rallies/sets 欄位的純函數）＋ schema 缺口/決策清單 ＋ 使用者拍板清單。
  - **三個非擊球事件結構決策（fable-advisor 複審）**：換人 #42／暫停 #44 各開專用表
    （`substitutions`/`timeouts`），時機存**當下比分快照**而非 rallyId（契合 local-first 單筆
    atomic insert；塞進 events 會破壞「一 row=一觸球」不變量、逼 `rallyId` nullable、PG enum
    加值不可逆）。#51 子分類：可聚合的走 typed 欄位（`serveType`/`outcome`）、開放長尾的走
    `tags[]`（UI 用預設清單餵）。
  - **新硬缺口 → 開 issue #93 `lineups` 起始先發表**：DB 沒存「這局哪六人站哪」，是輪次統計/
    換人重播的種子（推不出來、資料補不回來）；使用者拍板早補。一局一 row、`setId` unique、
    六個 zone 欄位。
  - **使用者（PO）拍板**：lineups 早補；到位率(quality)/座標歸**進階版**（簡易版維持點人→選
    動作→得失分）；到位率分「舉球(set)/防守」＋防守新增第四類 `cover`（攔網後防守）；
    **`outcome` 基礎版也存**（維持 null⟺球續 in_play 的跨層不變量，避免「球續」與「未填」撞名）；
    **記錄體感＝節奏遊戲**（快/打擊感/即時回饋/視線不離場，是把 quality/座標/serveType 推進階版
    的理由）。仍待決定：到位門檻（暫定 `quality>=2`）、嗆司定義——先預設、與教練確認再鎖。
  - Ledger：#42 加註設計已定＋移除 `needs-plan`；#44 加註 timeouts 形狀已定、實作延後；#73
    保持開啟（2 個待決定 + schema 實作在下游）。**未動 `lib/db/src/schema/`。**
- **前一段（2026-07-09 稍早）：harness／協作結構治理，無功能程式碼。**
  - **Subagents unified to the user level.** #88 first added volleyball-customized
    `fable-advisor` / `sonnet-engineer` under `.claude/agents/`; #89 then removed them
    in favor of project-agnostic versions at `~/.claude/agents/` (outside the repo,
    shared by all projects). The generic versions read the current project's CLAUDE.md
    at start instead of hardcoding pnpm/codegen/React-pin details — single source, no
    drift. Design principles unchanged: advisor is read-only (Read/Glob/Grep + fable,
    advises only), engineer executes approved work (Read/Write/Edit/Bash + sonnet).
    Note for future sessions: don't recreate project-level copies in `.claude/agents/`.
  - **Role structure clarified and written down**: the user is the Product Owner
    (goals, value trade-offs, final approval); the main session is an executing/proxy
    PM (break down, delegate, surface decisions up). Cross-project part lives in the
    global `~/.claude/CLAUDE.md`; this repo's CLAUDE.md gained a Collaboration style
    rule — delegation must not skip the teaching step (#90).
  - **Global (outside-repo) config fixes**: `~/.claude/settings.json` had been invalid
    JSON the whole time (a `.` instead of `,`), so its entire deny/ask permission list
    was silently ignored — fixed and validated. The project's Prettier PostToolUse
    hook was pipe-tested and confirmed working.
- **2026-07-08 session (via another session, PR #87): `docs/product-deep-dive-plan.md`**
  — T1–T5 execution plan mapping onto the `area:product` issue series #73–#77.
- **2026-07-08 session: infra quality gates, issues #81 + #82 both closed.**
  - CI (`.github/workflows/ci.yml`) now runs **lint → prettier --check → typecheck →
    test** on every PR. The pre-existing debt (15 eslint errors, unformatted repo) was
    cleared first in PRs #83/#84 — commit `7573272` is the pure-format commit for
    `git blame --ignore-rev`.
  - **Branch protection is live on `main`**: the `test` check is required,
    `enforce_admins: true`（單人 repo 不對 admin 強制＝形同虛設）, squash-merge only,
    auto-delete head branches. Direct pushes to `main` are blocked for everyone —
    every change must go through a PR now. The `ship` skill's flow already matches
    this; its `--delete-branch` flag is now redundant (platform does it) but harmless.
  - **`.gitattributes` (`* text=auto eol=lf`) exists now** — without it, Windows
    `core.autocrlf=true` checked files out as CRLF and `prettier --check` failed
    locally while passing in CI. If a future session sees hundreds of phantom-modified
    files after touching attributes, it's the stat-cache effect: `git add -u` (blobs
    identical → nothing actually staged) clears it.
- **2026-07-07 session: product positioning + the `area:product` issue series (#73–#77).**
  Product direction is now written down, not just in heads:
  - `docs/product-vision.md` — 定位本文：一句話定位、TA（原型＝Excel 慢放算數據的
    系隊夥伴；擴散＝球經）、防守導向差異化、球線分布 wow 點、分享最小化（v1 單帳號、
    無多人）、PWA 優先與理由、影片畫質風險與緩解。是功能取捨的上位判斷依據。
  - `docs/marketing-page-draft.md` — 依募資課程模板填的行銷頁架構草稿；產品命名提案
    **「球跡 BallTrace」**（與「球技」諧音）；盲測/直覺/偏見調查等未執行項目誠實標
    【從缺】，商業/智財標【未驗證】。
  - 新 label **`area:product`**（青綠色，CONTRIBUTING.md 的 Area 表已補）＋五個
    產品設計 issues：**#73** 事件文法領域模型（最不可逆，統計⇐events 純函數推導）、
    **#74** 記錄成本預算（依賴 #73；單人賽中操作上限，簡易/進階分界）、**#75** 離線
    可靠性契約＋PWA（收斂 #63/#64、擋 #26）、**#76** 生命週期閉環（餵 #65/#17）、
    **#77** 定位落地與 v1 帳號模型（餵 #26）。建議順序 #73→#74 最優先。
  - `docs/spec-index.md` 的進度清單修正（原本還寫「後端 routes 尚未實作」，實際
    Phase 0–3 全完成）；導覽表加入 product-vision。
- **Match-recording backend is now fully implemented server-side, and the frontend has
  started migrating off localStorage onto it.** See `docs/backend-architecture.md` for
  the full design + phased plan:
  - **Phase 0 (#55, PR #53) — schema/spec alignment, done.** Fixed two openapi↔DB drifts
    that would have made inserts fail (`Match.name`, `Player.number`), added `events.side`
    (home/away, notNull) + made `events.playerId`/coords nullable so simple-tier
    "對手(全體)"/"沒看到" data fits (per `match-recording-erd.html`), made `matches.name`
    nullable + added `matches.userId` for future real auth. Ran codegen + `db push`.
  - **Phase 1 (#56, PR #54) — flat-resource CRUD, done.** `routes/matches.ts` (GET/POST/
    GET:id/PATCH, `userId`-scoped ownership), `routes/players.ts` + `routes/sets.ts`
    (nested under a match, ownership checked via `lib/ownership.ts`'s
    `matchBelongsToUser()`), plus `middleware/errorHandler.ts` (ZodError→400, FK→404/409,
    else→500 — a gap even `tactics.ts` had). Verified end-to-end against the real dev DB
    (happy path + 400/404), then cleaned up the test rows. (Phase 1 originally shipped
    with no `DELETE /matches` "by design" — that gap was closed in Phase 3a below, once
    the frontend turned out to actually need it.)
  - **Phase 2 (#57, PR #59) — nested rallies + events routes, done.** `routes/rallies.ts`
    (GET/POST `/sets/:setId/rallies`) + `routes/events.ts` (GET/POST
    `/rallies/:rallyId/events`, PATCH/DELETE `/events/:eventId`). Ownership now walks up
    the nesting chain via new `lib/ownership.ts` helpers (`setBelongsToUser` →
    `rallyBelongsToUser` → `eventBelongsToUser`, each join-ing one level further up to
    `match.userId`). **Correction to the original plan:** no `db.transaction()` was added
    — the openapi contract has no bulk "rally + N events" endpoint, so every write is a
    single atomic insert with nothing to wrap. A transaction would only be needed if a
    bulk endpoint is later added to `openapi.yaml`. Verified end-to-end against the real
    dev DB (create chain, list/patch/delete, FK cascade, 404/400 paths), test rows cleaned up.
  - **Phase 3a (part of #58, PR #60) — matches + roster off localStorage, done.**
    Backend gap-fill first (frontend UI already had operations Phase 1 skipped): added
    nullable `matches.tournamentId` (frontend folder grouping — backend just stores it as
    an opaque string, no `tournaments` table), `DELETE /matches/:id` (FK cascade),
    `PATCH`/`DELETE /matches/:id/players/:id`, and added `date` to `UpdateMatch` (editing
    a match's date previously silently didn't persist — a real gap). Then rewrote
    `hooks/useMatches.ts` from a Zustand+persist store into an API adapter layer (React
    Query hooks, same pattern as `TacticsBoardPanel.tsx`'s tactics save/load), with all
    the model-mismatch mapping (id integer↔string, `dateTime` local-string↔ISO, roster
    create/patch/delete diffing) centralized in new `lib/matchMapping.ts` (unit-tested).
    Roster edits use a granular diff (not delete-and-recreate) specifically to keep player
    ids stable for Phase 3b's `events.playerId`. Verified end-to-end: dev-DB curl checks
    plus an actual browser session (create/list/edit/delete a match, roster round-trip,
    tactics board loading the roster from the API).
  - **Phase 3b-i (part of #58, PR #62) — scoresheet scores/rotation off localStorage,
    done.** Decided `ourRotation`/`opponentRotation`/`serving`/per-point `wasSideOut` are
    all **derived** by replaying the rally-winner sequence — the only non-derivable seed
    is "who served first", so `sets` gained a `firstServer` (home/away) column (+ a new
    `DELETE /rallies/:id` for undo; events FK-cascade). New `lib/scoreSheetMapping.ts`
    (unit-tested) holds `us↔home`, `PointRecord→rally(+event)`, and
    `reconstructSetFromRallies`. `useScoreSheet` rewritten **local-first + background
    write**: pure Zustand reducers still update the UI instantly, but `persist` is gone
    and a new `useScoreSheetController` owns (a) a serialized write-queue that POSTs each
    rally/event and DELETEs on undo, and (b) hydrate-on-mount that rebuilds the store
    from `useListSets` + per-set `listRallies`. Verified end-to-end in the browser
    against the dev DB (score→persist→undo→delete→reload rebuild). **Events are written
    but not yet read back** — per-player stats are empty after reload until 3b-ii.
  - **Phase 3b-ii (part of #58, PR #66) — events read-back → player stats, done.** Added
    a bulk `GET /matches/:matchId/events` endpoint (joins events→rallies→sets, filters by
    `sets.matchId`) so hydration is one request instead of a per-rally N+1 (~250 requests).
    `reconstructSetFromRallies` now also takes an `eventsByRallyId` map and restores
    `action`/`touchedBy` on each `PointRecord` via new `eventToMeta` (int playerId→string,
    home/away→us/opponent), so `ScoreSheetStats`'s player matrix survives a reload.
    **Cross-match stats deferred:** the multi-match panel now shows current match only; a
    dedicated cross-match analytics page is tracked separately as #65 (not a fan-out over
    every match). **Fixed a real bug found here:** `DELETE /matches/:id` 500'd when events
    referenced real players — `events.playerId → players.id` lacked `onDelete`, so the
    match→players cascade hit an FK violation; fixed with `onDelete: "set null"` + db push.
    **This closed #58** (all of Phase 3 done). Two known 3b-i limitations remain filed:
    #63 (empty next-set reload quirk), #64 (background-write failures aren't reconciled).
  - **Libero back-row rule unified (#43, PR #67).** The "自由球員只能上後排" rule existed
    twice: the rotation table used the shared `BACK_ROW_ZONES` set, but the scoresheet's
    `isValidLiberoTarget` hand-rolled a `y <= 0.75` threshold — change the definition and
    they'd drift. Extracted `isBackRowPosition(x, y)` into `lib/rotationLogic.ts` (derived
    from the same `BACK_ROW_ZONES`, unit-tested in new `rotationLogic.test.ts`); the
    scoresheet now calls it. Pure refactor, behavior-equivalent for on-zone coordinates.
- **Process note: #58 got auto-closed by accident, then reopened.** A PR #60 body edit
  said "本 PR 不 close #58" (intending to _not_ trigger GitHub's auto-close), but GitHub's
  closing-keyword detection is a dumb substring match on "close #58" — it doesn't parse
  Chinese negation, so it closed #58 anyway on merge. Reopened with an explanatory
  comment and rewrote #58's body to reflect the real Phase 3a/3b split. **Lesson for
  future PR bodies:** to reference an issue without closing it, avoid putting
  close/closes/fix/fixes/resolve/resolves directly before a `#number` in any language —
  write "relates to #58" instead, never "not close #58".
- **`CLAUDE.md` had a stale claim, now fixed**: it said "no test framework is
  configured" and to not invent `pnpm test`, but `vitest` has actually been configured
  for a while (`artifacts/volleyball-tactics/vitest.config.ts`, jsdom) with real test
  files, and root `pnpm run test` does work (fans out via `-r --if-present`). Corrected
  the "Current gaps" section to state this accurately.
- **ScoreSheet(計分表)簡易版 recording flow redesigned** (PR #47, closes #22 for the
  simple-tier scope):
  - Action categories expanded from 4 (`serve`/`defense`/`attack`/`block`) to 6
    (`serve`/`receive`/`set`/`attack`/`block`/`dig`), matching `lib/db/src/schema/
events.ts`'s `eventActionEnum` — `types/scoresheet.ts`.
  - `RadialMenu.tsx` no longer hardcodes 4 fixed positions (`top`/`right`/`bottom`/
    `left`) — it now auto-computes each option's angle from array length + a
    `startAngle` prop, so it scales to any option count without a two-tier submenu
    (resolves the "RadialMenu can't fit >4 options" concern #22 raised).
  - New "對手(全體)" tap target on `ScoreSheetCourt.tsx`: records the action as
    `side: "opponent", playerId: undefined` when the point came from an opponent's own
    unforced error (no opposing roster exists to attribute it to a specific player).
  - New "沒看到" button: skips action selection entirely, records only the point
    outcome on `rallies`-equivalent state with zero action/player attribution.
  - Fixed a real scoring bug: 得分/失分 outcome is now judged relative to the tapped
    target's `side` (the actor), not always relative to "us" — previously tapping
    "對手(全體)" → attack → "得分" incorrectly added to our own score.
  - `ScoreSheetStats.tsx`'s player-action matrix updated to the same 6 categories.
- **`docs/match-recording-erd.html` added**: an ERD design doc (rendered first as a
  Claude Artifact, then saved into the repo) exploring how the already-shipped
  ScoreSheet(簡易版) and the still-unimplemented `events`-table pipeline(進階版) should
  share one schema instead of staying parallel. Key decisions captured there: a new
  `events.side` column (home/away, notNull — who performed the touch, independent of
  `rallies.winner`), `events.playerId` becomes nullable (opponent-side actions have no
  roster to point at), `fromX/fromY/toX/toY` become nullable (simple tier never records
  coordinates) — none of this schema change has been implemented yet, it's design-only.
- **Issue #22 closed**, its unfinished scope (action sub-types like 跳發/飄球/跳飄,
  Violation category, Outcome detail expansion) split into new follow-on
  [#51](https://github.com/aila8913/volley-tatic-board/issues/51) since that part is
  advanced-tier (post-match video review) work, not simple-tier.
- **Issue #29 fixed** (PR #46): tactics-view court bottom border now uses
  `vector-effect="non-scaling-stroke"` so it doesn't get squished by the viewBox;
  "重置站位" now has a `window.confirm` guard; "← 比賽列表" extracted into a shared
  `BackToMatchListButton.tsx` and added to `TacticsBoard`/`ScoreSheet`/
  `TournamentDetail`/`not-found` (previously missing on some of those screens entirely).
- **Of the two bugs/ideas filed in the session that opened them, #49 is now fixed**
  (see "Current state" bullet above — PR #61, pending merge); #50 is still open:
  - [#49](https://github.com/aila8913/volley-tatic-board/issues/49) — root cause turned
    out to be neither of the two hypotheses in the issue: the tactics-view whiteboard
    had no background rect of its own, so its true (letterboxed) extent visually
    blended into the court's white and the page's white. Fixed by giving the
    court-canvas its own bounds and reworking the panel→whiteboard→court-element
    padding chain (PR #61).
  - [#50](https://github.com/aila8913/volley-tatic-board/issues/50) — ScoreSheet action
    options should be context-aware based on who's currently serving (serve/receive
    should be mutually exclusive depending on `currentSet.serving`); user noted more
    context rules may follow but hasn't defined them yet. Not started.
- **A pre-existing, unrelated-to-this-session problem was found and fixed while
  shipping**: local `main` had a commit (`a28749f`, the Mermaid.js flow-diagrams
  rewrite) that had never been pushed to `origin/main`. This caused a divergence when
  PR #46 was squash-merged (same pattern PR #32 tried to prevent, but that fix only
  covers commits made _during_ a session — this one predated it). Resolved with a merge
  commit (same precedent as PR #31's "Merge origin/main after squash-merging" pattern),
  then pushed so local/origin `main` are back in sync.
- Previously landed (still true, unchanged this session): new onboarding docs (PR #33),
  the three-way 輪轉表/戰術板/計分表 split (PR #28), tactics-board snapshot decoupling
  (PR #30), offline `docs/flow-diagrams.html` (PR #31, now also carries issue-number
  cross-references added this session for #35–#45 via issue #34's fix).
- Backend match-recording API is **fully implemented server-side** (Phases 0–2 + the
  3a/3b-i gap-fills: matches/players/sets/rallies/events CRUD, plus `sets.firstServer`
  and `DELETE /rallies/:id`, plus the bulk `GET /matches/:id/events`, all live and
  dev-DB-verified). **The frontend scoresheet is now fully off localStorage: matches/players
  (3a), scores/rotation (3b-i), and events read-back → per-player stats (3b-ii, PR #66).
  #58 is closed.** Next big pieces build on this: #51's advanced-tier recording and #65's
  dedicated cross-match analytics page.
- **New human-facing onboarding docs exist** (PR #33), written for a teammate who is new
  to programming/Git/GitHub/AI-agent collaboration (design/PM background):
  - Root [`README.md`](../README.md) — project one-liner, points first to
    `docs/flow-diagrams.html` for a fast mental model before reading code, tech-stack
    table, quick-start commands, repo layout guide (what's editable vs. generated), and
    links out to the other two docs.
  - [`docs/onboarding.md`](./onboarding.md) — zero-background primer on what Git/GitHub/
    an AI agent (Claude Code) actually are, an environment-install checklist, and what
    `CLAUDE.md` plus the `catch-up`/`ship`/`wrap-up` skills do. Links out to
    `CONTRIBUTING.md` for the concrete commit/PR/label mechanics rather than duplicating
    them.
  - `CONTRIBUTING.md` (created by another session alongside the new issue-label
    taxonomy) had its opening section reworked this session to point at `README.md`'s
    quick-start instead of `CLAUDE.md` (which only lists env-var names, not runnable
    commands), and `.claude/skills/wrap-up/SKILL.md`'s label-creation instructions were
    updated to reference `CONTRIBUTING.md`'s taxonomy instead of a one-off `needs-plan`
    snippet, so the label rules live in one place.
- Also landed since the last real update to this file: PR #31 (offline
  `docs/flow-diagrams.html`, already reflected below) and PR #32 (fixed the `ship` skill
  to branch _before_ committing, avoiding local/`origin` `main` divergence after
  squash-merge).
- **The former single "tactics board" is now three independently-named features**, both
  in conversation and in code (PR #28):
  - **輪轉表 (rotation table)** — `components/RotationTable.tsx` (was `LeftPanel.tsx`) +
    `hooks/useRotationTable.ts` (was part of `useTactics.ts`). Owns `roster`, per-rotation
    `positions`/`liberoReplacement`, `currentRotation`, `startingLiberoId`, `circleLabel`.
  - **戰術板 (tactics board)** — `components/TacticsBoardPanel.tsx` (was `RightPanel.tsx`)
    - `hooks/useTacticsBoard.ts`. Owns `tacticsByRotation` (markers/defense
      ranges/tactics-view positions), tool state, undo/redo, project save/load.
  - **計分表 (scoresheet)** — `pages/ScoreSheet.tsx` (was `MatchRecording.tsx`) +
    `hooks/useScoreSheet.ts` (was `useRecording.ts`), plus renamed
    `ScoreSheetCourt.tsx`/`ScoreSheetStats.tsx`. `liberoSubstitution` moved from the
    shared tactics store into `ScoreSheetState`, keyed per matchId (previously a single
    global value that would leak across different matches' scoresheets — fixed as part
    of the split).
  - `pages/TacticsBoard.tsx` still hosts 輪轉表 (left) + `Court.tsx` (center) + 戰術板
    (right) **simultaneously side by side** — a same-day attempt to make them a
    page-flip (only one mounted at a time) was tried and reverted; the user wants both
    always visible.
- **Tactics-board editing is now a one-time snapshot, not a live view of rotation-table
  data** (same-day follow-up after the split, PR #30):
  - Clicking "戰術布置" calls `useTacticsBoard.enterTacticsLayout()`, which copies
    `useRotationTable`'s current-rotation positions into `tacticPositions` once, then
    editing is fully independent — nothing written in 戰術布置 flows back to
    `useRotationTable` anymore, including the libero (no more back-row-only rule or
    `startingLiberoId` sync while in tactics view; it's just a plain marker there now).
    Every click on "戰術布置" re-snapshots and overwrites whatever was there — there is
    no "resume"; to keep edits, save as a tactic and reload it.
  - A separate "編輯" button (disabled until a saved tactic is loaded from the list)
    resumes editing the _currently loaded_ data as-is, without re-snapshotting — this is
    the path for editing a previously-saved tactic.
  - Removing a player branches by which view is active: rotation view still calls
    `useRotationTable.removePlayerFromCourt`; tactics view now calls
    `useTacticsBoard.removePlayerFromTacticView` (local to the current snapshot only).
    The old cross-store cleanup action was removed as unnecessary.
  - Layout-mode footer is now **取消 / 儲存 / 另存新檔** (cancel discards without
    saving and returns to rotation view; "＋新建空白戰術" was removed entirely, along
    with the now-dead `newProject` action).
  - **Fixed a real bug found while testing this**: `Markers.tsx` (arrows/dashed
    lines/attack lines/text/volleyball icons) had no drag-to-move logic at all — only
    click-to-select — unlike `DefenseRange.tsx` which already supported dragging. Added
    the same pointer-capture drag pattern to all marker types.
- **Operation-flow / state-machine reference docs exist for all three features** plus a
  page-transition overview, saved as a file at `docs/flow-diagrams.html` — closes #27.
  Keep this updated per the `wrap-up` skill's step for it (overwrite the "recent
  changes" callout each session, don't accumulate one).
  - **All 4 diagrams were rewritten from hand-coded SVG (manual x/y coordinates for
    every box/arrow/text label) to [Mermaid.js](https://mermaid.js.org/) syntax**
    (`stateDiagram-v2` / flowchart blocks in `<pre class="mermaid">` tags) — much
    easier to edit the diagram content without fighting coordinates. **Tradeoff: the
    file is no longer fully offline** — it now loads `mermaid.js` from a CDN
    (`cdn.jsdelivr.net`) via an ES module `<script>` tag at the bottom of the file, so
    an internet connection is required to render the diagrams (the file still opens
    fine with no dev server, just needs network access).

## Known gaps / next big pieces

Tracked in GitHub Issues (open backlog, check `gh issue list --state open` for current
status — the list below is a snapshot, not guaranteed up to date). Since 2026-07-11 the
backlog is **phase-ordered via Milestones M1–M5**（current phase = lowest-numbered
milestone with open issues; `gh issue list --milestone "M1 簡易版收尾"` to scope）:

- **`area:product` 系列（#73–#77，2026-07-07 新開）**——動程式碼前的概念設計層，
  上位依據是 `docs/product-vision.md`：
  ~~[#73] 事件文法領域模型~~——**已完成並關閉（設計 PR #92＋對帳收束 PR #105，見 Recently closed）**→
  [#74](https://github.com/aila8913/volley-tactic-board/issues/74) 記錄成本預算
  ——**T2 設計已完成（見 `docs/recording-cost-budget.md`）**，畫出簡易/進階硬分界＋答出
  #50（零成本）/#51/#21/#20 的分層；PO 拍板嚴守 T1、不開 simple+。落地待回灌各下游 issue、

  [#75](https://github.com/aila8913/volley-tactic-board/issues/75) 離線可靠性契約＋PWA
  （收斂 #63/#64、擋 #26）、
  [#76](https://github.com/aila8913/volley-tactic-board/issues/76) 生命週期閉環
  （餵 #65/#17）、
  [#77](https://github.com/aila8913/volley-tactic-board/issues/77) 定位落地與 v1 帳號
  模型（餵 #26）。

- ~~[#93] `lineups` 起始先發表~~ — **已完成並關閉（PR #94）**。`lib/db/src/schema/lineups.ts`
  已 live（dev DB），一局一 row、`setId` unique、六 zone notNull FK。#42 換人重播現在有基態陣容
  可依賴。「六人不得重複」驗證留給下游應用層。
- [#17](https://github.com/aila8913/volley-tatic-board/issues/17) — UX 重整：視圖控制
  流程、輪次選擇簡化、頁首漢堡選單. **Status per part:** part 1 (Sheet-based saved-tactics
  list) and part 3 (hamburger menu) not started. Part 2 (rotation picker) partially done
  by PR #69 — thumbnails replaced by a prev/next `RotationSwitcher` (different design than
  spec'd, but the same "remove visual clutter" goal), but the "重置站位"/"清除畫筆" buttons
  it wanted removed are still in `RotationTable.tsx`, and the picker is still gated behind
  `isLineupComplete` rather than always showing. Issue body corrected this session to
  reflect current file layout and drop the reference to the now-deleted
  `handleExportAllPNG` (#38).
- [#19](https://github.com/aila8913/volley-tatic-board/issues/19) — 計分表（
  `pages/ScoreSheet.tsx`, issue body still says `MatchRecording.tsx`) UI 簡化與調整,
  placeholder issue depending on #20/#21.
- [#20](https://github.com/aila8913/volley-tatic-board/issues/20) — 計分表多項 Bug 與
  功能補齊. Bug 2 (場外換人入口) confirmed already resolved by earlier work (see
  comment on the issue); Bug 1/3 + sub-count-limit UI still open.
- [#21](https://github.com/aila8913/volley-tatic-board/issues/21) — 球線軌跡記錄（進
  階版：精確座標記錄）. Highly related to new issue #51 — both are "advanced tier"
  recording scope, probably worth designing together. This session's ERD work leans
  towards resolving #21's open "落點要精確座標還是號位" question in favor of precise
  coordinates (zone becomes a derived display value, not an input field).
- [#24](https://github.com/aila8913/volley-tatic-board/issues/24) — 複製比賽。
- [#26](https://github.com/aila8913/volley-tatic-board/issues/26) — 部署準備。上游的
  設計決定在 #75（離線契約）與 #77（auth 形態）。
- [#50](https://github.com/aila8913/volley-tatic-board/issues/50) — 計分表動作選項應
  依發球方做情境限制（發球/接發互斥）。
- [#51](https://github.com/aila8913/volley-tatic-board/issues/51) — 進階版：動作子分
  類、犯規類型與 Outcome 細節擴充（#22 的後續，見上方 Current state）。Backend 地基
  已完全就緒且 #58（Phase 3）已全數完成，這塊現在可以直接開工。
- [#65](https://github.com/aila8913/volley-tatic-board/issues/65) — 專門的數據分析頁面
  （跨場/彙總統計）。**本 session 已規劃定案並落地「視圖一＝單場比賽分析」骨架（PR #101）**：
  三視圖（單場★核心/隊伍/球員跨場跨隊）、優先序反轉為單場優先、不做 GA4 客製化、樣本數降飽和、
  schema 解耦、身分模型選項 A——全部記在 #65 留言。剩下：視圖一補齊比率統計（side-out%/輪次得失，
  現為空狀態）、視圖二（隊伍，需 #102 的 `teams`）、視圖三（球員跨場跨隊，需 #102 的 `people`）、
  差異化區塊（到位率/球線熱區，需進階記錄 #51/#21）。`needs-plan`、`priority:essential`。
- [#99](https://github.com/aila8913/volley-tactic-board/issues/99) — **本 session 新開**：站位快照
  （進階版）。比賽任一時刻擷取雙方站位＋手動畫球線＋匯出 PNG 溝通；獨立新表 `snapshots`
  （match-anchored + 比分快照，復用戰術板 `tacticPositions`/`markers`/`defenseRanges`），比賽卡片
  第 4 顆入口＝整場快照藝廊。與 #21（球線軌跡，同一套手動畫線模型）、#51（進階版）、#65（數據頁
  ＝第 3 顆入口）同屬 advanced tier，可一起設計。**只記想法，進階版才實作，基礎版不加。**
- [#63](https://github.com/aila8913/volley-tatic-board/issues/63) — 3b-i 已知限制：剛按
  「下一局」但未開球的空局還沒寫進後端，reload 後會退回顯示上一局（低優先 edge case）。
- [#64](https://github.com/aila8913/volley-tatic-board/issues/64) — 3b-i 取捨：背景寫入
  API 失敗只記 log、不回滾/reconcile（dev/單人堪用；部署前要處理，關聯 #26）。

## Recently closed

- #73 — 事件文法領域模型（統計⇐events 純函數）。設計基石，分兩段：**設計 T1（PR #92，
  `docs/event-grammar-spec.md`，7 決策 2026-07-09 拍板）＋對帳收束（PR #105，2026-07-11，`Closes #73`）**。
  對帳把 spec 標的缺口對到現在 schema：`lineups`/`substitutions`/`events.outcome` 三個「必須早補」
  的結構缺口已於 #42/#97/#98/#102 全落地。剩餘為進階版欄位（#51/#21/#44）與教練待確認項（到位門檻
  `quality>=2`、嗆司定義，有預設在跑），各自下游追蹤，不需 #73 空掛。
- #102 — `people`＋`teams` 身分/球隊 schema 地基（#65 階段 1/2）。**本 session 落地並關閉（PR #104）**：
  兩張新表（`people`＝跨場跨隊唯一「人」身分、`teams`＝分組標籤）＋`players.personId`/`matches.teamId`
  nullable FK（皆 `onDelete: set null`，保留歷史事實）＋順手補 `events.outcome` enum（決策 7）。`db push`
  已套用 dev DB。身分模型走顧問拍板的選項 A。PO 拍板三事（建賽隊可選／去重 UX 分階段／舊比賽只填新資料
  不回填）記在 issue 留言。**刻意留給 #65 後面階段**：openapi/codegen、前端讀寫、建名單去重 UX、舊資料回填。
- #42 — 計分表換人紀錄不持久化、reload 消失。**本 session 修完（PR #98）**：Phase A 補
  `substitutions` 後端 REST（`GET /matches/:id/substitutions`＋`POST /sets/:id/substitutions`＋
  openapi/codegen；表本身 #97 落地），Phase B 把 `regularSubs`/`subCountsHistory` 搬進
  `useScoreSheet` store 走「本地即時＋背景 POST＋進頁重建」，重建時重放淨疊加 dedup。API
  round-trip + 硬 reload 驗過（換人數 0/0→2/2）。libero 持久化留 #43、換人 undo 留 #41。
- #81 — lint/format 存量清理＋納入 CI。三個 PR：#83（全 repo 格式化）、#84（15 個
  eslint 錯誤，含 Court.tsx hooks 規則真 bug）、#85（CI 步驟＋`.gitattributes` 統一
  LF）。
- #82 — branch protection：`test` check 必須綠燈才能合併 main（含 admin）、squash
  merge only、合併後自動刪分支。用 `gh api` 設定，細節見 issue 關閉留言。
- #38 — 匯出6輪PNG 過程沒鎖住其他操作。決定不補鎖機制，直接砍掉整個功能（PR #71）。
- #36 — 輪轉表/戰術板移除球員邏輯分散兩個 store。複查發現 PR #30 的快照解耦重構已經
  解決，`removeFromCourt()` 現在 if/else 二選一，不需額外重構。
- #35 — 輪轉表刪除球員留下幽靈站位，PR #69 修正（`setRoster` 一併清殘留站位）。
- #45 — 計分表「下一局」沒有勝負判斷，PR #69 加上 `isSetComplete` 勝局條件檢查。
- #37 — 先發/排陣完整度檢查太寬鬆，PR #69 收斂到共用 `isLineupComplete`。
- #25 — 先發/先接切換，討論後決定不做（使用者自行溝通即可），非技術限制。
- #58 — 後端 Phase 3：計分表從 localStorage 切到 API。Phase 3a（matches+名單，PR #60）、
  3b-i（比分/輪轉，PR #62）、3b-ii（events 讀回 → 球員統計，PR #66）三段全部完成，計分表
  已完全脫離 localStorage。跨場統計拆到獨立的 #65。
- #43 — 自由球員「後排才能上」規則原本計分表(`y<=0.75`)與輪轉表(`BACK_ROW_ZONES`)各判各的，
  已抽出共用的 `isBackRowPosition` 收斂到單一來源（PR #67，附 `rotationLogic.test.ts`）。
- #55 — 後端 Phase 0：schema/openapi 三層對齊、events 加 side+nullable、matches 加
  userId，已在 PR #53 完成（retro issue，開完即關以留 ledger 軌跡）。
- #56 — 後端 Phase 1：matches/players/sets CRUD 路由 + errorHandler middleware，已在
  PR #54 完成並對真實 dev DB 端對端驗證（retro issue，開完即關）。
- #57 — 後端 Phase 2：rallies + events 巢狀路由，已在 PR #59 完成並對真實 dev DB
  端對端驗證（放棄原描述的 `db.transaction()`：合約無 bulk endpoint，單筆寫入本就
  原子）。
- #22 — 簡易版所需的動作分類擴充（4→6 大類，對齊 events 表）與 RadialMenu 選項數量
  限制已在 PR #47 完成；子分類/犯規類型/Outcome 細節拆到 #51 繼續追蹤。
- #29 — 戰術布置測試發現的邊框、確認彈窗、返回按鈕問題，已在 PR #46 修正。
- #34 — flow-diagrams.html 的 T5 標記矛盾，已修正並補上已知問題對應的 issue 連結。
- #27 — 輪轉表/戰術板/計分表操作流程圖 + 狀態機圖 + 頁面跳轉大圖，存成
  `docs/flow-diagrams.html`。
- #14 — libero substitution bug + 先發 UX unification, fully fixed in PR #23 (commit
  `5dcc4ed`); PR #16 had only partially fixed it (rotation view only), see the
  clarifying comment added on the issue.
- #10 — decided not to implement cross-match tactic reuse for now; single-match scope is
  enough, can reopen later if needed.
- #12 — brush-tool requirements resolved into #17 (UX overhaul) instead; no standalone
  brush feature planned.
- #13 — base rotation setup now just uses drag-to-grid (existing implementation); the
  separate left-panel 3×2 grid idea was dropped.
- #15 — `/ship` skill (git commit → branch → push → PR → merge flow) written and in use.
