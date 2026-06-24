# API 規格總覽

> 真正的規格來源是 `lib/api-spec/openapi.yaml`（這份文件只是導覽，跟程式碼有出入時以 YAML 為準）。
> 這個 yaml 是 codegen 的輸入：跑 `pnpm --filter @workspace/api-spec run codegen` 會自動產生
> `lib/api-client-react`（前端用的 React Query hooks）跟 `lib/api-zod`（驗證用的 Zod schemas）。
> 對應的資料表見 [db-schema-spec.md](./db-schema-spec.md)，產品需求見 [product-spec.md](./product-spec.md)。

## Endpoints

```
GET    /matches                       列出所有比賽
POST   /matches                       建立比賽
GET    /matches/{matchId}             取得單場比賽
PATCH  /matches/{matchId}             更新比賽（例如補上 videoUrl 開啟賽後補填模式）

GET    /matches/{matchId}/players     列出球員名單
POST   /matches/{matchId}/players     新增球員

GET    /matches/{matchId}/sets        列出局數
POST   /matches/{matchId}/sets        開新的一局

GET    /sets/{setId}/rallies          列出這局的所有分
POST   /sets/{setId}/rallies          記錄新的一分

GET    /rallies/{rallyId}/events      列出這一分裡的所有球
POST   /rallies/{rallyId}/events      記錄一球（賽中即時或賽後補填都用這個）
PATCH  /events/{eventId}              修正/補完一筆球的記錄
DELETE /events/{eventId}              刪除記錄錯誤的球
```

## 設計上的取捨

- **巢狀路由跟著資料的從屬關係走**（matches → sets → rallies → events），不是把所有資源都攤平在根層級，
  這樣每個 endpoint 的路徑本身就說明了「這是誰的什麼」，不需要額外的 query 參數去過濾。
- **`POST /rallies/{rallyId}/events` 同時服務賽中跟賽後兩種情境**，差別只在 request body 裡的
  `source` 欄位是 `'live'` 還是 `'review'`，以及有沒有帶 `videoTimestamp`——對應產品規格裡「賽中賽後
  共用同一個畫面」的決定，後端 API 也不用分兩套。
- **沒有 `DELETE /matches` 或刪除 rally 的 endpoint**：目前沒有需求要整場刪除比賽資料，先不做，
  避免過度設計用不到的功能。

## 還沒做的事

- `lib/api-spec/openapi.yaml` 裡的 endpoint 目前只有規格，**後端 `artifacts/api-server/src/routes/`
  還沒有對應的實作**（目前 routes 只有 `/healthz`）。下一步是依照這份規格把 Express route 寫出來。
