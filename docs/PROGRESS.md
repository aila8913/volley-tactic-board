# Progress Snapshot

> This is a **rolling ~1-week snapshot, not a log**. The `wrap-up` skill **overwrites**
> the "Current state" section each session and prunes anything older than roughly a week —
> it does **not** append an ever-growing history.
>
> **Durable facts don't live here.** 每種事實只有一個家，對照表在 `CLAUDE.md` 的
> **「事實住哪裡」**一節（唯一一份，這裡不再抄——抄了就是那張表自己在示範的錯）。
> 判斷法一句話：**問「這件事一週後還該留著嗎？」該留 → 家就不是這裡。**
>
> ⚠️ **這份檔案很薄是刻意的，不是過期。** 判斷它 stale 的依據是「內容跟 `git log`／issue
> 狀態衝突」，不是行數；**「這裡沒寫」＝「它的家在別處」**，不是「不存在」。
>
> **各自的進度分區寫，別跨區改**（#146）：`Current state` / `Recently closed` 都拆成
> **開發進度 (aila)** 與 **設計進度 (tang)** 兩個子區塊。各自 wrap-up 時只改自己那區，
> 平行 PR 就落在不同行段、git 幾乎都能自動合併。上面的 `_Last updated_` 是**共用一行**摘要。

\_Last updated: 2026-08-11 (aila) — **PROGRESS 大剪一次（830 → 約 340 行）**：判準與教訓各自歸位
（新增 [ADR-0006](adr/0006-no-schema-push-in-build.md)，milestone 收件標準歸 `wrap-up/reference.md`，
fixture 規則歸該檔檔頭），Known gaps 一批過期的 milestone 歸屬與已交付項目一併修正。
同批交付 #370（視圖③ 得/失分結構）、wrap-up 的 ADR 檢查步驟、以及
**`docs/usage-scenarios.md` 使用者情境盤點**（→ #372）。tang 於 08-06 交付 PR #321
（設計系統背景層＋token＋一鍵記分），該區未動。\_

## Current state

Where the project actually stands right now（**只寫現在成立的事實**；某一次 session 做了什麼，
去 git log 與那張 issue 看）。

### 開發進度 (aila — backend / frontend / db / infra)

- **後端 REST API 全實作、live（dev DB）。** matches / players / sets / rallies / events /
  substitutions / lineups / timeouts / tournaments / teams CRUD ＋ tactics / health ＋ `analysis`
  唯讀報表路由，全部 ownership-scoped。前端計分表**已完全脫離 localStorage**，資料夾（tournaments）
  同樣進 DB。設計與分期沿革見 `docs/backend-architecture.md`。
  - route 檔的兩層儀式已收斂且**必填**：`lib/handler.ts` 的 `owns`（漏寫擁有權檢查＝編譯錯誤）、
    `lib/insertIdempotent.ts` 的 `scope`（不限定在已驗過擁有權的上層底下，重送重讀那列就是 IDOR 探測管道）。
  - ⚠️ **POST/PATCH 是逐欄列舉**（刻意的——`...body` 會讓路徑決定的 `rallyId` 有被蓋掉的風險），
    而**漏列一個 nullable 欄位不是型別錯誤、也沒有測試會紅**。結構缺口是 **#368**，別為了解那張票
    把它改成展開。
- **Schema 地基齊了。** `lineups`（起始先發，一局一 row）、`substitutions`／`timeouts`（存比分快照）、
  `events.outcome`、`people`＋`teams`（`players.personId`／`matches.teamId` nullable FK、
  `onDelete: set null` 保留歷史事實）、`matches.format`（賽制 enum）、`matches.status`
  （`in_progress | finished`，**ADR-0005**）全部 live。五張表主鍵是 client-mintable uuid，
  **主鍵本身就是冪等鍵**。`people` 已有應用層（#213）。詳見 `docs/db-schema-spec.md`。
- **`events.outcome` 有值、也有消費者。** 推導式只有一條、三處落點共用：
  **`outcome = (events.side === rallies.winner) ? "point" : "loss"`**（以**執行這球的一方**為基準，
  不是以我方）。簡易版一個 rally 只記一顆決定球，所以永遠不會有 `in_play`。視圖③ 已長出得/失分結構
  （後端 grain 是 action × outcome，同一次掃描餵出舊的動作分布與新的得失分結構）。
  - `unknown` 桶（null）刻意保留：回填腳本跑過本機與正式站，但那不是欄位與生俱來的保證，
    任何新環境的舊資料仍會是 null。前端只在 `unknown > 0` 時才顯示那一欄。
  - ⚠️ **同一條規則目前有三份推導**（`resolveOutcome` / `buildPlayerMatrix` / `buildRotationStats`），
    答案一致所以不是 bug，觀察點記在 #370——**現在收斂等於為了對稱而改一段沒壞的程式**。
- **前端 store 全面 per-match 分片。** 計分表（`useScoreSheet`）、戰術板／輪轉表
  （`useTacticsBoard`／`useRotationTable`）都是 `dataByMatch[matchId]`，A 場編輯不污染 B 場；
  戰術板/輪轉表工作狀態**不 persist**（PO 決策：只有存成戰術才算數）。切輪次的跨 store 同步走
  `RotationSwitcher → syncRotationChange` 明確呼叫，不靠全域 subscribe。
- **站位＝全站共用單一真相**（07-21 PO 定案，**推翻 #115 的解耦模型**，作廢註記在 #115 留言）。
  唯一真相是 `useRotationTable.dataByMatch[matchId]`：比賽列表決定站位，計分表讀它也寫它，
  戰術板右欄唯讀。共存機制是「**共用現役＋開局凍結**」——每局開賽那一刻擷取成該局的凍結快照
  （`ScoreSheetState.lineup` 語意＝歷史快照，不是平行的第二份先發），此後該局唯讀。
  判斷式只有一行 `activeLineup = lineup ?? capturableLineup`。
- **戰術板是單向的**：快照是 denormalized 的自給自足 `CourtSnapshot`，載入已存戰術＝唯讀檢視、
  **不反向寫回輪轉表**，這條單向依賴由 eslint `no-restricted-imports` **焊在 CI 上，不得停用**。
  模式（browse／viewing／edit）是推導值，store 裡沒有 mode 欄位。決策見 **ADR-0001**／**ADR-0002**。
- **先發與自由球員的表示法只剩一份。** `PerMatchRotationState` 只存
  `lineup: LineupSnapshot`（起始號位 → playerId，0~6 人皆合法）＋ `liberoReplacesPlayerId`（L 頂替誰）
  ＋ `startingLiberoId`，六輪座標由 `deriveRotation(...)` 渲染時現算（`event-grammar-spec.md`
  那條**「能推導就不存」**的 store 版）。「可不可以開賽」獨立成 `isLineupFull`。
  - **L 的規則定案：從後排轉出去就下場、留在場外，直到手動再換上場**——系統不自動找下一個頂替對象。
    理由不是「猜得不準」，而是**這個 app 產出的是紀錄不是示意圖**。「L 不能跟著輪到前排」因此是
    一行推導，不需要清理邏輯。
  - 入口是輪轉表的**第七格**（3×2＋1）：存的是「頂替誰」不是「站哪格」，六個號位是輪轉序、L 不佔輪轉序。
    三個呼叫端＝計分頁右欄（真正的入口）／比賽列表右欄／戰術板右欄（唯讀，ADR-0001）。
  - ⚠️ **這些指派完全沒有持久化**（不在 DB、不在 localStorage、不在逐局快照）→ #359。
- **比賽編輯＝右欄就地編輯**（#329）。選中→唯讀（`MatchDetailView`）、按左欄卡片「編輯」→ 同一欄
  變表單（`MatchDetailForm`）、新增比賽→右欄開在空白編輯模式。`MatchFormDialog` 已刪除。右欄由上而下
  固定是**比賽資訊 → 場上站位 → 第幾局 → 球員名單**，唯讀與編輯兩種模式模組順序一致。
  - ⚠️ **站位的唯讀規則跟「比賽資訊在不在編輯狀態」是兩個不同層次的可寫性**，`editing` 刻意完全不參與
    那段計算、也沒接進 `RotationRailPanel` 的 `readOnly`。`MatchInfoRail.tsx` 有一段註解把這條紅線寫死。
- **計分頁的寫入是一條有序 write log，撐得過離線與 reload**（#64 四個 PR 已全數交付）。
  六個動作 append `WriteLogEntry`，集中的 executor 依序翻成 API 呼叫；entry 進 **IndexedDB**
  （主鍵 `[matchId, seq]`），開頁補送、送成功才刪（＝至少送一次）。退避 `3s→10s→30s→60s`，
  UI 是 `UnsyncedWritesBadge`。後端五支 POST 有 `ON CONFLICT (id) DO NOTHING`＋**先驗 parent 相符才回
  既有列，否則 409**。設計契約見 #75（**建立在「單裝置單人」前提上**，所以是重放不是合併、不需要 CRDT）。
  - **已知缺口**：開頁當下後端就連不上時，hydrate 全失敗 → 停在「載入計分記錄中…」，徽章沒機會顯示。
    要修得先有「整場資料的本機快取」，那是離線**讀取**、不是離線寫入的題目。
- **領域規則都有主人了**（M3.5 的共同主題：一條規則被複製成兩三份手寫拷貝然後各自漂走）。
  現有的規則模組：`volleyballRules.ts`（含 `visibleSetCount()`＝「有幾格可以滑」，判準是
  **那一格裡有沒有資料**而不是「已完賽就不 +1」）／`rotationLogic.ts`／`liberoRotation.ts`／
  `courtGeometry.ts`／`matchOutcome.ts`／後端 `analysisSummary.ts`。戰術板場景編輯一律走
  `editSession(mutate, { history })`，`HistoryPolicy = "record" | "defer"` 是**必填的字面量聯集**
  ——漏寫政策是編譯錯誤，不是靜靜挑到錯的預設值。
- **測試現況。** vitest 跑 `volleyball-tactics`（jsdom）與 `api-server` 兩包；
  **`@testing-library/react` ＋ user-event 已裝**，基礎設施在 `src/test/`（詳見 `CLAUDE.md`，
  含那個 jsdom 沒有排版引擎、hover 展開的 UI 會誤收合的坑）。測試檔**會被 typecheck**。
  假資料走 `src/lib/__fixtures__/scoreSheet.ts` 的 builder。
  - **仍在盲區**：`Markers.tsx`／`DefenseRange.tsx` 的 `didMove` 手勢守衛、
    `Court.tsx`／`ScoreSheetCourt.tsx` 的座標數學與拖曳（→ #168）。
- **示範資料與測試沙盒。** `lib/db/src/demoData.ts` 的 `seedDemoData(exec, userId, seed)` 是**唯一一份**
  示範資料建構器，兩個消費者共用（`db:reset` 種子腳本、`POST/DELETE /demo-data`）。內容是
  **1 場完整走完的比賽**而不是多場零碎的——示範資料的價值在「完整走完一場」。
  `pnpm run db:reset` ＝ push ＋ 清空 ＋ 重灌，搭配另開一顆沙盒 DB 用。
  **兩道安全閘門都是白名單不是黑名單**（`assertSafeDatabaseHost` 只放行 localhost 那幾個、
  刪示範資料用 `and(eq(userId), eq(isDemo, true))`）。已知限制 → #341。
- **有一份使用者情境盤點了：`docs/usage-scenarios.md`**（08-11，導覽討論的副產物）。
  五大類使用者 × 十七個時機（A1–A5／B1–B6／C1–C3／D1／E1–E2），每個標裝置、身體約束、時間預算；
  大類沿用 `product-vision.md` 已定義的 TA，不另立一套。**它存在的理由是導覽爭論會原地打轉，
  因為每個人腦裡假設的情境不同、而那個假設沒被講出來**——有編號之後可以問「你說的是 B3 還是 A3」。
  - 順帶照出兩個空白：**C1**（教練賽中借平板看一眼，30 秒）完全沒被設計過，現有分析頁全是為
    A4（從容坐著找洞察）做的；**B5**（記錯了要改）沒出現在任何既有文件裡，但球經在壓力下記錯是必然。
  - 這輪的判準被推翻兩次（各漏了一個時機）才收斂到「需不需要先指定一場比賽才有意義」，
    過程記在 #372——**推翻的理由比結論有用**。
- **部署：merge 不會幫你 push schema，這是刻意的** → [ADR-0006](adr/0006-no-schema-push-in-build.md)。
  動 `lib/db/src/schema/` 的 PR 合併後要**人工**跑一次 push；CI 全綠不代表正式站會動。
  提醒機制本身開成 #354。

### 設計進度 (tang — 視覺 / UX / area:design)

- **深色語言已套完全站、手繪風全站退役，#131 於 07-23 關閉**（`docs/design-spec.md`）：深色儀表板語言
  （`#0a0b07` 底＋萊姆綠 `#C6F135`＋玻璃卡片＋Space Grotesk/JetBrains Mono）。`wobbly-border` 與
  `--font-display`/Caveat/Permanent Marker 死碼已從 `index.css` 清掉。品牌 logo mark 已定案
  （`public/favicon.svg`）。**寫 UI 前先讀 design-spec.md**；實作數值以該檔「實作微調」「實作決定」註記
  為準（邊框 `white/[0.12]`～`[0.26]`、球場單一平色 `#1B6E62`——非原始的 `#121310`/暖木色）。
  **整頁背景已於 08-06 換成製圖紙（見下一條），`#0a0b07` 不再是背景值。**
  （#134 仍 open，但**只剩 Track A／C**：Track B 材質強化已由設計系統接手並推廣全站；Track A 微 3D 已
  拍板延後到很後面；Track C 版面呼吸空間等功能介面先穩定，目前介面不夠流暢之處彙整在 #209。#132
  首頁 review 收尾獨立進行。）
- **設計系統「戰術版風格」已落地：整頁背景＝製圖紙、`--ds-*` token 進 `:root`**（PR #321，08-06）。
  來源是 tang 在 claude.ai/design 建的設計系統專案（含 7 個元件、2 份頁面樣板）。這一輪只取「背景＋
  token」，字體與元件對齊留待後續。背景組成：底色 `#050603` → 48/240px 雙層網格 → 青綠／萊姆兩顆光暈
  → 斜光束 → 噪點 → 暗角，52 秒一輪的極慢飄移。實作是 `index.css` 的 `.app-canvas`，全站 8 頁透過
  `APP_SHELL_CLASS` 共用。
  **換掉舊漸層的理由是玻璃質感，不是換花樣**：`backdrop-filter` 模糊的是元件背後的東西，漸層太平滑、
  模糊完幾乎還原成純色，玻璃感沒有真的產生；網格與噪點是高頻細節，blur 攪得動，球場毛玻璃地板才讀得
  出來是玻璃。**網格弱化有下限**——弱到看不見就退回這個坑，調 #320 時要一併確認 `.court-glass` 還像玻璃。
  背景層全站只掛一次，各頁重複的 `.tb-beam` 已移除（該 class 已從 `index.css` 刪除）。
  **技術細節**：背景層用 `z-index: -1` 搭 `isolation: isolate`——isolate 讓 `.app-canvas` 自成 stacking
  context，負 z-index 被關在裡面，只疊在自己底色之上、所有內容之下；少了 isolate 會往頁面後面竄而看不見。
  29 個 token 目前 12 個有 `var()` 消費者，其餘 17 個（色彩／玻璃兩階／骨架寬度）是既有字面值的正規
  來源，遷移另計。**待調**：底色更深＋格線更弱（#320）；載入／錯誤狀態頁還沒吃到新背景（#322）。
- **計分板改成一鍵記分**（PR #321 同批，08-06）：點我方／對手大比分卡直接記一分，不再彈「選動作 →
  選得失分」兩層選單（原本記一分要點三次，跟不上比賽節奏）。**刻意不記 `action`／`touchedBy`**——那個
  當下不知道是誰碰的球、做了什麼動作（可能是對方失誤），硬填推測值會汙染球員統計，**寧可少記也不要記
  假的**。要記細節的路徑保留：點球場上的球員仍走原本的選單流程。所以計分頁有**兩個入口並存**（比分卡
  ＝快、球場＝細），這層關係已寫進 design-spec 第 5 節，#21 重新設計球線軌跡時不要把快速路徑吃掉。
  比分卡同時從 `<div>` 改成真正的 `<button type="button">`（它是整頁最主要的操作，鍵盤／螢幕閱讀器
  都該用得到）。已知會 aila：從比分卡記的球在球員決定球矩陣裡不會有貢獻者。
- **球場材質與球員圈已全站共用**：`courtTheme` 模組（毛玻璃地板／邊緣繞行光／漸層，`Court.tsx` 與
  `ScoreSheetCourt.tsx` 吃同一份，改一處兩邊同步）＋`components/PlayerMarker.tsx`（深色玻璃底＋狀態色
  邊框＋圈內背號／圈下姓名，戰術板 `PlayerNode.tsx` 與計分表共用）。計分表原本那個沒有 UI 能切換的死
  開關 `circleLabel` 已退役。**08-04 加了 `solidFill` 布林 prop**：預設狀態維持「深色玻璃底＋狀態色
  描邊」，`solidFill=true` 時 fill/stroke 對調成「狀態色實色填滿＋深色描邊」，目前唯一用途是自由球員
  （見下一條）；姓名文字**固定米白、不跟著 `solidFill` 換色**（背號在圈裡、姓名在圈下方深色球場背景
  上，兩者所在的底色不同，不能共用同一條換色邏輯——踩過一次姓名跟著換成深色、蓋在深色球場上看不見）。
- **自由球員視覺定案：跟前排球員同一個綠、實色填滿＋深色邊框**（PR #260，08-04）。原本橘色
  `#FF6B00`（計分表拖曳鈕、L 疊圖、拖曳合法目標提示環、戰術板備位圓圈、`PlayerNode.tsx` 場上狀態色）
  全站統一換成 `#CCFF00`——不是新配色，是直接沿用 `isFrontRow` 已經在用的同一個值，理由是「自由球員」
  跟「前排」在合法站位下不會同時成立（自由球員規則上只能站後排），共用色相不會造成混淆，也不用另外
  設計一個新色相。填色關係從「深底描邊」改成「實色填滿＋深色邊框」（`solidFill`，上一條），是使用者
  拿一般球員圈當參照直接要求「外框/填充色相反」。**發光效果試過又拿掉**——常駐發光曾比照「發球方才
  發光」延伸給「L 待命」，使用者實機看過覺得不需要，實色填滿的綠圈本身已經夠醒目。戰術板那個珊瑚色
  虛線「L 備位框」（`#fca5a5`，issue #18 舊物）**已拿掉**，備位圓圈跟底下的留白空間都還在，只是不再
  多畫一圈虛線裝飾。**教訓值得記**：`overflow:hidden` 裁的是「元件背後的內容」，鈕若用 `left:100%`
  之類的定位貼在容器邊界「外面」，即使容器本身沒有明顯視覺裁切效果，滑鼠事件跟畫面照樣被整個吃掉——
  這次因此多包一層 `court-shell`（拿掉 `overflow:hidden`，只管定位）撐住 `court-glass`（保留
  `overflow:hidden`，只管視覺裁切），兩層責任分開後鈕才點得到。
- **計分表新增「局點提示」**（PR #260 同批，08-04，無對應 issue）：一般局 25 分／決勝局（第 5 局）
  15 分且淨勝 2 分以上，跳出琥珀色提示條（沿用既有「柔性提醒、不鎖版面」語彙），不強制任何動作——
  比分卡跟球場手勢完全不受影響，教練仍可自行決定何時按「下一局」。`isSetComplete()` 這個判斷式
  （`lib/scoreSheetMapping.ts`，issue #45 就有）本身沒改，這次只是把它接到一個新的畫面提示上。
- **全站外殼材質（背景／右欄）已收斂成 `lib/appChromeStyles.ts`**（PR #253，**已合併**）：`APP_SHELL_CLASS`
  （整頁外層 class）、右欄外殼 `INFO_RAIL_BASE_CLASS`（半透明玻璃 `bg-[#121310]/75 + backdrop-blur-md`，
  取代原本的實色板子）各只有一個家。動機是這兩串樣式原本在七個頁面／三個右欄各複製一份，而 #131 改版
  **只改到戰術板／計分表兩頁**、其餘五頁停在舊的斜線網格版本分裂成兩代——複製的成本不在寫的當下，在改
  的時候。要調整全站氛圍改那一個檔案就好。
  **08-06 更新**：整頁背景已搬到 `index.css` 的 `.app-canvas`（`APP_SHELL_CLASS` 帶進去），
  `APP_BACKGROUND_STYLE` 因此變成空物件、只留作 inline 覆寫的入口——**調背景現在要改 `index.css` 的
  `--ds-bg-*`，不是改這個常數**。右欄那條不受影響。
  **待調項目**（記在 PR #253 留言，尚未動工）：右欄透明度 `/75` 的實際數值、`ListItemCard` 比例（要拿
  Figma 重畫線稿，不再猜 px）。字級收斂那項已由 #310／PR #311 交付。
- **工具軌正式圖示已上線**（PR #248，08-03 合併）：10 顆圖示取代單字佔位，每顆照該工具在球場上實際
  畫出來的樣子設計。**#176 已關閉；細節統整跟微調另開 #284**（線條粗細一致性、虛線密度、排列時的
  視覺微調，留給下一輪，不卡在 #176）。
- **UX 測試流程已成文**：`docs/ux-testing.md`（PR #244）——兩個方案分不出高下時用小規模 moderated
  usability test（無事件追蹤基礎設施，做不了正式 A/B），測試結果寫在相關 issue 留言、不另開文件。
  #214 的[留言](https://github.com/aila8913/volley-tactic-board/issues/214#issuecomment-5126493974)是範例格式。
- **教訓（踩過三次，兩條）**：(1) aila 的架構重構（#154/#160、#172 AppShell）速度很快，材質類 PR 只要
  卡在分支上超過一天，動到的元件常常已被換掉底層架構——合併前務必先 `git fetch` 比對 `origin/main`，
  抓到就**直接照新結構重做一次**（不要嘗試 rebase 硬套舊 diff；#167 與 #182 都是重做的第二版）。
  (2) 落後 main 又同檔的 PR，**git 自動合併無衝突不等於合對**，要讀合併後的檔案確認雙方改動都活著；
  另外 fork PR 的 CI 預設不跑、要手動核准。(3) **UX 微調類需求，先實機讓使用者確認過效果，才做
  branch/commit/push/PR 那一整套**（08-04 使用者明確要求）——自由球員配色這次來回改了七輪，同一個
  PR、同一個分支上迭代，最後才一次 push，避免每一輪小調整都各自跑一次完整 ship 流程。
  **08-06 補充**：使用者看過效果後若給的是「方向對、強度要收」這類反饋，可以照常 ship、把微調開成
  issue 帶著走（這次背景就是這樣處理，追在 #320），不必卡著不合併——(3) 要防的是「沒人看過就 ship」，
  不是「不到完美不准 ship」。
- **本機環境會悄悄落後，卡住的時候先查這兩個**（08-06 實際踩到，各花了不少時間）：(1) `.env` 少了新加的
  必要變數——`COOKIE_SECRET` 缺了 api-server 直接起不來，`.env.example` 有列但 `CLAUDE.md` 沒有（已開
  #323 補文件）。(2) **本機 DB 沒跟著 schema 走**——這專案用 `drizzle-kit push` 不產 migration 檔，拉完
  code 要自己 push schema；這次本機 DB 停在 #64 PR1 之前的世代（六張表主鍵還是整數、schema 早已改
  uuid），Postgres 無法自動轉型，最後是整個 `public` schema 砍掉重建＋跑 `lib/db/src/seed-testdata.ts`
  才解決。症狀是「建立比賽 500」「計分頁卡在載入」「API 回 Invalid uuid」——**看到這類錯誤先查 DB 世代，
  不要往前端找**。

## Known gaps / next big pieces

Backlog lives in **GitHub Issues, phase-ordered via Milestones** — this file **不重述票的內容**，
只寫「issue 裡看不到的東西」。

**當前階段 ＝ 編號最小、還有 open issue 的那個 milestone。**
⚠️ **這裡刻意不寫出它的名字**——milestone 名稱是推導值，抄進靜態文件就是一個一定會過期的常數
（這個坑踩過三次：08-07 原 M5 改名、`"M3 部署給真人試用"` 早已關閉、`catch-up` 的範例用 `"M1 簡易版收尾"`）。
**這是 `event-grammar-spec.md`「能推導就不存」那條原則的文件版。** 要用就現算：

```sh
# 當前階段是哪一個
gh api repos/:owner/:repo/milestones --jq 'map(select(.open_issues>0)) | .[0].title'

# 列出當前階段的票（把上面那句套進去，不要手打名稱）
gh issue list --milestone "$(gh api repos/:owner/:repo/milestones --jq 'map(select(.open_issues>0))|.[0].title')"
```

各 milestone 的**收件標準**（包含「名字裡有『雜項』的 milestone 會變成垃圾桶」那條教訓）
寫在 `.claude/skills/wrap-up/reference.md`，不在這裡。

### M4：三張刻意一起設計，不單張開工

#51 動作子分類決定 #21 記得出什麼、#21 的球線分布是產品定位裡的 wow 點、#99 站位快照同屬 advanced tier。
**地基已先落一塊**：`events.outcome` 的寫入（#365）與呈現（#370）都已交付，不必等設計會。

**已拍板**：進階版的影片載體＝**內嵌 YouTube 播放器**。這題之前完全懸空——整套進階版的可行性
建立在「可暫停倒帶的影片」上，而 `videoTimestamp` 從 schema 到 API 都通了卻沒有任何前端在寫它。
定了之後它升格成進階版的時間軸主鍵：「待補清單」從一份清單變成**可以一鍵跳到那一球重看**。

**還沒決定、擋著 #21 實作的三題**（記在 #21／#51）：影片網址存哪（一場很可能有多段影片，
`matches` 加一欄表達不了）、要不要同時支援本機檔案（系隊影片不一定會上 YouTube）、
時間軸怎麼對齊（手動標錨點再靠 rally 順序推，還是每分都對）。

### 導覽資訊架構要改，但卡一個決策（#372，M6）

判準已定案（左欄只放「不需要先選比賽就有意義」的入口）。**擋著動工的是「戰術要脫離
`tactics.matchId` 到什麼程度」**——最小改法是那一欄改可空，最徹底是換成自由標籤。沒有這一步，
「戰」放進左欄只是換個地方灰掉；動 `lib/db/src/schema/` 要一次想清楚，且依協作規則要 heads-up
@tangyi1025。**C1（教練賽中借平板 30 秒看一眼）是獨立的新題**，先定它要看什麼再決定浮層或頁面。
與 #214 的「頁內選比賽下拉」有重疊面，兩張要對齊。

### 沒有 issue 在追、但需要知道的

- **一張 ADR 還沒寫**：#231／#326 收斂出來的「先發單一表示法」＋「persist 永不能帶 match 資料」不變條件。
  要記的是 `liberoReplacesPlayerId` 這個方向，**不是被推翻的 `liberoZones`**。
  ⚠️ 寫的時候**取當下最小的未用編號，不要在這裡預先佔號**——這一行原本寫著「ADR-0006」，
  結果 0006 被別的決策先用掉了（預留編號跟上面那條「不要抄推導值」是同一個錯）。
- **#40**（undo/redo 不涵蓋輪轉拖曳）的前提已消失：先發表示法已收斂成一份、座標已降級為衍生值，
  所以那張票**現在可能小很多**，重估之前別照 body 的舊描述動工。
- **#232**（`createDb` 注入）沒有被 #229 帶掉。#229 只抽純函式、**刻意不做 query adapter／不做 DI**
  （只有一個實作的 adapter 是假 seam）。#232 剩下的價值要單獨評估：真要動就得同時接上第二個 adapter。

### 一條會復發的判準

**外鍵保證 referential integrity（uuid 指得到一列），不保證 ownership（那列是不是你的）**——
兩者很容易被當成同一件事。`lib/ownership.ts` 的 `tournamentBelongsToUser`／`teamBelongsToUser`
就是這條的落點。**它已經復發過一次**（#225：`tactics.ts` 是當初唯一沒 import `ownership` 的路由檔），
所以真正的解法不是把判準寫下來，是 #228 的 handler 儀式收斂——**判準擋不住復發，因為新檔案不會
自動知道它；把約定寫進 CI 或型別才可靠**（同 #154 把單向依賴焊進 eslint、#310 把字級 token 焊進 eslint）。

## Recently closed (past ~week)

一行一張，**細節在該 issue 與 git log**。只留過去約一週。

### 開發 (aila)

- **#370**（08-11）視圖③ 長出得/失分結構。範圍比預期小很多：單場分析頁**早就有**得失分結構
  （`buildPlayerMatrix()` 從前端 `history` 現算），只是不讀 `events.outcome`——而那正好是這欄位存在的
  最好註腳，**前端那條推導路只在「這場比賽已載進記憶體」時成立**，跨場統計沒有 `history` 可推。
- **#365**（08-10）`events.outcome` 從「有欄位沒人寫」變成真的有值。真正的智力工作是**語意釐清**
  （schema 舊註解與 `event-grammar-spec.md` 決策 7 互相矛盾，見 Current state 那條推導式）。
  ⚠️ 交付當下踩到一個**四道 CI 全綠、功能沒生效**的洞 → 已開成 #368。
- **#168 第一批**（08-10，該張仍 open）前端互動行為終於測得到。**留下來的判準**：
  在此之前**覆蓋的都是安全的部分、沒覆蓋的都是危險的部分**——每支刻意抽到 `lib/` 的純函式都有測試，
  每個握著座標數學／指標事件的元件都沒有，而那正是 #120／#172／#349 三次 bug 的落點。
- **#352**（08-10）`visibleSetCount()`。前情是 #349 修了兩次才修完，因為同一段算式有**兩份手寫拷貝**
  （PR #350 只改了分析頁，#351 才補上比賽列表右欄）。**這張補的是規則模組少劃的一格邊界**：
  #226 已經把「最後一局是進行中」收進 `splitCompletedAndCurrent()`，但沒有人擁有從切分推出來的
  下一件事——「這個選擇器有幾格可以滑」。
- **#304 ＋ #361**（08-10）戰術板歷史政策收斂＋四個 undo bug。**方法論值得記**：票面問的三個問題，
  **三個答案都不是靠推理得到的，是靠查證推翻票面直覺的**——三組 CRUD 三連並不齊頭收斂（只有 `remove`
  該合併），真正該收斂的不是 CRUD 的形狀而是「何時記 undo 歷史」這條規則，而「值不值得做」的
  決定性證據是那條規則**當下正在製造四個使用者看得見的 bug**（開票時沒人知道）。
  **判準：收斂要對著「會漂走的規則」下手，不是對著「長得像的程式碼」。**
- **#326 ＋ #327**（08-10）自由球員模型改成「記頂替誰」＋輪轉表第七格。**這組的教訓不在程式**：
  #327 是拿 curl 手開的一場未開賽比賽驗完的，「載入示範比賽」那條路一次都沒走，所以交付當下就存在
  「示範資料看不到第七格」的洞（→ #359）。**不只要走一遍流程，還要走使用者實際會走的那一條。**
  連帶解鎖 #328，並讓 #309 多了一條相依（右欄現在是排 L 先發的唯一入口，拿掉面板不是純減法）。
- **#329**（08-09）比賽編輯從彈窗搬進右欄就地編輯，`MatchFormDialog` 已刪。相依：#222 的修法本來
  指向那個已刪除的元件，要重新確認抽在哪裡；#24（複製比賽）body 已改寫。
- **#229 / #306 / #339**（08-07）後端合併規則抽純函式／測試 fixture builder／測試沙盒 `db:reset`。
- **#231**（08-06 合併、08-07 關閉）先發只留一種表示法。**但這張真正的產出是手動 QA 撈出來的東西，
  不是重構本身**：四個 PR 全綠、CI 全過，PO 一坐下來實際點，第一步就卡住——排不出自由球員（→#326／#327）。
  那個洞是三個各自正確的決定疊出來的，**沒有任何一處寫錯，所以沒有任何測試會失敗**。
  **判準：自動化驗證的是「每一處有沒有寫錯」，走一遍流程驗證的是「合起來還能不能用」。**
  附帶推翻了自己的一個結論：`liberoZones` 方向反了（頂替誰才是原始事實）。
- **#292 ＋ #294**（08-06）測試檔納入 typecheck／players 名單補 `ORDER BY`。拿掉排除後冒出約 90 個
  型別錯誤，全部是既有的脫節，而 217 個測試一路全綠。**判準：測試通過只證明執行期沒爆，
  不證明它斷言的還是現在這套型別**——把測試排除在 typecheck 之外，等於讓重構的安全網成為唯一
  沒有型別保護的地方。（#294 的成因：**Postgres MVCC 下 `UPDATE` 會把該列擠到 heap 尾端**，
  沒有 `ORDER BY` 時任何一次 PATCH 都會讓名單跳動。）
- **#303 / #310 ＋ 深模組盤點**（08-06）自由球員規則抽成純函式／字級語意 token／`insertIdempotent`。
  **把散在元件裡的規則抽成純函式的附帶好處，是讓矛盾變得看得見**——`liberoRotation` 的「接替」啟發式
  當初就跟它隔壁分支的註解自相矛盾，在 `useEffect` 裡藏了很久，抽出來才被發現、然後被 PO 推翻（→#326）。
- **#218**（08-05）比賽「結束」成為真動作。病根是全站那條「sets 最後一局＝進行中」的推導慣例，
  打完的最後一局永遠不算數 → 加 `matches.status` 讓那條慣例吃它，**ADR-0005** 釘死兩條回頭路。

### 設計 (tang)

- **PR #321**（設計系統「戰術版風格」背景層＋token 落地全站、計分板一鍵記分，08-06，無對應 issue）—
  見上方 Current state 兩條，細節不重複列。這裡記幾件過程中的事：
  - **同批把兩項決定補進 `docs/design-spec.md`**（第 4 節整頁背景、第 5 節計分板一鍵記分）。規範沒跟上
    實作正是這份文件自己記過的教訓——背景改版曾經只改到兩頁、其他五頁停在舊版，直到一頁一頁看才發現。
    design-spec 是共用約定檔，已依慣例在 PR 上 @-mention aila。
  - **一併知會 aila 記分行為改變會影響數據面**：從比分卡記的球不寫 `action`／`touchedBy`，在球員決定球
    矩陣裡不會有貢獻者。他若認為分析頁不能接受，會另開 issue 處理「事後補動作」的入口。
  - **新開 #320／#322／#323／#324**；#134 Track B 標記為已由設計系統接手（該 issue 只剩 Track A／C），
    #21／#19 過時的 body 一併修正（#21 的「現狀」只適用球場路徑了；#19 引用的 `MatchRecording.tsx`
    早已不存在、且把自己列為自己的相依）。
- **PR #260**（計分表：長按換人＋自由球員鈕改位＋支援兩位候選，08-04，無對應 issue）— 見上方
  Current state「自由球員視覺定案」「局點提示」兩條，細節不重複列。這裡記流程教訓：這張 PR 在同一條
  分支上前後改了七輪配色/位置（球場左右側→垂直位置對齊後排→橘色多種變體→萊姆綠→填色關係反轉→
  拿掉發光），每輪都先在瀏覽器裡實機確認過效果才進下一輪，最後才一次 push／合併——沒有每輪各自開
  commit/PR。手勢類互動（長按換人、長按選自由球員）這個 sandbox 沒辦法用合成事件穩定觸發，最終
  由使用者自己實機驗證後才合併。
- **#176 關閉（08-04），新開 #284**（工具軌圖示：統整細節與視覺調整）— PR #248 已交付 10 顆正式
  圖示，#176 的原始範圍（正式圖示）算完成，關閉時說明剩下的細節調整（線條粗細一致性、虛線密度、
  排列時的視覺微調）移到 #284 追蹤，不卡在已完成的票上。
- **PR #248**（#176 剩餘的工具軌正式圖示，08-03 合併）— 10 顆圖示取代單字佔位，每顆照該工具在球場上
  實際畫出來的樣子設計（虛線工具的圖示真的用 `stroke-dasharray` 畫）。實機看過後拿掉「攻擊線」工具
  （跟實線箭頭分不出來）與「號位標示」開關（連 store 欄位＋`Court.tsx` 渲染一起刪，決定已留言在 #176）。
- **PR #253**（全站背景與右欄材質統一，08-03 合併）— 見上方 Current state「全站外殼材質」一條。
  合併過程中跟 aila 同期的 #251（PR #274）在 `MatchInfoRail.tsx`／`TournamentDetail.tsx` 有真實文字
  衝突（型別改名、資料源換掉），用 `git worktree` 隔離解衝突、跑完整檢查套件後才推。
- **#276**（修掉戰術板頁面空白崩潰，08-03 合併，無關聯設計工作、順手抓到）— `useRosterEditor.ts` 的
  Zustand selector `state.dataByMatch[matchId]?.roster ?? []` 兩個 fallback 分支各自產生新陣列參照，
  觸發 React `useSyncExternalStore` 判定「快照每次都變了」的無限重繪迴圈，整個 `<RotationPanel>` 崩潰。
  修法是把 fallback 提到模組層常數 `EMPTY_ROSTER`，跟 `RotationTable.tsx`／`Court.tsx` 既有慣例一致。
  確認是 aila PR #274 帶進來的既有 bug，跟本次設計工作無關，獨立分支/PR 修完立刻合併。

---

- （更早的條目已修剪。判準與決策都另有長期的家：架構決策在 `docs/adr/`、規格在 `docs/*-spec.md`、
  票的來龍去脈在該 issue 留言、程式碼層的約定在檔案自己的註解裡、協作教訓在 auto-memory。
  已關閉的 milestone：**M1／M1.5／M2／M2.5／M3／M3.5**。想查某張票怎麼收的，`gh issue view <n>`
  比翻這份檔案準。）
