# ADR-0008：後端寫入一律逐欄窮舉列舉

狀態：Accepted（2026-08-11，#368／PR #384）

## 背景

route 的 insert/update 是逐欄列舉的（刻意的：`...body` 全展開會讓「由路徑決定的欄位」——
`POST /rallies/:rallyId/events` 的 `rallyId`——有被使用者送來的 body 蓋掉的風險）。

代價是新增欄位時 schema／openapi／route 三邊都要記得改，而**第三邊漏掉是完全靜默的**：
欄位可以是 null，少給就是 null，所以不是型別錯誤、沒有測試會紅、四道 CI 全綠，功能卻沒生效。
2026-08-10 的 PR #365 就這樣——前端已經在送 `outcome`，route 沒列，每一球的 outcome 永遠是
null，是靠人工讀 route 檔才抓到的。

#368 評估過三個方向：型別層窮舉、跨 route 的合約測試、pick helper。

## 決定

**寫入物件一律標註 `EveryColumnOnInsert` / `EveryColumnOnUpdate`**
（`artifacts/api-server/src/lib/everyColumn.ts`），讓該表的每一欄都必須出現在物件字面量裡，
不寫的要明寫 `undefined`。漏列一欄＝TS2741。

這是**純型別**的：drizzle 對 insert 的 `undefined` 送出 SQL `default`、對 update 的
`undefined` 直接濾掉（0.45.2 讀過原始碼），所以執行期行為與送出的 SQL 一個位元都沒變。

## 後果

- 新增欄位時，12 支 route 檔會被編譯器逼著一個一個看過，「忘了改第三邊」不再可能。
- 「這欄不開放 PATCH 修改」從「沒寫所以沒有」變成程式碼裡看得到的一句 `undefined` ＋理由。
  副作用是第一次套用就照出三個合約缺口（#385）。
- 代價：每個寫入點多出幾行 `createdAt: undefined`、`isDemo: undefined` 這類看似噪音的欄位。
  這是**刻意付的價**——那些欄位正是最容易被漏掉、漏掉又最安靜的一類。

## 不要重新提議

- **別改回條件展開**（`...(body.x !== undefined && { x: body.x })`）。它產生的是 optional
  key，窮舉檢查看不到，等於把守衛關掉。`sets.ts` 原本有一句「用條件展開是為了不依賴
  drizzle 遇到 undefined 會退回 default 這個隱性行為」——那個行為已經讀原始碼確認並記在
  `everyColumn.ts` 檔頭，這條理由不再成立。
- **別改成 `...body` 全展開。** 路徑決定的欄位會被使用者的 body 蓋掉，那是安全問題不是風格問題。
- **別把型別改「聰明」成自動排除有 default 的欄位**（為了少寫那幾行 `undefined`）。
  `tags`、`format`、`outcome` 這些正是有 default 又常從 body 來的欄位，排除掉就是在最容易
  出事的地方失效。
- **別改用合約測試取代它。** 那要在 CI 開 Postgres，而且是執行期檢查——編譯期擋得住的事
  不需要跑一次資料庫才知道。（要另外加是另一回事，但不是拿它換掉這個。）
