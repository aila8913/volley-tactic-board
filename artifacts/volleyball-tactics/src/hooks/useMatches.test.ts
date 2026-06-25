import { describe, it, expect, beforeEach } from "vitest";
import { useMatches } from "./useMatches";
import { MatchFormValues } from "../types/match";

const formValues: MatchFormValues = {
  opponent: "台大",
  dateTime: "2026-06-25T19:00",
  players: [{ name: "小明", number: 7, role: "S" }],
};

// zustand store 是 module 層級的單例，測試之間如果不重置，前一個測試加的資料會留到下一個測試裡，
// 所以每次都要把 matches 清空，也清掉 localStorage（persist middleware 會把資料寫進去）。
beforeEach(() => {
  // 不能傳第二個參數 true（replace）——那會把整個 state 物件換掉，
  // 連 addMatch/updateMatch/deleteMatch 這些 action 函式都一起消失。
  // 不傳就是預設的合併模式，只覆蓋 matches 這個欄位。
  useMatches.setState({ matches: [] });
  localStorage.clear();
});

describe("useMatches", () => {
  it("addMatch 在 tournamentId 是 null 時，建立一場最上層的比賽", () => {
    const id = useMatches.getState().addMatch(formValues, null);
    const match = useMatches.getState().matches.find((m) => m.id === id);
    expect(match).toBeDefined();
    expect(match?.tournamentId).toBeNull();
    expect(match?.opponent).toBe("台大");
  });

  it("addMatch 有傳 tournamentId 時，比賽會記住自己屬於哪個資料夾", () => {
    const id = useMatches.getState().addMatch(formValues, "tournament-1");
    const match = useMatches.getState().matches.find((m) => m.id === id);
    expect(match?.tournamentId).toBe("tournament-1");
  });

  it("updateMatch 保留既有球員的 id，新球員列才補新的 id", () => {
    const id = useMatches.getState().addMatch(formValues, null);
    const existingPlayerId = useMatches.getState().matches[0].players[0].id;

    useMatches.getState().updateMatch(id, {
      ...formValues,
      players: [
        { id: existingPlayerId, name: "小明", number: 7, role: "S" },
        { name: "小華", number: 8, role: "OH" },
      ],
    });

    const updated = useMatches.getState().matches.find((m) => m.id === id);
    expect(updated?.players[0].id).toBe(existingPlayerId);
    expect(updated?.players[1].id).toBeDefined();
    expect(updated?.players[1].id).not.toBe(existingPlayerId);
  });

  it("deleteMatch 只刪掉指定的那一場比賽", () => {
    const idToDelete = useMatches.getState().addMatch(formValues, null);
    const idToKeep = useMatches.getState().addMatch(formValues, null);

    useMatches.getState().deleteMatch(idToDelete);

    const remainingIds = useMatches.getState().matches.map((m) => m.id);
    expect(remainingIds).toEqual([idToKeep]);
  });
});
