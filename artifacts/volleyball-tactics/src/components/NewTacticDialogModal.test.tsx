import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useTacticsBoard } from "../hooks/useTacticsBoard";
import NewTacticDialogModal from "./NewTacticDialogModal";
import type { CourtSnapshot } from "../types/courtSnapshot";

// issue #168：這支檔案是那個 issue 舉的「靜態序列化的死角」本身。
//
// 改寫前這裡只測得到 open=false：這個元件是 shadcn 包 Radix 的 Dialog，open=true 時內容
// 透過 ReactDOM Portal 掛到 document.body 底下，而 renderToStaticMarkup 是純字串序列化、
// 根本沒有「真實 DOM」可以掛（React 官方也明講 server renderer 不支援 portal）。於是
// captureLabel 有沒有顯示、captureDisabled 有沒有真的讓按鈕按不動、按下起點會不會開 session
// ——這個元件所有實際有意義的行為，一條都測不到。
//
// 有了 @testing-library/react 之後，這些全部只是「查 document」而已：screen 查的就是整個
// document，portal 掛在哪一層對它沒有差別。

const STUB_SNAPSHOT: CourtSnapshot = {
  source: "blank",
  matchId: "1",
  rotation: 0,
  capturedAt: "2026-01-01T00:00:00.000Z",
  players: [],
};

// zustand 是模組層級單例，測試之間會互相污染（同 NavRail.test.tsx 的說明）。
const PRISTINE_STATE = useTacticsBoard.getState();
beforeEach(() => {
  useTacticsBoard.setState(PRISTINE_STATE, true);
});

function renderModal(
  props: Partial<{
    onOpenChange: (open: boolean) => void;
    onStarted: () => void;
    captureCurrent: () => CourtSnapshot;
    captureDisabled: boolean;
  }> = {},
) {
  return render(
    <NewTacticDialogModal
      open
      onOpenChange={props.onOpenChange ?? (() => {})}
      onStarted={props.onStarted}
      matchId="1"
      captureCurrent={props.captureCurrent ?? (() => STUB_SNAPSHOT)}
      captureLabel="測試用擷取說明"
      captureDisabled={props.captureDisabled}
    />,
  );
}

describe("NewTacticDialogModal 關著的時候", () => {
  it("內容完全不存在，captureLabel 也不會提早洩漏到畫面上", () => {
    render(
      <NewTacticDialogModal
        open={false}
        onOpenChange={() => {}}
        matchId="1"
        captureCurrent={() => STUB_SNAPSHOT}
        captureLabel="測試用擷取說明"
      />,
    );

    expect(screen.queryByText("測試用擷取說明")).not.toBeInTheDocument();
    expect(screen.queryByTestId("button-new-tactic-blank")).not.toBeInTheDocument();
  });
});

describe("NewTacticDialogModal 打開的時候（以前完全測不到的那一半）", () => {
  it("兩個起點跟說明文字都畫得出來", () => {
    renderModal();

    expect(screen.getByTestId("button-new-tactic-from-rotation")).toBeInTheDocument();
    expect(screen.getByTestId("button-new-tactic-blank")).toBeInTheDocument();
    // 說明文字是呼叫端注入的（戰術頁說「將複製第 N 輪」、計分頁說「擷取目前計分站位」）
    // ——這一格是使用者唯一能確認「我等下擷到的是哪一份站位」的線索。
    expect(screen.getByText("測試用擷取說明")).toBeInTheDocument();
  });

  it("渲染當下不會呼叫 captureCurrent——擷取是使用者按下去那一刻的事", () => {
    const captureCurrent = vi.fn(() => STUB_SNAPSHOT);
    renderModal({ captureCurrent });

    expect(captureCurrent).not.toHaveBeenCalled();
  });

  it("captureDisabled 時「擷取目前站位」真的按不動", async () => {
    const user = userEvent.setup();
    const captureCurrent = vi.fn(() => STUB_SNAPSHOT);
    renderModal({ captureDisabled: true, captureCurrent });

    const button = screen.getByTestId("button-new-tactic-from-rotation");
    expect(button).toBeDisabled();
    await user.click(button);
    // 舊寫法只能用 regex 去 HTML 字串裡撈 disabled="" 這幾個字，證明不了「點了真的沒事」。
    expect(captureCurrent).not.toHaveBeenCalled();

    // 「空站位」不受影響：擷取來源不可用（例如還沒排出完整先發）跟「從空白開始」無關。
    expect(screen.getByTestId("button-new-tactic-blank")).toBeEnabled();
  });

  it("按「擷取目前站位」：用呼叫端給的快照開 session，並回報 onStarted 後關閉", async () => {
    const user = userEvent.setup();
    const startSession = vi.fn();
    useTacticsBoard.setState({ startSession });
    const onStarted = vi.fn();
    const onOpenChange = vi.fn();
    renderModal({ onStarted, onOpenChange });

    await user.click(screen.getByTestId("button-new-tactic-from-rotation"));

    expect(startSession).toHaveBeenCalledWith(STUB_SNAPSHOT);
    expect(onStarted).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("按「空站位」：開一份空白 session，同樣回報 onStarted", async () => {
    const user = userEvent.setup();
    const startSession = vi.fn();
    useTacticsBoard.setState({ startSession });
    const onStarted = vi.fn();
    renderModal({ onStarted });

    await user.click(screen.getByTestId("button-new-tactic-blank"));

    // 空站位的快照是這個元件自己用 captureBlank 生的，不經過 captureCurrent。
    expect(startSession).toHaveBeenCalledWith(
      expect.objectContaining({ source: "blank", matchId: "1" }),
    );
    expect(onStarted).toHaveBeenCalled();
  });

  it("⚠️ 按 Esc 取消：不會開 session，也不會回報 onStarted", async () => {
    const user = userEvent.setup();
    const startSession = vi.fn();
    useTacticsBoard.setState({ startSession });
    const onStarted = vi.fn();
    const onOpenChange = vi.fn();
    renderModal({ onStarted, onOpenChange });

    await user.keyboard("{Escape}");

    // 這是 onStarted 存在的理由：關閉這件事本身（onOpenChange(false)）兩種情況都會發生，
    // 「選了起點」跟「按 Esc 取消」光看它分不出來。呼叫端不能從關閉反推使用者意圖，
    // 得由彈窗明講「我真的開了一個 session」——NavRail.test.tsx 有對應的端到端回歸測試。
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(startSession).not.toHaveBeenCalled();
    expect(onStarted).not.toHaveBeenCalled();
  });
});
