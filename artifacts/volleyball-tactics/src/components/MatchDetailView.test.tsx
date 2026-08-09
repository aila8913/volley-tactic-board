// issue #329 的回歸測試：右欄「比賽資訊」的唯讀檢視。
//
// 為什麼只測這一半：這個專案還沒裝 @testing-library/react（issue #168），元件測試只能用
// renderToStaticMarkup 比對「一次性的初始渲染」（同 AnalyticsRotationRail.test.tsx 開頭的說明）。
// 編輯表單那半掛滿 React Query hook，沒有 QueryClientProvider 跟假 server 就渲染不起來，
// 硬寫只會得到一支假測試——所以那半走手動驗收，這半（純元件）測起來。
//
// 這支測試守的是驗收條件第 1 條：「選中比賽 → 右欄看得到時間／球隊／對手／賽制，
// **全部唯讀**」。最後那個 not.toContain("<input") 就是「唯讀」這件事的機器判準——以後有人
// 圖方便把輸入框直接塞進唯讀檢視（而不是走編輯模式），這裡會擋下來。
//
// 球員名單刻意**不**在這支元件裡（PO 2026-08-09）：右欄以前畫了兩份一模一樣的名單，
// 合併成 RotationRailPanel 底下那一份了。下面那條 not.toContain("日向翔陽") 就是防止
// 有人手滑把名單又加回來，變回兩份。
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import MatchDetailView from "./MatchDetailView";
import type { Match } from "@/types/match";

const MATCH: Match = {
  id: "1",
  opponent: "青葉城西",
  // 固定寫死的本地時間字串（datetime-local 格式，見 types/match.ts）：2026-08-09 是週日，
  // 所以 formatMatchDateTime 應該吐出「08/09（日）19:30」。
  dateTime: "2026-08-09T19:30",
  players: [
    { id: "p1", name: "日向翔陽", number: 10, role: "MB", personId: null },
    { id: "p2", name: "影山飛雄", number: 9, role: "S", personId: 42 },
  ],
  createdAt: "2026-08-01T00:00:00.000Z",
  tournamentId: null,
  teamId: 7,
  format: "best_of_5",
  status: "in_progress",
};

describe("MatchDetailView", () => {
  it("四個基本欄位都看得到", () => {
    const html = renderToStaticMarkup(<MatchDetailView match={MATCH} teamName="烏野高校" />);

    expect(html).toContain("08/09（日）19:30");
    expect(html).toContain("青葉城西");
    expect(html).toContain("烏野高校");
    // 賽制顯示的是人看得懂的文案，不是 DB 的 enum 值。
    expect(html).toContain("五戰三勝");
    expect(html).not.toContain("best_of_5");
  });

  it("名單不畫在這裡（合併進站位面板，右欄只留一份）", () => {
    const html = renderToStaticMarkup(<MatchDetailView match={MATCH} teamName="烏野高校" />);

    expect(html).not.toContain("球員名單");
    expect(html).not.toContain("日向翔陽");
    expect(html).not.toContain("影山飛雄");
  });

  it("沒標球隊時那一列仍然在，顯示「未指定」", () => {
    const html = renderToStaticMarkup(
      <MatchDetailView match={{ ...MATCH, teamId: null }} teamName={null} />,
    );

    expect(html).toContain("球隊");
    expect(html).toContain("未指定");
  });

  it("唯讀：整塊不含任何輸入框（驗收第 1 條）", () => {
    const html = renderToStaticMarkup(<MatchDetailView match={MATCH} teamName="烏野高校" />);

    expect(html).not.toContain("<input");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<select");
  });
});
