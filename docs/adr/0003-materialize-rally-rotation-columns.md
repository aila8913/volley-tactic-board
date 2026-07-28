# ADR-0003：rally 的輪次物化成欄位，不靠重放推導

- 狀態：Accepted
- 日期：2026-07-25（落地 PR #204，commit `8dfa901`）
- 來源：issue #76 設計收尾 ①，服務 #65

## 背景

「這一球發生在第幾輪」是分析頁的核心 join key。輪次可以從 rally 序列重放推導出來（規則：side-out 那一刻才 +1，模 6），所以理論上不需要存。

一般的預設判斷是**衍生值不要存，免得跟真相漂移**。這裡的決定違反那個預設，所以值得記下來。

## 決定

在 `lib/db/src/schema/rallies.ts` 加兩欄 `homeRotation` / `awayRotation`（integer 0–5，notNull），語意等同 `homeScore`：**這一球開始「之前」的輪次快照**。

寫入點在 `useScoreSheet.score()` 裡抓 `homeScoreBefore` 的同一個位置（讀 `pre.currentSet.ourRotation` / `opponentRotation`）。

**真相來源仍然是 `scoreSheetMapping.ts` 的重放邏輯** —— 欄位是它的物化結果，不是另一份獨立規則。

### 判準

衍生值該不該物化 = **讀取重算貴，而且寫入重算便宜又穩定** → 物化。這裡兩條都成立：

- **讀取端貴**：單場在 JS 裡跑迴圈很簡單，但跨場統計要在 SQL 做。輪次規則是有狀態的序列推導，`GROUP BY 輪次` 幾乎寫不出乾淨的 SQL；沒有欄位就只能把 rallies + events 整包撈回 Node 重放，正好踩回 #65 想避開的 fan-out。有欄位後查詢退化成一句 `GROUP BY home_rotation`。
- **寫入端便宜且穩定**：rally 只有兩種寫法 —— **尾端 append** 和 **undo 退最後一筆**。沒有插入、沒有改動中間。所以每一筆的輪次在建立當下就固定、終生不重算，漂移風險實質為零。

「兩欄都落」而不只落我方：對手輪次是同一次寫入就拿得到的資訊，之後要分析對手輪次時不用再補一次 migration。

## 後果

- #65 視圖①（輪次比率統計）可以直接在 Postgres 聚合，endpoint 只回 ≤6 列
- M4 的球線分布疊圖有鑰匙了：`WHERE home_rotation = N` join 該局 `lineups` 還原號位，把 events 的 `toX/toY` 疊上，不用重放
- 完整的 join key 是 `rally.homeRotation`（輪到第幾輪）**＋** `set → lineup`（第 0 輪誰站哪），兩者一起才還原「第 N 輪站位」
- 落欄位當下 dev DB 既有的 rally 資料：**決定清庫重錄，不寫回填 script**
- 代價：多了一個必須跟重放邏輯保持一致的地方。**這條漂移風險由前提保護 —— 前提是「rally 只有尾端 append / undo」。**

## 不要重新提議

- 「這是衍生值，砍掉欄位改成讀取時重算比較乾淨」—— 已評估，跨場 SQL 是不可接受的代價
- 「用 generated column 或 trigger 自動算」—— 輪次是有狀態的序列推導，不是單列函式，算不出來

## 前提失效時要回來重看這張

如果 rally 變成可以**插入中間**或**修改既有筆**（例如事後補記漏掉的一球、編輯歷史回合），那「寫入端重算便宜又穩定」就不再成立，整個判準要重跑一次。屆時的選項是：改成寫入時重算該局全部 rally 的輪次，或退回讀取時重放。
