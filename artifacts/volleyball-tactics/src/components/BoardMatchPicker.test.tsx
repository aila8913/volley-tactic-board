import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/renderWithProviders";
import BoardMatchPicker from "./BoardMatchPicker";
import type { Match } from "@/types/match";

// 這顆元件是啞的 controlled component（見該檔案開頭的說明）：不自己打 API 決定「選了之後
// 要不要真的切過去」，這裡只換掉「比賽從哪來」這一層（跟 MatchInfoRail.test.tsx 同一種
// 考量——讓真的 React Query 去跑只會讓測試變成在驗 fetch 有沒有被 mock 對）。
//
// issue #433 重寫：原本是原生 <select>，測試靠 user.selectOptions／toHaveValue 這類
// <select> 專屬 API。改成自畫的按鈕＋選單之後，互動模型變成「點觸發鈕展開 → 點選項」，
// 這裡整份重寫成對應的 testing-library 寫法，行為保證（列出哪些選項、目前選中誰、
// 選了之後 onSelect 收到什麼）維持跟改版前一致。
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
  it("觸發鈕顯示 matchId 對應的對手名；matchId=null 顯示「未選比賽」", () => {
    renderWithProviders(<BoardMatchPicker matchId="2" onSelect={() => {}} />);
    expect(screen.getByTestId("board-match-picker-trigger")).toHaveTextContent("音駒");

    renderWithProviders(<BoardMatchPicker matchId={null} onSelect={() => {}} />);
    expect(screen.getAllByTestId("board-match-picker-trigger")[1]).toHaveTextContent("未選比賽");
  });

  it("展開選單：列出「未選比賽（空板）」＋每一場比賽，比賽項不帶「vs」前綴", async () => {
    const user = userEvent.setup();
    renderWithProviders(<BoardMatchPicker matchId={null} onSelect={() => {}} />);

    await user.click(screen.getByTestId("board-match-picker-trigger"));

    expect(screen.getByTestId("board-match-picker-option-blank")).toHaveTextContent(
      "未選比賽（空板）",
    );
    expect(screen.getByTestId("board-match-picker-option-1")).toHaveTextContent("青葉城西");
    expect(screen.getByTestId("board-match-picker-option-2")).toHaveTextContent("音駒");
  });

  it("選某一場：onSelect 收到那一場的 id，選單收合", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderWithProviders(<BoardMatchPicker matchId={null} onSelect={onSelect} />);

    await user.click(screen.getByTestId("board-match-picker-trigger"));
    await user.click(screen.getByTestId("board-match-picker-option-2"));

    expect(onSelect).toHaveBeenCalledWith("2");
    expect(screen.queryByTestId("board-match-picker-menu")).not.toBeInTheDocument();
  });

  it("選「未選比賽（空板）」：onSelect 收到 null，不是空字串", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderWithProviders(<BoardMatchPicker matchId="1" onSelect={onSelect} />);

    await user.click(screen.getByTestId("board-match-picker-trigger"));
    await user.click(screen.getByTestId("board-match-picker-option-blank"));

    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("再點一次觸發鈕：選單收合（不用 click-outside，同 TacticsExportMenu 的既有習慣）", async () => {
    const user = userEvent.setup();
    renderWithProviders(<BoardMatchPicker matchId={null} onSelect={() => {}} />);

    const trigger = screen.getByTestId("board-match-picker-trigger");
    await user.click(trigger);
    expect(screen.getByTestId("board-match-picker-menu")).toBeInTheDocument();

    await user.click(trigger);
    expect(screen.queryByTestId("board-match-picker-menu")).not.toBeInTheDocument();
  });
});
