import { cn } from "@/lib/utils";

export interface RadialMenuOption<T extends string> {
  value: T;
  label: string;
  // 反灰：這個選項仍佔一個固定方位、照樣畫出來，但灰掉、點了沒反應。用來做情境過濾
  // （見 ScoreSheet.tsx 的 disabledActions）——刻意「灰掉」而不是「拿掉」，是為了讓
  // 六個動作永遠在同樣的方位，記錄者可以靠肌肉記憶按方位（呼應節奏遊戲手感）。
  disabled?: boolean;
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
    // bg-black/40：計分表換成深色球場背景後，選單彈出時要跟底下忙碌的球場拉開視覺
    // 焦距，原本淺色主題用的 bg-black/10 太淡，深色底幾乎看不出「選單開著」的感覺。
    <div className="fixed inset-0 z-50 bg-black/40" onPointerDown={onCancel}>
      {options.map((opt, i) => {
        const angle = ((startAngle + i * step) * Math.PI) / 180;
        const dx = OFFSET * Math.cos(angle);
        const dy = OFFSET * Math.sin(angle);
        return (
          <button
            key={opt.value}
            onPointerDown={(e) => {
              // 一律 stopPropagation（連反灰的也是）：不讓這個點擊冒泡到背景的 onCancel，
              // 所以點到反灰選項時選單不會關掉、什麼都不做，使用者可以接著點旁邊有效的那顆。
              e.stopPropagation();
              if (!opt.disabled) onSelect(opt.value);
            }}
            // 退役手繪風（wobbly-border + 硬邊陰影），改用跟計分表其餘按鈕同一套
            // 玻璃圓角語言（見 pages/ScoreSheet.tsx 的 SECONDARY_BUTTON_CLASS）。
            // 這是全站最後一個還在用 wobbly-border 的地方，換完之後 index.css 那個
            // class 就沒有消費者了（見清理那一步）。
            className={cn(
              "absolute -translate-x-1/2 -translate-y-1/2 rounded-full px-3 py-2 text-sm font-bold backdrop-blur-md transition active:scale-95",
              opt.disabled
                ? "cursor-not-allowed border border-white/[0.08] bg-white/[0.03] text-white/25"
                : "border border-white/[0.26] bg-white/[0.11] text-[#f5f5f0] shadow-lg shadow-black/30 hover:border-[#c6f135] hover:bg-[#c6f135]/20 hover:text-[#c6f135]",
            )}
            style={{ left: center.x + dx, top: center.y + dy }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
