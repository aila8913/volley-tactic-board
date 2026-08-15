import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/renderWithProviders";
import RosterEditDialog from "./RosterEditDialog";
import type { MatchPlayer } from "@/types/match";

// #222 的另一半：戰術板這條路徑原本**完全沒有**去重 UX——打了一個跟既有身分同名的球員，
// 畫面上不會有任何反應，存下去就是一筆對不到人的新資料。這支測的是「提示有沒有出現、
// 按下去有沒有真的把 personId 寫進要存的名單」。
//
// 寫入層那半（沒對應到的列會自動建一個新 person）在 hooks/useMatches.test.tsx，
// 兩支合起來才是完整的一條路。
vi.mock("@/hooks/usePeople", () => ({
  usePersonList: () => ({
    people: [{ id: 7, name: "小美", matchCount: 3, teamNames: [] }],
    isLoading: false,
    isError: false,
  }),
}));

const roster: MatchPlayer[] = [{ id: "1", name: "阿明", number: 1, role: "S", personId: null }];

describe("RosterEditDialog 的名單去重 UX（#222）", () => {
  it("打了跟既有身分同名的名字：冒出「是同一人」，按下去存檔會帶著那個 personId", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    renderWithProviders(
      <RosterEditDialog open onOpenChange={() => {}} roster={roster} onSave={onSave} />,
    );

    // 把第一列的名字改成既有身分的名字。
    const nameInput = screen.getByDisplayValue("阿明");
    await user.clear(nameInput);
    await user.type(nameInput, "小美");

    // 絕不自動綁定——要使用者親自按（#213 的判準：猜錯人會把兩個人的生涯數據混在一起）。
    const link = await screen.findByRole("button", { name: "是同一人" });
    await user.click(link);
    expect(await screen.findByText("已對應：小美")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "儲存" }));

    await vi.waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toEqual([
      { id: "1", name: "小美", number: 1, role: "S", personId: 7 },
    ]);
  });

  it("名字對不到任何既有身分：不顯示提示（不打擾正常的打字）", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <RosterEditDialog open onOpenChange={() => {}} roster={roster} onSave={() => {}} />,
    );

    const nameInput = screen.getByDisplayValue("阿明");
    await user.clear(nameInput);
    await user.type(nameInput, "沒登錄過的人");

    expect(screen.queryByRole("button", { name: "是同一人" })).not.toBeInTheDocument();
  });

  it("已經對應好的列可以解除對應（✕）", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    renderWithProviders(
      <RosterEditDialog
        open
        onOpenChange={() => {}}
        roster={[{ id: "1", name: "小美", number: 1, role: "S", personId: 7 }]}
        onSave={onSave}
      />,
    );

    expect(screen.getByText("已對應：小美")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "解除對應" }));

    // 解除之後回到「同名建議」那一態：名字沒變，所以建議 chip 會再出現。
    expect(await screen.findByRole("button", { name: "是同一人" })).toBeInTheDocument();
  });
});
