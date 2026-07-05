import { eq, and } from "drizzle-orm";
import { db, matchesTable, setsTable, ralliesTable, eventsTable } from "@workspace/db";

// 巢狀資源（players/sets/rallies/events）自己沒有存 userId，它們的擁有權是「繼承」自所屬的 match。
// 所以在對這些資源做讀寫之前，要先確認 parent match 真的屬於這個使用者，
// 否則就等於讓 A 使用者能透過 /matches/<B 的 matchId>/players 去讀到 B 的資料。
// 把這個檢查抽成共用函式，players/sets/rallies 都能重複使用，不用每個路由各寫一次。
export async function matchBelongsToUser(matchId: number, userId: string): Promise<boolean> {
  const [match] = await db
    .select({ id: matchesTable.id })
    .from(matchesTable)
    .where(and(eq(matchesTable.id, matchId), eq(matchesTable.userId, userId)));

  return match !== undefined;
}

// 越往下的巢狀層，擁有權檢查就要多 join 一層往上追到 match.userId。
// set 在 match 底下：join sets → matches，比對 setId 與 userId。
// innerJoin 的意思是「只保留兩張表都對得上的列」——如果這個 set 不存在、
// 或它所屬的 match 不是這個 user 的，join 完就是空的，回傳 false。
export async function setBelongsToUser(setId: number, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: setsTable.id })
    .from(setsTable)
    .innerJoin(matchesTable, eq(setsTable.matchId, matchesTable.id))
    .where(and(eq(setsTable.id, setId), eq(matchesTable.userId, userId)));

  return row !== undefined;
}

// rally 在 set 底下、set 又在 match 底下：要 join 兩層（rallies → sets → matches）。
export async function rallyBelongsToUser(rallyId: number, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: ralliesTable.id })
    .from(ralliesTable)
    .innerJoin(setsTable, eq(ralliesTable.setId, setsTable.id))
    .innerJoin(matchesTable, eq(setsTable.matchId, matchesTable.id))
    .where(and(eq(ralliesTable.id, rallyId), eq(matchesTable.userId, userId)));

  return row !== undefined;
}

// event 是最深一層：events → rallies → sets → matches，join 三層才追得到 userId。
// PATCH / DELETE /events/:eventId 只拿得到 eventId（路徑裡沒有 match/set/rally），
// 所以只能靠這條 join 鏈反推它到底屬不屬於這個 user。
export async function eventBelongsToUser(eventId: number, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: eventsTable.id })
    .from(eventsTable)
    .innerJoin(ralliesTable, eq(eventsTable.rallyId, ralliesTable.id))
    .innerJoin(setsTable, eq(ralliesTable.setId, setsTable.id))
    .innerJoin(matchesTable, eq(setsTable.matchId, matchesTable.id))
    .where(and(eq(eventsTable.id, eventId), eq(matchesTable.userId, userId)));

  return row !== undefined;
}
