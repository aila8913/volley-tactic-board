import { useParams } from "wouter";
import { useRotationTable } from "../hooks/useRotationTable";
import { useRosterEditor } from "../hooks/useRosterEditor";
import { useRotationStepper } from "../hooks/useRotationStepper";
import { MatchPlayer } from "../types/match";
import { filterLineupToRoster, isLineupFull } from "../lib/rotationLogic";
import type { LineupSnapshot } from "../types/scoresheet";
import RotationRailPanel from "./RotationRailPanel";
import RosterEditDialog from "./RosterEditDialog";
import RotationControlsFooter from "./RotationControlsFooter";

// 這一場還沒有分片資料時用的空白預設值。定義在模組層（不是每次 render 新建）是為了保持
// 參照穩定：roster/lineup 是 useMemo/依賴陣列跟 zustand selector 會比對的值，每 render
// 換一個新物件會造成不必要的重繪，甚至跟 effect 互踩成迴圈。
const EMPTY_ROSTER: MatchPlayer[] = [];
const EMPTY_LINEUP: LineupSnapshot = {};

// 小按鈕共用樣式（編輯/重置站位/清除畫筆），跟比賽列表那邊的次要按鈕是同一套語言，
// 只是尺寸縮小配合這裡的資訊密度。
const PANEL_BUTTON_CLASS =
  "rounded-lg border border-white/[0.26] bg-white/[0.05] px-2 py-1 text-xs " +
  "font-bold text-[#f5f5f0] transition hover:border-[#c6f135] hover:text-[#c6f135]";

interface RotationPanelProps {
  matchId: string | undefined;
}

// 這裡以前還有一個 showTips prop，掛著 mode B 專屬的「👉 新手提示 (Tips)」摺疊區塊。
// 2026-08-11 PO 決定拿掉，換空間給上面的名單／按鈕，兩個理由：
//
//   1. 它是右欄空間的主要競爭者。Tips 是 flex 的兄弟節點、佔掉固定一段高度，把上面
//      `overflow-y-auto` 那塊擠到 745px 視窗下只剩 320px（內容 392px）——名單只露 3 列、
//      「重置站位／清除畫筆」兩顆整個沉在摺線下。#324 就是因此被誤開成一張「按鈕被蓋住」
//      的 bug（實際是捲出視野），根因併進 #331 追。
//   2. 內容本身已經過期。四條裡有兩條在講「輪轉視圖」——正是 #328 要退役的那個沒有名字、
//      沒有切換入口的遺留畫面。教學文案指著一個要拆掉的東西，留著只會誤導。
//
// 需要新手引導的話那是另一件事（該做在第一次進頁的 onboarding，不是常駐佔一塊版面），
// 不在這次的範圍。

// mode B（沒在編）跟 mode D（佈陣中）共用的輪轉/名單面板本體——issue #251 這一輪發現
// 兩個 mode 需要的組合幾乎一模一樣（同一顆 RotationRailPanel、同一組 footer 按鈕），
// 差別只在「matchId 從哪裡來」：mode B（這個檔案的 default export）自己用 useParams
// 讀路由；mode D（TacticsRosterPanel.tsx）的 matchId 是 TacticsBoard.tsx 已經算好、
// 用 prop 傳進來的。與其兩邊各自拼一份幾乎相同的 JSX，不如把「拼裝」這件事抽成這個
// 吃 matchId prop 的元件，兩個檔案各自只負責「怎麼拿到 matchId」。
//
// Tips 區塊拿掉之後（見上面 RotationPanelProps 的說明），兩個 mode 的差別只剩 matchId
// 從哪來——這層包裝現在幾乎是純轉發，但先留著：#328／#331 都會再動這一帶的版面，
// 等那兩張落地、確定兩邊真的不會再長出差異了再談要不要合併。
export function RotationPanel({ matchId }: RotationPanelProps) {
  // 名單/站位/目前輪次/先發 L 現在都存在「這一場」的分片裡（issue #119），統一從
  // dataByMatch[matchId] 讀；那場還沒任何資料時給空白預設值。
  const data = useRotationTable((state) => (matchId ? state.dataByMatch[matchId] : undefined));
  const roster = data?.roster ?? EMPTY_ROSTER;
  // 只收「還在名單上」的號位（幽靈站位清理），要不要顯示則交給 isLineupFull 這道獨立的
  // 門檻——這兩件事以前綁在 captureLineupFromRotations 一支函式裡，#231 PR3 拆開了。
  const lineup = filterLineupToRoster(data?.lineup ?? EMPTY_LINEUP, roster);
  // 「編輯球員名單」彈窗開關 + 存檔邏輯，issue #251 抽成共用 hook（見該檔案開頭的說明）：
  // 這裡跟 mode D 的 TacticsRosterPanel 各自呼叫同一份邏輯，維持 mode B 原本的行為不變。
  const rosterEditor = useRosterEditor(matchId);
  // 「上一輪/下一輪」按了要做的副作用（見該 hook 開頭的說明：從舊的 RotationSwitcher
  // 抽出來，UI 改交給 RotationRailPanel 自己內建的 stepper 畫）。
  const { currentRotation, onStep } = useRotationStepper(matchId);

  return (
    <div className="flex h-full flex-col font-dash">
      <div className="flex-1 overflow-y-auto">
        {/* ── 輪轉表：戰術板改唯讀（issue #154 的「單向不回寫」在 UI 上的具體表現）──
          RotationRailPanel 是計分頁跟戰術板共用的同一顆元件（issue #120），這裡用
          readOnly 開它：戰術板是白板，只負責「讀」共用的先發真相來畫球場，不能從這裡
          「寫」回去——真的要排先發，得去計分頁排（那邊在開賽前是可編輯的）。lineup 直接就是
          store 裡那一份先發（#231 PR3 之後 store 存的本來就是號位版），不再需要「從座標
          算回號位」那層翻譯，兩邊天生是同一份資料、不可能兜不起來。
          benchDraggable 則是另一件事（見 RotationRailPanel 的 prop 註解）：格子唯讀
          不代表清單也不能動，把球員拖到球場本來就是這個 repo 一直允許的互動。 */}
        <RotationRailPanel
          readOnly
          benchDraggable
          lineup={isLineupFull(lineup) ? lineup : null}
          roster={roster}
          rotation={currentRotation}
          onStep={onStep}
          // 第七格（#327）在戰術板是**唯讀顯示**：ADR-0001 訂死戰術板不從右欄改先發，
          // 自由球員也適用同一條——沒有 onLiberoChange，這一格就只是「目前 L 頂替誰」的
          // 對照資訊。在此之前這裡連 L 是誰都看不到（清單把 role "L" 整個濾掉了），
          // 教練畫戰術時完全不知道場上那個位置站的是誰。
          showLiberoCell
          liberoId={data?.startingLiberoId ?? null}
          liberoReplacesPlayerId={data?.liberoReplacesPlayerId ?? null}
          footer={
            <div className="mt-4 space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-panel-title font-bold">球員名單</h2>
                <button
                  onClick={rosterEditor.open}
                  className={PANEL_BUTTON_CLASS}
                  data-testid="button-edit-roster"
                >
                  編輯
                </button>
              </div>

              {/* 輪次重置/清除畫筆：issue #251 抽成 RotationControlsFooter 元件（見該檔案
                開頭的說明），mode D 的 TacticsRosterPanel 也共用同一個元件，不重複貼一份
                邏輯。原本這裡另外自畫的「上/下一輪」按鈕已經被上面 RotationRailPanel 自己
                內建的 stepper 取代，不再需要 RotationControlsFooter 額外畫一份。 */}
              {matchId && <RotationControlsFooter matchId={matchId} />}
            </div>
          }
        />
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

// mode B（沒在編）的右欄輪轉/名單面板：自己從路由讀 matchId——這是這個檔案原本唯一的
// 職責，維持原檔名/預設匯出不變，這樣 TacticsBoard.tsx 等既有呼叫端不用跟著改 import。
export default function RotationTable() {
  const { id: matchId } = useParams<{ id: string }>();
  return <RotationPanel matchId={matchId} />;
}
