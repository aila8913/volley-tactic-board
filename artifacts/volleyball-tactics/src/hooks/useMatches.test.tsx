import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/renderWithProviders";
import { useSaveRoster } from "./useMatches";
import type { MatchPlayer } from "../types/match";

// #222 守的那條線：**不管從哪個表單存名單，寫進後端的每一列都要指向一個 person。**
//
// 為什麼要測到這一層、而不是只測 lib/matchMapping.ts 的 resolveRosterPersonIds：那支純函式
// 驗的是「規則長什麼樣」，這支驗的是「規則真的被接在寫入路徑上」。#222 的 bug 正是後者——
// 規則早就存在（寫在 MatchDetailForm 的送出流程裡），只是戰術板那條路徑沒有經過它。
// 規則對、接線漏，畫面上看起來一模一樣，只有資料庫裡少一塊。
//
// mock 的邊界跟 useTacticsBoardController.test.tsx 一致：只換掉「真的打後端」的 generated
// mutation hook，其餘（useCallback 的組裝、invalidate 用的 queryKey 純函式）留著真的跑。
const createPlayerMock = vi.fn(async () => ({}));
const updatePlayerMock = vi.fn(async () => ({}));
const deletePlayerMock = vi.fn(async () => ({}));
const createPersonMock = vi.fn(async () => ({ id: 77 }));

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/api-client-react")>();
  return {
    ...actual,
    useCreatePlayer: () => ({ mutateAsync: createPlayerMock }),
    useUpdatePlayer: () => ({ mutateAsync: updatePlayerMock }),
    useDeletePlayer: () => ({ mutateAsync: deletePlayerMock }),
    useCreatePerson: () => ({ mutateAsync: createPersonMock }),
  };
});

// 這串 hook 只能在 React tree 裡跑（內部用了 useQueryClient），所以包一顆按鈕當觸發點，
// 用 userEvent 點它——跟直接呼叫 hook 回傳值比，這樣測到的才是實際使用的樣子。
function Harness({ existing, next }: { existing: MatchPlayer[]; next: MatchPlayer[] }) {
  const saveRoster = useSaveRoster();
  return <button onClick={() => void saveRoster(1, existing, next)}>save</button>;
}

beforeEach(() => {
  createPlayerMock.mockClear();
  updatePlayerMock.mockClear();
  deletePlayerMock.mockClear();
  createPersonMock.mockClear();
});

describe("useSaveRoster 的身分解析（#222）", () => {
  it("新加的球員沒有 personId：先建一個 person，送出去的那一列帶著它的 id", async () => {
    const user = userEvent.setup();
    const existing: MatchPlayer[] = [{ id: "1", name: "阿明", number: 1, role: "S", personId: 42 }];
    const next: MatchPlayer[] = [
      ...existing,
      // 戰術板的「編輯球員名單」彈窗新增的列長這樣：前端先鑄一個 uuid，personId 是 null。
      { id: "new-uuid", name: "小美", number: 2, role: "OH", personId: null },
    ];

    renderWithProviders(<Harness existing={existing} next={next} />);
    await user.click(screen.getByText("save"));

    await vi.waitFor(() => expect(createPlayerMock).toHaveBeenCalledTimes(1));
    expect(createPersonMock).toHaveBeenCalledWith({ data: { name: "小美" } });
    // 這一行就是 #222：修好之前這裡是 null，那位球員在 /analytics/people 的跨場統計裡
    // 等於不存在，而且沒有任何提示。
    expect(createPlayerMock).toHaveBeenCalledWith({
      matchId: 1,
      data: { name: "小美", number: 2, role: "OH", personId: 77, id: "new-uuid" },
    });
  });

  it("已經對應好身分的列不會被多建一個 person，也不會被當成有變動", async () => {
    const user = userEvent.setup();
    const existing: MatchPlayer[] = [{ id: "1", name: "阿明", number: 1, role: "S", personId: 42 }];

    renderWithProviders(<Harness existing={existing} next={existing} />);
    await user.click(screen.getByText("save"));

    // 沒有任何寫入請求該發出去——「開了彈窗、什麼都沒改、按儲存」不該產生副作用。
    // 這條也擋住一種很容易寫出來的錯：對每一列都無條件 createPerson，那樣每存一次名單
    // 就會多長出一批重複的身分。
    await vi.waitFor(() => expect(createPersonMock).not.toHaveBeenCalled());
    expect(createPlayerMock).not.toHaveBeenCalled();
    expect(updatePlayerMock).not.toHaveBeenCalled();
    expect(deletePlayerMock).not.toHaveBeenCalled();
  });
});
