# 後端架構設計

> 這份文件是「比賽紀錄後端」從無到有的實作藍圖與架構檢視。真正的規格來源仍是
> `lib/api-spec/openapi.yaml`（API 合約）跟 `lib/db/src/schema/*.ts`（DB schema）；
> 這份文件補的是它們之間的**取捨、落差、跟落地順序**。相關文件：
> [api-spec.md](./api-spec.md)（endpoint 導覽）、[db-schema-spec.md](./db-schema-spec.md)
> （資料表關係）、[match-recording-erd.html](./match-recording-erd.html)（events 表共用 schema 的 ERD）。

## 現況：三層模型的落差

比賽紀錄這條資料流有三個層次，目前**只有戰術板 (tactics) 那條線是打通的**（前端 → API → DB
全通，`routes/tactics.ts` 是可照抄的範本）。比賽紀錄這條線：DB schema 定義好了但（除了 tactics）
還沒 push，openapi 規格寫好了但路由沒實作，前端則完全活在瀏覽器的 localStorage 裡、沒碰過 API。

```
前端 (Zustand + localStorage)   ──✗ 未連接 ──   後端 (Express)      ──→   DB (Drizzle/Postgres)
  types/match.ts                                routes/tactics.ts ✅        schema/*.ts
  types/scoresheet.ts                           routes/health.ts  ✅        (tactics 已 push，其餘未 push)
  (比賽/名單/計分全在瀏覽器)                    routes/(比賽紀錄) ✗          openapi.yaml 是 API 層合約，
                                                                            codegen 產出 api-zod / api-client-react
```

### 逐欄位比對發現的落差

前端型別、DB schema、openapi 三者不是「同一個模型的三種寫法」，而是各走各的：

| 概念   | 前端 `types/match.ts` | DB `schema/matches.ts` | openapi `Match`    |
| ------ | --------------------- | ---------------------- | ------------------ |
| id     | `string`（nanoid）    | `serial`（整數自增）   | `integer`          |
| 標題   | 用 `opponent`         | 原本有 `name` notNull  | 原本沒有 name 欄位 |
| 時間   | `dateTime` 原始字串   | `date` timestamp       | `date` date-time   |
| 名單   | `players[]` 內嵌      | 獨立 `players` 表      | 獨立               |
| 資料夾 | `tournamentId`        | DB 沒有                | 沒有               |

**兩個原本會直接讓 API 爆掉的漂移（已在 Phase 0 修掉）：**

1. `matches.name` 原本是 notNull，但 openapi `NewMatch` 沒有 name 欄位 → 照規格 codegen 出來的
   insert 會因 name 為 null 被 Postgres 拒絕。**修法：把 `matches.name` 改成 nullable**，對齊前端
   「對手名稱就是標題、沒有獨立比賽名稱」的既有決定，而不是反過來強迫前端生一個 name 出來。
2. `players.number` 是 notNull，但 openapi `Player`/`NewPlayer` 漏了 number → 同樣 insert 失敗。
   **修法：把 number 補進 openapi**（前端本來就有這欄位）。

### events 表原本裝不下簡易版資料（已在 Phase 0 修掉）

`docs/match-recording-erd.html` 早就預判到：簡易版 ScoreSheet 的「對手(全體)」動作沒有球員可指、
「沒看到」路徑不記座標，但 events 表原本 `playerId` 與 `fromX/Y/toX/Y` 都是 notNull，而且沒有欄位
能區分「這球是我方還對方執行的」（`rallies.winner` 是「誰得分」，跟「誰做這球動作」是兩回事）。

**修法（照 ERD）：** 加 `events.side`（home/away, notNull）、把 `playerId` 與四個座標改 nullable。

## 分階段落地計畫

核心判斷：這不是「刻 12 條路由」的工作，而是**先把三層模型對齊，再由簡到繁接線**。

### Phase 0 — 對齊 schema 與規格（地基，不寫路由）✅ 進行中

1. 修 `openapi.yaml`：`Match`/`NewMatch` 對 name 的處理、`Player`/`NewPlayer` 補 `number`、
   `MatchEvent`/`NewEvent` 補 `side` 並把 playerId/座標改 optional。
2. 改 `schema/matches.ts`：`name` 改 nullable、加 `userId`（為未來真 auth 鋪路）。
3. 改 `schema/events.ts`：加 `side` enum、`playerId` 與座標改 nullable。
4. 跑 `pnpm --filter @workspace/api-spec run codegen` 重新生成 api-zod / api-client-react。
5. 跑 `pnpm --filter @workspace/db run push` 把所有表建到 dev DB。
   - 驗證：`pnpm run typecheck` 過。

### Phase 1 — 扁平資源 CRUD（`matches` / `players` / `sets`）

沒有深層巢狀依賴，先拿它們把 Drizzle 讀寫 pattern 跑順。每個資源一個路由檔
（`routes/matches.ts` 等），**沿用 `tactics.ts` 的風格：檔案內定義完整路徑**（如
`router.get("/matches/:matchId/players")`），在 `routes/index.ts` 掛載——跟現有 tactics 一致，
不玩 Express 的 `mergeParams`。驗證：實際打一輪 create → list → get。

### Phase 2 — 巢狀 + 事務（`rallies` / `events`）

- `POST /rallies/{rallyId}/events` 依 openapi，`source: 'live' | 'review'` 一個 endpoint 兩用。
- 開始需要**事務**：一分結束時要同時寫 rally + 多個 events，包 `db.transaction()` 保證全成或全 rollback。
- `PATCH` / `DELETE /events/{eventId}` 收尾。

### Phase 3 — 前端切換（localStorage → API）

用 codegen 出來的 `api-client-react`（React Query hooks）把 ScoreSheet / 比賽名單從 localStorage
慢慢搬到後端。最大一塊，可獨立排。這階段才會真正碰到前端 `dateTime` 字串 ↔ DB `date` timestamp、
前端 string id ↔ DB serial 整數的映射問題。

## 貫穿全程的架構決策

1. **擁有權 / auth**：`tactics` 表有 `userId` 可隔離使用者，比賽相關表原本沒有。已決定
   **現在就在 `matches` 加 `userId`**（Phase 0），路由沿用 tactics 的 `mockAuth`；巢狀資源
   （players/sets/rallies/events）之後靠「往上追到所屬 match 的 userId」驗證擁有權，不需要每張表都存 userId。
2. **錯誤處理中介層**：現在 `tactics.ts` 直接 `.parse()`，ZodError 會冒泡但沒有 error middleware 接，
   Express 5 預設回 500 HTML。應加一支 error middleware：ZodError → 400、外鍵違反 → 404/409。
   （這是現有程式碼就有的隱性缺口，Phase 1 補。）
3. **path 參數驗證**：openapi 的 id 是 integer，但 URL 拿到的是字串，用 `z.coerce.number().int()`
   轉，順便擋掉 `/matches/abc` 這種亂打。
