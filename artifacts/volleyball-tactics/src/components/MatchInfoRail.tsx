import { useEffect, useState } from "react";
import { Folder } from "lucide-react";
import RotationRailPanel from "@/components/RotationRailPanel";
import MatchDetailView from "@/components/MatchDetailView";
import MatchDetailForm from "@/components/MatchDetailForm";
import { useMatchList, useMatchWithRoster } from "@/hooks/useMatches";
import { useTournamentList } from "@/hooks/useTournaments";
import { useTeamList } from "@/hooks/useTeams";
import { useRotationTable } from "@/hooks/useRotationTable";
import { useScoreSheet, useScoreSheetController } from "@/hooks/useScoreSheet";
import { useCrossMatchAnalysis } from "@/hooks/useCrossMatchAnalysis";
import { filterLineupToRoster } from "@/lib/rotationLogic";
import { getMatchWinner, setWinner, winsNeededFor, type MatchStatus } from "@/lib/matchOutcome";
import { visibleSetCount } from "@/lib/volleyballRules";
import { INFO_RAIL_BASE_CLASS } from "@/lib/appChromeStyles";
import { computeTournamentStats, type TournamentMatchResult } from "@/lib/tournamentSummary";
import type { LineupSnapshot, LineupZones } from "@/types/scoresheet";
import type { Match } from "@/types/match";

// 比賽列表（MatchList）／資料夾內頁（TournamentDetail）共用的「選取」語意（issue #174）。
// 這兩個頁面的右欄內容完全一樣（同一個元件），差別只在資料夾內頁不會出現 kind:"tournament"
//（資料夾裡不會再有子資料夾）——型別不需要為此再拆一份，讓兩邊呼叫端各自決定要不要用到
// "tournament" 這個分支就好。
//
// issue #329 加上 "new-match"：「新增比賽」不再開彈窗，而是把右欄直接開在一張空白編輯表單。
// 它得是選取的一種狀態（而不是另一個獨立的布林），因為它跟 "match"/"tournament" 是互斥的
// ——右欄同一時間只可能是其中一種樣子。tournamentId 帶在這裡，是為了讓「資料夾內頁按新增，
// 建好的比賽要歸進那個資料夾」這條規則跟著選取狀態走，不用再多接一條 prop。
export type MatchListSelection =
  | { kind: "tournament"; id: string }
  | { kind: "match"; id: string }
  | { kind: "new-match"; tournamentId: string | null }
  | null;

interface MatchInfoRailProps {
  selected: MatchListSelection;
  // 目前是不是編輯模式（issue #329）。狀態放在頁面層、不是這個元件內部，理由見
  // hooks/useMatchRailSelection.ts：「編輯」鈕長在左欄卡片上，跟右欄不在同一棵子樹。
  editing: boolean;
  onCancelEdit: () => void;
  onSaved: () => void;
  onCreated: (matchId: string) => void;
  onDirtyChange: (dirty: boolean) => void;
}

// 右欄外層樣式改從 lib/appChromeStyles 讀（原本這裡自己寫一份、跟另外兩個右欄字面相同）——
// 抽出去的理由跟材質決定都寫在那個檔案裡。寬度刻意不在這裡也不在那裡：AppShell 的
// ASIDE_WIDTH 已經是唯一寬度來源（見 AppShell.tsx 開頭的說明），這個元件只負責
// 「這一欄裡面長什麼樣」，多寫一次寬度只會製造「兩個地方各管一份數字」的老問題重演。
const RAIL_BASE_CLASS = INFO_RAIL_BASE_CLASS;

// 編輯模式時疊在外殼上的視覺提示（PO 指定：「底色變亮引起使用者注意，顯示在這邊編輯」）。
// 底色提亮一階 + 一圈內描邊的萊姆綠——#C6F135 是全站既有的主色（選中的號位、主要 CTA 都用它），
// 不為了這個狀態再發明一種新顏色。ring-inset 而不是 border：border 會改變盒模型讓內容位移
// 1px，切進編輯模式時整欄跳動一下很廉價；ring 畫在框內、不佔空間。
const EDITING_RAIL_CLASS = "bg-[#1A1C15]/85 ring-1 ring-inset ring-[#C6F135]/40";

export default function MatchInfoRail({
  selected,
  editing,
  onCancelEdit,
  onSaved,
  onCreated,
  onDirtyChange,
}: MatchInfoRailProps) {
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
        <p className="text-sm text-[#9AA08C]">選一場比賽</p>
        <p className="text-xs text-[#9AA08C]/70">
          點一下左邊的卡片，這裡會出現這場比賽的資料、名單與場上站位
        </p>
      </div>
    );
  }

  // issue #329：新增比賽——右欄直接開在一張空白表單，不需要先選中任何東西。
  // 這一支沒有比分、沒有站位可畫（比賽都還不存在），所以整欄就是表單本身。
  if (selected.kind === "new-match") {
    return (
      <div className={`${RAIL_BASE_CLASS} ${EDITING_RAIL_CLASS}`}>
        <MatchDetailForm
          match={null}
          tournamentId={selected.tournamentId}
          onCancel={onCancelEdit}
          onSaved={onSaved}
          onCreated={onCreated}
          onDirtyChange={onDirtyChange}
        />
      </div>
    );
  }

  if (selected.kind === "tournament") {
    const tournament = tournaments.find((t) => t.id === selected.id);
    const matchesInFolder = matches.filter((m) => m.tournamentId === selected.id);
    return (
      <div className={`${RAIL_BASE_CLASS} px-3 py-3`}>
        <div className="flex shrink-0 items-center gap-2">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[#C6F135]/15 text-[#C6F135]">
            <Folder className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold">{tournament?.name ?? "資料夾"}</h2>
            <p className="text-xs text-[#9AA08C]">{matchesInFolder.length} 場比賽</p>
          </div>
        </div>
        {/* issue #174 Stage B：資料夾層級的跨場戰績。拆成獨立元件（而不是直接在這裡算）
          是為了讓 useCrossMatchAnalysis 只在真的需要（選到資料夾時）才掛，跟 kind==="match"
          分支拆出 MatchDetailSection 的理由一樣。 */}
        <TournamentStatsSection matches={matchesInFolder} />
      </div>
    );
  }

  // kind === "match"：用 matchId 當 key 讓元件整個重新掛載——換一場比賽時，內部所有
  // local state（例如下面「目前滑到第幾局」）都應該重新從這場比賽的「目前這一局」開始看，
  // 而不是延續上一場選的局數。用 key remount 讓這件事自動發生，不用另外寫一個
  // useEffect(() => setXxx(初始值), [matchId]) 來手動同步——少一個「忘記把某個 state 也
  // 放進重置清單」的地雷。
  return (
    <div className={`${RAIL_BASE_CLASS} ${editing ? EDITING_RAIL_CLASS : ""}`}>
      <MatchDetailSection
        key={selected.id}
        matchId={selected.id}
        editing={editing}
        onCancelEdit={onCancelEdit}
        onSaved={onSaved}
        onDirtyChange={onDirtyChange}
      />
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
//
// issue #329 之後它同時扛「比賽資訊＋名單」跟「場上站位」兩件事（原本只有站位，資訊在彈窗），
// 所以從 MatchRotationSection 改名成 MatchDetailSection。
function MatchDetailSection({
  matchId,
  editing,
  onCancelEdit,
  onSaved,
  onDirtyChange,
}: {
  matchId: string;
  editing: boolean;
  onCancelEdit: () => void;
  onSaved: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { match } = useMatchWithRoster(Number(matchId));
  // 唯讀檢視要顯示球隊名字，但 Match 上存的只有 teamId。在這裡查好再傳下去，讓
  // MatchDetailView 維持純元件（見該檔案開頭的說明）。
  const { teams } = useTeamList();
  const teamName = teams.find((t) => t.id === match?.teamId)?.name ?? null;

  const setRoster = useRotationTable((state) => state.setRoster);
  const storedLineup = useRotationTable((state) => state.dataByMatch[matchId]?.lineup);
  const setLineupZones = useRotationTable((state) => state.setLineupZones);
  // 自由球員先發（#327）跟 lineup 存在同一份分片裡：它們是同一份「這場打算怎麼排」的兩半。
  // #425 之後這一半就只有「誰是先發 L」——他頂替誰是比賽中才成立的事實，不在賽前規劃裡。
  const startingLiberoId = useRotationTable(
    (state) => state.dataByMatch[matchId]?.startingLiberoId,
  );
  const setStartingLibero = useRotationTable((state) => state.setStartingLibero);

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
  // 賽制（#215）：跟 getMatchWinner 一樣不能再假設全站都是五戰三勝，用這場比賽自己的
  // format 換算「贏幾局才算贏」。match 可能還沒載入完（enabled=false 之類），這裡沒有
  // 額外兜底——match 尚未就緒時 isMatchFinished 提早算成 false 沒關係，下面各分支本來就
  // 有處理 match 未定義時的 fallback（例如 match?.players ?? []）。
  const isMatchFinished =
    match !== undefined && getMatchWinner(completedSets, winsNeededFor(match.format)) !== null;
  // 使用者能滑到幾格。規則本身（未完賽為什麼一定要 +1、已完賽為什麼不能無條件 +1、什麼時候
  // 例外要補回那一格）收在 lib/volleyballRules.ts 的 visibleSetCount()，分析頁右欄
  //（AnalyticsRotationRail）呼叫的是同一支（#352）。這裡以前跟那邊各自手寫一份相同的算式，
  // #349 修了那邊、漏了這裡，比賽列表右欄照樣顯示不存在的「第 4 局」。
  // 未完賽的那個 +1 是目前這一局：可能還在打，也可能還沒開賽而正等著在這裡排先發
  //（見下面第四個分支，那格是本頁唯一可編輯的格子）。
  const hasCurrentSetData = record?.currentSet != null && record.currentSet.serving !== null;
  const totalSets = visibleSetCount({
    completedSetCount: completedSets.length,
    hasCurrentSetData,
    isMatchFinished,
  });
  // 局是線性有邊界的（跟輪轉的「輪」是環狀不同）：夾在 [0, totalSets-1] 之間，manualSetIndex
  // 是 null 時預設看最新一局。
  const clampedIndex = Math.min(Math.max(manualSetIndex ?? totalSets - 1, 0), totalSets - 1);

  // 六個號位（面板只吃這張表，L 不在裡面——見 types/scoresheet.ts）。
  let lineup: LineupZones | null;
  let readOnly: boolean;
  let onLineupChange: ((next: LineupZones) => void) | undefined;
  // 第七格顯示用的 L 指派（#359）。跟 lineup 一樣沿著同一串 if/else 算：唯讀的局讀那一局
  // **封存快照裡的** L，可編輯的局讀共用現役真相（useRotationTable）。以前這兩個值無視分支、
  // 一律讀共用真相，所以 #359 之前只能在「還沒開賽」那一支顯示——把現在的 L 指派畫在三天前
  // 打完的局旁邊等於憑空宣稱那局是這樣配的。現在快照裡有這份資料了，才敢在歷史局顯示。
  let liberoId: string | null = null;
  let liberoReplaces: string | null = null;
  // #191/#192：跟 lineup/readOnly 一樣，狀態小藥丸跟比分要沿著同一條 if/else 分支算，
  // 不能另外重寫一份判斷式——不然兩份規則遲早會飄開（例如未來改了「已打完」的判定條件，
  // 卻只記得改 lineup 那一支，藥丸跟著顯示錯誤的狀態）。
  let setStatus: "historical" | "live" | "upcoming";
  let score: { our: number; opponent: number } | null;
  // 第七格（#327）預設不出現。#359 之前只有「還沒開賽的那一局」打得開；現在只要那一局的
  // 封存快照裡真的有排 L，歷史局／進行中的局也會打開（唯讀）。
  let showLiberoCell = false;

  // 三個唯讀分支各自讀到的那一局封存快照。收在一個變數裡，L 指派在整串 if/else 跑完之後
  // 統一取（見下方），不用在三個分支各抄一次同樣的三行。
  let frozenLineup: LineupSnapshot | null = null;

  // ⚠️ issue #329 的紅線：下面這串 if/else 是**站位**的領域規則（歷史局／局中凍結一律唯讀，
  // 只有還沒開賽的局才排得了先發），跟新的「編輯模式」是兩回事。`editing` 刻意完全不參與
  // 這段計算，也絕對不能接進 RotationRailPanel 的 readOnly——「按了編輯」管的是比賽資訊
  // 與球員名單，不是「讓已經打完的第 1 局可以重排先發」。這兩件事一旦混在一起，教練改個
  // 對手名字就能把打完的局的站位改掉，而且改了也不會反映在已經記錄的比分上。
  if (clampedIndex < completedSets.length) {
    // 滑到「已經打完的某一局」：讀那一局封存當下的先發快照，純粹看歷史、不能改
    // （改了也沒意義——那一局早就打完了，改站位不會讓已經發生的比賽重新來過）。
    frozenLineup = completedSets[clampedIndex].lineup;
    lineup = frozenLineup?.zones ?? null;
    readOnly = true;
    setStatus = "historical";
    score = {
      our: completedSets[clampedIndex].ourScore,
      opponent: completedSets[clampedIndex].opponentScore,
    };
  } else if (isMatchFinished) {
    // 整場已經打完，而且滑到的是「目前這局」。正常情況下只有那局真的記過分才滑得到這裡
    //（見 visibleSetCount() 的 hasCurrentSetData 例外）；例外是完賽卻連一局都沒有的資料異常，那時
    // 這格是唯一的一格。一律唯讀：比賽結束了，不該再從這裡改任何站位。
    frozenLineup = record?.lineup ?? null;
    lineup = frozenLineup?.zones ?? null;
    readOnly = true;
    setStatus = "historical";
    // 這局可能根本沒開球過（見上面註解的「空局」情況），這時 currentSet.serving 是 null，
    // 沒有比分可顯示——用 null 而不是硬湊 0:0，教練才不會誤以為這局真的打過。
    score =
      record?.currentSet && record.currentSet.serving !== null
        ? { our: record.currentSet.ourScore, opponent: record.currentSet.opponentScore }
        : null;
  } else if (record?.lineup) {
    // 目前這局已經開賽（局中凍結，跟 ScoreSheet.tsx 的 activeLineup 是同一條規則）：
    // 已經開始記分的局，站位要跟開賽當下凍結的那一份綁在一起，中途改會讓歷史跟站位對不上，
    // 要調整陣容得走換人，不能直接在這裡動先發。
    frozenLineup = record.lineup;
    lineup = frozenLineup.zones;
    readOnly = true;
    setStatus = "live";
    // record.lineup 存在代表這局已經選過先發方、正在進行，理論上 currentSet.serving
    // 一定不是 null；仍用同一條判斷式保底，serving 意外還是 null 時顯示 0:0 而不是憑空
    // 湊一個可能不準的比分。
    score =
      record.currentSet.serving !== null
        ? { our: record.currentSet.ourScore, opponent: record.currentSet.opponentScore }
        : { our: 0, opponent: 0 };
  } else {
    // 目前這局還沒開賽：讀全站共用的「現役站位」（useRotationTable，#120 PO 定案的唯一真相），
    // 可以直接在這裡編輯——跟 ScoreSheet.tsx 開賽前那段是同一份資料、同一套寫法，教練在
    // 這裡排先發，計分頁/戰術板立刻看到同一份結果，不是各自一份副本。
    //
    // 這裡照實回報現在排了幾個人（0~6），不套「不滿 6 人就當作沒有」那道門檻：這一格是
    // 「編輯中的顯示」，必然會經過 1~5 人的中間狀態。原本接錯成把關語意，導致排第一個人時
    // 面板讀回 null 整個變空，看起來就是「點了放不上去」——完整說明見 rotationLogic.ts 的
    // isLineupFull 註解。filterLineupToRoster 只負責濾掉已不在名單上的幽靈站位。
    lineup = filterLineupToRoster(storedLineup ?? {}, match?.players ?? []);
    readOnly = false;
    onLineupChange = (next) => setLineupZones(matchId, next);
    setStatus = "upcoming";
    score = null; // 還沒開賽，沒有分可看。
    // 自由球員先發格（#327）：這一支顯示的是「現役」的 L 指派（useRotationTable，跟先發
    // 同一份真相），而且是全 app 唯一排得了 L 先發的地方，所以無條件打開——即使還沒排任何
    // L（空的第七格＝「這裡可以排 L」的入口），跟唯讀分支「沒排就不畫」的判準相反。
    liberoId = startingLiberoId ?? null;
    // 可編輯這一支永遠沒有頂替對象可顯示（#425：賽前不記）。留著這行賦值是為了讓兩支分支
    // 都明確講一次自己給什麼，而不是靠「上面宣告時是 null」的預設值默默生效。
    liberoReplaces = null;
    showLiberoCell = true;
  }

  // 唯讀的三支：L 指派一律讀**那一局封存的快照**（#359 之後快照裡才有這份資料），不是讀
  // 共用的現役指派——後者是「現在打算怎麼配」，跟三天前那局實際怎麼配是兩回事。
  //
  // 為什麼「快照裡沒排 L 就整格不畫」而不是畫一個空格：#359 之前寫進 DB 的 lineup 通通沒有
  // 這兩欄（讀回來是 null），畫一個空的第七格等於對那些舊資料宣稱「這局沒有自由球員」——
  // 但事實是「不知道」。不畫只是少講一件事，不會講錯。
  if (readOnly) {
    liberoId = frozenLineup?.liberoId ?? null;
    liberoReplaces = frozenLineup?.replacesPlayerId ?? null;
    showLiberoCell = liberoId !== null;
  }

  // 站位面板在唯讀/編輯兩種模式下是**同一組 props**，只有球員清單的呈現方式不同
  // （唯讀時它就是那份合併後的名單；編輯時名單由表單接手，這裡整塊不畫）。抽成一個小
  // 函式而不是在兩個分支各寫一次 JSX：那十個 prop 抄兩份，之後改其中一個就會漏改另一份
  // ——這個 repo 已經因為「同一段邏輯兩份拷貝」吃過 #349/#351 那次虧。
  const renderRotationPanel = (rosterList: "fill" | "hidden") => (
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
      setStatus={setStatus}
      score={score}
      rosterList={rosterList}
      showLiberoCell={showLiberoCell}
      liberoId={liberoId}
      liberoReplacesPlayerId={liberoReplaces}
      onLiberoChange={(nextLiberoId) => setStartingLibero(matchId, nextLiberoId)}
    />
  );

  return (
    <>
      {/* issue #174 Stage B「統計格」：逐局藥丸，放在最上面。刻意只讀 completedSets
        （這個元件已經透過上面的 useScoreSheetController 重建過整場資料），不為此另外打一次
        API——這正是拆出 MatchDetailSection 的理由之一（見上方 MatchInfoRail 的說明），
        這裡本來就手上有整場已完成局的資料。
        completedSets 是空陣列時（連一局都還沒打完）整格不渲染：比賽都還沒開始，沒有
        局比分可以看，硬要畫一排空藥丸只是雜訊。比賽進行中也會顯示到這裡（只是少幾顆），
        這是刻意的——中途把已經打完的局藏起來反而奇怪，教練這時候更需要回顧前面幾局。 */}
      {completedSets.length > 0 && (
        <section
          className="shrink-0 border-b border-white/[0.10] px-3 py-3"
          data-testid="set-score-pills"
        >
          <h2 className="mb-2 text-sm font-bold text-[#F5F5F0]">各局比分</h2>
          {/* flex + flex-1（而不是 flex-wrap）：局數最多只有 5 局（五戰三勝上限），
            用 flex-1 讓每顆藥丸平分容器寬度，不管幾顆都剛好塞滿一整排，不會因為
            局數變多而擠出 aside 的寬度需要橫向捲動。 */}
          <div className="flex gap-1">
            {completedSets.map((set, index) => {
              // 顏色是這一局的勝負，不是文字——PO 原話「勝負用顏色表示」，藥丸本身
              // 就是結果，不再疊一層「勝/敗」文字或加總分數製造多餘資訊。
              const weWonThisSet = setWinner(set) === "us";
              return (
                <span
                  key={index}
                  className={`flex-1 rounded-full px-1 py-1 text-center text-caption font-bold tabular-nums ${
                    weWonThisSet
                      ? "bg-[#C6F135]/15 text-[#C6F135]"
                      : "bg-white/[0.06] text-[#9AA08C]"
                  }`}
                >
                  {set.ourScore}:{set.opponentScore}
                </span>
              );
            })}
          </div>
        </section>
      )}

      {/* ── 模組順序（PO 2026-08-09 定案）──
        比賽資訊 → 場上站位 → 第幾局 → 球員名單，**唯讀跟編輯兩種模式完全相同**。
        「第幾局」的 stepper 跟球員清單都長在 RotationRailPanel 內部（那份清單原本只是
        「拖誰上場」的來源），所以這裡看起來只有兩塊。

        關鍵的一刀：右欄以前畫了兩份同樣的球員名單——MatchDetailView 一份唯讀的、
        RotationRailPanel 底下一份可拖曳的。合併成一份之後，那份清單同時是「這場比賽
        有誰」跟「把誰拖上號位」；按了編輯才換成 MatchDetailForm 裡可增刪的版本
        （所以那時面板傳 rosterList="hidden"，同一份東西不會同時畫兩次）。

        編輯模式下站位面板是**塞進表單裡面**的（lineupSlot），不是接在表單下方——
        理由見 MatchDetailForm 那個 prop 的註解：就地編輯的重點就是模組不會換位置。 */}
      {editing ? (
        // match 還沒載回來就先不渲染表單：defaultValues 只會被讀一次（見 MatchDetailForm
        // 的說明），拿一份還是 undefined 的資料去初始化，表單會停在空白且再也不會補上。
        match === undefined ? (
          <div className="min-h-0 flex-1 px-3 py-3 text-xs text-[#9AA08C]">載入比賽資料…</div>
        ) : (
          <MatchDetailForm
            match={match}
            tournamentId={match.tournamentId}
            onCancel={onCancelEdit}
            onSaved={onSaved}
            // 編輯既有比賽不會走到「新增成功」這條路，但 prop 是必填——給一個什麼都不做的
            // 函式，比把 prop 改成 optional 好：optional 會讓新增模式那個真正需要它的呼叫端
            // 忘記傳也不會被型別擋下來。
            onCreated={() => {}}
            onDirtyChange={onDirtyChange}
            lineupSlot={renderRotationPanel("hidden")}
          />
        )
      ) : (
        <>
          <div className="shrink-0">
            {match === undefined ? (
              <p className="px-3 py-3 text-xs text-[#9AA08C]">載入比賽資料…</p>
            ) : (
              <MatchDetailView match={match} teamName={teamName} />
            )}
          </div>
          {/* 唯讀模式：站位面板是整欄最後一塊，讓它的球員清單吃掉剩下的高度
              （rosterList="fill"），名單長一點也不必擠在 112px 的小框裡捲。 */}
          {renderRotationPanel("fill")}
        </>
      )}
    </>
  );
}

// ── 資料夾層級的統計格（issue #174 Stage B）──
//
// 拆成獨立元件的理由跟 MatchDetailSection 一樣：useCrossMatchAnalysis 這個 hook 只有
// selected.kind === "tournament" 時才需要掛，拆出來才不用在 MatchInfoRail 本體就無條件呼叫它。
function TournamentStatsSection({ matches }: { matches: Match[] }) {
  const { summaries } = useCrossMatchAnalysis();
  // summaries 的 matchId 是後端 serial（數字），domain Match.id 是字串形式，
  // 轉成字串當 key 才能對得起來——跟 MatchList.tsx 的 summaryByMatch 是同一個轉換。
  const summaryByMatch = new Map(summaries.map((s) => [String(s.matchId), s]));

  // 把「這個資料夾底下每一場比賽」轉成 computeTournamentStats 要吃的最小形狀：
  // 完整的勝負規則（怎麼算贏、局數怎麼加總）都收在 lib/tournamentSummary.ts 那支純函式，
  // 這裡只負責兜資料，不重寫一次規則。
  const stats = computeTournamentStats(
    matches.map((m) => {
      // 同一場比賽下面要讀三個欄位（completedSets/setsPlayed/hasLineup），先取一次存
      // 起來，不要在物件字面量的三個欄位各自呼叫一次 summaryByMatch.get(m.id)——
      // Map.get 雖然是 O(1)，但三次查找三份程式碼，改動時容易漏改其中一處。
      const summary = summaryByMatch.get(m.id);
      return {
        matchId: m.id,
        opponent: m.opponent,
        dateTime: m.dateTime,
        format: m.format,
        // 查不到摘要（例如這場比賽還完全沒打過球）就當作沒有已完成局，跟 MatchList.tsx
        // matchResultText 的 fallback 邏輯一致。
        completedSets: summary?.setResults ?? [],
        // 同樣道理：查不到摘要就當作沒開打過、也沒排過先發。
        setsPlayed: summary?.setsPlayed ?? 0,
        hasLineup: summary?.hasLineup ?? false,
      };
    }),
  );

  if (stats.matchCount === 0) {
    return <p className="mt-3 shrink-0 text-xs text-[#9AA08C]">這個資料夾裡還沒有比賽</p>;
  }

  return (
    <div className="mt-3 flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-1">
        <p className="text-xs text-[#9AA08C]">
          {stats.matchCount} 場 · {stats.ourWins} 勝 {stats.opponentWins} 敗
        </p>
        <p className="text-xs text-[#9AA08C]">
          總局數{" "}
          <span className="font-bold tabular-nums text-[#F5F5F0]">
            {stats.totalOurSets} : {stats.totalOpponentSets}
          </span>
        </p>
      </div>
      <div className="my-2 shrink-0 border-t border-white/[0.10]" />
      {/* 逐場清單獨立捲動，標題摘要固定不跟著捲——資料夾裡比賽一多，這塊清單可能比
        aside 的高度長，不能把上面的摘要也一起推出視野外。 */}
      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5">
        {stats.matches.map((m) => (
          <TournamentMatchRow key={m.matchId} match={m} />
        ))}
      </ul>
    </div>
  );
}

// 五種狀態對應的顏色跟文字（issue #174 Stage B）。第一版只看 winner === null 就一律顯示
// 「進行中」，會把「排好先發但還沒開賽」「連先發都沒排」這兩種更早的狀態也誤標成
// 「進行中」，所以改成看 status。跟 RotationRailPanel 的 SET_STATUS_META 同一套用色邏輯（歷史/已定案＝中性色、
// 進行中＝天藍、我方贏＝萊姆綠），讓使用者在不同畫面看到同一種狀態時顏色是一致的；還沒
// 開打的兩種狀態（已排先發／未開始）用同一種中性色再降一階透明度，跟「已經打完」的中性色
// 拉出一點區隔，但不需要另外發明一種新顏色。
//
// won/lost 需要把這場的局比數（scoreText）插進文字裡，其他三種是固定文字，兩種情況沒辦法
// 共用同一種「靜態字串」欄位。這裡選擇讓 label 一律是函式（就算 in_progress/lineup_only/
// not_started 用不到參數也一樣），而不是「靜態字串 + 一個布林旗標」——因為呼叫端
// （下面的 resultLabel）不用先判斷「這個狀態要不要吃分數」，直接呼叫 meta.label(scoreText)
// 就好，少一層 if。
const STATUS_META: Record<
  MatchStatus,
  { label: (scoreText: string) => string; className: string }
> = {
  won: { label: (scoreText) => `勝 ${scoreText}`, className: "text-[#C6F135]" },
  lost: { label: (scoreText) => `敗 ${scoreText}`, className: "text-[#9AA08C]" },
  in_progress: { label: () => "進行中", className: "text-sky-300" },
  lineup_only: { label: () => "已排先發", className: "text-[#9AA08C]/70" },
  not_started: { label: () => "未開始", className: "text-[#9AA08C]/70" },
};

// 逐場清單的一列：對手名 + 這場的戰績（勝/敗/進行中/已排先發/未開始，見上面 STATUS_META）。
function TournamentMatchRow({ match }: { match: TournamentMatchResult }) {
  const scoreText = `${match.ourSetWins}:${match.opponentSetWins}`;
  const meta = STATUS_META[match.status];

  return (
    <li className="flex items-center justify-between gap-2 text-xs">
      <span className="truncate text-[#F5F5F0]">{match.opponent}</span>
      <span className={`shrink-0 font-bold tabular-nums ${meta.className}`}>
        {meta.label(scoreText)}
      </span>
    </li>
  );
}
