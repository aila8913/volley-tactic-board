// 讓「寫入時漏列一個欄位」從安靜的資料遺失變成編譯錯誤（issue #368）。
//
// ── 在解什麼問題 ──
//
// route 的寫入是**逐欄列舉**的：
//
//     await db.insert(eventsTable).values({ rallyId, sequence, side, action, ... })
//
// 這是刻意的，不是懶——`req.body` 是使用者送來的資料，整包 `...body` 展開會讓「由路徑
// 決定的欄位」有被蓋掉的風險（`POST /rallies/:rallyId/events` 的 rallyId 來自已驗過
// 擁有權的路徑參數，body 裡若也夾帶一個 rallyId，展開就等於讓使用者把 event 寫到別人的
// rally 底下）。這個取捨不變。
//
// 代價是：新增一個 nullable 欄位時，schema / openapi / route 三邊都要記得改，而**第三邊
// 漏掉是完全靜默的**——欄位可以是 null，少給就是 null，所以不是型別錯誤、沒有測試會紅、
// 四道 CI 全綠，而功能完全沒生效。2026-08-10 的 PR #365 就這樣：前端已經在送 `outcome`，
// route 沒把它列進去，結果每一球的 outcome 永遠是 null，是靠人工讀 route 檔才抓到的。
//
// ── 這裡怎麼讓它變吵 ──
//
// TypeScript 的物件字面量在指派給一個型別時，**少了必填的 key 會報錯**（TS2741）。所以
// 只要有一個「這張表的每一欄都是必填」的型別，把寫入物件標註成它，漏欄位就編譯不過：
//
//     const values: EveryColumnOnInsert<typeof eventsTable> = { ... };
//     //    ^ 少寫 outcome → Property 'outcome' is missing in type ...
//
// drizzle 的 `$inferInsert` 本身做不到這件事，因為它刻意把「nullable 或有 default 的欄位」
// 標成 optional（`outcome?: ...`）——那對呼叫端是方便，對我們卻正是漏欄位不會被抓到的原因。
// 底下的 `-?` 就是把那個 optional 修飾子拿掉。
//
// ── 為什麼 insert 和 update 是兩個型別 ──
//
// 差別在「可不可以明寫 undefined」。兩者都靠一個 drizzle 的實作事實（0.45.2 讀過原始碼確認）：
//
//   - insert：`buildInsertQuery` 遇到 `colValue === undefined` 會送出 SQL 的 `default`，
//     所以明寫 `id: undefined` 跟整個省略不寫，產生的 SQL 完全一樣。
//   - update：`mapUpdateSet` 會 `.filter(([, value]) => value !== undefined)`，所以
//     `.set({ side: undefined })` 跟舊寫法 `...(body.side !== undefined && { side: body.side })`
//     也完全等價。
//
// 也就是說這整套是**純型別**的：執行期行為與送出的 SQL 一個位元都沒變，只是逼人把每一欄
// 都寫出來、想略過就得明寫 `undefined`（而那句 `undefined` 本身就是一份「這欄目前不寫」的
// 紀錄，下一個人看得到，也就有機會發現它該改了）。
import type { SQL } from "drizzle-orm";

// ── 為什麼不是 `{ [K in keyof X]-?: X[K] | undefined }` ──
//
// 直覺的寫法是用 mapped type 的 `-?` 把 optional 修飾子拿掉、再自己補回 `| undefined`。
// 那行不通：TypeScript 的 `-?` 規則是**連同型別裡的 undefined 一起移除**（`Required<T>`
// 就是靠這個），所以補回去的 undefined 會被當場剝掉，`id: body.id ?? undefined` 反而編譯不過。
//
// 改用一個不碰修飾子的組合：**`Record<keyof X, unknown> & X`**。
//   - `Record<keyof X, unknown>` 只負責一件事：這些 key 全部**必須出現**（少寫就 TS2741）。
//   - `& X` 負責值的型別；`unknown & T` 會化簡成 `T`，所以每一欄仍然是它原本該有的型別。
// 兩者相交的效果就是「X 的所有欄位，一個都不准省略」。

// 「這張表 insert 時的所有欄位都要列出來」。
//
// 值的型別直接沿用 `$inferInsert`，於是自然分成兩種：
//   - 本來 optional（nullable、或有 default，例如 id / outcome）→ 型別含 undefined，
//     可以明寫 `id: undefined`，語意是「這次不給值，交給資料庫」。
//   - 本來 required（notNull 又沒有 default，例如 sequence / side）→ 不含 undefined，
//     非給實際值不可。那種欄位本來就跑不掉，放寬只會讓檢查失去意義。
export type EveryColumnOnInsert<TTable extends { $inferInsert: object }> = Record<
  keyof TTable["$inferInsert"],
  unknown
> &
  TTable["$inferInsert"];

// 「這張表 update 時的所有欄位都要列出來」。
//
// 跟 insert 版的差別：**每一欄都允許 undefined**，因為 PATCH 的語意是「body 有帶的才改」，
// 任何一欄都可能這次不動。連 notNull 的欄位也是——不改它跟把它改成 null 是兩回事。
//
// 這條規則的附加價值比 insert 那邊更大：像 rallyId、sequence 這種「不開放 PATCH 修改」的
// 欄位，現在也必須在物件裡明寫 `rallyId: undefined`。那一行等於把「這欄不給改」這個決定
// 從「沒寫所以沒有」變成程式碼裡看得到的一句話。
//
// `| SQL` 是留給 `sql\`...\`` 片語（例如 `count: sql\`count + 1\``）的，對齊 drizzle
// `.set()` 本來就收 SQL 的行為，免得為了用型別而擋掉合法寫法。
export type EveryColumnOnUpdate<TTable extends { $inferInsert: object }> = Record<
  keyof TTable["$inferInsert"],
  unknown
> & {
  // 這一半跟 insert 版的 `& X` 對應，差別是加了 `?`：optional 修飾子會把 undefined 併進
  // 每一欄的型別（連 notNull 的欄位也是），而「必須出現」則由上面的 Record 保證。
  [K in keyof TTable["$inferInsert"]]?: TTable["$inferInsert"][K] | SQL;
};
