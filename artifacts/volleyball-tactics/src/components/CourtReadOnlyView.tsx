import type { MatchPlayer } from "@/types/match";
import type { PlayerPosition } from "@/types/rotationTable";

// ── 唯讀站位視圖（issue #120 第一階段）──
//
// 這個元件刻意設計成「純展示」：不 import 任何 hook / store，畫面要顯示什麼完全由外面
// 的 props 決定。為什麼要這麼龜毛？issue #115 才剛把計分表的先發跟全域 useRotationTable
// store 解耦（計分表現在有自己 per-match、逐局的先發快照），如果這個元件反過來去讀
// useRotationTable，等於是把好不容易切開的耦合又接回去——而且未來這個元件是要給
// 「計分頁」「分析頁」等多個頁面共用的，每個頁面的站位真相來源都不一樣（計分頁讀自己
// 的 lineup 快照、分析頁以後可能讀比賽紀錄重建的站位），只有讓元件保持「你餵我畫」，
// 才能真的到處共用而不互相污染。
interface CourtReadOnlyViewProps {
  // 我方這一輪 6 人的座標，0~1 normalized（跟 rotationLogic.ts 的 zoneCoords 同一套座標系：
  // 前排 y=0.6、後排 y=0.85，都落在 0.5~1 這個「我方半場」的範圍）。
  positions: PlayerPosition[];
  // 這場比賽的球員名單，用來把 positions 裡的 playerId 換算成背號/姓名/身分（自由球員與否）。
  roster: MatchPlayer[];
  className?: string;
}

// 顏色照 docs/design-spec.md 第 2 節色票：一般球員＝主色萊姆綠，自由球員（role "L"）
// 用 Error 色珊瑚紅區分——這跟 ScoreSheetCourt.tsx 裡自由球員相關的提示環/拖曳殘影
// 是同一組視覺語言（橘/紅系代表「特殊身分」），使用者換到唯讀視圖也不會認不出誰是自由球員。
const PLAYER_FILL = "#C6F135";
const LIBERO_FILL = "#EF4444";

export default function CourtReadOnlyView({
  positions,
  roster,
  className,
}: CourtReadOnlyViewProps) {
  return (
    <div
      className={`relative w-full overflow-hidden rounded-xl border border-white/[0.10] bg-white/[0.03] ${
        className ?? ""
      }`}
      // 半場比例：positions.y 只會落在 0.5~1 這個範圍（我方半場），所以 viewBox 用
      // 1:1（正方形）而不是 ScoreSheetCourt 全場那種 1:2——半場高度剛好是全場的一半。
      style={{ aspectRatio: "1 / 1" }}
      data-testid="court-readonly-view"
    >
      {positions.length === 0 ? (
        // 這一局／這個資料源根本沒有站位（例如計分表還沒選先發方、currentSet 是 null）——
        // 不畫任何東西，用一句提示取代空白 SVG，避免使用者以為畫面壞掉。
        <div className="flex h-full w-full items-center justify-center px-4 text-center text-xs text-[#9AA08C]">
          尚未排先發
        </div>
      ) : (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
          {/* 半場外框＋前後排分界虛線，純裝飾用（不是精算的攻擊線位置），
              只是讓使用者一眼看出這是「一片球場」而不是隨機排列的圓點。 */}
          <rect
            x="1"
            y="1"
            width="98"
            height="98"
            rx="4"
            fill="none"
            stroke="rgba(245,245,240,0.15)"
            strokeWidth="1"
          />
          <line
            x1="1"
            y1="40"
            x2="99"
            y2="40"
            stroke="rgba(245,245,240,0.15)"
            strokeWidth="1"
            strokeDasharray="3 2"
          />

          {positions.map((pos) => {
            const player = roster.find((p) => p.id === pos.playerId);
            // 幽靈站位（playerId 在這場名單裡找不到人）直接跳過不畫，比在唯讀畫面上崩潰
            // 或畫出一個空白圓圈安全——這種情況照理不該發生（呼叫端應該已經濾過），但
            // 唯讀元件本來就該對自己收到的資料抱持防禦心態，不要假設 props 一定乾淨。
            if (!player) return null;
            const isLibero = player.role === "L";
            // x 是 0~1 直接乘 100；y 是 0.5~1，先減掉 0.5 再乘 200 換算成半場 0~100 的座標。
            const cx = pos.x * 100;
            const cy = (pos.y - 0.5) * 200;
            return (
              <g key={pos.playerId} data-testid={`court-readonly-player-${player.id}`}>
                <circle
                  cx={cx}
                  cy={cy}
                  r="7"
                  fill={isLibero ? LIBERO_FILL : PLAYER_FILL}
                  stroke="rgba(18,19,16,0.6)"
                  strokeWidth="1"
                />
                <text
                  x={cx}
                  y={cy + 2}
                  fontSize="6"
                  fontWeight="bold"
                  textAnchor="middle"
                  fill="#121310"
                >
                  {player.number}
                </text>
                {/* 姓名放在圈圈下方的小字——空間有限只留前 4 字，跟其他地方姓名截斷的
                    寬鬆程度一致（不用刻意再縮短，反正字級夠小、超出範圍也不影響判讀背號）。 */}
                <text x={cx} y={cy + 12} fontSize="4" textAnchor="middle" fill="#9AA08C">
                  {player.name.slice(0, 4)}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
