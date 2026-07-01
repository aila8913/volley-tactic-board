# 戰術板站位互動模式重做（設計紀錄）

> 這份文件原本是代辦清單，現在待辦事項已經搬到 GitHub Issues 追蹤（`gh issue list`），這份
> 文件保留下來是因為「已完成」段落記錄了設計討論的來龍去脈（為什麼這樣改、改了哪些檔案），這
> 種「為什麼」的脈絡放 issue 裡容易埋沒，留在這裡比較好查。之後如果又有大範圍重做且經過討論
> 收斂出設計決策，可以比照這份文件的寫法繼續記錄。

## 已完成

- **拿掉自動排位**：「生成初始輪次」按鈕跟角色（S/OH1/OH2/...）→站位的自動對應已經拿掉。
- **改成拖曳球員上場**：球場分成 6 格（沿用原本 `zoneCoords` 的 1~6 號位置），從球員設定
  名單把人拖到球場上（原生 drag-and-drop，見 `Court.tsx` 的 `handleDrop`），或在場上重新拖曳
  （`PlayerNode.tsx` 的 pointer 事件），都會吸附到最近的格子（`lib/rotationLogic.ts` 的
  `findNearestZone`）。拖到已經有人的格子會跟原本那位對換。排好一個輪次後，其他 5 個輪次依照
  輪轉公式自動推算（`hooks/useTactics.ts` 的 `placePlayerOnCourt`）。
- **自由球員替換重新檢視**：`liberoSubstitution` 改成存「被替換下場那位球員的 id」
  （不再是固定的 `MB1`/`MB2`），`LeftPanel.tsx` 依照 roster 裡實際有幾個 MB 動態長出對應
  按鈕。
- 球員名單（roster）跟場上站位（`PlayerPosition.playerId`）現在直接共用同一份球員 id，
  不再有「戰術板內部 7 個固定站位」這層中間對應，所以「比賽紀錄」（`MatchRecording.tsx`/
  `RecordingCourt.tsx`）也一起改了：紀錄模式不會自動生成站位，沒有人先拖過站位時會請教練先去
  戰術板排好。
- **畫筆工具改成要進「戰術布置」模式才能用**：新增 `useTactics.ts` 的 `isLayoutMode`
  狀態（故意不存進 localStorage，重新整理一律回到唯讀檢視）跟 `setLayoutMode` action。
  平常 `RightPanel.tsx` 只顯示「進入戰術布置」按鈕；點下去之後才會出現畫筆工具（箭頭/虛線/
  攻擊線/文字/排球）跟防守範圍工具（圓形/橢圓/扇形），畫完點「完成並儲存」會呼叫既有的
  `saveProject()` 存檔並退出。`Markers.tsx`/`DefenseRange.tsx` 的選取、拖曳、雙擊編輯文字
  都加上 `isLayoutMode` 檢查，沒進入模式時球場上已經畫好的標記只能看不能動；`Court.tsx`
  建立新標記的三個分支也同樣多一層 `isLayoutMode` 防呆。球員拖曳上場（吸附 6 格）不受這次
  改動影響，跟模式無關，隨時可用。

## 已完成（續）

- **拿掉情境模式（base/serve-receive/defense/attack/cover）**：球場上不再有即時切換的情境
  開關（`LeftPanel.tsx` 的「情境模式」區塊整段刪掉）。`RotationState.scenarioPositions`
  （5 份站位/輪次）拍平成單一 `positions: PlayerPosition[]`，因為畫筆標記跟防守範圍本來就
  不分情境、`RecordingCourt.tsx` 讀站位也一直是寫死 `"base"`，情境其實只影響「正在編輯哪一份
  站位」這件事。改成「一個戰術專案＝一個情境」：情境變成存檔時選的標籤
  （`useTactics.ts` 的 `projectSituation`/`setProjectSituation`，存進
  `ProjectInfo.situation`），在 `RightPanel.tsx`「戰術管理」區塊選、存好的專案列表會顯示這個
  標籤。

## 還沒做的事

待辦已搬到 GitHub Issues，追蹤這幾個：

- [#10 戰術跨比賽重複使用：站位需要 role-based 而非綁死 playerId](https://github.com/aila8913/volley-tatic-board/issues/10)
  （`needs-plan`：實作前先進 Plan 模式設計。原本這個 issue 是照這份文件當時的內容寫的，範圍
  寫得太大——後來發現改名/刪除/儲存覆寫/另存新檔都已經在改用 Postgres 存戰術時做完了，issue
  已經改寫縮小到真正還沒解決的部分）
- [#12 畫筆工具「筆刷功能」需求待釐清](https://github.com/aila8913/volley-tatic-board/issues/12)
- [#13 基礎輪轉位設定（左側獨立功能）— 細節待決定](https://github.com/aila8913/volley-tatic-board/issues/13)

（原本還有一個 #11「新建按鈕清空所有戰術」的bug，查證後發現這個bug已經不存在了，issue 已關閉。）

以下是這次重做已經完成的項目（歷史紀錄，非待辦）：

- ✅ **自由球員（Libero）替補規則照真實排球規則重做**：`MatchRecording.tsx` 加入
  `previousLiberoTarget` 追蹤「上一位被替換者」作為備用候選；輪轉時 `useEffect` 自動
  檢查被換者是否已到前排，是則嘗試換給上一位候選（仍在後排才換，否則讓自由球員回場邊）。
  store 的 `liberoSubstitution` 仍是 `string | null`，第二候選以 local state 補足，
  功能面已能運作。

- ✅ **球員設定 list 裡的自由球員那一列要標紅色**：`LeftPanel.tsx` 的 roster 列表已對
  `role === "L"` 的球員加上 `bg-red-100` 底色，位置文字也改成 `text-red-600`。

- ✅ **球場尺寸：以高度為主，寬度由 1:2 比例推算**：`Court.tsx` 和 `RecordingCourt.tsx`
  的球場 wrapper 從 `w-full + aspectRatio: "1/2"`（寬→高，可能超出視窗）改成
  `h-full w-auto max-w-full + aspectRatio: "1/2"`（高→寬，高度跟著頁面走）。

- ✅ **比賽紀錄要有對應的「結果呈現」畫面**：沒有做成獨立新頁面，而是把 `MatchRecording.tsx`
  改成左右分欄：左邊維持原本的記錄操作，右邊新增常駐統計欄（新元件 `MatchResult.tsx`），用
  CSS `scroll-snap`（不需要額外 JS）左右滑動切換「本場」跟其他有紀錄的場次。統計內容：
  - **比分總覽**：每局一張 pill 卡片（贏＝綠、輸＝紅、進行中＝藍），外加局數小計。
  - **換人紀錄**：本局／全場累計的一般換人次數（自由球員替換不計入，邏輯見
    `MatchRecording.tsx` 的 `regularSubs`/`subCountsHistory`）。
  - **球員統計**：依球衣號碼排序，把攻擊/發球/防守/攔網四種動作的得分/失分次數整理成一張
    矩陣表格（`MatchResult.tsx` 的 `buildPlayerMatrix`，資料來源是 `PointRecord.touchedBy`/
    `action`/`side`）。命中率等進階分析故意先不做，留給以後的數據分析頁面。

> 「基礎輪轉位設定（左側獨立功能）」的設計決策已經在討論中收斂，但實作／待決定細節還沒完全
> 結束，完整內容已經搬進 [issue #13](https://github.com/aila8913/volley-tatic-board/issues/13)，
> 不在這裡重複列。

## 不在這次範圍內、但相關的既有限制

- 拖曳上場目前一次只能處理「目前選的輪次＋目前選的情境」這一組站位；情境模式拿掉後，
  這個範圍會跟著簡化（不用再考慮「換情境會不會互相影響」）。
- 同一類角色（例如 OH）人數沒有上限，但球場只有 6 個格子＋1 個自由球員替補位置，超過的人
  純粹留在名單上當替補，沒有額外的「先發/替補」標記，純粹看有沒有被拖上場。
