import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/renderWithProviders";
import { useTacticsBoard } from "./useTacticsBoard";
import { useTacticsBoardController } from "./useTacticsBoardController";
import type { CourtSnapshot, SnapshotPlayer } from "../types/courtSnapshot";

// #372 決策⑤：這支測試守的是「新建戰術要不要問歸屬」這條規則，不是後端 API 本身
// （那是 tactics.ts route 自己的測試範圍）。所以跟 MatchInfoRail.test.tsx／
// NavRail.test.tsx 一樣的做法——只換掉「跟後端互動」那一層（generated 的 mutation hook），
// store（useTacticsBoard）留著真的跑，因為我們要測的正是 store 的 session 狀態
// （有沒有 serverId）怎麼影響這支 controller 的行為。
//
// 用 importOriginal 而不是整包 mock "@workspace/api-client-react"：這個模組裡還有
// getListTacticsQueryKey 這種純函式，controller 內部真的會呼叫到（invalidateQueries 的
// queryKey），整包換掉會逼我們把它也一起兜出來，沒有必要。
const createMutate = vi.fn();
const updateMutate = vi.fn();
const deleteMutate = vi.fn();

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/api-client-react")>();
  return {
    ...actual,
    useListTactics: () => ({ data: [] }),
    useCreateTactic: () => ({ mutate: createMutate, isPending: false }),
    useUpdateTactic: () => ({ mutate: updateMutate, isPending: false }),
    useDeleteTactic: () => ({ mutate: deleteMutate, isPending: false }),
  };
});

const snapPlayer = (id: string): SnapshotPlayer => ({
  sourcePlayerId: id,
  name: id,
  number: 1,
  role: "OH",
  x: 0.5,
  y: 0.5,
  isLibero: false,
});

const snapshot = (matchId: string | null): CourtSnapshot => ({
  source: "rotation",
  matchId,
  rotation: 0,
  capturedAt: new Date().toISOString(),
  players: [snapPlayer("p1")],
});

// 測試用的小外殼：真的呼叫這支 hook，把 handleSave/handleSaveAs 掛成按鈕給 userEvent 點——
// 跟直接呼叫 hook 回傳值比，這樣才測得到「在一個真的 React tree 裡跑」的行為（hook 內部用了
// useToast/useQueryClient，都需要活在 React 元件裡）。
function Harness({ matchId }: { matchId: string | undefined }) {
  const controller = useTacticsBoardController(matchId);
  return (
    <div>
      <button onClick={controller.handleSave}>save</button>
      <button onClick={controller.handleSaveAs}>save-as</button>
    </div>
  );
}

beforeEach(() => {
  createMutate.mockClear();
  updateMutate.mockClear();
  deleteMutate.mockClear();
  // session/session 相關的 store 狀態是模組層級單例，測試之間要清乾淨（同一種考量見
  // MatchInfoRail.test.tsx 的 beforeEach 說明）。
  useTacticsBoard.setState({ session: null });
});

describe("useTacticsBoardController 的歸屬詢問（#372 決策⑤）", () => {
  it("新建 ＋ 目前有選比賽 ＋ confirm 按「確定」：送出 matchId 是那一場的整數 id", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    useTacticsBoard.getState().startSession(snapshot("7"), { arranging: false });

    renderWithProviders(<Harness matchId="7" />);
    await user.click(screen.getByText("save"));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ matchId: 7 }) }),
    );
    confirmSpy.mockRestore();
  });

  it("新建 ＋ 目前有選比賽 ＋ confirm 按「取消」：送出 matchId 是 null（存成全域）", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    useTacticsBoard.getState().startSession(snapshot("7"), { arranging: false });

    renderWithProviders(<Harness matchId="7" />);
    await user.click(screen.getByText("save"));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ matchId: null }) }),
    );
    confirmSpy.mockRestore();
  });

  it("新建 ＋ 目前沒有選比賽（空板）：不問，直接存成全域", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm");
    useTacticsBoard.getState().startSession(snapshot(null), { arranging: false });

    renderWithProviders(<Harness matchId={undefined} />);
    await user.click(screen.getByText("save"));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ matchId: null }) }),
    );
    confirmSpy.mockRestore();
  });

  it("另存新檔（handleSaveAs）：跟新建同一條規則，一樣會問歸屬", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    // 另存新檔的起點可以是已經有 serverId 的 session（複製一份），這裡刻意讓 session 帶
    // serverId，確認 handleSaveAs 走的是 createTactic（新建），不是 updateTactic（覆寫）。
    useTacticsBoard.getState().startSession(snapshot("9"), { serverId: "existing-id" });

    renderWithProviders(<Harness matchId="9" />);
    await user.click(screen.getByText("save-as"));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ matchId: 9 }) }),
    );
    expect(updateMutate).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("覆寫既有戰術（session 有 serverId，按「儲存」）：完全不問歸屬", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm");
    useTacticsBoard.getState().startSession(snapshot("7"), { serverId: "existing-id" });

    renderWithProviders(<Harness matchId="7" />);
    await user.click(screen.getByText("save"));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(updateMutate).toHaveBeenCalledWith(expect.objectContaining({ tacticId: "existing-id" }));
    expect(createMutate).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
