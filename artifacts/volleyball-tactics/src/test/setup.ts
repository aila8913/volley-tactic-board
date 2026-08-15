// vitest 的「每個測試檔開跑前先執行一次」的設定檔（vitest.config.ts 的 setupFiles）。
// issue #168 引進 @testing-library/react 時新增。
//
// 這裡做三件事，都是「不做就會很難 debug」的那種前置：
//
// 1. **jest-dom 的自訂斷言**（`toBeInTheDocument` / `toBeDisabled` / `toHaveAttribute`…）。
//    沒有它也不是不能測，只是得寫成 `expect(el.hasAttribute("disabled")).toBe(true)` 這種
//    「斷言失敗時只告訴你 true !== false」的形式；jest-dom 的版本在失敗時會把那個元素的
//    HTML 印出來，找問題快得多。`/vitest` 這個子路徑是官方替 vitest 準備的進入點，它會把
//    matcher 掛進 vitest 的 expect（掛進 jest 的 expect 是另一個進入點，別用錯）。
//
// 2. **每個測試之後把 render 出來的 DOM 清掉**。testing-library 的 render 會把元件掛進
//    document.body，同一個測試檔裡的多個 it 共用同一個 jsdom 環境——不清掉的話，第二個
//    測試裡的 `screen.getByText(...)` 會同時看到上一個測試殘留的節點，然後以
//    「Found multiple elements」爆掉（或更糟：抓到上一個測試的節點，測試假綠）。
//    testing-library 本來有自動清理，但那條路徑要求 `afterEach` 是**全域變數**
//    （vitest 的 `globals: true`）。這個專案的測試都是明確 import `describe/it/expect`
//    的寫法（沒開 globals），所以自動清理不會生效，這裡手動掛一次。
//
// 3. **ResizeObserver 的空殼**（#328 加）。jsdom 沒有排版引擎，所以也沒有實作
//    ResizeObserver——任何用它量自己尺寸的元件（Court.tsx 靠它算白板的 viewBox）一 mount
//    就會 `ReferenceError: ResizeObserver is not defined`，而錯誤訊息指向 React 的 commit
//    階段、看不出是哪個元件，很難追。這裡掛一個「可以被 new、可以被呼叫、永遠不回報」的
//    空殼：jsdom 裡本來就沒有真實尺寸可量（所有元素都是 0×0），就算實作了也只會一直回報
//    0——所以空殼不是在假裝有這個能力，是誠實對應「這個環境量不到版面」。需要驗證
//    「尺寸變了畫面跟著變」的測試，得自己餵 wrapperSize 或改用真瀏覽器，不能靠這個殼。
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

afterEach(() => {
  cleanup();
});
