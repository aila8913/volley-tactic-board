// vitest 的「每個測試檔開跑前先執行一次」的設定檔（vitest.config.ts 的 setupFiles）。
// issue #168 引進 @testing-library/react 時新增。
//
// 這裡做兩件事，兩件都是「不做就會很難 debug」的那種前置：
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
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});
