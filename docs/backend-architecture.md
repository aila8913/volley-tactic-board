# 後端架構設計

> 這份文件是「比賽紀錄後端」從無到有的實作藍圖與架構檢視。真正的規格來源仍是
> `lib/api-spec/openapi.yaml`（API 合約）跟 `lib/db/src/schema/*.ts`（DB schema）；
> 這份文件補的是它們之間的**取捨、落差、跟落地順序**。相關文件：
> [api-spec.md](./api-spec.md)（endpoint 導覽）、[db-schema-spec.md](./db-schema-spec.md)
> （資料表關係）、[match-recording-erd.html](./match-recording-erd.html)（events 表共用 schema 的 ERD）。

> **狀態（2026-07-11）：本藍圖的 Phase 0–3 已全部完成，#58 已關。** 下面的「現況：三層模型的落差」
> 描述的是**動工前的起點**（保留下來是為了理解為什麼要分階段），不是現在的狀態。現在三層已打通、
> schema 已 push、路由全實作、前端計分表已脫離 localStorage。要看現在的 endpoint/表清單，見
> [api-spec.md](./api-spec.md) 與 [db-schema-spec.md](./db-schema-spec.md)。

## 現況：三層模型的落差（動工前的起點）

比賽紀錄這條資料流有三個層次，**動工前只有戰術板 (tactics) 那條線是打通的**（前端 → API → DB
全通，`routes/tactics.ts` 是可照抄的範本）。比賽紀錄這條線當時：DB schema 定義好了但（除了 tactics）
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

### Phase 0 — 對齊 schema 與規格（地基，不寫路由）✅ 已完成（PR #53）

1. 修 `openapi.yaml`：`Match`/`NewMatch` 對 name 的處理、`Player`/`NewPlayer` 補 `number`、
   `MatchEvent`/`NewEvent` 補 `side` 並把 playerId/座標改 optional。
2. 改 `schema/matches.ts`：`name` 改 nullable、加 `userId`（為未來真 auth 鋪路）。
3. 改 `schema/events.ts`：加 `side` enum、`playerId` 與座標改 nullable。
4. 跑 `pnpm --filter @workspace/api-spec run codegen` 重新生成 api-zod / api-client-react。 //從 openapi.yaml 的手寫檔案轉成真的 api 程式
5. 跑 `pnpm --filter @workspace/db run push` 把所有表建到 dev DB。
   - 驗證：`pnpm run typecheck` 過。

### Phase 1 — 扁平資源 CRUD（`matches` / `players` / `sets`）✅ 已完成

沒有深層巢狀依賴，先拿它們把 Drizzle 讀寫 pattern 跑順。每個資源一個路由檔
（`routes/matches.ts` 等），**沿用 `tactics.ts` 的風格：檔案內定義完整路徑**（如
`router.get("/matches/:matchId/players")`），在 `routes/index.ts` 掛載——跟現有 tactics 一致，
不玩 Express 的 `mergeParams`。驗證：實際打一輪 create → list → get。

落地內容：

- `routes/matches.ts`（GET/POST/GET:id/PATCH，userId 擁有權隔離）、`routes/players.ts`、
  `routes/sets.ts`（後兩者靠 `lib/ownership.ts` 的 `matchBelongsToUser()` 先驗 parent match 擁有權）。
- 補上 `middleware/errorHandler.ts`：ZodError → 400、外鍵違反 → 404/409、其餘 → 500，
  掛在所有路由之後（app.ts）。這是原本 `tactics.ts` 就缺的隱性缺口。
- 已對真實 dev DB 端對端驗證 happy path 與錯誤情境（400/404）通過。

### Phase 2 — 巢狀 CRUD（`rallies` / `events`）✅ 已完成

落地內容（六個 endpoint，完全照 openapi 合約）：

- `routes/rallies.ts`：`GET`/`POST /sets/:setId/rallies`（依 `rallyNumber` 排序）。
- `routes/events.ts`：`GET`/`POST /rallies/:rallyId/events`（依 `sequence` 排序）、
  `PATCH`/`DELETE /events/:eventId`。
- `POST /rallies/:rallyId/events` 依 openapi，`source: 'live' | 'review'` 一個 endpoint 兩用
  （即時記 vs 賽後補影片座標），路由邏輯相同，差別只在 body 帶不帶座標／videoTimestamp。
- 擁有權：巢狀越深就多 join 一層往上追 `match.userId`。`lib/ownership.ts` 補了
  `setBelongsToUser`（sets→matches）、`rallyBelongsToUser`（rallies→sets→matches）、
  `eventBelongsToUser`（events→rallies→sets→matches，因為 `/events/:eventId` 路徑上只有 event id）。
- 已對真實 dev DB 端對端驗證：match→set→rally→event 建立鏈、list/patch/delete、
  FK cascade（刪 match 連帶清掉 rally/event），以及 404（擁有權）/400（body 與 path param 驗證）情境。

**關於「事務（transaction）」的修正：** 原本設想「一分結束時同時寫 rally + 多個 events，用
`db.transaction()` 保證全成或全 rollback」。但**現行 openapi 合約沒有這種 bulk endpoint** —— rally
跟 event 是分開的單筆 `POST`，每筆本身就是原子操作，`db.transaction()` 沒有東西可以包。若之後前端要
「一次送整個 rally（含多球）」，得先在 `openapi.yaml` 加一個 bulk endpoint、重新 codegen，那時才會
真正需要事務。現階段不預先實作規格裡不存在的 endpoint。

### Phase 3 — 前端切換（localStorage → API）✅ 已完成（#58 已關）

用 codegen 出來的 `api-client-react`（React Query hooks）把 ScoreSheet / 比賽名單從 localStorage
搬到後端。最大一塊，分三段落地：3a（matches + 名單，PR #60）、3b-i（比分/輪轉，PR #62）、
3b-ii（events 讀回 → 球員統計，PR #66）。過程中處理了前端 `dateTime` 字串 ↔ DB `date` timestamp、
前端 string id ↔ DB serial 整數的映射（`lib/matchMapping.ts` / `lib/scoreSheetMapping.ts`，皆有單元測試）。
換人持久化（#42）與 `lineups`/`substitutions`/`people`/`teams` schema 是這之後補的下游地基。

## 貫穿全程的架構決策

1. **擁有權 / auth**：`tactics` 表有 `userId` 可隔離使用者，比賽相關表原本沒有。已決定
   **現在就在 `matches` 加 `userId`**（Phase 0），路由沿用 tactics 的 `mockAuth`；巢狀資源
   （players/sets/rallies/events）之後靠「往上追到所屬 match 的 userId」驗證擁有權，不需要每張表都存 userId。
2. **錯誤處理中介層**：現在 `tactics.ts` 直接 `.parse()`，ZodError 會冒泡但沒有 error middleware 接，
   Express 5 預設回 500 HTML。應加一支 error middleware：ZodError → 400、外鍵違反 → 404/409。
   （這是現有程式碼就有的隱性缺口，Phase 1 補。）
3. **path 參數驗證**：openapi 的 id 是 integer，但 URL 拿到的是字串，用 `z.coerce.number().int()`
   轉，順便擋掉 `/matches/abc` 這種亂打。
