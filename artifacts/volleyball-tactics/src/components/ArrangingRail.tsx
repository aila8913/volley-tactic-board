import type { Match } from "../types/match";
import { useRotationTable } from "../hooks/useRotationTable";
import { useRosterEditor } from "../hooks/useRosterEditor";
import { useRotationStepper } from "../hooks/useRotationStepper";
import { useTacticsBoard } from "../hooks/useTacticsBoard";
import { filterLineupToRoster } from "../lib/rotationLogic";
import { formatMatchDateTime } from "../lib/matchSummary";
import { PRIMARY_BTN_CLASS } from "../lib/tacticsBoardStyles";
import PositionPalette from "./PositionPalette";
import MiniCourtRotation from "./MiniCourtRotation";
import ArrangingRosterList from "./ArrangingRosterList";
import RosterEditDialog from "./RosterEditDialog";

// mode D（佈陣中）的整條右欄——issue #420（header ＋ 佈陣右欄 v3）新元件，取代原本
// TacticsBoard.tsx 裡「永遠顯示 PositionPalette、matchId 有值再疊 TacticsRosterPanel」的
// 拼裝寫法。三層結構跟瀏覽模式的 TacticsBoardRail.tsx（issue #331）呼應：rhead／rbody／
// rfoot，但這是完全不同的模式（佈陣 vs 瀏覽），不是它的第三個分頁——兩者刻意不共用元件。
//
// ⚠️ mode C（編輯中）的球員名單浮層（TacticsEditToolRail.tsx 的 rosterOpen 那塊）**沒有**
// 被這次改版動到，仍然直接重用舊的 TacticsRosterPanel／RotationTable.tsx／
// RotationRailPanel／RotationControlsFooter 那一整串——這份設計稿只畫了 mode D 的四種
// 狀態，沒有涵蓋 mode C 的浮層，貿然把那條鏈路一起換掉、卻沒有稿子可以對，風險太高。
//
// 「清除畫筆」／「編輯名單」這兩個功能，設計稿沒有安排位置（舊版透過 RotationControlsFooter
// 提供，那顆元件被留給 mode C 繼續用，這裡不重用）。這裡的判斷是把它們放進「球員名單」
// 區塊的標題列，兩顆小 ghost 鈕——不進 rfoot（那裡照 spec 只留「確定」一顆主要出口，
// 塞進次要動作正是 spec 明講要拆掉的 header 縮小版問題）也不進 rhead（那裡只放狀態）。
interface ArrangingRailProps {
  matchId: string | null;
  match: Match | undefined;
}

export default function ArrangingRail({ matchId, match }: ArrangingRailProps) {
  const session = useTacticsBoard((s) => s.session);
  const clearDrawings = useTacticsBoard((s) => s.clearDrawings);
  const confirmArrangement = useTacticsBoard((s) => s.confirmArrangement);

  const data = useRotationTable((state) => (matchId ? state.dataByMatch[matchId] : undefined));
  const roster = data?.roster ?? [];
  const lineup = filterLineupToRoster(data?.lineup ?? {}, roster);
  const rosterEditor = useRosterEditor(matchId ?? undefined);
  const { currentRotation, onStep } = useRotationStepper(matchId ?? undefined);

  // 「確定」能不能按：場上（白板 session）一個人都還沒放，就沒有東西可以確定——跟有沒有
  // 選比賽無關，選了比賽但還沒拖任何人上場，一樣不成立（spec §4：「沒有東西可以確定」）。
  const hasAnyoneOnCourt = (session?.snapshot.players.length ?? 0) > 0;

  // 名單裡誰已經在白板上了——用來讓 ArrangingRosterList 把那些人降階顯示。sourcePlayerId
  // 對真人來說就是 MatchPlayer.id（見 useTacticsBoard.ts 開頭「兩種來源都保證 sourcePlayerId
  // 非 null」的說明），匿名調色盤籌碼的 id 是 "anon-<role>-<uuid>"，天生對不上任何 roster.id，
  // 不用另外過濾掉。
  const onCourtPlayerIds = new Set(
    session?.snapshot.players
      .map((p) => p.sourcePlayerId)
      .filter((id): id is string => id !== null) ?? [],
  );

  return (
    <div className="flex h-full flex-col">
      {/* rhead：狀態 kicker（萊姆綠圓點 + ARRANGING）＋ 比賽主詞。這份資訊在球場左上角的
        浮層也會出現一次（見 TacticsBoard.tsx）——刻意的冗餘，球場那份給遠距離確認，
        這份給操作時的上下文，兩者不是同一顆元件（這裡是純顯示，不能選比賽）。 */}
      <div className="flex shrink-0 flex-col gap-[5px] border-b border-white/[0.08] px-3.5 py-3">
        <div className="flex items-center gap-1.5">
          <span aria-hidden className="h-[5px] w-[5px] shrink-0 rounded-full bg-[#c6f135]" />
          <span className="font-label text-micro tracking-[0.18em] text-[#c6f135]">ARRANGING</span>
        </div>
        <div className="flex min-w-0 items-baseline gap-2">
          {match ? (
            <>
              <span className="shrink-0 text-micro text-[#a9b096]/60">VS</span>
              <span className="min-w-0 truncate font-dash text-display font-semibold tracking-[-0.02em]">
                {match.opponent}
              </span>
              <span className="shrink-0 font-label text-caption text-[#a9b096]">
                {formatMatchDateTime(match.dateTime)}
              </span>
            </>
          ) : (
            <span className="font-dash text-display font-semibold tracking-[-0.02em] text-[#a9b096]/85">
              未選比賽
            </span>
          )}
        </div>
      </div>

      {/* rbody */}
      <div className="flex min-h-0 flex-1 flex-col gap-[18px] px-3.5 pt-4">
        {!matchId ? (
          <>
            <div className="flex flex-col gap-2.5">
              <span className="font-label text-micro uppercase tracking-[0.18em] text-[#a9b096]/65">
                位置調色盤
              </span>
              <p className="text-caption leading-relaxed text-[#a9b096]">
                拖任一顆到球場放一個佔位圈。
                <span className="font-medium text-[#f5f5f0]">每顆可重複拖</span>
                ，場上能同時有兩個 OH。
              </p>
              <PositionPalette />
            </div>
            <div className="flex flex-col gap-2.5">
              <span className="font-label text-micro uppercase tracking-[0.18em] text-[#a9b096]/65">
                要用真人名單？
              </span>
              <p className="text-caption leading-relaxed text-[#a9b096]">
                上方主詞選一場比賽，這排籌碼會換成那場的球員名單。
              </p>
            </div>
          </>
        ) : (
          <>
            <MiniCourtRotation
              lineup={lineup}
              roster={roster}
              rotation={currentRotation}
              onStep={onStep}
              liberoId={data?.startingLiberoId ?? null}
            />
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <div className="flex shrink-0 items-center justify-between">
                <span className="font-label text-micro uppercase tracking-[0.18em] text-[#a9b096]/65">
                  球員名單 · 拖到球場
                </span>
                <div className="flex shrink-0 items-center gap-3">
                  <button
                    type="button"
                    onClick={() => clearDrawings()}
                    data-testid="button-clear-drawings"
                    className="text-micro text-[#a9b096] transition hover:text-[#ef4444]"
                  >
                    清除畫筆
                  </button>
                  <button
                    type="button"
                    onClick={rosterEditor.open}
                    data-testid="button-edit-roster"
                    className="text-micro text-[#a9b096] transition hover:text-[#f5f5f0]"
                  >
                    編輯
                  </button>
                </div>
              </div>
              <ArrangingRosterList roster={roster} onCourtPlayerIds={onCourtPlayerIds} />
            </div>
          </>
        )}
      </div>

      {/* rfoot：唯一的出口，永遠是同一個落點（跟瀏覽模式的常駐動作列同一個位置，見
        TacticsBoardRail.tsx）。佈陣幾乎都發生在右欄，動作結束在同一條欄的底部。 */}
      <div className="flex shrink-0 gap-1.5 border-t border-white/[0.08] px-3.5 py-3">
        <button
          type="button"
          onClick={confirmArrangement}
          disabled={!hasAnyoneOnCourt}
          data-testid="button-confirm-arrangement"
          className={`flex h-9 w-full items-center justify-center whitespace-nowrap text-action font-bold disabled:cursor-not-allowed disabled:bg-white/[0.06] disabled:text-[#a9b096]/50 disabled:shadow-none ${PRIMARY_BTN_CLASS}`}
        >
          確定
        </button>
      </div>

      {matchId && (
        <RosterEditDialog
          open={rosterEditor.isOpen}
          onOpenChange={rosterEditor.onOpenChange}
          roster={rosterEditor.roster}
          onSave={rosterEditor.handleSave}
        />
      )}
    </div>
  );
}
