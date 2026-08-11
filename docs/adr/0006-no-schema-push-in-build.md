# ADR-0006：部署流程刻意不含 `drizzle-kit push`

- 狀態：Accepted
- 日期：2026-08-11
- 來源：2026-08-08 正式站 500，追出來的根因

## 背景

這個專案是 schema-first、不產 migration 檔（`drizzle-kit push` 直接把 schema 推進 DB）。
`render.yaml` 的 `buildCommand` 只有 `install` + `build`，**沒有** push。

代價踩過一次：合併了動 `lib/db/src/schema/` 的 PR 卻忘了手動 push，正式站的新程式查一個
不存在的欄位、當場 500，而**四道 CI 全綠**——CI 跑的是本機／CI 的資料庫，看不到雲端的 schema 漂移。

於是很自然會想「那把 `drizzle-kit push` 加進 `buildCommand` 不就好了」。這張 ADR 就是為了
回答那個念頭。

## 決定

**雲端 schema 變更必須是明確的人為動作，不能是合併的副作用。**

`push` 是破壞性的：它比對 schema 與現有資料庫後直接改結構，欄位改名可能被判成
「刪一欄 + 加一欄」而丟掉資料，而且**沒有 migration 檔可以回頭**（這是 schema-first 的既定取捨）。
把它掛在 `buildCommand` 上，等於讓「按下 merge」同時觸發一次不可逆的正式資料庫改動——
而 merge 是這個專案裡最頻繁、也最容易在沒看 diff 的情況下發生的動作。

寧可付「有時候忘記 push、正式站 500」的代價，也不付「某次 merge 靜靜刪掉正式資料」的代價。
前者吵、可逆、五分鐘修好；後者安靜、不可逆。

## 後果

- 動 `lib/db/src/schema/` 的 PR，合併後要**人工**跑一次 push，這是流程的一部分不是遺漏
- **CI 全綠不代表正式站會動**——這類 bug 只有正式站測得出來
- Neon 要用 **Direct** 連線字串跑 push（pooled 會靜靜卡在「Pulling schema…」）；
  dotenv **不覆蓋**已存在的 `process.env`，在 shell 裡設 `DATABASE_URL` 會蓋過 repo 的 `.env`

## 不要重新提議

- 「把 `drizzle-kit push` 加進 `render.yaml` 的 `buildCommand`」——本 ADR 拒絕的那條路
- 「加一個 CI job 自動 push 到正式 DB」——同一件事換個地方，一樣是把不可逆動作自動化
- 「因為忘記過所以改成自動」——忘記正是預期成本，不是這個決定失敗的證據
