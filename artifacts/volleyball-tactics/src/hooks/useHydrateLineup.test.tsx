import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderWithProviders } from "@/test/renderWithProviders";
import { useHydrateLineup } from "./useHydrateLineup";
import { useRotationTable } from "./useRotationTable";
import type { Lineup } from "@workspace/api-client-react";

// issue #431 守的那條線：**戰術板的六宮格對已開賽／打完的比賽不能是空的。**
//
// 這裡驗的是「接線」而不是「規則」——規則（不覆蓋、只填空）在 useRotationTable.test.ts 直接
// 測 store，這支問的是另一半：後端回來的那一列，真的有被翻譯成 store 認得的形狀、真的有被
// 寫進去嗎。#431 這個 bug 的形狀正是「兩邊各自都對，中間沒有人接」——資料在後端好好躺著，
// store 有位置可以放，只是從來沒有人把它搬過去。
//
// mock 的邊界跟 useMatches.test.tsx 一致：只換掉真的會打後端的那支 generated query hook，
// 其餘（apiLineupToSnapshot 的欄位對應、store 的寫入規則）留著真的跑。
const lineupsQueryMock = vi.fn();

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/api-client-react")>();
  return {
    ...actual,
    useListMatchLineups: (...args: unknown[]) => lineupsQueryMock(...args),
  };
});

// 後端 lineups 的一列（一局一列）。這裡只給這支 hook 會讀到的欄位。
const lineupRow = (setId: string, zone1: string, startingLiberoId: string | null = null) =>
  ({
    id: 1,
    setId,
    zone1PlayerId: zone1,
    zone2PlayerId: "p2",
    zone3PlayerId: "p3",
    zone4PlayerId: "p4",
    zone5PlayerId: "p5",
    zone6PlayerId: "p6",
    startingLiberoId,
    liberoReplacesPlayerId: null,
  }) as Lineup;

function Harness({ matchId }: { matchId: string | null }) {
  useHydrateLineup(matchId);
  return <div>ok</div>;
}

beforeEach(() => {
  useRotationTable.setState({ dataByMatch: {}, circleLabel: "name" });
  lineupsQueryMock.mockReset();
});

describe("useHydrateLineup（issue #431）", () => {
  it("把後端最新一局的先發寫進這一場的分片", async () => {
    lineupsQueryMock.mockReturnValue({
      // 後端已依 setId 排序（＝局數順序），所以最後一列是最新一局——這條同時釘住「取最新
      // 不是取第一局」：教練在戰術板要看的是這場最後站成什麼樣，不是三局前的開局陣容。
      data: [lineupRow("set-1", "first"), lineupRow("set-2", "latest", "l1")],
    });

    renderWithProviders(<Harness matchId="7" />);

    await vi.waitFor(() => {
      expect(useRotationTable.getState().dataByMatch["7"]?.lineup[1]).toBe("latest");
    });
    expect(useRotationTable.getState().dataByMatch["7"]?.startingLiberoId).toBe("l1");
  });

  it("這一場後端還沒有任何先發（例如還沒開賽）時，什麼都不寫", async () => {
    lineupsQueryMock.mockReturnValue({ data: [] });

    renderWithProviders(<Harness matchId="7" />);

    // 分片根本不該被建立出來：hydrate 是「補資料」，不是「幫每一場都開一個空殼」。
    await vi.waitFor(() => expect(lineupsQueryMock).toHaveBeenCalled());
    expect(useRotationTable.getState().dataByMatch["7"]).toBeUndefined();
  });

  it("空板（沒有比賽）時不發查詢也不寫任何分片", async () => {
    lineupsQueryMock.mockReturnValue({ data: undefined });

    renderWithProviders(<Harness matchId={null} />);

    // hook 還是會被呼叫（React hooks 規則：不能有條件地少呼叫一支 hook），但要帶著
    // enabled: false 進去——查詢本身不該發出去。/board 沒有比賽可查，Number(null) 送去打
    // /matches/0/lineups 只會換來一個 404 跟一個沒有意義的快取 key。
    await vi.waitFor(() => expect(lineupsQueryMock).toHaveBeenCalled());
    const options = lineupsQueryMock.mock.calls[0][1] as { query: { enabled: boolean } };
    expect(options.query.enabled).toBe(false);
    expect(useRotationTable.getState().dataByMatch).toEqual({});
  });
});
