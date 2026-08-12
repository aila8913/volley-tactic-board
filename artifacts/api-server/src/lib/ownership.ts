import { eq, and } from "drizzle-orm";
import {
  db,
  matchesTable,
  playersTable,
  setsTable,
  ralliesTable,
  eventsTable,
  substitutionsTable,
  timeoutsTable,
  tournamentsTable,
  teamsTable,
  peopleTable,
  tacticsTable,
} from "@workspace/db";

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

// tournament（資料夾）跟 match 一樣是頂層資源、自己就存了 userId，所以不用 join，
// 直接比對 id + userId 就好——形狀跟上面的 matchBelongsToUser 一模一樣。
//
// 為什麼需要這一支（#127）：matches 的 POST/PATCH 收到 body.tournamentId 時，以前是原封不動
// 存進 DB，只靠外鍵擋。**外鍵保證的是 referential integrity（這個 uuid 真的指到一列存在的
// 資料夾），不保證 ownership（那列是不是「你的」資料夾）**——這兩件事很容易被當成同一件。
// 現在是 mock auth 單一使用者所以出不了事，但真 auth 上線後，A 只要知道 B 的資料夾 uuid，
// 就能把自己的比賽塞進 B 的資料夾（典型的 IDOR）。
export async function tournamentBelongsToUser(
  tournamentId: string,
  userId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: tournamentsTable.id })
    .from(tournamentsTable)
    .where(and(eq(tournamentsTable.id, tournamentId), eq(tournamentsTable.userId, userId)));

  return row !== undefined;
}

// team（球隊標籤）跟 tournament 一樣是頂層資源、自己存了 userId，直接比對 id + userId，
// 不用 join。matches 的 POST/PATCH 收到 body.teamId 時要先過這關，理由同 tournamentBelongsToUser：
// 外鍵只保證「這個 id 指到一列存在的球隊」，不保證「那是你的球隊」——真 auth 上線後別讓 A
// 把自己的比賽標成 B 的球隊（IDOR）。teamId 是整數（serial），所以參數型別是 number。
export async function teamBelongsToUser(teamId: number, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: teamsTable.id })
    .from(teamsTable)
    .where(and(eq(teamsTable.id, teamId), eq(teamsTable.userId, userId)));

  return row !== undefined;
}

// person（跨場身分）跟 team 一樣是頂層資源、自己存了 userId，直接比對 id + userId，
// 不用 join。players 的 POST/PATCH 收到 body.personId 時要先過這關，理由跟
// teamBelongsToUser 完全相同：外鍵只保證「這個 id 指到一列存在的人」，不保證「那是你名下
// 的人」——真 auth 上線後別讓 A 把自己的名單列掛到 B 的 person 身上（IDOR）。personId 是
// 整數（serial），所以參數型別是 number。
export async function personBelongsToUser(personId: number, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: peopleTable.id })
    .from(peopleTable)
    .where(and(eq(peopleTable.id, personId), eq(peopleTable.userId, userId)));

  return row !== undefined;
}

// player 的擁有權分兩步：先用上面的 matchBelongsToUser 確認 match 是這個 user 的，
// 再用這支確認這個 player 真的屬於那場 match（擋掉 /matches/1/players/999 這種 playerId
// 存在、但其實掛在別場比賽底下的情況）。比對的是 player.matchId，不需要再 join 到 userId。
export async function playerBelongsToMatch(playerId: string, matchId: number): Promise<boolean> {
  const [player] = await db
    .select({ id: playersTable.id })
    .from(playersTable)
    .where(and(eq(playersTable.id, playerId), eq(playersTable.matchId, matchId)));

  return player !== undefined;
}

// ── events.playerId 的兩支：擋「把一球指到不屬於這場比賽的球員」（#385）────────────────
//
// 判準本身寫成了 ADR-0009（docs/adr/0009-foreign-key-scope-is-the-match-not-the-user.md），
// 含「不要重新提議」四條——想把這兩支收斂成一支、或只驗 PATCH 不驗 POST 之前先讀它。
//
// 為什麼不是用 playerBelongsToUser（不存在，也不該存在）：player 沒有自己的 userId，它的
// 擁有權繼承自 match。但這裡真正要擋的**比擁有權更嚴**——就算那名球員也是你自己的，只要
// 他不在這場比賽的名單裡，把一球指給他就是錯的資料（他根本沒上場）。所以判準是
// 「同一場比賽」而不是「同一個使用者」，前者自動蘊含後者（match 已經驗過擁有權）。
//
// 為什麼要兩支：PATCH /events/:eventId 路徑上只有 eventId，POST /rallies/:rallyId/events
// 路徑上只有 rallyId，兩邊能拿來反推 matchId 的起點不同，join 的層數也就差一層。
// 邏輯完全一樣：從那個起點往上追到 sets.matchId，再看目標 player 的 matchId 是不是同一個。

// PATCH 用：從 event 往上追 events → rallies → sets 拿到 matchId，比對 player.matchId。
export async function playerBelongsToEventMatch(
  playerId: string,
  eventId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: playersTable.id })
    .from(eventsTable)
    .innerJoin(ralliesTable, eq(eventsTable.rallyId, ralliesTable.id))
    .innerJoin(setsTable, eq(ralliesTable.setId, setsTable.id))
    // innerJoin 到 players 時直接把「同一場比賽」寫進 join 條件：對不上就沒有列，
    // 不需要先查出 matchId 再發第二次查詢。
    .innerJoin(
      playersTable,
      and(eq(playersTable.id, playerId), eq(playersTable.matchId, setsTable.matchId)),
    )
    .where(eq(eventsTable.id, eventId));

  return row !== undefined;
}

// POST 用：從 rally 往上追 rallies → sets 拿到 matchId，比對 player.matchId。
// 這支補的是一個既有的洞——POST /rallies/:rallyId/events 原本只驗 parent rally，
// body.playerId 完全沒驗（events.ts 的 POST 註解寫著「維持遷移前的既有行為」）。
// 只驗 PATCH 不驗 POST 沒有意義：想指到別場的球員，直接刪掉重新 POST 一次就繞過去了。
export async function playerBelongsToRallyMatch(
  playerId: string,
  rallyId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: playersTable.id })
    .from(ralliesTable)
    .innerJoin(setsTable, eq(ralliesTable.setId, setsTable.id))
    .innerJoin(
      playersTable,
      and(eq(playersTable.id, playerId), eq(playersTable.matchId, setsTable.matchId)),
    )
    .where(eq(ralliesTable.id, rallyId));

  return row !== undefined;
}

// 越往下的巢狀層，擁有權檢查就要多 join 一層往上追到 match.userId。
// set 在 match 底下：join sets → matches，比對 setId 與 userId。
// innerJoin 的意思是「只保留兩張表都對得上的列」——如果這個 set 不存在、
// 或它所屬的 match 不是這個 user 的，join 完就是空的，回傳 false。
export async function setBelongsToUser(setId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: setsTable.id })
    .from(setsTable)
    .innerJoin(matchesTable, eq(setsTable.matchId, matchesTable.id))
    .where(and(eq(setsTable.id, setId), eq(matchesTable.userId, userId)));

  return row !== undefined;
}

// rally 在 set 底下、set 又在 match 底下：要 join 兩層（rallies → sets → matches）。
export async function rallyBelongsToUser(rallyId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: ralliesTable.id })
    .from(ralliesTable)
    .innerJoin(setsTable, eq(ralliesTable.setId, setsTable.id))
    .innerJoin(matchesTable, eq(setsTable.matchId, matchesTable.id))
    .where(and(eq(ralliesTable.id, rallyId), eq(matchesTable.userId, userId)));

  return row !== undefined;
}

// substitution 跟 rally 一樣掛在 set 底下（不是掛在 rally），所以擁有權也是 join 兩層
// （substitutions → sets → matches）追到 match.userId。DELETE /substitutions/:id 路徑上
// 只有 substitutionId（沒有 set/match），只能靠這條 join 鏈反推它屬不屬於這個 user。
export async function substitutionBelongsToUser(
  substitutionId: string,
  userId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: substitutionsTable.id })
    .from(substitutionsTable)
    .innerJoin(setsTable, eq(substitutionsTable.setId, setsTable.id))
    .innerJoin(matchesTable, eq(setsTable.matchId, matchesTable.id))
    .where(and(eq(substitutionsTable.id, substitutionId), eq(matchesTable.userId, userId)));

  return row !== undefined;
}

// timeout 跟 substitution 一樣掛在 set 底下（不是掛在 rally），所以擁有權也是 join 兩層
// （timeouts → sets → matches）追到 match.userId。DELETE /timeouts/:id 路徑上只有 timeoutId
// （沒有 set/match），只能靠這條 join 鏈反推它屬不屬於這個 user，跟 substitutionBelongsToUser 同理。
export async function timeoutBelongsToUser(timeoutId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: timeoutsTable.id })
    .from(timeoutsTable)
    .innerJoin(setsTable, eq(timeoutsTable.setId, setsTable.id))
    .innerJoin(matchesTable, eq(setsTable.matchId, matchesTable.id))
    .where(and(eq(timeoutsTable.id, timeoutId), eq(matchesTable.userId, userId)));

  return row !== undefined;
}

// tactic（戰術）跟 tournament/team/person 一樣是頂層資源、自己存了 userId，直接比對
// id + userId，不用 join。GET/PUT/DELETE /tactics/:tacticId 這三支原本各自重複寫了一次
// 這段查詢（handler() 的 owns closure），收斂成這支共用函式（#228 self-review 時發現的重複）。
export async function tacticBelongsToUser(tacticId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: tacticsTable.id })
    .from(tacticsTable)
    .where(and(eq(tacticsTable.id, tacticId), eq(tacticsTable.userId, userId)));

  return row !== undefined;
}

// event 是最深一層：events → rallies → sets → matches，join 三層才追得到 userId。
// PATCH / DELETE /events/:eventId 只拿得到 eventId（路徑裡沒有 match/set/rally），
// 所以只能靠這條 join 鏈反推它到底屬不屬於這個 user。
export async function eventBelongsToUser(eventId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: eventsTable.id })
    .from(eventsTable)
    .innerJoin(ralliesTable, eq(eventsTable.rallyId, ralliesTable.id))
    .innerJoin(setsTable, eq(ralliesTable.setId, setsTable.id))
    .innerJoin(matchesTable, eq(setsTable.matchId, matchesTable.id))
    .where(and(eq(eventsTable.id, eventId), eq(matchesTable.userId, userId)));

  return row !== undefined;
}
