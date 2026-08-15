import { useState } from "react";
import type { Tactic } from "@workspace/api-client-react";
import { useRotationTable } from "../hooks/useRotationTable";
import { useRosterEditor } from "../hooks/useRosterEditor";
import { useRotationStepper } from "../hooks/useRotationStepper";
import { useTacticsBoard } from "../hooks/useTacticsBoard";
import { MatchPlayer } from "../types/match";
import { filterLineupToRoster, isLineupFull } from "../lib/rotationLogic";
import type { LineupZones } from "../types/scoresheet";
import { PRIMARY_BTN_CLASS, SECONDARY_BTN_CLASS } from "../lib/tacticsBoardStyles";
import type { useTacticsBoardController } from "../hooks/useTacticsBoardController";
import RotationRailPanel from "./RotationRailPanel";
import RosterEditDialog from "./RosterEditDialog";
import TacticsBoardPanel from "./TacticsBoardPanel";

// ── 戰術板右欄 v2（issue #331）── mode B（browse，含唯讀檢視）的整條右欄。
//
// 取代原本 TacticsBoard.tsx 直接疊 RotationTable + TacticsBoardPanel 的兩塊堆疊版面
//（那正是 #331 的病根：對半分的 flex-1/flex-1 高度跟兩邊實際需要多少完全無關，745px
// 視窗下上半只分到 320px、內容卻要 392px，於是「重置先發／清除畫筆」兩顆整個沉在摺線下。
// #324 曾把這個症狀誤判成 z-index bug，其實是捲出視野——見 RotationTable.tsx 舊版註解）。
//
// 設計稿（claude.ai/design「戰術版風格2.0」專案 explorations/tactics-rail-v2.html，
// 規範見 tactics-rail-v2-spec.md）把兩塊改成**分頁籤**：站位／戰術不再上下爭同一段高度，
// 清單一律吃剩餘空間，最小 176px（≈4 列，見 RotationRailPanel.tsx 的 rosterList="fill"）。
// 動作按鈕移到欄底常駐 footer，永遠在摺線之上——這是解決「按鈕捲出視野」最直接的作法。
//
// ⚠️ 這份設計稿只畫了 mode B 的四種狀態（一般／戰術/唯讀檢視/空板），**沒有涵蓋 mode D
// （佈陣中，TacticsRosterPanel.tsx）**。mode D 繼續用 RotationTable.tsx 的 RotationPanel，
// 完全不受這次改版影響——它還需要「清除畫筆」（清掉白板上的畫筆/防守範圍，是佈陣中唯一
// 能清畫筆的地方，mode C 的工具軌才有另一顆同名鈕），這條票的設計稿沒有考慮到這件事，
// 貿然把「清除畫筆」從共用的 RotationControlsFooter 拿掉會讓 mode D 直接少一個功能。
// 這裡選擇的做法是：RotationControlsFooter.tsx 完全不動，這條新右欄的「重置先發」
// 自己重新用同一段 confirm 文案直接呼叫 resetPositions，不透過那個共用元件。
interface TacticsBoardRailProps {
  matchId: string | null;
  controller: ReturnType<typeof useTacticsBoardController>;
  openNewTactic: () => void;
}

const EMPTY_ROSTER: MatchPlayer[] = [];
const EMPTY_LINEUP: LineupZones = {};

// footer 常駐按鈕的共用尺寸（spec §5：高 32、radius 7、action 500）——跟 lib/tacticsBoardStyles.ts
// 既有的 PRIMARY_BTN_CLASS／SECONDARY_BTN_CLASS（只給顏色/邊框，不含尺寸）疊加使用，
// 那兩個常數本來就是設計成给不同尺寸的呼叫端共用色彩語彙，不是每次都要重新定義一份。
const FOOTER_BTN_SIZE =
  "flex h-8 w-full items-center justify-center whitespace-nowrap text-action font-medium disabled:cursor-not-allowed disabled:opacity-40";

type Tab = "station" | "tactics";

// 兩顆分頁籤 class 只差在「是不是選中的那顆」，抽成函式避免同一段條件式抄兩遍
// （self-review 抓到的重複程式碼：站位／戰術兩顆按鈕原本各自寫一份幾乎一樣的 template
// literal，改個顏色要記得改兩處）。
const tabButtonClass = (selected: boolean) =>
  `flex h-[30px] flex-1 items-center justify-center gap-1.5 rounded-lg text-action transition ${
    selected
      ? "bg-[#c6f135] font-bold text-[#0a0b07]"
      : "border border-white/[0.08] bg-white/[0.03] font-medium text-[#a9b096] hover:text-[#f5f5f0]"
  }`;

export default function TacticsBoardRail({
  matchId,
  controller,
  openNewTactic,
}: TacticsBoardRailProps) {
  const [activeTab, setActiveTab] = useState<Tab>("station");

  const viewingScene = useTacticsBoard((s) => s.viewingScene);
  const enterEditFromViewing = useTacticsBoard((s) => s.enterEditFromViewing);

  // 名單/站位/目前輪次/先發 L 都存在「這一場」的分片裡（issue #119），matchId 為 null
  // （空板）時整段給空白預設值——見下面「站位」分頁 body 的判斷，這種情況根本不會
  // 渲染 RotationRailPanel，這裡的空殼只是讓 hook 呼叫順序保持穩定（React hooks 規則：
  // 不能因為 matchId 有沒有值就跳過某個 hook）。
  const data = useRotationTable((state) => (matchId ? state.dataByMatch[matchId] : undefined));
  const roster = data?.roster ?? EMPTY_ROSTER;
  const lineup = filterLineupToRoster(data?.lineup ?? EMPTY_LINEUP, roster);
  const rosterEditor = useRosterEditor(matchId ?? undefined);
  const { currentRotation, onStep } = useRotationStepper(matchId ?? undefined);
  const resetPositions = useRotationTable((state) => state.resetPositions);

  // 「重置先發」——文案跟確認邏輯照抄 RotationControlsFooter.tsx 那顆（見上面檔頭說明，
  // 這裡不能沿用那個元件本身，因為它綁死了「跟清除畫筆並排」的版面，這條新 footer
  // 只要一顆滿版鈕）。
  const handleResetRotation = () => {
    if (!matchId) return;
    if (!window.confirm("確定要重置先發嗎？六個輪次的站位會一起清空，此動作無法復原。")) return;
    resetPositions(matchId);
  };

  // 清單「編輯」圖示鈕：載入這張戰術的唯讀快照，緊接著直接升級成可編輯 session——
  // 等同使用者自己「先點這張戰術看唯讀檢視、再按球場右上角的編輯鈕」兩步,這裡收成一步。
  // enterEditFromViewing() 用 get() 讀當下 store 狀態（見 useTacticsBoard.ts），
  // handleSelectTactic 裡的 loadProject 是同步的 zustand set()，所以緊接著呼叫看得到
  // 剛寫入的 viewingScene，不需要等下一次 render。
  const handleEditTactic = (t: Tactic) => {
    controller.handleSelectTactic(t);
    enterEditFromViewing();
  };

  const tacticsCount = controller.tactics.length;

  return (
    <div className="flex h-full flex-col">
      {/* header：分頁籤，spec §7 三層結構的第一層。 */}
      <div className="flex shrink-0 flex-col gap-2.5 px-3 pt-2.5">
        <div className="flex items-center gap-1.5" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "station"}
            onClick={() => setActiveTab("station")}
            data-testid="button-rail-tab-station"
            className={tabButtonClass(activeTab === "station")}
          >
            站位
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "tactics"}
            onClick={() => setActiveTab("tactics")}
            data-testid="button-rail-tab-tactics"
            className={tabButtonClass(activeTab === "tactics")}
          >
            戰術
            <span className="text-micro opacity-70">{tacticsCount}</span>
          </button>
        </div>
        <div className="h-px bg-white/[0.08]" />
      </div>

      {/* body：flex:1 + min-h-0，唯一可捲區在裡面（spec §7 第二層）。兩個分頁都渲染在這裡，
        用 hidden 而不是條件渲染切換——「站位」分頁裡的 RotationRailPanel 帶著拖放的暫時
        UI 狀態（selectedZone/dragOverZone），切去戰術分頁再切回來不該把那些狀態砍掉重練。 */}
      <div className="flex min-h-0 flex-1 flex-col px-3 py-4">
        <div className={`flex min-h-0 flex-1 flex-col ${activeTab === "station" ? "" : "hidden"}`}>
          {matchId ? (
            <RotationRailPanel
              readOnly
              // mode B 的球場沒有 session 接得住拖曳（見 RotationTable.tsx 舊版
              // benchDraggable 說明），清單拖了也沒反應，所以關掉。
              benchDraggable={false}
              lineup={isLineupFull(lineup) ? lineup : null}
              roster={roster}
              rotation={currentRotation}
              onStep={onStep}
              compactStepper
              title=""
              showLiberoCell
              liberoId={data?.startingLiberoId ?? null}
              // 不傳 liberoReplacesPlayerId：#425 之後賽前不記頂替對象，輪轉表 store 裡
              // 已經沒有這個欄位（那一格會顯示「尚未指定頂替對象」，就是實話——見
              // RotationTable.tsx 同一輪改動的說明）。
              rosterList="fill"
              listHeader={
                <div className="mt-4 flex shrink-0 items-center justify-between">
                  <h2 className="text-micro font-bold uppercase tracking-wide text-[#a9b096]">
                    球員名單 · 可拖上場
                  </h2>
                  <button
                    type="button"
                    onClick={rosterEditor.open}
                    data-testid="button-edit-roster"
                    className="flex h-5 shrink-0 items-center rounded border border-white/[0.12] px-2 text-micro text-[#a9b096] transition hover:text-[#f5f5f0]"
                  >
                    編輯
                  </button>
                </div>
              }
            />
          ) : (
            // 空板（#372）：不畫空的六宮格——六個空格子會讓人以為可以點進去排人（spec §1）。
            // 改成一段說明＋名單區的空狀態，動作列（下面 footer）位置保留、按鈕停用。
            <div className="flex min-h-0 flex-1 flex-col gap-4">
              <div className="shrink-0 rounded-lg border border-dashed border-white/[0.13] p-3 text-caption leading-relaxed text-[#a9b096]">
                還沒選比賽——上方可以選一場借名單與最後輪轉站位，或直接從右側工具軌拖位置上場。
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-2">
                <h2 className="shrink-0 text-micro font-bold uppercase tracking-wide text-[#a9b096]">
                  球員名單
                </h2>
                <div className="flex-1 rounded-lg border border-dashed border-white/[0.13] p-3 text-caption leading-relaxed text-[#a9b096]">
                  選了比賽之後，名單會出現在這裡，可直接拖到球場上。
                </div>
              </div>
            </div>
          )}
        </div>

        <div className={`flex min-h-0 flex-1 flex-col ${activeTab === "tactics" ? "" : "hidden"}`}>
          <TacticsBoardPanel
            tactics={controller.tactics}
            onSelectTactic={controller.handleSelectTactic}
            onEditTactic={handleEditTactic}
            onRenameTactic={controller.handleRenameTactic}
            onDeleteTactic={controller.handleDeleteTactic}
          />
        </div>
      </div>

      {/* footer：常駐動作列，永遠在摺線之上（spec §7 第三層）——這是這一輪要解決的核心
        問題。內容依「哪個分頁」×「戰術分頁是不是在看唯讀檢視」決定，兩個分頁的按鈕
        意義完全不同，不能共用同一顆。 */}
      <div className="flex shrink-0 gap-1.5 border-t border-white/[0.08] px-3 py-2.5">
        {activeTab === "station" ? (
          <button
            type="button"
            onClick={handleResetRotation}
            disabled={!matchId}
            data-testid="button-reset-rotation"
            title="清空上方輪轉表的先發（六個號位），不會動到白板上的戰術"
            className={`${FOOTER_BTN_SIZE} ${SECONDARY_BTN_CLASS}`}
          >
            重置先發
          </button>
        ) : viewingScene ? (
          <button
            type="button"
            onClick={enterEditFromViewing}
            data-testid="button-edit-viewing-tactic"
            className={`${FOOTER_BTN_SIZE} ${PRIMARY_BTN_CLASS}`}
          >
            編輯這張戰術
          </button>
        ) : (
          <button
            type="button"
            onClick={openNewTactic}
            data-testid="button-enter-layout-mode"
            className={`${FOOTER_BTN_SIZE} ${PRIMARY_BTN_CLASS}`}
          >
            ＋ 新增戰術
          </button>
        )}
      </div>

      <RosterEditDialog
        open={rosterEditor.isOpen}
        onOpenChange={rosterEditor.onOpenChange}
        roster={rosterEditor.roster}
        onSave={rosterEditor.handleSave}
      />
    </div>
  );
}
