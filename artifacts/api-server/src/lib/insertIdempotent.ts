import { eq, and, type SQL, type InferSelectModel } from "drizzle-orm";
import type { PgTable, PgColumn, PgInsertValue } from "drizzle-orm/pg-core";
import { db } from "@workspace/db";

// 「冪等寫入 + 重送回既有列」的單一實作（#64 PR3 的後端那一半）。
//
// 為什麼要抽出來：這段邏輯原本在 sets / rallies / events / substitutions / timeouts
// 五個 route 各有一份**逐字相同**的複本（每份約 22 行），複本自己的註解都寫著
// 「做法與理由見 sets.ts 的 POST 註解」——那句話就是重複的自白。這段又剛好是併發敏感的
// 邏輯（它處理的正是「同一筆寫入被送了兩次」），改一份忘四份不會有人發現，直到某張表
// 的重送行為跟其他四張表悄悄分岔。收斂成一份之後，重送語意變成只有一個地方定義。
//
// ── 這段在解什麼問題 ──
// 前端的離線佇列（volleyball-tactics 的 lib/writeLog.ts）只能保證「至少送一次」：
// 後端明明已經寫進去了，但回應在半路掉了的話，前端重連後會用**同一個 id** 再送一次。
//   1. 沒有 onConflictDoNothing → 第二次撞主鍵回 409 → 那筆永遠卡在佇列裡重送。
//   2. 有了它 → 重複的第二次安靜地什麼都不做，前端收到成功、把那筆標成已同步。
// 這是「主鍵由前端鑄造」（client-mintable id，#64 PR2）的附加價值：id 本身就是
// 冪等鑰匙（idempotency key），不必再另外設計一個 request id 欄位。
//
// ── scope 參數是安全機制，不是方便性參數 ──
// 撞到既有 id 時要把那一列讀回來回給前端。但「拿一個 id 就能換到那列內容」正是一條
// IDOR 探測管道（#225 的教訓）——攻擊者可以拿別人的 row id 來 POST，藉回應內容確認
// 那列存不存在、甚至讀到內容。所以重讀時一定要加上「這列真的掛在你已經驗過擁有權的
// 上層底下」這個條件，也就是 scope（例如 eq(setsTable.matchId, params.matchId)）。
// 呼叫端在 handler 的 owns 已經驗過那個上層屬於自己，兩者合起來才閉環。
// 設成必填參數（而不是可選），理由跟 handler.ts 的 owns 一樣：漏寫的後果是安全漏洞，
// 所以要讓「這支路由的 scope 是什麼」變成一定得主動決定、而且會留在程式碼裡的一件事。
//
// ── 回傳值 ──
// 回傳那一列（不管是這次新建的、還是重送撞到的既有列）——對呼叫端來說兩者沒有差別，
// 都回 201，openapi 合約也才能維持單一成功狀態碼。
// 回 null 代表「這個 id 已經存在，但不在你的 scope 底下」，呼叫端據此回 409。
//
// 刻意只回傳資料、不碰 res：這樣它是個純粹「進去值、出來列」的函式，不需要假造
// Express 的 req/res 就測得到（見 handler.ts 也是把 res 留給呼叫端的同一個取捨）。
export async function insertIdempotent<TTable extends PgTable & { id: PgColumn }>(
  table: TTable,
  // & { id?: string } 是為了讓底下讀得到 values.id——PgInsertValue<TTable> 是泛型，
  // TypeScript 在還不知道 TTable 是哪張表時無法確定它有 id 欄位。這五張表的 id 都是
  // uuid 主鍵，交集一個 optional string 不會放寬任何實際呼叫端的型別檢查。
  values: PgInsertValue<TTable> & { id?: string },
  scope: SQL,
): Promise<InferSelectModel<TTable> | null> {
  const [created] = await db
    .insert(table)
    .values(values)
    .onConflictDoNothing({ target: table.id })
    .returning();

  if (created) return created as InferSelectModel<TTable>;

  // 走到這裡代表這個 id 已經存在。沒帶 id 的話根本不可能走到（DB 自己生的 uuid 撞不到），
  // 但型別上 values.id 仍是 optional，所以照樣處理成「查不到 → 409」。
  if (!values.id) return null;

  // `table as PgTable` 這個 cast 是為了繞過 drizzle 的一個型別限制，不是在放寬安全檢查：
  // .from() 的參數型別包了一層條件型別（用來擋「沒有 returning 的 subquery」那種誤用），
  // 而條件型別遇到還沒具體化的泛型參數 TTable 時 TypeScript 無法求值，於是整個判斷卡住。
  // 退回非泛型的 PgTable 讓它求得出值；代價是這一行的回傳型別變寬，所以下面補一次 cast
  // 回 InferSelectModel<TTable>。這正是深模組該做的事——把型別系統的粗糙處關在實作裡，
  // 讓呼叫端拿到的介面（進去一張表、出來那張表的列）保持精確。
  const [existing] = await db
    .select()
    .from(table as PgTable)
    .where(and(eq(table.id, values.id), scope))
    .limit(1);

  return (existing as InferSelectModel<TTable> | undefined) ?? null;
}
