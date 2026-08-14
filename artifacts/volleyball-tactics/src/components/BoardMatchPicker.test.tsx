import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/renderWithProviders";
import BoardMatchPicker from "./BoardMatchPicker";
import type { Match } from "@/types/match";

// 這顆元件是啞的 controlled component（見該檔案開頭的說明）：不自己打 API 決定「選了之後
// 要不要真的切過去」，這裡只換掉「比賽從哪來」這一層（跟 MatchInfoRail.test.tsx 同一種
// 考量：讓真的 React Query 去跑只會讓測試變成在驗 fetch 有沒有被 mock 對）。
const MATCHES: Match[] = [
  {
    id: "1",
    opponent: "青葉城西",
    dateTime: "2026-08-09T19:30",
    players: [],
    createdAt: "2026-08-01T00:00:00.000Z",
    tournamentId: null,
    teamId: null,
    format: "best_of_3",
    status: "in_progress",
  },
  {
    id: "2",
    opponent: "音駒",
    dateTime: "2026-08-10T10:00",
    players: [],
    createdAt: "2026-08-01T00:00:00.000Z",
    tournamentId: null,
    teamId: null,
    format: "best_of_3",
    status: "in_progress",
  },
];

vi.mock("@/hooks/useMatches", () => ({
  useMatchList: () => ({ matches: MATCHES, isLoading: false, isError: false }),
}));

describe("BoardMatchPicker", () => {
  it("列出「未選比賽（空板）」＋每一場比賽，選項標題跟比賽列表卡片同一種寫法", () => {
    renderWithProviders(<BoardMatchPicker matchId={null} onSelect={() => {}} />);

    const select = screen.getByTestId("board-match-picker");
    const options = Array.from(select.querySelectorAll("option")).map((o) => o.textContent);

    expect(options).toContain("未選比賽（空板）");
    expect(options.some((t) => t?.includes("vs 青葉城西"))).toBe(true);
    expect(options.some((t) => t?.includes("vs 音駒"))).toBe(true);
  });

  it("目前值 = matchId prop；matchId=null 時顯示空板那個選項", () => {
    renderWithProviders(<BoardMatchPicker matchId="2" onSelect={() => {}} />);
    expect(screen.getByTestId("board-match-picker")).toHaveValue("2");
  });

  it("選某一場：onSelect 收到那一場的 id", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderWithProviders(<BoardMatchPicker matchId={null} onSelect={onSelect} />);

    await user.selectOptions(screen.getByTestId("board-match-picker"), "2");

    expect(onSelect).toHaveBeenCalledWith("2");
  });

  it("選「未選比賽（空板）」：onSelect 收到 null，不是空字串", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderWithProviders(<BoardMatchPicker matchId="1" onSelect={onSelect} />);

    await user.selectOptions(screen.getByTestId("board-match-picker"), "未選比賽（空板）");

    expect(onSelect).toHaveBeenCalledWith(null);
  });
});
