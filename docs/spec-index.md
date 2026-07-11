# 規格總覽

這份文件是「比賽記錄與分析」這組新功能的規格入口，串接下面三份文件：

| 文件                                     | 內容                                                           | 真正的規格來源                        |
| ---------------------------------------- | -------------------------------------------------------------- | ------------------------------------- |
| [product-vision.md](./product-vision.md) | 產品定位：給誰用、差異化、亮點、裝置形態（比下面三份更上一層） | 這份文件本身                          |
| [product-spec.md](./product-spec.md)     | 要做什麼、為什麼（賽中記錄、賽後補填、防守數據分析）           | 這份文件本身                          |
| [db-schema-spec.md](./db-schema-spec.md) | 資料表關係總覽                                                 | `lib/db/src/schema/*.ts`（程式碼）    |
| [api-spec.md](./api-spec.md)             | API endpoint 總覽                                              | `lib/api-spec/openapi.yaml`（程式碼） |

## 目前進度

這份文件只導覽「規格文件之間的關係」，**不記進度狀態**（狀態會過期、且會與別處漂移）。
目前做到哪、下一步是什麼，看這兩個會被主動維護的來源，別在這裡重抄：

- `docs/PROGRESS.md` — 近一週快照＋當下狀態。
- GitHub Issues / Milestones — `gh issue list --state open`（backlog 依 M1–M5 分階段）。

## 為什麼分成三份文件而不是一份

產品規格、資料庫規格、API 規格三者的**讀者和變動頻率不同**：

- 產品規格給「決定要做什麼」時看，變動最少。
- DB schema 和 API 規格是程式碼本身（schema-first / OpenAPI-first 的架構決定，見 CLAUDE.md），
  這兩份 `.md` 檔只是導覽，實際規格永遠以程式碼為準，避免文件和程式碼長期維護下來互相漂移。

## 閱讀順序建議

如果你是第一次接觸這個功能，建議先看 product-spec → db-schema-spec → api-spec，這個順序對應
「先懂需求，再懂資料怎麼存，最後懂怎麼透過 API 存取」。
