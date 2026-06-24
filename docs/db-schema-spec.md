# 資料庫 Schema 規格

> 這份文件是 ER 關係總覽，**不是**真正的規格來源 —— 這個專案是 schema-first（見 CLAUDE.md），
> 真正的規格就是 `lib/db/src/schema/*.ts` 裡的 Drizzle table 定義本身。這份文件只是幫助理解全貌，
> 如果跟程式碼有出入，以程式碼為準。對應的產品需求見 [product-spec.md](./product-spec.md)。

## 資料表關係

```
Match (一場比賽)
├── Player[]   一場比賽的球員名單（陣容掛在比賽底下，不是獨立球隊概念）
└── Set[]      一局
    └── Rally[]    一分（一個來回）
        └── Event[]    一球
```

| 資料表    | 檔案                                | 對應到 |
| --------- | ----------------------------------- | ------ |
| `matches` | `lib/db/src/schema/matches.ts`      | 一場比賽，含 `video_url`（YouTube 連結，可空） |
| `players` | `lib/db/src/schema/players.ts`      | 球員名單，角色跟前端戰術板的 `Player.role` 一致 |
| `sets`    | `lib/db/src/schema/sets.ts`         | 局（最多 5 局） |
| `rallies` | `lib/db/src/schema/rallies.ts`      | 一分；記錄的是該分**開始前**的比分 |
| `events`  | `lib/db/src/schema/events.ts`       | 一球；座標跟前端球場 SVG 的 viewBox (0~100 x 0~200) 一致 |

## 為什麼這樣設計（非顯而易見的決定）

- **`players` 掛在 `match` 底下，不是獨立的球隊實體**：同一隊不同場次的先發/名單可能不同，現在不需要
  跨比賽共用球員資料，先用最簡單的模型，避免過度設計。
- **`rallies.homeScore` / `awayScore` 存的是分數開始前的值**：這樣每一筆 rally 都能獨立還原當時的
  比賽情境，不需要把前面所有分數加總才能知道某一球發生時比分多少。
- **`events.tags` 用 Postgres 原生陣列型別**：預設標籤跟使用者自訂標籤都存進同一個欄位，不需要另外
  開一張標籤表、再用 join 查詢。
- **`events.quality` 是 0~3 分**：沿用排球記錄慣例的評分刻度（0 = 直接失誤、3 = 完美到位），用來計算
  「到位率」。門檻值（幾分以上算到位）目前未定案，見 [product-spec.md](./product-spec.md) 待確認事項。
- **型別命名 `MatchSet` / `MatchEvent` 而不是 `Set` / `Event`**：避免跟 JavaScript 內建的 `Set`、
  瀏覽器內建的 DOM `Event` 撞名。

## 還沒做的事

- 還沒執行 `pnpm --filter @workspace/db run push` 把這些 table 真正建到資料庫裡（需要先有
  `DATABASE_URL`）。
- 還沒實作對應的 API routes（見 [api-spec.md](./api-spec.md)）。
