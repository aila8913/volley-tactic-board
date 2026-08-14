import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fireEvent } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { useTacticsBoard } from "../hooks/useTacticsBoard";
import TacticsExportMenu from "./TacticsExportMenu";

// exportUtils 換掉——這支測試守的是「按鈕/下拉這一層 UI 有沒有接對動作」，不是
// html-to-image 真的畫得出 PNG 這種 exportUtils.ts 自己該測的事（見該檔案本身沒有測試、
// 但邏輯單純到不需要）。同一種「換掉跟外部世界互動那一層、store 留著真的跑」的做法見
// useTacticsBoardController.test.tsx 開頭的說明。
const exportCourtAsPng = vi.fn();
const exportStateAsJson = vi.fn();
const importStateFromJson = vi.fn();

vi.mock("../lib/exportUtils", () => ({
  exportCourtAsPng: (...args: unknown[]) => exportCourtAsPng(...args),
  exportStateAsJson: (...args: unknown[]) => exportStateAsJson(...args),
  importStateFromJson: (...args: unknown[]) => importStateFromJson(...args),
}));

beforeEach(() => {
  exportCourtAsPng.mockClear();
  exportStateAsJson.mockClear();
  importStateFromJson.mockClear();
  // session 是模組層級單例，測試之間要清乾淨（同一種考量見 useTacticsBoardController.test.tsx
  // 的 beforeEach 說明）。
  useTacticsBoard.setState({ session: null });
});

describe("TacticsExportMenu", () => {
  it("初始收合，按下切換鈕後展開三個動作＋隱藏的檔案輸入", async () => {
    renderWithProviders(<TacticsExportMenu matchId={null} />);

    expect(screen.queryByTestId("tactics-export-menu")).not.toBeInTheDocument();

    // 用 fireEvent 打開浮層：跟 NavRail.test.tsx 開頭那段 jsdom hover 坑的說明一致——
    // 這裡雖然是點擊不是 hover，但同一份 house style 仍是「開啟這一步用 fireEvent，
    // 真正要驗證的那一步才用 userEvent」，維持全篇一致的手法。
    fireEvent.click(screen.getByTestId("button-tactics-export-menu"));

    expect(screen.getByTestId("button-tactics-export-png")).toBeInTheDocument();
    expect(screen.getByTestId("button-tactics-export-json")).toBeInTheDocument();
    expect(screen.getByTestId("button-tactics-import-json")).toBeInTheDocument();
  });

  it("點「匯出 JSON」呼叫 exportStateAsJson，並收合浮層", async () => {
    const user = userEvent.setup();
    renderWithProviders(<TacticsExportMenu matchId={null} />);

    fireEvent.click(screen.getByTestId("button-tactics-export-menu"));
    await user.click(screen.getByTestId("button-tactics-export-json"));

    expect(exportStateAsJson).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("tactics-export-menu")).not.toBeInTheDocument();
  });

  it("沒有比賽（matchId=null）時「匯出 PNG」不帶輪次後綴，也不會因為 DOM 沒有 court-wrapper 而丟例外", async () => {
    const user = userEvent.setup();
    // jsdom 裡沒有真的球場 DOM（#court-wrapper），這裡刻意不另外掛一個假的——就是要驗證
    // 「這個元件本身」在這種情況下不會炸掉；exportCourtAsPng 找不到元素時該怎麼辦是
    // exportUtils.ts 自己的責任（已經在被 mock 掉，這裡只驗證呼叫沒有拋出）。
    renderWithProviders(<TacticsExportMenu matchId={null} />);

    fireEvent.click(screen.getByTestId("button-tactics-export-menu"));
    await expect(
      user.click(screen.getByTestId("button-tactics-export-png")),
    ).resolves.not.toThrow();

    expect(exportCourtAsPng).toHaveBeenCalledTimes(1);
    const [, fileName] = exportCourtAsPng.mock.calls[0] as [string, string];
    expect(fileName).not.toMatch(/輪次/);
  });
});
