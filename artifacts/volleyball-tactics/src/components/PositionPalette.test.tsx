import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { PLAYER_ROLES } from "../types/match";
import { DND_ANON_ROLE } from "../lib/dndProtocols";
import PositionPalette from "./PositionPalette";

// PositionPalette 是純展示 + 拖曳的啞元件（不吃任何 props、不碰 store），測試重點只有
// 兩件事（見 issue #372 任務說明的驗收清單）：五顆籌碼都畫得出來、拖曳會把角色代碼寫進
// DND_ANON_ROLE，以及「拖出去之後籌碼還在」這個決策核心（不是搬移，是無限供應）。

describe("PositionPalette", () => {
  it("五顆位置籌碼都渲染出來，代碼跟 types/match.ts 的 PLAYER_ROLES 一致", () => {
    renderWithProviders(<PositionPalette />);

    for (const role of PLAYER_ROLES) {
      const chip = screen.getByTestId(`position-palette-${role}`);
      expect(chip).toHaveTextContent(role);
    }
  });

  it("dragStart 把角色代碼寫進 DND_ANON_ROLE 這個自訂 MIME 鍵", () => {
    renderWithProviders(<PositionPalette />);

    const chip = screen.getByTestId("position-palette-OH");
    // jsdom 沒有真的實作 HTML5 drag-and-drop，DataTransfer 建構子在部分環境下也不完整，
    // 這裡手刻一個最小的假 DataTransfer（只需要 setData 會被呼叫、可以事後讀出寫了什麼），
    // 比引入完整的 drag-and-drop 模擬套件划算——這裡只是要驗證「onDragStart 呼叫了
    // setData(DND_ANON_ROLE, role)」這一件事。
    const data: Record<string, string> = {};
    const dataTransfer = {
      setData: vi.fn((key: string, value: string) => {
        data[key] = value;
      }),
      effectAllowed: "",
    };

    chip.dispatchEvent(Object.assign(new Event("dragstart", { bubbles: true }), { dataTransfer }));

    expect(dataTransfer.setData).toHaveBeenCalledWith(DND_ANON_ROLE, "OH");
    expect(data[DND_ANON_ROLE]).toBe("OH");
  });

  it("拖曳之後五顆籌碼原地都還在——這排是無限供應的取用點，不是會被搬走的清單", () => {
    renderWithProviders(<PositionPalette />);

    const chip = screen.getByTestId("position-palette-S");
    const dataTransfer = { setData: vi.fn(), effectAllowed: "" };
    chip.dispatchEvent(Object.assign(new Event("dragstart", { bubbles: true }), { dataTransfer }));

    for (const role of PLAYER_ROLES) {
      expect(screen.getByTestId(`position-palette-${role}`)).toBeInTheDocument();
    }
  });
});
