# API 規格總覽

> 真正的規格來源是 `lib/api-spec/openapi.yaml`（這份文件只是導覽，跟程式碼有出入時以 YAML 為準）。
> 這個 yaml 是 codegen 的輸入：跑 `pnpm --filter @workspace/api-spec run codegen` 會自動產生
> `lib/api-client-react`（前端用的 React Query hooks）跟 `lib/api-zod`（驗證用的 Zod schemas）。
> 對應的資料表見 [db-schema-spec.md](./db-schema-spec.md)，產品需求見 [product-spec.md](./product-spec.md)。

## Endpoints

```
GET    /matches                                列出所有比賽
POST   /matches                                建立比賽
GET    /matches/{matchId}                      取得單場比賽
PATCH  /matches/{matchId}                       更新比賽（例如補上 videoUrl 開啟賽後補填模式）
DELETE /matches/{matchId}                       刪除整場比賽（FK cascade 連帶清名單/局/分/球）

GET    /matches/{matchId}/players               列出球員名單
POST   /matches/{matchId}/players               新增球員
PATCH  /matches/{matchId}/players/{playerId}    修改名單裡的一名球員
DELETE /matches/{matchId}/players/{playerId}    從名單移除一名球員

GET    /matches/{matchId}/sets                  列出局數
POST   /matches/{matchId}/sets                  開新的一局

GET    /matches/{matchId}/events                一次撈整場所有球（hydrate 用，避免每 rally N+1）
GET    /matches/{matchId}/substitutions         列出整場換人紀錄
POST   /sets/{setId}/substitutions              記錄一次換人（一般 / 自由球員）

GET    /sets/{setId}/rallies                    列出這局的所有分
POST   /sets/{setId}/rallies                    記錄新的一分
DELETE /rallies/{rallyId}                       刪除一分（undo 用；events FK cascade）

GET    /rallies/{rallyId}/events                列出這一分裡的所有球
POST   /rallies/{rallyId}/events                記錄一球（賽中即時或賽後補填都用這個）
PATCH  /events/{eventId}                        修正/補完一筆球的記錄
DELETE /events/{eventId}                        刪除記錄錯誤的球

GET    /tactics                                 列出戰術板存檔
POST   /tactics                                 儲存戰術板
GET    /tactics/{tacticId}                      讀取單一戰術板
DELETE /tactics/{tacticId}                      刪除戰術板

GET    /healthz                                 健康檢查
```

## 設計上的取捨

- **巢狀路由跟著資料的從屬關係走**（matches → sets → rallies → events），不是把所有資源都攤平在根層級，
  這樣每個 endpoint 的路徑本身就說明了「這是誰的什麼」，不需要額外的 query 參數去過濾。
- **`POST /rallies/{rallyId}/events` 同時服務賽中跟賽後兩種情境**，差別只在 request body 裡的
  `source` 欄位是 `'live'` 還是 `'review'`，以及有沒有帶 `videoTimestamp`——對應產品規格裡「賽中賽後
  共用同一個畫面」的決定，後端 API 也不用分兩套。
- **`DELETE /matches/{matchId}` 與 `DELETE /rallies/{rallyId}` 後來補上了**（原本刻意不做）：前者是
  前端比賽列表的刪除需求，靠 FK cascade 連帶清掉底下名單/局/分/球；後者是計分表 undo（刪掉剛記的一分，
  events 一起 cascade）。這印證了「先不做、真的有需求再補」的取捨方向對，而不是一開始就全刻好。
- **換人存比分快照、走 `POST /sets/{setId}/substitutions`**：換人發生在下一 rally 開始前、那個 rally
  的 id 還不存在，所以時機用「當下比分」定位而非 rallyId（同 `rallies` 存開球前比分的理念）。

## 落地狀態

這份規格對應的後端已**全部實作完成**：`artifacts/api-server/src/routes/` 有 matches / players / sets /
rallies / events / substitutions / tactics / health，並對真實 dev DB 端對端驗證過（Phase 0–3，見
[backend-architecture.md](./backend-architecture.md)）。前端計分表也已完全脫離 localStorage（#58 已關）。
