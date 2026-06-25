# 戰術板站位互動模式重做（代辦）

> 這份文件記錄一次討論中決定要做、但故意延後實作的工作。範圍比較大、會動到現有的匯出/
> 儲存邏輯，做之前建議先用 Plan 模式仔細設計，不要直接動手改。

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

## 還沒做的事

1. **拿掉情境模式（base/serve-receive/defense/attack/cover）**：
   `LeftPanel.tsx` 的「情境模式」區塊、`TacticsState.scenario` /
   `RotationState.scenarioPositions`。要融進「戰術專案」（`saveProject`/`loadProject`）
   的概念裡，不要再用獨立的情境切換——細節待設計（一個戰術專案要存幾種情境？怎麼存？）。

## 不在這次範圍內、但相關的既有限制

- 拖曳上場目前一次只能處理「目前選的輪次＋目前選的情境」這一組站位；情境模式拿掉後，
  這個範圍會跟著簡化（不用再考慮「換情境會不會互相影響」）。
- 同一類角色（例如 OH）人數沒有上限，但球場只有 6 個格子＋1 個自由球員替補位置，超過的人
  純粹留在名單上當替補，沒有額外的「先發/替補」標記，純粹看有沒有被拖上場。
