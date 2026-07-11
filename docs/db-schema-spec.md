# 資料庫 Schema 規格

> 這份文件是 ER 關係總覽，**不是**真正的規格來源 —— 這個專案是 schema-first（見 CLAUDE.md），
> 真正的規格就是 `lib/db/src/schema/*.ts` 裡的 Drizzle table 定義本身。這份文件只是幫助理解全貌，
> 如果跟程式碼有出入，以程式碼為準。對應的產品需求見 [product-spec.md](./product-spec.md)。

## 資料表關係

```
People (跨場跨隊的一個「人」)          Team (球隊 / 分組標籤)
    ▲ personId (可空)                     ▲ teamId (可空)
    │                                     │
Match (一場比賽) ────────── teamId ───────┘
├── Player[]   一場比賽的名單列 ── personId ──▶ People
└── Set[]      一局
    ├── Lineup          這局的起始先發（一局一 row，六個號位）
    ├── Substitution[]  這局發生的換人（一般 / 自由球員）
    └── Rally[]         一分（一個來回）
        └── Event[]     一球

Tactics (戰術板存檔)  ← 獨立那條線，比賽紀錄之前就存在
```

| 資料表          | 檔案                                 | 對應到                                                                                         |
| --------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `matches`       | `lib/db/src/schema/matches.ts`       | 一場比賽，含 `video_url`（YouTube 連結，可空）、`teamId`（可空 FK → `teams`）                  |
| `players`       | `lib/db/src/schema/players.ts`       | 一場比賽的名單列，角色同前端 `PLAYER_ROLES`（S/OH/MB/OPP/L）；`personId`（可空 FK → `people`） |
| `sets`          | `lib/db/src/schema/sets.ts`          | 局（最多 5 局），含 `firstServer`（home/away，重播輪轉的唯一種子）                             |
| `lineups`       | `lib/db/src/schema/lineups.ts`       | 一局的起始先發，**一局一 row**（`setId` unique），六個 `zone{1..6}PlayerId` notNull FK         |
| `substitutions` | `lib/db/src/schema/substitutions.ts` | 一次換人，`kind` = regular/libero，時機存**比分快照**（homeScore/awayScore），非 rallyId       |
| `rallies`       | `lib/db/src/schema/rallies.ts`       | 一分；記錄的是該分**開始前**的比分                                                             |
| `events`        | `lib/db/src/schema/events.ts`        | 一球；`side`(home/away)、`outcome`(得/失/球續，可空)、座標對前端 viewBox (0~100 x 0~200)       |
| `people`        | `lib/db/src/schema/people.ts`        | 跨場跨隊的唯一「人」身分（`id`/`userId`/`name`）——把散落各場的名單列串成同一個人               |
| `teams`         | `lib/db/src/schema/teams.ts`         | 球隊 / 分組標籤（`id`/`userId`/`name`）——讓統計可以按隊切片                                    |
| `tactics`       | `lib/db/src/schema/tactics.ts`       | 戰術板存檔（站位/標記/防守範圍），與比賽紀錄各自獨立                                           |

## 為什麼這樣設計（非顯而易見的決定）

- **`players` 是「一場比賽的一列名單」，身分/球隊分開存兩層**：同一人不同場次可能穿不同號、甚至換隊，
  所以每場的名單列各自是一筆 `player`（歷史事實，不共用）。要把「散落各場的同一個人」串起來，靠
  `players.personId → people`（跨場跨隊的唯一身分錨點）；要把比賽按隊切片，靠 `matches.teamId → teams`。
  兩條 FK 都是**可空 + `onDelete: set null`**：刪掉 canonical 身分/球隊只斷連結，不連帶抹掉歷史紀錄
  （原本「players 不需要跨比賽共用」的簡化，在 #102 導入 people/teams 後改成這個兩層模型）。
- **`rallies.homeScore` / `awayScore` 存的是分數開始前的值**：這樣每一筆 rally 都能獨立還原當時的
  比賽情境，不需要把前面所有分數加總才能知道某一球發生時比分多少。
- **`events.tags` 用 Postgres 原生陣列型別**：預設標籤跟使用者自訂標籤都存進同一個欄位，不需要另外
  開一張標籤表、再用 join 查詢。
- **`events.quality` 是 0~3 分**：沿用排球記錄慣例的評分刻度（0 = 直接失誤、3 = 完美到位），用來計算
  「到位率」。門檻值（幾分以上算到位）目前未定案，見 [product-spec.md](./product-spec.md) 待確認事項。
- **型別命名 `MatchSet` / `MatchEvent` 而不是 `Set` / `Event`**：避免跟 JavaScript 內建的 `Set`、
  瀏覽器內建的 DOM `Event` 撞名。

## 落地狀態

以上所有表都已 `pnpm --filter @workspace/db run push` 到 dev DB，對應的後端 API routes 也全部
實作完成（見 [api-spec.md](./api-spec.md)）。仍未做的是 schema 之上的**應用層**：`people`/`teams`
的 openapi/codegen 與前端讀寫、建名單去重 UX、舊比賽回填身分——追蹤於 #65 後續階段與 #102 留言。
