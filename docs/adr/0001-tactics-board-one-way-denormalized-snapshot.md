# ADR-0001：戰術板嚴格單向，快照 denormalize

- 狀態：Accepted
- 日期：2026-07-19（落地 2026-07-20，PR #155 / #157 / #159）
- 來源：issue #154、#160

## 背景

戰術板原本會「載入已存戰術 → 整包覆蓋輪轉表的 roster 和六輪站位」（舊 `useTacticsBoard.loadProject` → `useRotationTable.loadRotationData`）。這造成三個使用者回報的 bug：

1. 新增的球員在載入戰術後消失
2. 手動佈好的站位被覆蓋，而且沒有 undo，回不去
3. 從名單刪掉一位球員，**舊快照裡那個人也跟著消失** —— 因為場上位置只存 `{ playerId, x, y }`，圈圈上的名字是渲染時拿 id 回現在的名單查

三個現象是同一個病根：戰術板本該是消費者，卻反過來寫回了站位的真相來源；而且快照不是自給自足的「照片」。

中間曾經定案過「戰術板降級成 overlay 白板」，後來因為 Figma 新版面改成「左欄工具頁 ＋ 各頁右 panel 快照入口」（#160）。**UI 形式改了，下面這兩條不變式沒改。**

## 決定

**一、資料流嚴格單向，戰術板永遠不寫回輪轉表／計分表。**

```
輪轉表／計分表（站位真相）→〔擷取〕→ 戰術白板（暫時）→〔存檔〕→ 已存戰術（凍結唯讀）
```

擷取發生在 UI 邊界：handler 自己讀 state → 呼叫純函式 `captureFromRotation(...)` 得到一個**純值** → 傳給 session。白板拿到的是深拷貝 plain object，**型別裡根本沒有能寫回去的東西**。單向性不靠「小心不要寫回」，靠型別。

這條用 ESLint `no-restricted-imports` 焊進 CI（`eslint.config.mjs`）：白板 store 不得 import `useRotationTable` / `useScoreSheet` / `captureCurrentRotation`。**依賴方向 = import 方向，寫進 CI 比寫進註解可靠。**

**二、快照 denormalize（`SnapshotPlayer` 凍存身分）。**

擷取當下就把名字／背號／位置印進位置資料，之後不再回名單查。`sourcePlayerId` 只供追溯，渲染與存檔一律不得拿它 join。

活名單（live state）走第三正規化；快照是歷史照片，**刻意反正規化** —— 照片就該記「當時」，改名後舊快照維持舊名是正確語意，不是 bug。

**三、一份戰術 = 一景。**不保留「一份戰術畫滿六輪」。舊六輪存檔由 `parseSavedTactic` 讀檔時攤成多景，寫入一律 v2 單景。

## 後果

- bug 1、2 在架構層面消失 —— 沒有東西會被覆蓋，所以**不需要**載入確認彈窗，也不需要給 `useRotationTable` 補 undo（省掉最大一塊工）
- bug 3 消失 —— 快照不再回頭查 roster
- 唯一剩下的破壞性動作變成「捨棄未存的 session」，確認彈窗搬到那裡
- 舊檔相容用讀檔轉接層 `parseSavedTactic`（zod 驗證），**不做批次遷移**；DB schema 不動，版本化在 jsonb 內層
- 代價：快照資料變大（存了冗餘的球員身分），戰術頁右側的輪轉表變成純對照用參考物、不能編輯

## 不要重新提議

- 「載入戰術時順便把站位套用回輪轉表」—— 這正是 bug 1、2 的成因
- 「快照只存 playerId 比較省、渲染時 join 就好」—— 這正是 bug 3 的成因
- 「加個確認彈窗／undo 就能安全地雙向同步」—— 已評估過，成本高於單向化本身
