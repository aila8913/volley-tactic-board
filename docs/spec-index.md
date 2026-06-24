# 規格總覽

這份文件是「比賽記錄與分析」這組新功能的規格入口，串接下面三份文件：

| 文件 | 內容 | 真正的規格來源 |
| --- | --- | --- |
| [product-spec.md](./product-spec.md) | 要做什麼、為什麼（賽中記錄、賽後補填、防守數據分析） | 這份文件本身 |
| [db-schema-spec.md](./db-schema-spec.md) | 資料表關係總覽 | `lib/db/src/schema/*.ts`（程式碼） |
| [api-spec.md](./api-spec.md) | API endpoint 總覽 | `lib/api-spec/openapi.yaml`（程式碼） |

## 目前進度

- [x] 產品規格寫完
- [x] DB schema 寫完並通過 typecheck（`matches` / `players` / `sets` / `rallies` / `events`）
- [x] OpenAPI 規格寫完，已跑過 `codegen` 重新產生 `lib/api-client-react` / `lib/api-zod`
- [ ] 後端 routes 尚未實作（`artifacts/api-server/src/routes/` 目前只有 `/healthz`）
- [ ] 前端頁面尚未串接（`/matches` 相關頁面還沒開始寫）
- [ ] DB schema 尚未 push 到真正的資料庫（需要先有 `DATABASE_URL`）
- [ ] 「嗆司」的精確定義還沒跟使用者確認（影響防守數據分析怎麼分類）

## 為什麼分成三份文件而不是一份

產品規格、資料庫規格、API 規格三者的**讀者和變動頻率不同**：

- 產品規格給「決定要做什麼」時看，變動最少。
- DB schema 和 API 規格是程式碼本身（schema-first / OpenAPI-first 的架構決定，見 CLAUDE.md），
  這兩份 `.md` 檔只是導覽，實際規格永遠以程式碼為準，避免文件和程式碼長期維護下來互相漂移。

## 閱讀順序建議

如果你是第一次接觸這個功能，建議先看 product-spec → db-schema-spec → api-spec，這個順序對應
「先懂需求，再懂資料怎麼存，最後懂怎麼透過 API 存取」。
