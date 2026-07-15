import { useState } from "react";
import { useParams } from "wouter";
import { useRotationTable } from "../hooks/useRotationTable";
import { useTacticsBoard } from "../hooks/useTacticsBoard";
import { useRoster, useSaveRoster } from "../hooks/useMatches";
import { MatchPlayer } from "../types/match";
import { isLineupComplete } from "../lib/rotationLogic";
import RotationSwitcher from "./RotationSwitcher";
import RosterEditDialog from "./RosterEditDialog";
import { useToast } from "../hooks/use-toast";

export default function RotationTable() {
  const { roster, setRoster, rotations, currentRotation, startingLiberoId } = useRotationTable();
  const resetCurrentRotationPositions = useRotationTable(
    (state) => state.resetCurrentRotationPositions,
  );
  const resetCurrentRotationTactics = useTacticsBoard((state) => state.resetCurrentRotationTactics);
  const clearMarkers = useTacticsBoard((state) => state.clearMarkers);
  const { id: matchId } = useParams<{ id: string }>();
  // 伺服器目前的名單，當作「儲存名單」時算差異（新增/修改/刪除哪些球員）的基準。
  const { players: serverRoster } = useRoster(Number(matchId));
  const saveRoster = useSaveRoster();
  const [isRosterDialogOpen, setIsRosterDialogOpen] = useState(false);
  const { toast } = useToast();

  // 球員名單同時要存進輪轉表自己的 roster（本地即時反映），也要回寫到後端。
  // 回寫用 diff：把新名單對伺服器現有名單比對，只送有變動的 create/patch/delete。
  //
  // 為什麼要 async/await 而不是原本的 void saveRoster(...)：
  // 原本不等待背景回寫的結果，寫入失敗（網路斷線、後端驗證錯誤等）會被無聲吞掉——
  // setRoster 已經讓畫面看起來「存好了」，但球員其實沒進資料庫，使用者完全不會發現。
  // 這裡改成 await，抓到錯誤時用 toast 提醒使用者，跟 MatchFormDialog.tsx 儲存失敗
  // 用的是同一套 useToast + destructive 樣式，不重複造一套新的錯誤提示模式。
  const handleRosterSave = async (players: MatchPlayer[]) => {
    // local-first：不管後端回寫成不成功，先讓畫面立刻反映使用者剛編輯的名單。
    setRoster(players);
    if (matchId) {
      try {
        await saveRoster(Number(matchId), serverRoster, players);
      } catch {
        toast({
          title: "名單儲存失敗",
          description: "球員名單尚未同步到伺服器，請稍後再試一次",
          variant: "destructive",
        });
      }
    }
  };

  // 「排好」= 至少一輪站滿 6 人（共用判定，跟計分表 hasLineup 同一條規則，見 issue #37）。
  const hasRotations = isLineupComplete(rotations);

  // 目前輪次場上的球員 id，用來在名單上標示「已上場」。
  const onCourtIds = new Set(rotations[currentRotation].positions.map((p) => p.playerId));

  // 「重置站位」要同時清空輪轉表（站位）跟戰術板（這個輪次的畫筆/自由站位）——
  // 兩個 store 各自只管自己的資料，由按下按鈕的這一刻各自呼叫一次，這就是我們說好的
  // 「資料用傳輸的」：不是互相偷看對方內部，而是外層明確呼叫兩邊。
  // 這個動作沒有 undo，點錯會直接清空——用瀏覽器內建的 window.confirm() 擋一下，
  // 跟 MatchList.tsx / TournamentDetail.tsx 刪除比賽/賽事時用的是同一套簡單彈窗模式。
  const handleResetRotation = () => {
    if (!window.confirm("確定要重置目前輪次的站位嗎？此動作無法復原。")) return;
    resetCurrentRotationPositions();
    resetCurrentRotationTactics();
  };

  return (
    <div className="flex flex-col h-full bg-[#f8f8f8]">
      <div className="p-4 overflow-y-auto flex-1 space-y-5">
        {/* 球員名單：可拖到球場（輪轉視圖吸附格子；戰術視圖+布置模式自由放置） */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-[15px] font-bold">球員設定</h2>
            <button
              onClick={() => setIsRosterDialogOpen(true)}
              className="wobbly-border bg-white px-2 py-0.5 text-xs font-bold hover:bg-gray-100"
              data-testid="button-edit-roster"
            >
              編輯
            </button>
          </div>
          <div className="space-y-1">
            {roster.length === 0 && (
              <p className="text-xs text-gray-500">尚未設定球員，點右上角「編輯」新增</p>
            )}
            {roster.map((p) => (
              <div
                key={p.id}
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/plain", p.id)}
                className={`flex items-center gap-2 text-sm cursor-grab active:cursor-grabbing wobbly-border px-1.5 py-1 ${
                  p.role === "L"
                    ? "bg-red-100"
                    : onCourtIds.has(p.id)
                      ? "bg-[#CCFF00]/30"
                      : "bg-white"
                }`}
                data-testid={`roster-row-${p.id}`}
              >
                {/* L 用紅色區分，其他用灰色 */}
                <span
                  className={`w-8 text-right text-xs font-bold ${p.role === "L" ? "text-red-600" : "text-gray-600"}`}
                >
                  {p.role}
                </span>
                <span className="w-8 text-gray-500">{p.number}</span>
                <span className="flex-1">{p.name}</span>
                {/* 狀態顯示跟一般球員統一，不再用按鈕手動切換先發：
                    已上場（含 L）沿用同一個「已上場」標籤；
                    L 沒上場但被指定為先發（在球場備位區等待）則顯示「備位」，
                    要變成先發只要把它拖到球場後排（Court.tsx 的 placePlayerOnCourt 會自動同步 startingLiberoId）。 */}
                {onCourtIds.has(p.id) ? (
                  <span className="text-[10px] text-gray-500">已上場</span>
                ) : (
                  p.role === "L" &&
                  p.id === startingLiberoId && (
                    <span className="text-[10px] text-[#FF6B00] font-bold">備位</span>
                  )
                )}
              </div>
            ))}
          </div>
        </section>

        {/* 輪次選擇：6 個縮圖 + 重置/清除按鈕 */}
        {hasRotations && (
          <section>
            <h2 className="font-display mb-1 text-[15px] font-bold">輪次選擇</h2>
            <RotationSwitcher />
            <div className="flex gap-2 mt-1">
              <button
                onClick={handleResetRotation}
                className="flex-1 wobbly-border bg-white px-2 py-1 text-xs font-bold hover:bg-gray-100"
              >
                重置站位
              </button>
              <button
                onClick={clearMarkers}
                className="flex-1 wobbly-border bg-white px-2 py-1 text-xs font-bold hover:bg-red-100 text-red-600"
              >
                清除畫筆
              </button>
            </div>
          </section>
        )}
      </div>

      {/* Tips Section */}
      <div className="p-3 border-t-2 border-[#111] bg-white">
        <details className="group">
          <summary className="font-display cursor-pointer font-bold outline-none marker:content-[''] text-sm">
            <span className="group-open:hidden">👉 新手提示 (Tips)</span>
            <span className="hidden group-open:inline">👇 隱藏提示</span>
          </summary>
          <ul className="mt-2 text-xs space-y-1 list-disc pl-4 text-gray-700">
            <li>輪轉視圖：把球員從名單拖到球場，會自動吸附到最近的號位，6 個輪次同步推算</li>
            <li>戰術視圖 + 布置模式：自由拖放，只影響目前輪次，不受格子限制</li>
            <li>切換輪次後自動回到輪轉視圖</li>
            <li>在右側面板選工具後點擊球場畫圖</li>
          </ul>
        </details>
      </div>

      <RosterEditDialog
        open={isRosterDialogOpen}
        onOpenChange={setIsRosterDialogOpen}
        roster={roster}
        onSave={handleRosterSave}
      />
    </div>
  );
}
