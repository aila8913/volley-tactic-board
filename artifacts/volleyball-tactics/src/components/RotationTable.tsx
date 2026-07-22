import { useState } from "react";
import { useParams } from "wouter";
import { useRotationTable } from "../hooks/useRotationTable";
import { useTacticsBoard } from "../hooks/useTacticsBoard";
import { useRoster, useSaveRoster } from "../hooks/useMatches";
import { MatchPlayer } from "../types/match";
import type { RotationPositions } from "../types/rotationTable";
import { captureLineupFromRotations } from "../lib/rotationLogic";
import RotationSwitcher from "./RotationSwitcher";
import RotationRailPanel from "./RotationRailPanel";
import RosterEditDialog from "./RosterEditDialog";
import { useToast } from "../hooks/use-toast";

// 這一場還沒有分片資料時用的空白預設值。定義在模組層（不是每次 render 新建）是為了保持
// 參照穩定：roster/rotations 是 useMemo/依賴陣列跟 zustand selector 會比對的值，每 render
// 換一個新陣列會造成不必要的重繪，甚至跟 effect 互踩成迴圈。
const EMPTY_ROSTER: MatchPlayer[] = [];
const EMPTY_ROTATIONS: RotationPositions[] = Array(6)
  .fill(null)
  .map(() => ({ positions: [], liberoReplacement: null }));

// 小按鈕共用樣式（編輯/重置站位/清除畫筆），跟比賽列表那邊的次要按鈕是同一套語言，
// 只是尺寸縮小配合這裡的資訊密度。
const PANEL_BUTTON_CLASS =
  "rounded-lg border border-white/[0.26] bg-white/[0.05] px-2 py-1 text-xs " +
  "font-bold text-[#f5f5f0] transition hover:border-[#c6f135] hover:text-[#c6f135]";

export default function RotationTable() {
  const { id: matchId } = useParams<{ id: string }>();
  // 名單/站位/目前輪次/先發 L 現在都存在「這一場」的分片裡（issue #119），統一從
  // dataByMatch[matchId] 讀；那場還沒任何資料時給空白預設值。
  const data = useRotationTable((state) => (matchId ? state.dataByMatch[matchId] : undefined));
  const roster = data?.roster ?? EMPTY_ROSTER;
  const rotations = data?.rotations ?? EMPTY_ROTATIONS;
  const currentRotation = data?.currentRotation ?? 0;
  const startingLiberoId = data?.startingLiberoId ?? null;
  const setRoster = useRotationTable((state) => state.setRoster);
  const resetCurrentRotationPositions = useRotationTable(
    (state) => state.resetCurrentRotationPositions,
  );
  // 戰術白板改成單景 session 後（issue #154 PR C），沒有「常駐的第 N 輪畫筆」可清了：
  // 畫筆只在編輯中的 session 裡存在，所以「清除畫筆」改成清掉當前 session 的畫筆/防守範圍，
  // 沒在編輯（無 session）時停用。
  const session = useTacticsBoard((state) => state.session);
  const clearDrawings = useTacticsBoard((state) => state.clearDrawings);
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
    if (!matchId) return;
    // local-first：不管後端回寫成不成功，先讓畫面立刻反映使用者剛編輯的名單。
    setRoster(matchId, players);
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

  // 目前輪次場上的球員 id，用來在名單上標示「已上場」。
  const onCourtIds = new Set(rotations[currentRotation].positions.map((p) => p.playerId));

  // 「重置站位」清空輪轉表這一輪的站位。戰術白板單向化後（issue #154 PR C）已跟輪轉表脫鉤、
  // 也沒有常駐的每輪畫筆，所以這裡只動輪轉表自己的站位真相，不再連帶清白板。
  // 這個動作沒有 undo，點錯會直接清空——用瀏覽器內建的 window.confirm() 擋一下，
  // 跟 MatchList.tsx / TournamentDetail.tsx 刪除比賽/賽事時用的是同一套簡單彈窗模式。
  const handleResetRotation = () => {
    if (!matchId) return;
    if (!window.confirm("確定要重置目前輪次的站位嗎？此動作無法復原。")) return;
    resetCurrentRotationPositions(matchId);
  };

  return (
    <div className="flex h-full flex-col font-dash">
      <div className="flex-1 overflow-y-auto">
        {/* ── 輪轉表：戰術板改唯讀（issue #154 的「單向不回寫」在 UI 上的具體表現）──
          RotationRailPanel 是計分頁跟戰術板共用的同一顆元件（issue #120），這裡用
          readOnly 開它：戰術板是白板，只負責「讀」共用的先發真相來畫球場，不能從這裡
          「寫」回去——真的要排先發，得去計分頁排（那邊在開賽前是可編輯的）。lineup 用
          captureLineupFromRotations 從 rotations[0] 現算，不是另外存一份，這樣輪轉表
          本身（座標版）跟這裡顯示的（號位版）永遠是同一份資料的兩種呈現，不會兜不起來。 */}
        <RotationRailPanel
          readOnly
          lineup={captureLineupFromRotations(rotations, roster)}
          roster={roster}
          rotation={currentRotation}
          footer={
            <div className="mt-4 space-y-5">
              {/* 球員名單：可拖到球場（輪轉視圖吸附格子；戰術視圖+布置模式自由放置）。
                這段拖曳邏輯是 Court.tsx 用 dataTransfer 讀"text/plain"的來源，RotationRailPanel
                自己的球員清單沒有拖曳能力，所以繼續留在這裡、透過 footer 插進面板下方，
                不能拿掉，不然球員就沒辦法從名單拖上球場了。 */}
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-[15px] font-bold">球員設定</h2>
                  <button
                    onClick={() => setIsRosterDialogOpen(true)}
                    className={PANEL_BUTTON_CLASS}
                    data-testid="button-edit-roster"
                  >
                    編輯
                  </button>
                </div>
                <div className="space-y-1">
                  {roster.length === 0 && (
                    <p className="text-xs text-[#a9b096]">尚未設定球員，點右上角「編輯」新增</p>
                  )}
                  {roster.map((p) => (
                    <div
                      key={p.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("text/plain", p.id)}
                      className={`roster-row flex cursor-grab items-center gap-2 rounded-lg border px-1.5
                        py-1 text-sm shadow-sm shadow-black/20 backdrop-blur-lg active:cursor-grabbing ${
                          p.role === "L"
                            ? "border-[#ef4444]/40 bg-[#ef4444]/15"
                            : onCourtIds.has(p.id)
                              ? "border-[#c6f135]/40 bg-[#c6f135]/15"
                              : "border-white/[0.18] bg-white/[0.11]"
                        }`}
                      data-testid={`roster-row-${p.id}`}
                    >
                      {/* L 用紅色區分，其他用灰綠色 */}
                      <span
                        className={`w-8 text-right text-xs font-bold ${p.role === "L" ? "text-[#ef4444]" : "text-[#a9b096]"}`}
                      >
                        {p.role}
                      </span>
                      <span className="w-8 text-[#a9b096]">{p.number}</span>
                      <span className="flex-1">{p.name}</span>
                      {/* 狀態顯示跟一般球員統一，不再用按鈕手動切換先發：
                          已上場（含 L）沿用同一個「已上場」標籤；
                          L 沒上場但被指定為先發（在球場備位區等待）則顯示「備位」，
                          要變成先發只要把它拖到球場後排（Court.tsx 的 placePlayerOnCourt 會自動同步 startingLiberoId）。 */}
                      {onCourtIds.has(p.id) ? (
                        <span className="text-[10px] text-[#a9b096]">已上場</span>
                      ) : (
                        p.role === "L" &&
                        p.id === startingLiberoId && (
                          <span className="text-[10px] font-bold text-[#f5a623]">備位</span>
                        )
                      )}
                    </div>
                  ))}
                </div>
              </section>

              {/* 輪次選擇：RotationSwitcher（不是 RotationRailPanel 自帶的 stepper）。
                為什麼不把切輪次折進 RotationRailPanel：RotationSwitcher 身上背著「切輪次前
                若白板 session 有未存內容要先跳確認、確認後 discardSession/setCourtView 再切」
                這一串戰術白板才懂的副作用（見 RotationSwitcher.tsx），而 RotationRailPanel
                是純展示的共用元件、不該認識白板 session 是什麼。所以 onRotationChange 不傳給
                RotationRailPanel（它自己的 stepper 因此保持隱藏），改把既有的 RotationSwitcher
                原樣放進 footer——畫面上仍然只有一顆輪次切換控制，不會兩顆搶著切。

                issue #17 第 2 節：這裡以前包了一層 `{hasRotations && (...)}`，沒排滿 6 人就把
                整個「輪次選擇」區塊（含 RotationSwitcher）藏起來。解除這個鎖——輪次切換的
                用途是「預覽/繼續編輯別輪」，排到一半（例如只排了 3 個人）反而更需要切過去
                看看別輪、或是把還沒排的位置補齊，鎖住只會妨礙排陣過程本身，不是保護什麼。
                RotationSwitcher 本身也沒有任何「至少要排滿才能切」的前提（它只是改
                currentRotation 這個純數字），所以永遠渲染不會露出壞掉的畫面。

                「清除畫筆」按鈕：issue #17 原始描述以為它跟著 #154 一起變成死碼（呼叫的是
                已刪除的 resetCurrentRotationTactics），但實際讀過 useTacticsBoard.ts 後發現
                不是——它呼叫的是還活著的 clearDrawings（清掉目前白板 session 的 markers +
                defenseRanges，見該 store），只是沒有 session 時 disabled。所以這裡照實保留，
                沒有動它，只是跟著整個區塊一起解除外層的 hasRotations 鎖。 */}
              <section>
                <h2 className="mb-1 text-[15px] font-bold">輪次選擇</h2>
                <RotationSwitcher />
                <div className="mt-1 flex gap-2">
                  <button onClick={handleResetRotation} className={`flex-1 ${PANEL_BUTTON_CLASS}`}>
                    重置站位
                  </button>
                  <button
                    onClick={() => clearDrawings()}
                    disabled={!session}
                    title={session ? "清除白板上的畫筆與防守範圍" : "沒有正在編輯的戰術"}
                    className="flex-1 rounded-lg border border-white/[0.26] bg-white/[0.05] px-2 py-1
                      text-xs font-bold text-[#a9b096] transition hover:border-[#ef4444]
                      hover:bg-[#ef4444]/10 hover:text-[#ef4444] disabled:opacity-40
                      disabled:hover:border-white/[0.26] disabled:hover:bg-white/[0.05]
                      disabled:hover:text-[#a9b096]"
                  >
                    清除畫筆
                  </button>
                </div>
              </section>
            </div>
          }
        />
      </div>

      {/* Tips Section */}
      <div className="border-t border-white/[0.12] p-3">
        <details className="group">
          <summary className="cursor-pointer text-sm font-bold outline-none marker:content-['']">
            <span className="group-open:hidden">👉 新手提示 (Tips)</span>
            <span className="hidden group-open:inline">👇 隱藏提示</span>
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-[#a9b096]">
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
