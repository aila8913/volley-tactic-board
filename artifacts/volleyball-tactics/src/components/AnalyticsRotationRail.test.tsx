// #349 的回歸測試：分析頁右欄「場上站位」。
//
// 這裡仍然用 renderToStaticMarkup 而不是 @testing-library/react（#168 之後兩種都能用）：
// #349 Bug A 講的正是「**預設**停在第 4 局」，也就是初始渲染那一刻的事，不需要模擬使用者
// 按 stepper。這一頁的 rail 本來就是唯讀的，沒有互動可測——留著純渲染的寫法最貼近它的性質。
// （會動的那一份在 MatchInfoRail.test.tsx，那支用 RTL 驗同一條規則的可編輯版本。）
//
// record 刻意不手刻，而是餵假的後端 DTO 給 reconstructRecording 生出來（跟正式流程用的是
// 同一個重建函式）。這樣測到的是「後端資料 → 畫面」整條路，只少了 useMatchRecording 那層
// query 而已；手刻一份 ScoreSheetState 則會繞過重建邏輯，改壞了也測不出來。
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import AnalyticsRotationRail from "./AnalyticsRotationRail";
import { reconstructRecording } from "@/lib/scoreSheetMapping";
import { makeSet, makeRally, makeLineup } from "@/lib/__fixtures__/scoreSheet";
import type { MatchPlayer } from "@/types/match";

// 六個站位對應的六名球員。背號刻意用 11–16 這種不會跟 zone 編號、局數、比分撞在一起的數字，
// 這樣在 HTML 裡搜到「11」就一定是球員背號，不會是別的東西碰巧長一樣。
// 位置給一組正常的六人配置（雙主攻雙欄中＋舉球＋對角），這支測試不看位置，但 role 是必填
// 欄位、也沒有「未指定」這個值可填。
const ROLES = ["S", "OH", "MB", "OPP", "OH", "MB"] as const;
const ROSTER: MatchPlayer[] = [1, 2, 3, 4, 5, 6].map((zone) => ({
  id: String(zone),
  name: `球員${zone}`,
  number: 10 + zone,
  role: ROLES[zone - 1],
  personId: null,
}));

// 一場已完賽的三局比賽（我方 2:1 勝），每一局都有自己的先發。
// 每局只放一球，因為這支測試在乎的是「有幾局、哪一局的先發被畫出來」，不是比分怎麼算的。
function buildThreeSetFinishedRecord() {
  const sets = [1, 2, 3].map((n) => makeSet({ id: `set-${n}`, setNumber: n }));
  const ralliesBySetIndex = [1, 2, 3].map((n) => [
    makeRally({ id: `rally-${n}`, setId: `set-${n}`, winner: n === 2 ? "away" : "home" }),
  ]);
  // 第 3 局的先發換一組人（zone1 改成 6 號球員），用來驗證畫面畫的確實是「那一局自己的」
  // 先發，而不是隨便抓一局的。
  const lineups = [
    makeLineup({ id: 1, setId: "set-1" }),
    makeLineup({ id: 2, setId: "set-2" }),
    makeLineup({ id: 3, setId: "set-3", zone1PlayerId: "6", zone6PlayerId: "1" }),
  ];
  // 第 7 個參數 isFinished=true：已完賽，三局全部算已結束局（#218）。
  return reconstructRecording(sets, ralliesBySetIndex, [], [], lineups, [], true);
}

describe("AnalyticsRotationRail", () => {
  it("已完賽的三局比賽：預設停在第 3 局，不是不存在的第 4 局（#349 Bug A）", () => {
    const html = renderToStaticMarkup(
      <AnalyticsRotationRail
        record={buildThreeSetFinishedRecord()}
        roster={ROSTER}
        winsNeeded={2}
      />,
    );

    expect(html).toContain("第 3 局");
    expect(html).not.toContain("第 4 局");
  });

  it("已完賽的比賽：那一局的先發六人有畫出來，不是空盤子（#349 Bug B）", () => {
    const html = renderToStaticMarkup(
      <AnalyticsRotationRail
        record={buildThreeSetFinishedRecord()}
        roster={ROSTER}
        winsNeeded={2}
      />,
    );

    // 六格都要有人。斷言用球員**名字**而不是背號：背號是純數字，在一整份 HTML 裡（class
    // 名稱、比分、局數……）到處都可能碰巧出現，比對背號會給出假的綠燈。
    //
    // 第 3 局的先發把 1 號球員跟 6 號球員對調了（見 buildThreeSetFinishedRecord），所以
    // 六個人全員在場——名字全部出現就代表六格都填到了。
    for (const player of ROSTER) {
      expect(html).toContain(player.name);
    }
    // RotationRailPanel 的空格子會畫一個破折號（見該檔案的 cellContent），所以「一個
    // 破折號都沒有」＝六格都有人，比逐格數更嚴格也更誠實。
    expect(html).not.toContain("—");
  });

  it("已完賽但目前這局真的記過分：那一局仍然滑得到，不能被當成空佔位砍掉", () => {
    // 三戰兩勝已經 2:0（第 1、2 局都我方贏），教練仍按了「下一局」而且第 3 局記了分。
    // getMatchWinner 看已結束局判定「已完賽」，但第 3 局有真實資料，不是 #218 那種空佔位。
    const sets = [1, 2, 3].map((n) => makeSet({ id: `set-${n}`, setNumber: n }));
    const ralliesBySetIndex = [1, 2, 3].map((n) => [
      makeRally({ id: `rally-${n}`, setId: `set-${n}`, winner: "home" }),
    ]);
    const lineups = [1, 2, 3].map((n) => makeLineup({ id: n, setId: `set-${n}` }));
    // isFinished=false：matches.status 還是進行中（教練還沒按「結束比賽」），所以第 3 局
    // 是「目前這局」而不是已結束局——這正是 hasCurrentSetData 要保住的那一格。
    const record = reconstructRecording(sets, ralliesBySetIndex, [], [], lineups, [], false);

    const html = renderToStaticMarkup(
      <AnalyticsRotationRail record={record} roster={ROSTER} winsNeeded={2} />,
    );

    expect(html).toContain("第 3 局");
    expect(html).not.toContain("第 4 局");
  });

  it("進行中的比賽仍然為「目前這局」多留一格（未完賽時 totalSets 要 +1）", () => {
    // 兩局打完、比賽還沒分勝負（winsNeeded=3，五戰三勝），所以第 3 局是進行中的那一局。
    const sets = [1, 2, 3].map((n) => makeSet({ id: `set-${n}`, setNumber: n }));
    const ralliesBySetIndex = [1, 2, 3].map((n) => [
      makeRally({ id: `rally-${n}`, setId: `set-${n}`, winner: n === 2 ? "away" : "home" }),
    ]);
    const lineups = [1, 2, 3].map((n) => makeLineup({ id: n, setId: `set-${n}` }));
    const record = reconstructRecording(sets, ralliesBySetIndex, [], [], lineups, [], false);

    const html = renderToStaticMarkup(
      <AnalyticsRotationRail record={record} roster={ROSTER} winsNeeded={3} />,
    );

    // 未完賽時 sets 的最後一局＝進行中那局，所以已結束局只有兩局，預設停在第 3 局（進行中）。
    expect(html).toContain("第 3 局");
  });
});
