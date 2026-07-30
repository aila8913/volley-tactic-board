import { ComponentType, useState } from "react";
import { useTacticsBoard, ToolType } from "../hooks/useTacticsBoard";
import TacticsRosterPanel from "./TacticsRosterPanel";
import { PRIMARY_BTN_CLASS, SECONDARY_BTN_CLASS } from "../lib/tacticsBoardStyles";
import ToolSelectIcon from "./icons/ToolSelectIcon";
import ToolArrowIcon from "./icons/ToolArrowIcon";
import ToolDashedIcon from "./icons/ToolDashedIcon";
import ToolTextIcon from "./icons/ToolTextIcon";
import ToolVolleyballIcon from "./icons/ToolVolleyballIcon";
import ToolCircleIcon from "./icons/ToolCircleIcon";
import ToolEllipseIcon from "./icons/ToolEllipseIcon";
import ToolFanIcon from "./icons/ToolFanIcon";
import ToolRosterIcon from "./icons/ToolRosterIcon";
import ToolDeleteIcon from "./icons/ToolDeleteIcon";

// issue #176（layout-spec 環 5）：mode C（戰術編輯）專用的 132px 工具軌，取代原本編輯時
// 塞在 288px aside 裡的 TacticsEditPanel。
//
// 跟 TacticsEditPanel 最大的差異是「窄」：aside 是 288px 寬、放得下兩欄按鈕＋文字說明；
// 這裡只有 132px（AppShell 的 TOOLS_WIDTH），放不下橫排文字按鈕，所以整條軌改成「單字
// 方鈕直排」——視覺語彙抄左欄 NavRail 的收合態按鈕（h-11 w-11、方形、單字），道理一樣：
// 這是這一環的重點「編輯時只看球場」，工具軌本身要越不搶戲越好，跟 NavRail 收合態同一種
// 「符號當入口」的克制風格才不會兩側互相打架。
//
// 這一環刻意「不做」的兩件事（PO 拍板，見任務說明）：
//   1. 防守範圍的屬性編輯器（透明度/顏色/半徑/長短軸/旋轉/扇形角度整塊滑桿）直接砍掉，
//      圓/橢/扇工具本身留著、能畫能刪，畫出來吃預設值就好——不需要每次都能微調。
//   2. 戰術名稱輸入框／「切換到別張戰術」清單先不放：132px 放不下標準輸入框，改名走
//      browse 模式那條路（先取消回瀏覽，在那裡的清單改名），不在這裡重做一份。
//
// 繪圖工具的正式圖示（issue #176 剩餘項目）：每顆圖示都照對應功能在球場上實際畫出來的
// 樣子設計（見各 icons/Tool*Icon.tsx 檔案自己的說明），不是隨便挑好看的符號——例如
// ToolDashedIcon 真的用虛線畫。版位本來就設計成「以後只換字、不動結構」，所以這次只換了
// <span> 裡的內容，沒有動按鈕本身的 class/尺寸/排列順序。
//
// 原本另外有一顆「攻擊線」（attack）工具，跟「實線箭頭」只差在線更粗一點，tang 實際看過
// 兩顆圖示後覺得使用者分不太出來、留一顆就好，所以拿掉了——ToolType 本身、Markers.tsx
// 的 attack 渲染都還在（舊戰術裡如果已經畫了 attack 線，讀出來還是要能顯示），只是工具軌
// 不再提供新增這個工具的入口。
interface TacticsEditToolRailProps {
  matchId: string;
  onSave: () => void;
  onSaveAs: () => void;
  onCancel: () => void;
  saving: boolean;
  savingAs: boolean;
}

// 繪圖工具跟防守範圍工具都用同一顆「單一圖示方鈕」元件，圖示放在這張表裡——之後只要
// 改這張表就能換圖示/順序，不用動下面的渲染邏輯（跟 AppShell.tsx 的 MODES 查表是同一種
// 「規則跟渲染分開」的技巧）。存的是元件參照（Icon）不是先組好的 JSX，避免每次 map 都
// 重新建立元素。
const DRAW_TOOLS: { tool: ToolType; Icon: ComponentType<{ className?: string }>; label: string }[] =
  [
    { tool: "select", Icon: ToolSelectIcon, label: "選取移動" },
    { tool: "arrow", Icon: ToolArrowIcon, label: "實線箭頭" },
    { tool: "dashed", Icon: ToolDashedIcon, label: "虛線路徑" },
    { tool: "text", Icon: ToolTextIcon, label: "文字" },
    { tool: "volleyball", Icon: ToolVolleyballIcon, label: "排球" },
  ];

const RANGE_TOOLS: {
  tool: ToolType;
  Icon: ComponentType<{ className?: string }>;
  label: string;
}[] = [
  { tool: "circle", Icon: ToolCircleIcon, label: "圓形防守範圍" },
  { tool: "ellipse", Icon: ToolEllipseIcon, label: "橢圓防守範圍" },
  { tool: "fan", Icon: ToolFanIcon, label: "扇形防守範圍" },
];

export default function TacticsEditToolRail({
  matchId,
  onSave,
  onSaveAs,
  onCancel,
  saving,
  savingAs,
}: TacticsEditToolRailProps) {
  const session = useTacticsBoard((s) => s.session);
  const activeTool = useTacticsBoard((s) => s.activeTool);
  const setActiveTool = useTacticsBoard((s) => s.setActiveTool);
  const removeMarker = useTacticsBoard((s) => s.removeMarker);
  const removeDefenseRange = useTacticsBoard((s) => s.removeDefenseRange);
  const selectedObjectId = useTacticsBoard((s) => s.selectedObjectId);
  const undo = useTacticsBoard((s) => s.undo);
  const redo = useTacticsBoard((s) => s.redo);

  // 「換球員」浮層開關——純粹是這條工具軌自己的暫時 UI 狀態（開/關一塊浮層），不需要讓
  // 其他元件知道，所以用 local useState，不進 Zustand store（store 是給跨元件共用的狀態
  // 用的，這個開關只有這個元件自己在乎）。
  const [rosterOpen, setRosterOpen] = useState(false);

  const handleTool = (tool: ToolType) => setActiveTool(tool);

  // 單一圖示方鈕的共用樣式：跟 TacticsEditPanel 既有的 toolBtnClass 用同一套色票語彙
  //（選中＝萊姆綠底＋深色字），只是形狀從「兩欄橫排、文字說明」改成「單一方塊、單一圖示」。
  // 圖示用 stroke="currentColor"，選中/hover 時顏色會跟著 text-* 一起變，不用額外處理。
  const squareBtnClass = (active: boolean) =>
    `flex h-11 w-11 items-center justify-center rounded-lg border text-sm font-bold transition ${
      active
        ? "border-[#c6f135] bg-[#c6f135] text-[#0a0b07]"
        : "border-white/[0.26] bg-white/[0.05] text-[#f5f5f0] hover:border-[#c6f135] hover:text-[#c6f135]"
    }`;

  const handleDeleteSelected = () => {
    if (!selectedObjectId) return;
    // 選中的物件到底是畫筆標記還是防守範圍，這條軌不知道（也不需要知道）——兩個 remove
    // 都是「id 對不上就是 no-op」，直接兩個都呼叫，跟 TacticsEditPanel 原本的 handleDelete
    // 是同一招。
    removeMarker(selectedObjectId);
    removeDefenseRange(selectedObjectId);
  };

  return (
    // 外層：relative（給「換球員」浮層的 absolute 定位當基準）＋ h-full 撐滿 AppShell 分配的
    // TOOLS_WIDTH 欄位高度。**這一層刻意不設任何 overflow**——原因見下面內層捲動容器的說明。
    <div className="relative flex h-full flex-col font-dash">
      {/* 內層：真正負責「按鈕太多、螢幕太矮時可以上下捲」的容器。捲動一定要放在這一層、
          不能放外層，因為 CSS 有個陷阱：當 overflow-y 設成 auto、overflow-x 留 visible 時，
          規範會把 overflow-x 也強制算成 auto——於是整個容器兩軸都變成裁切區。「換球員」浮層
          是往左（right-full＝超出這一欄左緣）飛出去的，一旦掛在有 overflow 的容器裡就會被
          裁掉、整塊看不到。把捲動關進內層、讓外層保持不裁切，浮層掛外層就安全了。
          flex-1 吃滿外層剩餘高度，讓下段存檔區的 mt-auto 仍能貼到欄位最底。 */}
      <div className="flex flex-1 flex-col items-center gap-3 overflow-y-auto py-3">
        {/* ── 上段：繪圖工具 ── */}
        <div className="flex flex-col items-center gap-1.5">
          {DRAW_TOOLS.map(({ tool, Icon, label }) => (
            <button
              key={tool}
              type="button"
              title={label}
              aria-label={label}
              onClick={() => handleTool(tool)}
              data-testid={`tool-rail-${tool}`}
              className={squareBtnClass(activeTool === tool)}
            >
              <Icon className="size-5" />
            </button>
          ))}
        </div>

        <div className="h-px w-8 bg-white/[0.14]" />

        <div className="flex flex-col items-center gap-1.5">
          {RANGE_TOOLS.map(({ tool, Icon, label }) => (
            <button
              key={tool}
              type="button"
              title={label}
              aria-label={label}
              onClick={() => handleTool(tool)}
              data-testid={`tool-rail-${tool}`}
              className={squareBtnClass(activeTool === tool)}
            >
              <Icon className="size-5" />
            </button>
          ))}
        </div>

        <div className="h-px w-8 bg-white/[0.14]" />

        {/* 「換」＝球員名單浮層開關，是 toggle（按下去切換一個持續性狀態），跟上面「選一種
          工具」語意不同，但視覺上沿用同一顆方鈕、用同一套 active 樣式表示「現在開著」，
          使用者不用學兩套視覺語言。
          （原本這裡還有一顆「號位標示」開關，tang 覺得這功能不必要，已經整顆拿掉——連帶
          labelToggles/toggleLabel 這個 store 欄位、Court.tsx 畫號位數字的區塊都一起刪了，
          它本來就是重整頁面就歸零、不存進戰術檔的暫時性 UI 狀態，砍掉沒有相容性問題。） */}
        <div className="flex flex-col items-center gap-1.5">
          <button
            type="button"
            title="球員名單"
            aria-label="球員名單"
            aria-pressed={rosterOpen}
            onClick={() => setRosterOpen((v) => !v)}
            data-testid="tool-rail-toggle-roster"
            className={squareBtnClass(rosterOpen)}
          >
            <ToolRosterIcon className="size-5" />
          </button>
        </div>

        <div className="h-px w-8 bg-white/[0.14]" />

        {/* undo/redo + 刪除選取：跟 TacticsEditPanel 原本的 disabled 條件完全一致，只是排版
          從「橫排在畫筆工具區塊的標題列」改成獨立一小群方鈕。 */}
        <div className="flex flex-col items-center gap-1.5">
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => undo()}
              disabled={!session || session.historyIndex <= 0}
              title="Undo (Ctrl+Z)"
              data-testid="tool-rail-undo"
              className={`flex h-11 w-5 items-center justify-center text-xs disabled:opacity-50 ${SECONDARY_BTN_CLASS}`}
            >
              ↩
            </button>
            <button
              type="button"
              onClick={() => redo()}
              disabled={!session || session.historyIndex >= session.history.length - 1}
              title="Redo (Ctrl+Y)"
              data-testid="tool-rail-redo"
              className={`flex h-11 w-5 items-center justify-center text-xs disabled:opacity-50 ${SECONDARY_BTN_CLASS}`}
            >
              ↪
            </button>
          </div>
          <button
            type="button"
            onClick={handleDeleteSelected}
            disabled={!selectedObjectId}
            title="刪除選取標記 (Del)"
            data-testid="tool-rail-delete-selected"
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-white/[0.26]
            bg-white/[0.05] text-xs font-bold text-[#ef4444] transition hover:border-[#ef4444]
            hover:bg-[#ef4444]/10 disabled:opacity-50"
          >
            <ToolDeleteIcon className="size-5" />
          </button>
        </div>

        {/* ── 下段：存檔動作，貼底 + 明顯間距/分隔跟上面隔開，避免手滑誤觸 ── */}
        {/* mt-auto 把這一整塊推到欄位最下面；pt-4 + border-t 是「明顯間距/分隔」的具體做法：
          光留空白使用者可能以為只是排版空隙，加一條線才會意識到「這裡是另一群、比較危險
          （會真的送出請求）的按鈕」。 */}
        <div className="mt-auto flex flex-col items-center gap-1.5 border-t border-white/[0.14] pt-4">
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            title="儲存"
            data-testid="tool-rail-save"
            className={`flex h-11 w-11 items-center justify-center text-sm font-bold disabled:opacity-50 ${PRIMARY_BTN_CLASS}`}
          >
            存
          </button>
          <button
            type="button"
            onClick={onSaveAs}
            disabled={savingAs}
            title="另存新檔"
            data-testid="tool-rail-save-as"
            className={`flex h-11 w-11 items-center justify-center text-sm font-bold disabled:opacity-50 ${SECONDARY_BTN_CLASS}`}
          >
            另
          </button>
          <button
            type="button"
            onClick={onCancel}
            title="取消"
            data-testid="tool-rail-cancel"
            className={`flex h-11 w-11 items-center justify-center text-sm font-bold ${SECONDARY_BTN_CLASS}`}
          >
            取
          </button>
        </div>
      </div>
      {/* 內層捲動容器到此結束；下面的浮層刻意留在外層（不裁切）——見外層/內層的說明。 */}

      {/* ── 「換球員」浮層：從工具軌往左飛出，蓋在球場右緣上方 ── */}
      {/* right-full 讓浮層貼齊工具軌容器的左邊界往外（往球場方向）展開，而不是往右邊視窗
          外飛出去；mr-2 留一點間距跟工具軌本身分開，視覺上明確是「另外飄出來的一塊」而
          不是工具軌變寬了。z-40 高於 TacticsBoard.tsx 各欄位的 z-10（見該檔案「2. backdrop」
          的說明），確保浮層蓋在球場之上、不會被壓在後面。
          直接重用 TacticsRosterPanel——它本來就是「純消費 matchId + session」的展示元件，
          不知道自己被放在 aside 裡還是浮層裡，不用另外寫一份。 */}
      {rosterOpen && (
        <div
          data-testid="tool-rail-roster-flyout"
          className="absolute right-full top-0 z-40 mr-2 w-72 rounded-xl border border-white/[0.14]
            bg-[#12140f]/97 p-3 shadow-2xl shadow-black/50 backdrop-blur-lg"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-bold text-[#a9b096]">拖曳球員上下場</span>
            <button
              type="button"
              onClick={() => setRosterOpen(false)}
              title="關閉"
              data-testid="tool-rail-roster-flyout-close"
              className="px-1.5 text-xs font-bold text-[#a9b096] hover:text-[#c6f135]"
            >
              ×
            </button>
          </div>
          <TacticsRosterPanel matchId={matchId} />
        </div>
      )}
    </div>
  );
}
