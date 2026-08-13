import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/renderWithProviders";
import { useScoreSheet } from "@/hooks/useScoreSheet";
import { useRotationTable } from "@/hooks/useRotationTable";
import MatchInfoRail from "./MatchInfoRail";
import type { Match } from "@/types/match";
import { lineupFromZones } from "@/types/scoresheet";
import type { CompletedSet, ScoreSheetState, SetRecordingState } from "@/types/scoresheet";

// issue #168：這支測試補的是 #352 收尾時明講「還測不到」的那一塊。
//
// 脈絡值得寫下來，因為它是這個 repo 少數「同一個 bug 修了兩次」的案例：#349 回報「已完賽的
// 比賽，局數選擇器預設停在一個不存在的第 4 局」。當時「有幾局可以滑」這段算式在兩顆元件裡
// 各有一份手寫拷貝，PR #350 只改了 AnalyticsRotationRail 那一份，比賽列表右欄（就是這個
// 元件）照樣壞著，要到 PR #351 才補完。#352 把規則收進 lib/volleyballRules.visibleSetCount()
// 並補了 4 條純函式測試——但當時就寫明：**「規則算得對」跟「這顆元件真的有呼叫它」是兩件事**，
// 而後者需要能 render 這顆元件（它掛著兩顆 zustand store ＋ 一整排 React Query hook），
// 在只有 renderToStaticMarkup 的年代寫不出來。
//
// 所以下面驗的不是算式（那已經在 volleyballRules.test.ts 釘死了），而是**接線**：
// 這顆元件在四種局況下，畫面上真的排出了正確的格數、停在正確的那一格。

const MATCH: Match = {
  id: "1",
  opponent: "青葉城西",
  dateTime: "2026-08-09T19:30",
  players: [
    { id: "p1", name: "日向翔陽", number: 10, role: "MB", personId: null },
    { id: "p2", name: "影山飛雄", number: 9, role: "S", personId: null },
  ],
  createdAt: "2026-08-01T00:00:00.000Z",
  tournamentId: null,
  teamId: 7,
  // 三戰兩勝：贏兩局就完賽。用 best_of_3 是為了讓「完賽」這件事只要兩局就成立，
  // fixture 不用鋪四局才進得到要測的那個分支。
  format: "best_of_3",
  status: "in_progress",
};

// 只換掉「資料從哪來」這一層。這個元件本身不打 API——它把 hook 拿到的東西轉成畫面，
// 而我們要測的正是那個轉換。讓真的 React Query 去跑（然後全部 loading/失敗）只會讓測試
// 變成在驗 fetch 有沒有被 mock 對，跟這裡要守的規則無關。
vi.mock("@/hooks/useMatches", () => ({
  useMatchList: () => ({ matches: [], isLoading: false, isError: false }),
  useMatchWithRoster: () => ({ match: MATCH }),
}));
vi.mock("@/hooks/useTeams", () => ({ useTeamList: () => ({ teams: [] }) }));
vi.mock("@/hooks/useTournaments", () => ({ useTournamentList: () => ({ tournaments: [] }) }));

// useScoreSheet 這個 store 本體要留著真的（下面直接往裡面塞資料），只有 controller 要換掉：
// 它的職責是「進頁時去後端把 sets/rallies 重建進 store」，在測試裡那等於一串我們既不需要
// 也不想要的網路請求——而且它會把我們剛塞好的 fixture 覆寫掉。
vi.mock("@/hooks/useScoreSheet", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useScoreSheet")>();
  return { ...actual, useScoreSheetController: () => ({ isHydrating: false }) };
});

function completedSet(setNumber: number, ourScore: number, opponentScore: number): CompletedSet {
  return {
    setNumber,
    ourScore,
    opponentScore,
    history: [],
    lineup: lineupFromZones({ 1: "p1", 4: "p2" }),
  };
}

// 「目前這一局」。serving 是不是 null 就是 hasCurrentSetData 的判準（#351 修正的那個判準：
// 判的是「這一格裡到底有沒有東西」，不是「比賽完賽了沒」）。
function currentSet(setNumber: number, serving: "us" | null, score = 0): SetRecordingState {
  return {
    setNumber,
    ourScore: score,
    opponentScore: 0,
    serving,
    ourRotation: 0,
    opponentRotation: 0,
    history: [],
  };
}

function seedRecording(state: Partial<ScoreSheetState>) {
  const record: ScoreSheetState = {
    currentSet: currentSet(1, null),
    completedSets: [],
    lineup: null,
    liberoSubstitution: null,
    regularSubs: [],
    subCount: 0,
    subCountsHistory: [],
    timeouts: [],
    timeoutCountsHistory: [],
    ...state,
  };
  useScoreSheet.setState({ recordingsByMatch: { "1": record } });
}

const NOOP_PROPS = {
  selected: { kind: "match", id: "1" } as const,
  editing: false,
  onCancelEdit: () => {},
  onSaved: () => {},
  onCreated: () => {},
  onDirtyChange: () => {},
};

beforeEach(() => {
  // 兩顆 store 都是模組層級單例，測試之間會互相污染（見 NavRail.test.tsx 同一段說明）。
  useScoreSheet.setState({ recordingsByMatch: {} });
  useRotationTable.setState({ dataByMatch: {} });
});

describe("MatchInfoRail 的局軸格數（#352 的接線，#349／#351 的回歸測試）", () => {
  it("⚠️ 已完賽、當前局沒資料：不多開一格，預設停在最後一局", () => {
    // 2:0 完賽（best_of_3），而且沒有人在第 3 局記過任何一分。
    seedRecording({
      completedSets: [completedSet(1, 25, 20), completedSet(2, 25, 22)],
      currentSet: currentSet(3, null),
    });

    renderWithProviders(<MatchInfoRail {...NOOP_PROPS} />);

    // 這就是 #349 的症狀：舊算式無條件 +1，於是排出三格、還預設停在那個永遠空白的第 3 局。
    expect(screen.getByText(/第 2 局/)).toBeInTheDocument();
    expect(screen.queryByText(/第 3 局/)).not.toBeInTheDocument();
    // 停在最後一格，所以「下一局」按不動。
    expect(screen.getByRole("button", { name: "下一局" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "上一局" })).toBeEnabled();
  });

  it("⚠️ 已完賽但當前局真的記過分：那一格要留著（#351 修正的判準）", () => {
    // 三戰兩勝已經 2:0，教練仍按了「下一局」並繼續記分——那一局有真實資料，
    // 不能因為「判定完賽」就讓它滑不到。
    seedRecording({
      completedSets: [completedSet(1, 25, 20), completedSet(2, 25, 22)],
      currentSet: currentSet(3, "us", 7),
      lineup: lineupFromZones({ 1: "p1", 4: "p2" }),
    });

    renderWithProviders(<MatchInfoRail {...NOOP_PROPS} />);

    expect(screen.getByText(/第 3 局/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "下一局" })).toBeDisabled();
  });

  it("未完賽：一定多留「目前這一局」那一格", () => {
    seedRecording({
      completedSets: [completedSet(1, 25, 20)],
      currentSet: currentSet(2, null),
    });

    renderWithProviders(<MatchInfoRail {...NOOP_PROPS} />);

    // 第 2 局還沒開賽（serving 是 null），但那一格一定要在——它正是教練排下一局先發的地方。
    expect(screen.getByText(/第 2 局/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "上一局" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "下一局" })).toBeDisabled();
  });

  it("完賽卻一局都沒有（資料異常）：保底留一格，不會算出不存在的索引", () => {
    // completedSets 空、currentSet 也沒資料。舊寫法在別的分支會算出 totalSets - 1 = -1
    // 這種不存在的索引，clamp 之後畫面整個空掉。
    seedRecording({ completedSets: [], currentSet: currentSet(1, null) });

    renderWithProviders(<MatchInfoRail {...NOOP_PROPS} />);

    expect(screen.getByText(/第 1 局/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "上一局" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "下一局" })).toBeDisabled();
  });
});

describe("MatchInfoRail 局軸的唯讀／可編輯分支（#329 的紅線）", () => {
  it("滑到已打完的局：讀那一局封存的快照，而且改不動", async () => {
    const user = userEvent.setup();
    seedRecording({
      completedSets: [completedSet(1, 25, 20)],
      currentSet: currentSet(2, null),
    });

    renderWithProviders(<MatchInfoRail {...NOOP_PROPS} />);

    // 預設停在第 2 局（還沒開賽，可編輯）——先確認這一格確實是可編輯的。
    expect(screen.getByTestId("rotation-zone-1").tagName).toBe("BUTTON");

    await user.click(screen.getByRole("button", { name: "上一局" }));

    // 滑回第 1 局：那一局早就打完了，站位是歷史，改了也不會讓比賽重來。
    expect(screen.getByText(/第 1 局/)).toBeInTheDocument();
    expect(screen.getByTestId("rotation-zone-1").tagName).toBe("DIV");
    // 那一局的比分要跟著顯示（讀的是封存快照，不是現在的站位）。
    expect(screen.getByText("25")).toBeInTheDocument();
  });

  it("目前這局已開賽（局中凍結）：站位唯讀，要調整只能走換人", () => {
    seedRecording({
      completedSets: [],
      currentSet: currentSet(1, "us", 12),
      lineup: lineupFromZones({ 1: "p1", 4: "p2" }),
    });

    renderWithProviders(<MatchInfoRail {...NOOP_PROPS} />);

    expect(screen.getByTestId("rotation-zone-1").tagName).toBe("DIV");
  });

  it("各局比分藥丸只在有已完成局時出現", () => {
    seedRecording({ completedSets: [], currentSet: currentSet(1, null) });
    const { rerender } = renderWithProviders(<MatchInfoRail {...NOOP_PROPS} />);
    expect(screen.queryByTestId("set-score-pills")).not.toBeInTheDocument();

    seedRecording({
      completedSets: [completedSet(1, 25, 20)],
      currentSet: currentSet(2, null),
    });
    rerender(<MatchInfoRail {...NOOP_PROPS} />);
    expect(screen.getByTestId("set-score-pills")).toBeInTheDocument();
  });
});

describe("MatchInfoRail 的空狀態", () => {
  it("還沒選任何東西時不自動選第一場（#174 明文決策）", () => {
    renderWithProviders(<MatchInfoRail {...NOOP_PROPS} selected={null} />);

    expect(screen.getByText("選一場比賽")).toBeInTheDocument();
    // 沒有任何站位面板——「使用者還沒表達意圖前，不該把某場比賽的站位放進可編輯狀態」。
    expect(screen.queryByTestId("rotation-rail-panel")).not.toBeInTheDocument();
  });
});
