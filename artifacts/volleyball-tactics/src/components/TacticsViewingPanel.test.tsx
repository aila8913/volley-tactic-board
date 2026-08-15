import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TacticsViewingPanel from "./TacticsViewingPanel";

// #408：唯讀態要有改名入口。這顆元件全部靠 props 決定、沒有 context 依賴，
// 所以直接 render 就好，不需要 renderWithProviders。
describe("TacticsViewingPanel 的改名入口（#408）", () => {
  it("按 ✏ 改名、打字後按 Enter：把新名字交出去", async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    render(
      <TacticsViewingPanel
        viewingTacticName="快攻一號"
        onBackToBrowse={() => {}}
        onRename={onRename}
      />,
    );

    await user.click(screen.getByTestId("button-rename-viewing-tactic"));
    const input = screen.getByTestId("input-rename-viewing-tactic");
    await user.clear(input);
    await user.type(input, "快攻二號{Enter}");

    expect(onRename).toHaveBeenCalledWith("快攻二號");
  });

  it("按 Escape 取消：不改名，回到唯讀顯示", async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    render(
      <TacticsViewingPanel
        viewingTacticName="快攻一號"
        onBackToBrowse={() => {}}
        onRename={onRename}
      />,
    );

    await user.click(screen.getByTestId("button-rename-viewing-tactic"));
    await user.type(screen.getByTestId("input-rename-viewing-tactic"), "亂打的{Escape}");

    expect(onRename).not.toHaveBeenCalled();
    expect(screen.queryByTestId("input-rename-viewing-tactic")).not.toBeInTheDocument();
    expect(screen.getByText("快攻一號")).toBeInTheDocument();
  });

  it("名字清成空白不會送出（避免存出一張沒有名字的戰術）", async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    render(
      <TacticsViewingPanel
        viewingTacticName="快攻一號"
        onBackToBrowse={() => {}}
        onRename={onRename}
      />,
    );

    await user.click(screen.getByTestId("button-rename-viewing-tactic"));
    const input = screen.getByTestId("input-rename-viewing-tactic");
    await user.clear(input);
    await user.type(input, "   {Enter}");

    expect(onRename).not.toHaveBeenCalled();
  });

  it("onRename 是 null（例如 JSON 匯入的唯讀照片）就不長出改名入口", () => {
    render(
      <TacticsViewingPanel
        viewingTacticName="匯入的戰術"
        onBackToBrowse={() => {}}
        onRename={null}
      />,
    );

    expect(screen.queryByTestId("button-rename-viewing-tactic")).not.toBeInTheDocument();
    // 名稱本身照常顯示，只是不能改。
    expect(screen.getByText("匯入的戰術")).toBeInTheDocument();
  });

  it("「返回列表」仍然正常（別把既有行為改壞）", async () => {
    const user = userEvent.setup();
    const onBackToBrowse = vi.fn();
    render(
      <TacticsViewingPanel
        viewingTacticName="快攻一號"
        onBackToBrowse={onBackToBrowse}
        onRename={() => {}}
      />,
    );

    await user.click(screen.getByTestId("button-back-to-browse"));
    expect(onBackToBrowse).toHaveBeenCalled();
  });
});
