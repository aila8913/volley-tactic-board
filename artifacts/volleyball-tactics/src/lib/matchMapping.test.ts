import { describe, it, expect } from "vitest";
import {
  localInputToIso,
  isoToLocalInput,
  serverMatchToDomain,
  serverPlayerToDomain,
  diffRoster,
} from "./matchMapping";
import type { MatchPlayer } from "../types/match";

// 這些都是純函式（沒碰網路/store），最適合用單元測試釘住行為。重點是三層落差的轉換：
// id 整數↔字串、日期 local 字串↔ISO、名單 diff。

describe("date mapping", () => {
  it("round-trips a datetime-local string through ISO and back", () => {
    // 不管跑測試的機器在哪個時區，local→ISO→local 都應該回到同一個牆上時鐘時間。
    const local = "2026-06-24T15:30";
    expect(isoToLocalInput(localInputToIso(local))).toBe(local);
  });

  it("localInputToIso produces a valid ISO string", () => {
    expect(localInputToIso("2026-01-02T09:05")).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  });

  it("isoToLocalInput zero-pads month/day/hour/minute", () => {
    // 用本地時間建一個 Date 再轉 ISO，避免測試寫死時區。
    const iso = new Date(2026, 0, 2, 9, 5).toISOString();
    expect(isoToLocalInput(iso)).toBe("2026-01-02T09:05");
  });
});

describe("server → domain mapping", () => {
  it("maps a player, stringifying its id", () => {
    expect(
      serverPlayerToDomain({
        // players.id 在 #64 PR1 後從自增整數改成 client-mintable uuid，這裡的後端 DTO
        // 型別（ApiPlayer.id）已經是 string，測試 fixture 要跟著改成字串，
        // 不然「stringifying its id」這個測試名稱本身就對不上型別了。
        id: "7",
        matchId: 3,
        name: "小明",
        number: 12,
        role: "S",
        personId: null,
      }),
    ).toEqual({
      id: "7",
      name: "小明",
      number: 12,
      role: "S",
      personId: null,
    });
  });

  it("maps a player, carrying its personId through untouched", () => {
    // personId 是「跨場身分」的對應（#213），跟 id/matchId 一樣直接照抄，不用轉換。
    expect(
      serverPlayerToDomain({
        id: "7",
        matchId: 3,
        name: "小明",
        number: 12,
        role: "S",
        personId: 42,
      }),
    ).toMatchObject({ personId: 42 });
  });

  it("maps a match with roster, stringifying id and normalizing tournamentId", () => {
    const iso = new Date(2026, 5, 24, 15, 30).toISOString();
    const domain = serverMatchToDomain(
      {
        id: 3,
        name: null,
        date: iso,
        opponent: "台大",
        location: null,
        videoUrl: null,
        tournamentId: null,
        createdAt: iso,
        format: "best_of_3",
        // #218：完賽狀態原樣帶到 domain（DB notNull，不需要 ?? 兜底）。它決定計分頁/分析頁
        // 「最後一局算不算已結束局」，漏掉這個欄位的話整場的局比數就會少算一局。
        status: "finished",
      },
      [{ id: "7", matchId: 3, name: "小明", number: 12, role: "S", personId: null }],
    );
    expect(domain.id).toBe("3");
    expect(domain.opponent).toBe("台大");
    expect(domain.dateTime).toBe("2026-06-24T15:30");
    expect(domain.tournamentId).toBeNull();
    expect(domain.format).toBe("best_of_3");
    expect(domain.status).toBe("finished");
    expect(domain.players).toHaveLength(1);
    expect(domain.players[0].id).toBe("7");
  });
});

describe("diffRoster", () => {
  const existing: MatchPlayer[] = [
    { id: "1", name: "A", number: 1, role: "S", personId: null },
    { id: "2", name: "B", number: 2, role: "OH", personId: null },
  ];

  it("flags a player with no matching id as create", () => {
    const diff = diffRoster(existing, [
      ...existing,
      { name: "C", number: 3, role: "MB", personId: null }, // 沒 id（MatchFormDialog 新增列）→ 新增，不帶 id 欄位，交給 DB 生
    ]);
    expect(diff.toCreate).toEqual([{ name: "C", number: 3, role: "MB", personId: null }]);
    expect(diff.toUpdate).toEqual([]);
    expect(diff.toDelete).toEqual([]);
  });

  it("carries the client-minted id through to toCreate when a new player already has one", () => {
    // RosterEditDialog 會用 uuidv4() 幫新球員先鑄好 id（同一個 id 也被存進輪轉表站位），
    // 這個 id 對不到 existing，仍然是「新增」，但要把 id 一起送出去，讓後端沿用同一個 id，
    // 而不是自己另生一個——不然前端站位認得的 id 在後端就找不到對應的球員了。
    const diff = diffRoster(existing, [
      ...existing,
      { id: "new-uuid-123", name: "C", number: 3, role: "MB", personId: null },
    ]);
    expect(diff.toCreate).toEqual([
      { name: "C", number: 3, role: "MB", personId: null, id: "new-uuid-123" },
    ]);
    expect(diff.toUpdate).toEqual([]);
    expect(diff.toDelete).toEqual([]);
  });

  it("flags a changed existing player as update (playerId as uuid string)", () => {
    const diff = diffRoster(existing, [
      { id: "1", name: "A", number: 10, role: "S", personId: null }, // 背號改了
      { id: "2", name: "B", number: 2, role: "OH", personId: null }, // 沒變
    ]);
    expect(diff.toUpdate).toEqual([
      { playerId: "1", data: { name: "A", number: 10, role: "S", personId: null } },
    ]);
    expect(diff.toCreate).toEqual([]);
    expect(diff.toDelete).toEqual([]);
  });

  // #213 去重 UX 的核心路徑：使用者在名單裡按下「是同一人」，畫面上只有這一列的
  // personId 從 null 變成某個既有身分的 id，名字/背號/位置都沒動。這個案例漏掉的話，
  // diffRoster 會判斷成「沒有變化」而整支 update 消失——等於使用者按了等於沒按。
  it("flags a player whose personId changed from null to a value as update", () => {
    const diff = diffRoster(existing, [
      { id: "1", name: "A", number: 1, role: "S", personId: 42 }, // 只有 personId 變了
      { id: "2", name: "B", number: 2, role: "OH", personId: null },
    ]);
    expect(diff.toUpdate).toEqual([
      { playerId: "1", data: { name: "A", number: 1, role: "S", personId: 42 } },
    ]);
    expect(diff.toCreate).toEqual([]);
    expect(diff.toDelete).toEqual([]);
  });

  it("flags a removed player as delete", () => {
    const diff = diffRoster(existing, [
      { id: "1", name: "A", number: 1, role: "S", personId: null },
    ]);
    expect(diff.toDelete).toEqual(["2"]);
    expect(diff.toCreate).toEqual([]);
    expect(diff.toUpdate).toEqual([]);
  });

  it("no-ops when nothing changed", () => {
    const diff = diffRoster(existing, existing);
    expect(diff.toCreate).toEqual([]);
    expect(diff.toUpdate).toEqual([]);
    expect(diff.toDelete).toEqual([]);
  });
});
