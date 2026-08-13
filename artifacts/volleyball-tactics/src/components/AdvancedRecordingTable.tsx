import type { KeyboardEvent } from "react";
import type { PointRecord } from "@/types/scoresheet";
import { actionLabel } from "@/components/AdvancedRecordingCourt";

// 進階版補填的完整紀錄表格（#394，實作 ADR-0010「補填」拆票裡的唯讀讀那半）。
// 名字刻意跟 AdvancedRecordingCourt.tsx 對稱——球場負責「記」，這裡負責「唯讀回看」，
// 兩者都只在進階模式出現，是同一個功能的一體兩面。
//
// ── 為什麼刻意做成純展示元件（沒有任何 hook 進 useScoreSheet／useAdvancedRecording）──
// 這張表要顯示的內容全部是「已經記完的資料」（record.completedSets + record.currentSet），
// 不需要知道記錄進行到一半的手勢狀態，也不该自己決定要不要重新抓資料。純 props 進、
// 純 JSX 出，好處是：
//   1. 這裡的邏輯（跑分、決定球文案、mm:ss 格式化）可以直接單元測試，不用 mock 一整套 store。
//   2. 呼叫端（ScoreSheet.tsx）要怎麼組資料（例如 [...completedSets, currentSet]）留在
//      呼叫端自己決定，這個元件不用知道「進行中那一局」跟「已結束局」有什麼差別。
// 編輯是明確排除在外的（#396 的範圍）：這裡完全沒有任何會改資料的 handler，只有
// 唯讀顯示 + onSeek 這一個「跳去影片那一秒」的旁路。

type Props = {
  // 依時間順序：已結束各局在前，進行中那局在最後（呼叫端負責排好，見 ScoreSheet.tsx）。
  sets: { setNumber: number; history: PointRecord[] }[];
  // 只需要拿 id 對出球員名字，不需要背號/位置——跟 match.players（MatchPlayer[]）的完整
  // 型別比，這裡只挑用得到的兩個欄位，呼叫端直接把 match.players 傳進來就對得上。
  roster: { id: string; name: string }[];
  // 點一列有影片錨點的紀錄時呼叫，帶著那一分錨定的 videoId／秒數。不給這個 prop
  // （或某一列沒有錨點）時那一列就不可互動——見下面 isClickable 的判斷。
  onSeek?: (anchor: { videoId: string; seconds: number }) => void;
};

// ── mm:ss 格式化 ──
// 這個專案沒有共用的秒數格式化工具：lib/matchMapping.ts、lib/matchSummary.ts 各自在檔案內
// 定義了一個小小的 pad() 就地用，沒有抽成 lib 共用模組。這裡的需求（秒數→分:秒）跟那兩個
// 檔案的日期格式化不是同一件事，跟著同樣的「三處各自一份小工具」慣例走，不另外開一個
// 共用模組——那樣反而是這個 repo 目前沒有的模式。
export function formatVideoSeconds(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// ── 「決定球」欄位的文案 ──
// 這一分是「誰、做了什麼」的最簡短摘要。三種情況：
//   1. 完全沒有 meta（簡易版按過「沒看到」，或進階版這一分根本沒補填任何動作）→ "—"。
//   2. 我方球員、且找得到 playerId 對應的名字 → "動作 球員名"（例如「攻擊 王小明」）。
//   3. 其餘情況（對手做的、或我方但沒有 playerId 這種舊資料/邊界情況）→ 對手就標「對手」
//      當主詞（例如「對手 攔網」），我方沒有 playerId 時只顯示動作本身，不硬湊一個主詞。
function decisiveBallLabel(point: PointRecord, roster: { id: string; name: string }[]): string {
  if (!point.action) return "—";
  const label = actionLabel(point.action);
  const touchedBy = point.touchedBy;
  if (touchedBy?.side === "us" && touchedBy.playerId) {
    const player = roster.find((p) => p.id === touchedBy.playerId);
    return player ? `${label} ${player.name}` : label;
  }
  if (touchedBy?.side === "opponent") return `對手 ${label}`;
  return label;
}

// 一列的整理後資料：把「這一分之後的比分」（跑分）跟「這是第幾局第幾分」都先算好，
// render 那段只管畫、不管算——這是這個元件唯一真的有邏輯的地方，抽出來方便測試。
interface Row {
  key: string;
  setNumber: number;
  rallyIndex: number; // 這一局第幾分，1-based，對應「#」欄
  ourScore: number;
  opponentScore: number;
  point: PointRecord;
}

function buildRows(sets: Props["sets"]): Row[] {
  const rows: Row[] = [];
  for (const s of sets) {
    // 每一局的跑分獨立從 0:0 開始算——比分表達的是「這一分結束後這一局打到幾比幾」，
    // 局跟局之間不累加（跟 ScoreSheetStats 的「比分總覽」是同一個規則：局是排球計分的
    // 邊界，比分永遠局內算）。
    let ourScore = 0;
    let opponentScore = 0;
    s.history.forEach((point, i) => {
      if (point.side === "us") ourScore += 1;
      else opponentScore += 1;
      rows.push({
        key: `${s.setNumber}-${i}`,
        setNumber: s.setNumber,
        rallyIndex: i + 1,
        ourScore,
        opponentScore,
        point,
      });
    });
  }
  return rows;
}

const TH_CLASS =
  "sticky top-0 z-10 bg-[#14170f] py-2 text-xs font-semibold text-[#a9b096] first:pl-3 last:pr-3";
const TD_CLASS = "py-2 text-sm text-[#f5f5f0] first:pl-3 last:pr-3";

export default function AdvancedRecordingTable({ sets, roster, onSeek }: Props) {
  const rows = buildRows(sets);

  if (rows.length === 0) {
    // 空狀態跟它取代掉的那個佔位塊維持同一種「還沒有東西」的克制語氣（灰字、沒有邊框
    // 虛線——虛線框是「這裡以後會長東西」的施工中標記，資料是空的跟功能還沒做完是兩件事，
    // 不該共用同一種視覺語言，免得使用者以為表格又壞掉了）。
    return (
      <div className="flex h-48 items-center justify-center text-sm text-[#6d7361]">
        還沒補填任何一分
      </div>
    );
  }

  return (
    // 內部捲動 + sticky header：一局 50+ 分是常態（見票面），這塊區域自己捲，不會把整頁
    // 撐到需要捲很久才看得到下面的內容。max-h 給一個固定值而不是用 flex-1 撐滿剩餘空間，
    // 是因為這個元件被放在 ScoreSheet.tsx 裡「球場區塊下方、可以整頁往下捲」的位置
    // （見該檔案「完整紀錄表格的位置」那段），它自己不需要再搶佔剩餘視窗高度。
    <div className="max-h-[28rem] overflow-y-auto rounded-2xl border border-white/[0.10]">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-white/[0.10]">
            <th className={TH_CLASS}>局</th>
            <th className={TH_CLASS}>#</th>
            <th className={TH_CLASS}>比分</th>
            <th className={TH_CLASS}>得分方</th>
            <th className={TH_CLASS}>決定球</th>
            <th className={TH_CLASS}>影片</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const anchor = row.point.videoAnchor;
            // 只有「真的有錨點可以跳」且「呼叫端真的給了 onSeek」才可互動——看起來能點
            // 卻點了沒反應，比一眼看出「這列不能點」更糟（票面明講的原則）。
            const isClickable = anchor !== undefined && onSeek !== undefined;
            const isUs = row.point.side === "us";
            return (
              <tr
                key={row.key}
                className={
                  "border-b border-white/[0.06] last:border-b-0" +
                  (isClickable
                    ? " cursor-pointer transition hover:bg-white/[0.05] focus:outline-none focus:bg-white/[0.08]"
                    : "")
                }
                // 互動列才給 role/tabIndex/事件——非互動列維持普通 <tr>，不假裝可以聚焦。
                {...(isClickable
                  ? {
                      role: "button" as const,
                      tabIndex: 0,
                      onClick: () => onSeek?.(anchor),
                      onKeyDown: (e: KeyboardEvent<HTMLTableRowElement>) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onSeek?.(anchor);
                        }
                      },
                    }
                  : {})}
              >
                <td className={TD_CLASS}>{row.setNumber}</td>
                <td className={`${TD_CLASS} tabular-nums text-[#a9b096]`}>{row.rallyIndex}</td>
                <td className={`${TD_CLASS} font-score tabular-nums`}>
                  <span className="text-[#C6F135]">{row.ourScore}</span>
                  <span className="mx-0.5 text-[#a9b096]">–</span>
                  <span className="text-[#F0776C]">{row.opponentScore}</span>
                </td>
                <td className={`${TD_CLASS} ${isUs ? "text-[#C6F135]" : "text-[#F0776C]"}`}>
                  {isUs ? "我方" : "對手"}
                </td>
                <td className={TD_CLASS}>{decisiveBallLabel(row.point, roster)}</td>
                <td className={`${TD_CLASS} tabular-nums ${anchor ? "" : "text-[#6d7361]"}`}>
                  {anchor ? formatVideoSeconds(anchor.seconds) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
