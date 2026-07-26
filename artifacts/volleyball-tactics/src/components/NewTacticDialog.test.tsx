import { describe, it, expect } from "vitest";
// 這個元件（issue #177 改版）不再是 Radix Dialog（Portal），而是一個手刻的
// `absolute inset-0` 中央浮層——open=true 時整段內容就在正常的 React tree 裡，
// renderToStaticMarkup 這種純字串序列化就能把它完整輸出，不用像舊版那樣只能測 open=false
// （見 git 歷史裡這個檔案改版前的版本，那時受限於 Radix Portal 需要真實 DOM）。
import { renderToStaticMarkup } from "react-dom/server";
import NewTacticDialog from "./NewTacticDialog";
import type { CourtSnapshot } from "../types/courtSnapshot";

const STUB_SNAPSHOT: CourtSnapshot = {
  source: "blank",
  matchId: "1",
  rotation: 0,
  capturedAt: "2026-01-01T00:00:00.000Z",
  players: [],
};

describe("NewTacticDialog", () => {
  it("open=false 時不畫出任何內容", () => {
    const html = renderToStaticMarkup(
      <NewTacticDialog
        open={false}
        onClose={() => {}}
        matchId="1"
        captureCurrent={() => STUB_SNAPSHOT}
        captureLabel="測試用擷取說明"
      />,
    );
    expect(html).toBe("");
  });

  it("open=true 時渲染出兩個並排選項鈕＋captureLabel 說明文字", () => {
    const html = renderToStaticMarkup(
      <NewTacticDialog
        open={true}
        onClose={() => {}}
        matchId="1"
        captureCurrent={() => STUB_SNAPSHOT}
        captureLabel="測試用擷取說明"
      />,
    );
    expect(html).toContain('data-testid="button-new-tactic-from-rotation"');
    expect(html).toContain('data-testid="button-new-tactic-blank"');
    expect(html).toContain("現有輪轉位");
    expect(html).toContain("重新佈陣");
    expect(html).toContain("測試用擷取說明");
    // 遮罩／卡片兩層都要在，確認「只蓋中央欄」的 absolute inset-0 結構還在。
    expect(html).toContain('data-testid="new-tactic-overlay-backdrop"');
    expect(html).toContain('data-testid="new-tactic-overlay-card"');
  });

  it("captureDisabled 時「現有輪轉位」按鈕渲染成 disabled", () => {
    const html = renderToStaticMarkup(
      <NewTacticDialog
        open={true}
        onClose={() => {}}
        matchId="1"
        captureCurrent={() => STUB_SNAPSHOT}
        captureLabel="測試用擷取說明"
        captureDisabled
      />,
    );
    expect(html).toMatch(/disabled="" class="[^"]*" data-testid="button-new-tactic-from-rotation"/);
  });

  it("渲染當下不會呼叫 captureCurrent——擷取要等使用者實際按下按鈕才發生，不是渲染期的副作用", () => {
    let called = false;
    renderToStaticMarkup(
      <NewTacticDialog
        open={true}
        onClose={() => {}}
        matchId="1"
        captureCurrent={() => {
          called = true;
          return STUB_SNAPSHOT;
        }}
        captureLabel="測試用擷取說明"
      />,
    );
    expect(called).toBe(false);
  });
});
