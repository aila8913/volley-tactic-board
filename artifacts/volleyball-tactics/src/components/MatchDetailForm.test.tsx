import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/renderWithProviders";
import MatchDetailForm from "./MatchDetailForm";

// #401 的回歸測試：在球員名單裡按 Enter 不可以把整場比賽送出去。
//
// 為什麼要 mock 這一整排 hook：這支表單自己會打七、八個 API（建比賽、建球隊、建身分、
// 撈既有球隊/身分/建議名單…）。讓真的 React Query 去跑，測試就會變成在驗「fetch 有沒有
// 被 mock 對」，而不是在驗表單的鍵盤行為——跟 BoardMatchPicker.test.tsx 同一個考量。
const createMatch = vi.fn(() => Promise.resolve(1));
const updateMatch = vi.fn(() => Promise.resolve());

vi.mock("@/hooks/useMatches", () => ({
  useCreateMatch: () => createMatch,
  useUpdateMatch: () => updateMatch,
}));

vi.mock("@/hooks/useTeams", () => ({
  useTeamList: () => ({ teams: [] }),
  useCreateTeam: () => vi.fn(),
  useTeamRosterSuggestions: () => ({ suggestions: [] }),
}));

vi.mock("@/hooks/usePeople", () => ({
  usePersonList: () => ({ people: [] }),
  useCreatePerson: () => vi.fn(() => Promise.resolve(1)),
}));

function renderForm() {
  const onCreated = vi.fn();
  renderWithProviders(
    <MatchDetailForm
      match={null}
      tournamentId={null}
      onCancel={() => {}}
      onSaved={() => {}}
      onCreated={onCreated}
      onDirtyChange={() => {}}
    />,
  );
  return { onCreated };
}

describe("MatchDetailForm 的 Enter 鍵行為（#401）", () => {
  it("在球員姓名欄按 Enter 不送出表單（原本會觸發 implicit submission）", async () => {
    const user = userEvent.setup();
    renderForm();

    // 照 #401 的重現步驟：日期故意不填，讓驗證一定不會過。
    await user.type(screen.getByPlaceholderText("對手隊名"), "青葉城西");

    const name = screen.getAllByPlaceholderText("球員姓名")[0];
    await user.click(name);
    await user.keyboard("日向翔陽{Enter}");

    // 「有沒有送出」不能用 createMatch 有沒有被呼叫來驗——日期是空的，驗證本來就過不了，
    // 就算真的送出了 createMatch 也不會被呼叫，這個斷言在修好前後都會通過（第一版就是這樣寫的，
    // 三個測試全綠但什麼都沒測到）。真正看得出「送出被觸發了」的訊號是**驗證錯誤訊息冒出來**：
    // handleSubmit 一跑就會把 errors 寫進 formState，畫面上就會出現這一行。
    expect(screen.queryByText("請選擇比賽日期時間")).not.toBeInTheDocument();
    expect(createMatch).not.toHaveBeenCalled();
  });

  it("在背號欄按 Enter 也不送出", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByPlaceholderText("對手隊名"), "音駒");
    await user.click(screen.getAllByPlaceholderText("背號")[0]);
    await user.keyboard("{Enter}");

    expect(screen.queryByText("請選擇比賽日期時間")).not.toBeInTheDocument();
    expect(createMatch).not.toHaveBeenCalled();
  });

  it("「儲存」鈕仍然送得出去（別把整張表單擋成送不出）", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByPlaceholderText("對手隊名"), "烏野");
    // datetime-local 的值要一次填完整，type() 逐字打在 jsdom 裡填不進去。
    const date = document.querySelector<HTMLInputElement>('input[type="datetime-local"]')!;
    await user.clear(date);
    await user.type(date, "2026-08-15T19:30");
    await user.type(screen.getAllByPlaceholderText("球員姓名")[0], "日向翔陽");

    await user.click(screen.getByRole("button", { name: "儲存" }));

    // 驗證要跑完才會呼叫，所以用 findBy* 等一輪 microtask。
    await vi.waitFor(() => expect(createMatch).toHaveBeenCalledTimes(1));
  });
});
