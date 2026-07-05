import { eq, and } from "drizzle-orm";
import { db, matchesTable } from "@workspace/db";

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
