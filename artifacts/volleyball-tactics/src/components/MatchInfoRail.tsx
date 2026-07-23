import { useEffect, useState } from "react";
import { Folder } from "lucide-react";
import RotationRailPanel from "@/components/RotationRailPanel";
import { useMatchList, useMatchWithRoster } from "@/hooks/useMatches";
import { useTournamentList } from "@/hooks/useTournaments";
import { useRotationTable } from "@/hooks/useRotationTable";
import { useScoreSheet, useScoreSheetController } from "@/hooks/useScoreSheet";
import { readLineupFromRotations } from "@/lib/rotationLogic";
import { getMatchWinner } from "@/lib/matchOutcome";
import type { LineupSnapshot } from "@/types/scoresheet";

// 比賽列表（MatchList）／資料夾內頁（TournamentDetail）共用的「選取」語意（issue #174）。
// 這兩個頁面的右欄內容完全一樣（同一個元件），差別只在資料夾內頁不會出現 kind:"tournament"
//（資料夾裡不會再有子資料夾）——型別不需要為此再拆一份，讓兩邊呼叫端各自決定要不要用到
// "tournament" 這個分支就好。
export type MatchListSelection = { kind: "tournament" | "match"; id: string } | null;

interface MatchInfoRailProps {
  selected: MatchListSelection;
}

// 右欄外層沿用 ScoreSheet.tsx 那套「深色玻璃右欄」樣式（issue #120 訂的色票，
// docs/design-spec.md 第 2 節）。寬度刻意不寫在這裡——AppShell 的 ASIDE_WIDTH 已經是唯一
// 寬度來源（見 AppShell.tsx 開頭「為什麼三欄骨架要收斂到一個檔案」的說明），這個元件只負責
// 「這一欄裡面長什麼樣」，多寫一次寬度只會製造「兩個地方各管一份數字」的老問題重演。
const RAIL_BASE_CLASS =
  "flex h-full flex-col border-l border-white/[0.10] bg-[#121310] font-dash text-[#F5F5F0]";

export default function MatchInfoRail({ selected }: MatchInfoRailProps) {
  // 這兩個 query 在 MatchList.tsx / TournamentDetail.tsx 本來就會呼叫一次——這裡再呼叫一次
  // 不會多打一次網路請求，React Query 用同一個 queryKey 直接共用快取，只是多訂閱一份而已。
  const { tournaments } = useTournamentList();
  const { matches } = useMatchList();

  // issue #174 明文決策：進頁面不自動選第一場，右欄預設是空狀態。理由是「使用者還沒表達
  // 意圖前，不該把某場比賽的站位放進可編輯狀態」——如果自動選第一場，教練隨手點進比賽列表
  // 看一眼，右欄卻已經是「可以直接改先發」的編輯模式，一個不小心點兩下就把第一場的站位
  // 動掉了，這種「沒有使用者動作卻進入可寫狀態」正是要避免的。
  if (selected === null) {
    return (
      <div className={`${RAIL_BASE_CLASS} items-center justify-center gap-1 px-4 text-center`}>
        <p className="text-sm text-[#9AA08C]">選一場比賽來排先發</p>
        <p className="text-xs text-[#9AA08C]/70">
          點一下左邊的卡片，這裡會出現可以直接排的場上站位
        </p>
      </div>
    );
  }

  if (selected.kind === "tournament") {
    const tournament = tournaments.find((t) => t.id === selected.id);
    const matchCount = matches.filter((m) => m.tournamentId === selected.id).length;
    return (
      <div className={`${RAIL_BASE_CLASS} gap-1 px-3 py-3`}>
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[#C6F135]/15 text-[#C6F135]">
            <Folder className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold">{tournament?.name ?? "資料夾"}</h2>
            <p className="text-xs text-[#9AA08C]">{matchCount} 場比賽</p>
          </div>
        </div>
        {/* TODO(issue #174 Stage B)：資料夾層級的跨場統計（例如這個資料夾裡整體勝率、
          球員上場時間矩陣之類）blocked on M2——那批統計欄位這裡故意不先發明，等 M2 把
          統計口徑訂出來後再補。Stage A 先只做「這是哪個資料夾、裡面幾場比賽」這個最基本
          的摘要佔位，讓右欄不會整個消失（issue 原文：「進資料夾後右欄就消失會很突兀」）。 */}
      </div>
    );
  }

  // kind === "match"：用 matchId 當 key 讓元件整個重新掛載——換一場比賽時，內部所有
  // local state（例如下面「目前滑到第幾局」）都應該重新從這場比賽的「目前這一局」開始看，
  // 而不是延續上一場選的局數。用 key remount 讓這件事自動發生，不用另外寫一個
  // useEffect(() => setXxx(初始值), [matchId]) 來手動同步——少一個「忘記把某個 state 也
  // 放進重置清單」的地雷。
  return (
    <div className={RAIL_BASE_CLASS}>
      <MatchRotationSection key={selected.id} matchId={selected.id} />
    </div>
  );
}

// 拆成獨立元件（而不是把下面這些 hook 直接放進 MatchInfoRail 本體）是必要的，不是隨手拆分：
// useMatchWithRoster / useScoreSheetController 這些 hook 一定要「無條件呼叫」（React hooks
// 規則），但 matchId 只有 selected.kind === "match" 時才存在。如果硬要在 MatchInfoRail 本體
// 呼叫這些 hook，selected 是空狀態或資料夾時就得餵它們一個假的 matchId（例如 "0"），還要
// 額外處理「enabled: false」——每個 hook 呼叫都要記得加這個旗標，忘記一個就會在空狀態時
// 對不存在的比賽發出多餘的請求。拆成子元件之後，這個元件只在 kind === "match" 時才會被
// 掛載，元件存在期間 matchId 保證有值，內部完全不用處理「沒有選中比賽」這個分支。
function MatchRotationSection({ matchId }: { matchId: string }) {
  const { match } = useMatchWithRoster(Number(matchId));

  const setRoster = useRotationTable((state) => state.setRoster);
  const rotations = useRotationTable((state) => state.dataByMatch[matchId]?.rotations);
  const setLineupFromSnapshot = useRotationTable((state) => state.setLineupFromSnapshot);

  const record = useScoreSheet((state) => state.recordingsByMatch[matchId]);
  // 只借用 controller 的「進頁重建」副作用（見 hooks/useScoreSheet.ts 開頭的架構說明）：
  // 呼叫它就會把這場比賽後端的 sets/rallies/lineups 重建進 recordingsByMatch[matchId]，
  // 下面才讀得到 completedSets 各局的先發快照。這裡不需要它回傳的 start/score/undo 等
  // 動作（右欄不記分、不開局），只用 isHydrating 讓標題列有個「載入中」的提示。
  const { isHydrating } = useScoreSheetController(matchId);

  // ── 名單種進共用 store ──
  // 從沒被開啟過的比賽（沒進過計分頁/戰術板），useRotationTable.dataByMatch[matchId] 是空的
  // （roster: []），右欄會沒有球員可排。這裡補上：選中一場比賽時，把 useMatchWithRoster 抓到
  // 的名單種進共用 store。
  //
  // 為什麼這裡不會踩「zustand ref-stable writes in effect actions」那個無限迴圈的坑（見專案
  // memory）：坑的成因是「effect 依賴的物件每次 render 都是新參照 → effect 每次都重跑 →
  // setRoster 又觸發訂閱它的元件重繪 → 又進到這個 effect」。這裡的依賴是 `match`（不是
  // `match.players` 這種每次都 new 出來的子物件），而 useMatchWithRoster 內部用 useMemo 把
  // `match` 釘在 [matchQuery.data, playersQuery.data] 這兩個 React Query 的 data 參照上
  // （見 hooks/useMatches.ts 的註解）——只要後端資料沒有真的變，`match` 這個參照在重繪之間
  // 是穩定的，effect 就不會被無意義地重複觸發。setRoster 本身也是 zustand action，同一個
  // store 存活期間永遠是同一個函式參照，不會讓依賴陣列每次都判定「變了」。
  useEffect(() => {
    if (match) setRoster(matchId, match.players);
  }, [matchId, match, setRoster]);

  // ── 局軸：目前滑到第幾局（0-indexed）──
  // null 代表「跟著目前這一局走」（預設行為，配 key remount 用，見上方 MatchInfoRail 的說明：
  // 換一場比賽會整個重新掛載，這裡永遠是從 null 開始，也就是一開始一定停在目前這一局）。
  // 使用者按過 stepper 之後才會變成一個具體數字，代表「使用者主動選了要看哪一局，先別自動
  // 跟著換局往前跳」——這跟 RotationRailPanel 那邊 onStep 的職責分工一致：元件只回報方向，
  // 「局是線性有邊界」這條領域規則（第一局不能再往前、不能超過已完成局數+1）由這裡判斷。
  const [manualSetIndex, setManualSetIndex] = useState<number | null>(null);

  const completedSets = record?.completedSets ?? [];
  // 「整場比賽是不是已經打完」用勝隊判、不是用局數判（issue #174 明文決策）——2:0 也可能已經
  // 結束（例如三戰兩勝，或教練提早封存），單看「打了幾局」猜不出來；getMatchWinner 只看
  // 「贏了幾局」，才不會被賽制或提早封存誤導。
  const isMatchFinished = getMatchWinner(completedSets) !== null;
  // 「已完成局數 + 1」＝目前這一局（可能還在打、也可能還沒開賽），這是使用者能滑到的上界。
  const totalSets = completedSets.length + 1;
  // 局是線性有邊界的（跟輪轉的「輪」是環狀不同）：夾在 [0, totalSets-1] 之間，manualSetIndex
  // 是 null 時預設看最新一局。
  const clampedIndex = Math.min(Math.max(manualSetIndex ?? totalSets - 1, 0), totalSets - 1);

  let lineup: LineupSnapshot | null;
  let readOnly: boolean;
  let onLineupChange: ((next: LineupSnapshot) => void) | undefined;

  if (clampedIndex < completedSets.length) {
    // 滑到「已經打完的某一局」：讀那一局封存當下的先發快照，純粹看歷史、不能改
    // （改了也沒意義——那一局早就打完了，改站位不會讓已經發生的比賽重新來過）。
    lineup = completedSets[clampedIndex].lineup;
    readOnly = true;
  } else if (isMatchFinished) {
    // 整場已經打完：不管滑到「目前這局」時它有沒有資料（可能是還沒開打就被判定已經贏了的
    // 空局，教練沒有按「下一局」封存它），都一律唯讀——比賽結束了，不該再從這裡改任何站位。
    lineup = record?.lineup ?? null;
    readOnly = true;
  } else if (record?.lineup) {
    // 目前這局已經開賽（局中凍結，跟 ScoreSheet.tsx 的 activeLineup 是同一條規則）：
    // 已經開始記分的局，站位要跟開賽當下凍結的那一份綁在一起，中途改會讓歷史跟站位對不上，
    // 要調整陣容得走換人，不能直接在這裡動先發。
    lineup = record.lineup;
    readOnly = true;
  } else {
    // 目前這局還沒開賽：讀全站共用的「現役站位」（useRotationTable，#120 PO 定案的唯一真相），
    // 可以直接在這裡編輯——跟 ScoreSheet.tsx 開賽前那段是同一份資料、同一套寫法，教練在
    // 這裡排先發，計分頁/戰術板立刻看到同一份結果，不是各自一份副本。
    //
    // 用 readLineupFromRotations（照實回報幾個人）而不是 captureLineupFromRotations
    // （不滿 6 人回 null）：這一格是「編輯中的顯示」，必然會經過 1~5 人的中間狀態。
    // 原本接錯成把關用的那支，導致排第一個人時面板讀回 null 整個變空，看起來就是
    // 「點了放不上去」——完整說明見 rotationLogic.ts 兩支函式的註解。
    lineup = readLineupFromRotations(rotations ?? [], match?.players ?? []);
    readOnly = false;
    onLineupChange = (next) => setLineupFromSnapshot(matchId, next);
  }

  return (
    <RotationRailPanel
      lineup={lineup}
      roster={match?.players ?? []}
      rotation={clampedIndex}
      axis="set"
      readOnly={readOnly}
      onLineupChange={onLineupChange}
      onStep={(delta) =>
        setManualSetIndex(Math.min(Math.max(clampedIndex + delta, 0), totalSets - 1))
      }
      canStepPrev={clampedIndex > 0}
      canStepNext={clampedIndex < totalSets - 1}
      title={isHydrating ? "場上站位（載入中…）" : "場上站位"}
    />
  );
}
