// #394：唯讀紀錄表格。純展示元件，不需要 QueryClient/Router 這些 provider（見元件檔頭
// 「為什麼刻意做成純展示元件」），所以這裡直接用 @testing-library/react 的 render，
// 不用 renderWithProviders。
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdvancedRecordingTable, { formatVideoSeconds } from "./AdvancedRecordingTable";
import type { PointRecord } from "@/types/scoresheet";

const ROSTER = [
  { id: "p1", name: "王小明" },
  { id: "p2", name: "李小華" },
];

describe("formatVideoSeconds", () => {
  it.each([
    [0, "0:00"],
    [65, "1:05"],
    [3661, "61:01"],
  ])("%i 秒 → %s", (seconds, expected) => {
    expect(formatVideoSeconds(seconds)).toBe(expected);
  });
});

describe("AdvancedRecordingTable", () => {
  it("空狀態：每一局都沒有紀錄時顯示提示文字、不畫表格骨架", () => {
    render(<AdvancedRecordingTable sets={[{ setNumber: 1, history: [] }]} roster={ROSTER} />);
    expect(screen.getByText("還沒補填任何一分")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("依時間順序橫跨多局列出，比分逐局獨立跑分（第二局從 0:0 重新算）", () => {
    const set1: PointRecord[] = [
      { side: "us", wasSideOut: true }, // 1:0
      { side: "us", wasSideOut: false }, // 2:0
      { side: "opponent", wasSideOut: true }, // 2:1
    ];
    const set2: PointRecord[] = [
      { side: "opponent", wasSideOut: true }, // 0:1（局內重新從 0 起算）
    ];
    render(
      <AdvancedRecordingTable
        sets={[
          { setNumber: 1, history: set1 },
          { setNumber: 2, history: set2 },
        ]}
        roster={ROSTER}
      />,
    );

    const rows = screen.getAllByRole("row").slice(1); // 去掉表頭那一列
    expect(rows).toHaveLength(4);
    // 第一局第 3 分：2:1
    expect(rows[2].textContent).toContain("2");
    expect(rows[2].textContent).toContain("1");
    // 第二局第 1 分：局內重新從 0 起算，不是延續第一局的 2:1 → 0:1
    expect(rows[3].textContent).toContain("0");
    expect(rows[3].textContent).toContain("1");
  });

  it("有影片錨點的列點下去會呼叫 onSeek，帶著那一分自己的錨點", async () => {
    const user = userEvent.setup();
    const onSeek = vi.fn();
    const history: PointRecord[] = [
      { side: "us", wasSideOut: true, videoAnchor: { videoId: "v1", seconds: 42 } },
    ];
    render(
      <AdvancedRecordingTable sets={[{ setNumber: 1, history }]} roster={ROSTER} onSeek={onSeek} />,
    );

    await user.click(screen.getByRole("button", { name: /42/ }));
    expect(onSeek).toHaveBeenCalledWith({ videoId: "v1", seconds: 42 });
  });

  it("沒有影片錨點的列不可點：沒有 button role，點了也不會呼叫 onSeek", async () => {
    const user = userEvent.setup();
    const onSeek = vi.fn();
    const history: PointRecord[] = [{ side: "us", wasSideOut: true }];
    render(
      <AdvancedRecordingTable sets={[{ setNumber: 1, history }]} roster={ROSTER} onSeek={onSeek} />,
    );

    expect(screen.queryByRole("button")).toBeNull();
    const dataRow = screen.getAllByRole("row")[1];
    await user.click(dataRow);
    expect(onSeek).not.toHaveBeenCalled();
  });

  it("決定球欄位：我方球員動作顯示「動作 球員名」，對手動作顯示「對手 動作」，沒有動作顯示「—」", () => {
    const history: PointRecord[] = [
      // 我方 p1 攻擊得分
      {
        side: "us",
        wasSideOut: false,
        action: "attack",
        touchedBy: { side: "us", playerId: "p1" },
      },
      // 對手攔網得分（對手沒有 playerId）
      { side: "opponent", wasSideOut: true, action: "block", touchedBy: { side: "opponent" } },
      // 「沒看到」：完全沒有 meta
      { side: "us", wasSideOut: false },
    ];
    render(<AdvancedRecordingTable sets={[{ setNumber: 1, history }]} roster={ROSTER} />);

    expect(screen.getByText("攻擊 王小明")).toBeTruthy();
    expect(screen.getByText("對手 攔網")).toBeTruthy();
    // 「—」在「影片」欄也會出現（沒有錨點的三列都是 —），所以用 getAllByText 確認至少有一個。
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});
