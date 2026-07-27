import { useEffect, useState } from "react";
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

  // 進場彈出動畫：選單一開，所有按鈕先疊在中心點（transform 只有置中、opacity:0），
  // 下一影格才把 mounted 翻成 true、transform 換成各自的最終方位——CSS transition
  // 只會補間「有變化」的兩個狀態，如果第一次 render 就直接套用最終位置，中間沒有
  // 前後差異可以補，畫面會像瞬間出現而不是彈出來。用 requestAnimationFrame 而不是
  // useState(true) 初始值，就是為了確保瀏覽器先畫出「疊在中心點」那一幀。
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    // bg-black/40：計分表換成深色球場背景後，選單彈出時要跟底下忙碌的球場拉開視覺
    // 焦距，原本淺色主題用的 bg-black/10 太淡，深色底幾乎看不出「選單開著」的感覺。
    <div
      className="fixed inset-0 z-50 bg-black/40 transition-opacity duration-150"
      style={{ opacity: mounted ? 1 : 0 }}
      onPointerDown={onCancel}
    >
      {options.map((opt, i) => {
        const angle = ((startAngle + i * step) * Math.PI) / 180;
        const dx = OFFSET * Math.cos(angle);
        const dy = OFFSET * Math.sin(angle);
        // spring 感的 easing：CSS 沒有真的物理彈簧曲線，這條 cubic-bezier 最後一段會
        // 略為超出終點再彈回來，視覺上接近彈簧回彈；每顆鈕的 transition-delay 依 index
        // 錯開 20ms，六顆鈕會依序「爆」出去，而不是同時瞬間到位。
        const springTransition = `transform 320ms cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 20}ms, opacity 200ms ease-out ${i * 20}ms`;
        return (
          // 這裡刻意拆成兩層：外層 <button> 只管「彈出動畫的位移」（inline transform，
          // 每顆鈕的目標位置是 JS 算出來的，只能用 inline style 動態指定，套用不了
          // Tailwind 的固定 class）；內層 <span> 管視覺樣式跟按下去的縮放回饋
          // （group-active:scale-95）。兩個 transform 各自獨立不衝突——如果全部疊在同一個
          // 元素上，inline style 的 transform 會整個蓋掉 Tailwind active:scale-95 想加的
          // scale，按下去的回饋就會消失。
          <button
            key={opt.value}
            onPointerDown={(e) => {
              // 一律 stopPropagation（連反灰的也是）：不讓這個點擊冒泡到背景的 onCancel，
              // 所以點到反灰選項時選單不會關掉、什麼都不做，使用者可以接著點旁邊有效的那顆。
              e.stopPropagation();
              if (!opt.disabled) onSelect(opt.value);
            }}
            className="group absolute rounded-full"
            style={{
              left: center.x,
              top: center.y,
              transform: mounted
                ? `translate(-50%, -50%) translate(${dx}px, ${dy}px)`
                : "translate(-50%, -50%) translate(0, 0)",
              opacity: mounted ? 1 : 0,
              transition: springTransition,
            }}
          >
            {/* 退役手繪風（wobbly-border + 硬邊陰影），改用跟計分表其餘按鈕同一套
              玻璃圓角語言（見 pages/ScoreSheet.tsx 的 SECONDARY_BUTTON_CLASS）。
              這是全站最後一個還在用 wobbly-border 的地方，換完之後 index.css 那個
              class 就沒有消費者了（見清理那一步）。 */}
            <span
              className={cn(
                "block rounded-full px-3 py-2 text-sm font-bold backdrop-blur-md transition-transform group-active:scale-95",
                opt.disabled
                  ? "cursor-not-allowed border border-white/[0.08] bg-white/[0.03] text-white/25"
                  : "border border-white/[0.26] bg-white/[0.11] text-[#f5f5f0] shadow-lg shadow-black/30 hover:border-[#c6f135] hover:bg-[#c6f135]/20 hover:text-[#c6f135]",
              )}
            >
              {opt.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
