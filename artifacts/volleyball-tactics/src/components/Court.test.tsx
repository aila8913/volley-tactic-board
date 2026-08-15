import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen } from "@testing-library/react";
import { Route } from "wouter";
import { renderWithProviders } from "@/test/renderWithProviders";
import { useRotationTable } from "../hooks/useRotationTable";
import { useTacticsBoard } from "../hooks/useTacticsBoard";
import type { MatchPlayer } from "../types/match";
import type { CourtSnapshot, SnapshotPlayer } from "../types/courtSnapshot";
import Court from "./Court";

// issue #328：中央球場的「輪轉畫法」退役之後，這個元件只剩一種畫法。這裡釘住的是那次
// 退役真正改變的**行為**（不是它的長相），三條各自擋一種很容易走回去的回歸：
//
//   1. 沒在編／沒在看戰術時，球場是空的——就算輪轉表裡有一份完整的先發。「順手把先發
//      畫上去當參照」正是被退役掉的那個畫面，而它當初也不是有人決定要做的，是被剩下來的。
//   2. 唯讀檢視畫的是快照裡凍住的人，不是現在名單上的人（ADR-0001 的反正規化）。
//   3. 把球員拖進球場不會寫回輪轉表——那條路徑（placePlayerOnCourt / setStartingLiberoId）
//      是戰術板僅存的兩支寫回動作，跟 ADR-0001「嚴格單向」牴觸，已隨這次退役刪掉。
//
// 為什麼用 testing-library 而不是 renderToStaticMarkup：這三條驗的是「store 是這個狀態時
// 畫面上有沒有這個人」，其中第三條還要真的派一個 drop 事件進去，屬於互動行為（見
// CLAUDE.md 的兩種寫法分工）。

const A = "match-A";

const player = (id: string, role: MatchPlayer["role"] = "OH"): MatchPlayer => ({
  id,
  name: id,
  number: 1,
  role,
  personId: null,
});

const snapPlayer = (id: string): SnapshotPlayer => ({
  sourcePlayerId: id,
  name: id,
  number: 7,
  role: "OH",
  x: 0.5,
  y: 0.5,
  isLibero: false,
});

const snapshot = (players: SnapshotPlayer[]): CourtSnapshot => ({
  source: "rotation",
  matchId: A,
  rotation: 0,
  capturedAt: new Date().toISOString(),
  players,
});

const rt = () => useRotationTable.getState();
const tb = () => useTacticsBoard.getState();

// Court 只活在 /matches/:id/board 底下（空板是 /board），matchId 從路由段來——要讓
// useParams 拿得到值，就得像正式 app 那樣把它包在對應的 <Route> 裡，不能裸 render。
const renderCourt = () =>
  renderWithProviders(
    <Route path="/matches/:id/board">
      <Court />
    </Route>,
    { initialPath: `/matches/${A}/board` },
  );

// 在輪轉表裡放一份「六個號位都站滿」的先發。這是三條測試共同的前置：如果球場還會偷偷
// 畫輪轉表的資料，這份資料就是它會畫出來的東西。
const seedFullLineup = () => {
  const roster = ["r1", "r2", "r3", "r4", "r5", "r6"].map((id) => player(id));
  rt().setRoster(A, roster);
  rt().setLineupZones(A, { 1: "r1", 2: "r2", 3: "r3", 4: "r4", 5: "r5", 6: "r6" });
};

beforeEach(() => {
  useRotationTable.setState({ dataByMatch: {}, circleLabel: "name" });
  useTacticsBoard.setState({
    session: null,
    viewingScene: null,
    viewingTacticId: null,
    viewingTacticName: "",
    selectedObjectId: null,
    activeTool: "select",
  });
});

describe("Court（issue #328：只剩戰術一種畫法）", () => {
  it("沒在編也沒在看戰術時，球場是空的——輪轉表的先發不會被畫上來", () => {
    seedFullLineup();
    renderCourt();

    // 球場本身照畫（外框/攻擊線/球網），只是上面沒有人。
    expect(document.getElementById("court-svg")).not.toBeNull();
    for (const id of ["r1", "r2", "r3", "r4", "r5", "r6"]) {
      expect(screen.queryByText(id)).toBeNull();
    }
  });

  it("唯讀檢視時畫的是快照裡凍住的人，不是現在名單上的人", () => {
    seedFullLineup();
    // 快照裡的「snap1」根本不在上面那份名單裡——畫得出來就證明沒有回 roster 查（ADR-0001）。
    tb().startSession(snapshot([snapPlayer("snap1")]));

    renderCourt();

    expect(screen.getByText("snap1")).toBeInTheDocument();
    expect(screen.queryByText("r1")).toBeNull();
  });

  it("沒有 session 時把球員拖進球場：輪轉表分片原封不動（不再有寫回路徑）", () => {
    seedFullLineup();
    const before = rt().dataByMatch[A].lineup;

    renderCourt();
    const svg = document.getElementById("court-svg")!;

    // jsdom 沒有實作 HTML5 drag-and-drop，這裡手刻一個最小的假 DataTransfer——只要
    // getData 回得出被拖的 playerId 就夠了（跟 PositionPalette.test.tsx 同一招）。
    const dataTransfer = { getData: vi.fn(() => "r1") };
    svg.dispatchEvent(
      Object.assign(new Event("drop", { bubbles: true }), {
        dataTransfer,
        clientX: 50,
        clientY: 50,
      }),
    );

    // 連參照都沒變＝這次 drop 完全沒有碰到輪轉表（退役前這裡會呼叫 placePlayerOnCourt，
    // 把 r1 吸附到最近的號位並重算六輪）。
    expect(rt().dataByMatch[A].lineup).toBe(before);
    expect(tb().session).toBeNull();
  });
});
