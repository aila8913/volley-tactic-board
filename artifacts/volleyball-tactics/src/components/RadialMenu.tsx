export interface RadialMenuOption<T extends string> {
  value: T;
  label: string;
  position: "top" | "right" | "bottom" | "left";
}

interface RadialMenuProps<T extends string> {
  // 螢幕座標（clientX/clientY），不是球場 SVG 座標——選單是疊在畫面最上層的 HTML，
  // 跟球場本身的縮放/座標系統無關，只要知道「螢幕上哪一點」就能定位。
  center: { x: number; y: number };
  options: RadialMenuOption<T>[];
  onSelect: (value: T) => void;
  onCancel: () => void;
}

const OFFSET = 56; // px，選項按鈕離中心點的距離
const POSITION_DELTA: Record<RadialMenuOption<string>["position"], { dx: number; dy: number }> = {
  top: { dx: 0, dy: -OFFSET },
  right: { dx: OFFSET, dy: 0 },
  bottom: { dx: 0, dy: OFFSET },
  left: { dx: -OFFSET, dy: 0 },
};

// 比賽期間快速操作用的圓形彈出選單：點在球場上的球員，選項會在他上下左右彈出來，
// 不用開選單、不用捲動列表，單手點一下就能記一球（見 pages/MatchRecording.tsx 的
// 兩步驟手勢：先選動作，再選得失分）。半透明背景擋住整個畫面，點背景視為取消。
export default function RadialMenu<T extends string>({
  center,
  options,
  onSelect,
  onCancel,
}: RadialMenuProps<T>) {
  return (
    <div className="fixed inset-0 z-50 bg-black/10" onPointerDown={onCancel}>
      {options.map((opt) => {
        const { dx, dy } = POSITION_DELTA[opt.position];
        return (
          <button
            key={opt.value}
            onPointerDown={(e) => {
              e.stopPropagation();
              onSelect(opt.value);
            }}
            className="absolute -translate-x-1/2 -translate-y-1/2 wobbly-border bg-white px-3 py-2 text-sm font-bold shadow-[2px_2px_0_0_#111] hover:bg-[#CCFF00] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
            style={{ left: center.x + dx, top: center.y + dy }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
