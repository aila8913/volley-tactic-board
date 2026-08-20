import type { MatchPlayer } from "../types/match";

// 佈陣模式（mode D）常駐球員名單——issue #420（header ＋ 佈陣右欄 v3）新元件。
//
// 跟 mode B「站位」分頁、mode C 球員名單浮層用的 RotationRailPanel 清單是**兩份獨立實作**，
// 不是共用元件的另一種組裝，原因是這裡的互動比 RotationRailPanel 單純很多：
//   - RotationRailPanel 的清單身兼「先點號位、再點球員指派」跟拖曳兩種操作方式，因為它
//     也服務計分頁那種**可編輯先發**的情境。
//   - 這裡（佈陣模式，ADR-0001 訂死唯讀）只有一種操作：把人拖到中央球場。點擊完全沒有
//     意義，也就不需要 selectedZone 那整套狀態機。
// 硬要重用 RotationRailPanel 只為了它的拖曳那一小段，換來的是背著一整套用不到的
// 六宮格／第七格／點選賦值邏輯，也沒有插槽能單獨關掉六宮格（這次的設計本來就是要拿掉它，
// 換成 MiniCourtRotation）。拖曳本身只需要 `draggable` + `dataTransfer.setData("text/plain",
// playerId)`——中央球場 Court.tsx 的 drop handler 才是真正接住這個動作的地方，這個元件
// 不需要知道拖過去之後發生什麼事（跟 PositionPalette.tsx 是同一種「只管發起拖曳」的角色）。
//
// 高度規則跟瀏覽模式（TacticsList.tsx）同一條：flex:1 + min-height 176px（≈4 列），不設
// 上限，容器塞不下時交給外層一起捲。
interface ArrangingRosterListProps {
  roster: MatchPlayer[];
  // 這位球員是不是已經在中央球場的白板 session 裡了（sourcePlayerId 對得上）。用 Set
  // 而不是直接傳 session 進來，是為了讓這個元件維持「只管畫清單」的單純職責，不需要認識
  // CourtSnapshot 的形狀——同一種分工見 RotationRailPanel.tsx 開頭「不 import store」的說明，
  // 這裡雖然沒有直接碰 store，但一樣不該認識呼叫端資料源的內部結構。
  onCourtPlayerIds: ReadonlySet<string>;
}

export default function ArrangingRosterList({
  roster,
  onCourtPlayerIds,
}: ArrangingRosterListProps) {
  if (roster.length === 0) {
    return <p className="py-1 text-caption text-[#a9b096]">這場比賽還沒有球員名單</p>;
  }

  return (
    <div className="min-h-[176px] flex-1 overflow-y-auto">
      {roster.map((p) => {
        const onCourt = onCourtPlayerIds.has(p.id);
        return (
          <div
            key={p.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("text/plain", p.id);
              e.dataTransfer.effectAllowed = "move";
            }}
            data-testid={`arranging-roster-row-${p.id}`}
            className="flex h-10 cursor-grab items-center gap-2.5 border-b border-white/[0.05] py-0 pl-0.5 pr-2 transition hover:bg-white/[0.05] active:cursor-grabbing"
          >
            <span
              aria-hidden
              className={`grid w-1.5 grid-cols-2 gap-0.5 transition-opacity ${onCourt ? "opacity-20" : "opacity-45"}`}
            >
              {Array.from({ length: 6 }).map((_, i) => (
                <span key={i} className="h-0.5 w-0.5 rounded-full bg-white" />
              ))}
            </span>
            <span
              // 設計稿寫 16px，但這個 app 的字級系統就六級、不開第七個（#310）——跟既有
              // panel-title（15px）視覺上不可分辨，Anton 數字字重夠粗，1px 差不影響可讀性，
              // 借用既有 token 比為了 1px 差異另開一級誠實。
              className={`min-w-[26px] flex-none text-right font-score text-panel-title leading-none ${
                onCourt ? "text-[#a9b096]/50" : "text-[#f5f5f0]"
              }`}
            >
              {p.number}
            </span>
            <span
              className={`min-w-0 flex-1 truncate text-action ${
                onCourt ? "text-[#a9b096]/50" : "text-[#f5f5f0]"
              }`}
            >
              {p.name}
            </span>
            {onCourt && (
              <span className="flex-none font-label text-micro tracking-[0.08em] text-[#c6f135]/80">
                場上
              </span>
            )}
            <span className="min-w-[26px] flex-none text-right font-label text-micro tracking-[0.08em] text-[#a9b096]">
              {p.role}
            </span>
          </div>
        );
      })}
    </div>
  );
}
