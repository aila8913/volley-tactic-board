export interface RadialMenuOption<T extends string> {
  value: T;
  label: string;
}

interface RadialMenuProps<T extends string> {
  // 螢幕座標（clientX/clientY），不是球場 SVG 座標——選單是疊在畫面最上層的 HTML，
  // 跟球場本身的縮放/座標系統無關，只要知道「螢幕上哪一點」就能定位。
  center: { x: number; y: number };
  options: RadialMenuOption<T>[];
  onSelect: (value: T) => void;
  onCancel: () => void;
  // 第一個選項的角度（單位：度，0°=正右方，順時針為正，跟 CSS/螢幕座標系一致）。
  // 預設 -90°（正上方），其餘選項依序沿順時針、平均分攤 360°。
  // 例如 2 個選項搭配 startAngle=180，會落在左（180°）／右（0°），可以做出
  // 舊版「寫死 left/right」一樣的排版，同時 6 個選項也不用另外設計版面。
  startAngle?: number;
}

const OFFSET = 56; // px，選項按鈕離中心點的距離

// 比賽期間快速操作用的圓形彈出選單：點在球場上的球員，選項會繞著他彈出來，
// 不用開選單、不用捲動列表，單手點一下就能記一球（見 pages/ScoreSheet.tsx 的
// 手勢流程：先選動作，再選得失分）。半透明背景擋住整個畫面，點背景視為取消。
export default function RadialMenu<T extends string>({
  center,
  options,
  onSelect,
  onCancel,
  startAngle = -90,
}: RadialMenuProps<T>) {
  const step = 360 / options.length;
  return (
    <div className="fixed inset-0 z-50 bg-black/10" onPointerDown={onCancel}>
      {options.map((opt, i) => {
        const angle = ((startAngle + i * step) * Math.PI) / 180;
        const dx = OFFSET * Math.cos(angle);
        const dy = OFFSET * Math.sin(angle);
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
