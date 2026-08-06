import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useParams, useLocation, Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import AppShell from "@/components/AppShell";
import NavRail, { matchBackHref } from "@/components/NavRail";
import { useMatchWithRoster } from "@/hooks/useMatches";
import { useRotationTable } from "@/hooks/useRotationTable";
import { useScoreSheet, useScoreSheetController } from "@/hooks/useScoreSheet";
import ScoreSheetCourt, { TouchedTarget } from "@/components/ScoreSheetCourt";
import RadialMenu, { RadialMenuOption } from "@/components/RadialMenu";
import ScoreSheetStats from "@/components/ScoreSheetStats";
import RotationRailPanel from "@/components/RotationRailPanel";
import UnsyncedWritesBadge from "@/components/UnsyncedWritesBadge";
import { PlayAction, Side } from "@/types/scoresheet";
import { isSetComplete, disabledActions, resolveScoringSide } from "@/lib/scoreSheetMapping";
import { countSetWins, getMatchWinner, setWinner, winsNeededFor } from "@/lib/matchOutcome";
import { APP_BACKGROUND_STYLE, APP_SHELL_CLASS, INFO_RAIL_BASE_CLASS } from "@/lib/appChromeStyles";
import { filterLineupToRoster, isLineupFull, lineupToPositions } from "@/lib/rotationLogic";
import { captureFromScoreSheet, captureBlank } from "@/lib/courtSnapshot";
import { resolveLiberoOnRotation } from "@/lib/liberoRotation";

// 6 大類跟 lib/db/src/schema/events.ts 的 eventActionEnum 對齊（見
// types/scoresheet.ts 的說明）。陣列順序就是 RadialMenu 從正上方順時針排列的順序，
// 跟現在用哪個字沒關係，純粹排版用。
const ACTION_OPTIONS: RadialMenuOption<PlayAction>[] = [
  { value: "serve", label: "發球" },
  { value: "receive", label: "接發" },
  { value: "set", label: "舉球" },
  { value: "attack", label: "攻擊" },
  { value: "block", label: "攔網" },
  { value: "dig", label: "防守" },
];

type Outcome = "win" | "lose";
// 順序維持 [lose, win]：RadialMenu 用 startAngle=180 時，2 個選項會落在
// 180°（左）／0°（右），跟以前寫死 position="left"/"right" 的畫面完全一樣。
//
// 標籤維持單純的「得分／失分」，不寫死「我方／對方」——這兩個字是相對於
// 「這一球的動作方」來看的（見 handleOutcomeSelect），動作方是誰由前一步
// （點我方球員 / 對手(全體)）決定，「得分／失分」本身不用跟著切換文字。
const OUTCOME_OPTIONS: RadialMenuOption<Outcome>[] = [
  { value: "lose", label: "失分" },
  { value: "win", label: "得分" },
];

// 排球規則（issue #44）：每隊每局最多 2 次暫停。跟一般換人（顯示上限但不擋）不同，這裡
// 達到上限就直接把該方的暫停鈕反灰——2 次是沒有任何合法例外的硬規則，按第 3 次一定是誤觸、
// 會寫進去變成髒資料，所以擋掉比較安全（換人的 6 次上限有邊界情境，才選擇只提醒不擋）。
const MAX_TIMEOUTS_PER_SET = 2;

// 這頁中間計分區原本全部用 shadcn 的 <Button variant="outline"/"ghost">，但那套元件的顏色是
// 綁在 index.css 的 --primary/--border 等 CSS 變數上，而這個專案的 .dark class 其實跟 :root
// 完全一樣（深色模式沒有真的做），套用出來永遠是「淺色卡片配深色字」——在這次要換的深色
// 底頁面上會整個看不見。跟右欄（RotationRailPanel/ScoreSheetStats，issue #120 已經套用）
// 同一套做法，改成直接手刻 Tailwind class、不透過 Button 元件的顏色系統。三個等級對應原本
// default/outline/ghost 三種語意：
// - PRIMARY：唯一的強調 CTA（例如「我方先發」），萊姆綠實心圓角。
// - SECONDARY：次要但仍需要邊框的按鈕（「對手先發」、暫停…），透明玻璃底。
// - GHOST：工具列等級的次要動作（復原/下一局/結束比賽），只用文字顏色區分狀態。
const PRIMARY_BUTTON_CLASS =
  "inline-flex items-center justify-center rounded-full bg-[#c6f135] px-5 py-2 text-sm " +
  "font-semibold text-[#0a0b07] transition hover:brightness-110 disabled:pointer-events-none " +
  "disabled:opacity-40";
const SECONDARY_BUTTON_CLASS =
  "inline-flex items-center justify-center rounded-full border border-white/[0.26] " +
  "bg-white/[0.05] px-5 py-2 text-sm font-bold text-[#f5f5f0] transition " +
  "hover:border-[#c6f135] hover:text-[#c6f135] disabled:pointer-events-none disabled:opacity-40";
const SECONDARY_SM_BUTTON_CLASS =
  "inline-flex items-center justify-center rounded-full border border-white/[0.26] " +
  "bg-white/[0.05] px-3 py-1.5 text-xs font-bold text-[#f5f5f0] transition " +
  "hover:border-[#c6f135] hover:text-[#c6f135] disabled:pointer-events-none disabled:opacity-40";
const GHOST_BUTTON_CLASS =
  "inline-flex items-center justify-center rounded-full px-3 py-1.5 text-xs font-bold " +
  "text-[#a9b096] transition hover:text-[#c6f135] disabled:pointer-events-none disabled:opacity-30";

// 快速記一球的手勢流程：點球員(球場畫線)/我方比分卡/對手比分卡 → 選「動作」→ 選「得/失分」。
// 「我方(全體)」「對手(全體)」原本是球場上的虛線框，使用者後來決定改成直接點右欄的比分卡
// 觸發——省掉球場上的額外元素，也更省版面（見 handleScoreCardTouch）。
// action 在 outcome 這一步是 optional：比分卡觸發的動作選單多一顆「沒看到」（見
// ACTION_OPTIONS 使用處），選它代表「知道是哪一方，但不知道實際動作」，直接跳到選
// 得/失分、不記錄 action，這樣至少還留得住「哪一方」這個資訊（比原本完全不記錄任何東西
// 的舊版「沒看到」更完整）。
type Gesture =
  | { step: "action"; target: TouchedTarget }
  | { step: "outcome"; target: TouchedTarget; action?: PlayAction };

export default function ScoreSheet() {
  const { id } = useParams<{ id: string }>();
  // 導頁用（#218）：結束比賽確認完要把使用者送到分析頁。wouter 的 useLocation 回傳
  // [目前路徑, 導頁函式]，這裡只需要後者。
  const [, setLocation] = useLocation();
  const { match, isLoading: isMatchLoading } = useMatchWithRoster(Number(id));

  // 讀輪轉表這一場的先發——它是全站共用的「目前站位」真相（#120 PO 定案）。開賽前，右欄
  // 顯示並直接編輯它；開賽那一刻擷取成該局的凍結快照，之後這一局就改讀快照。
  // （注意：這裡不再是「擷取完就不碰輪轉表」了——那是 #115 的舊解耦模型，已作廢，見 #115 留言。）
  // 輪轉表用 matchId 分片（issue #119），所以
  // 讀 dataByMatch[id] 這一場自己的站位；那場還沒排就 undefined，capturableLineup 會算成 null。
  // 這其實比以前讀全域 state.rotations 更正確——舊寫法會讀到「最後開的那場」的站位（#119 的污染源）。
  const storedLineup = useRotationTable((state) =>
    id ? state.dataByMatch[id]?.lineup : undefined,
  );
  // 開局前，右欄的先發編輯就是直接改這份共用真相（PO 決策：輪轉/先發是跨頁共用的一份，
  // 不是計分頁自己再存一份副本）——教練在計分頁排先發，戰術板也要立刻看到同一份結果。
  const setLineupFromSnapshot = useRotationTable((state) => state.setLineupFromSnapshot);

  const record = useScoreSheet((state) => (id ? state.recordingsByMatch[id] : undefined));
  const setLiberoSubstitution = useScoreSheet((state) => state.setLiberoSubstitution);
  // 「復原」堆疊的深度：>0 才有東西可退（issue #41）。手動 libero 上/下場沒有對應的
  // 後端動作，也要能被復原，所以按鈕的可用與否看這個深度，而不是只看記了幾顆球。
  const undoDepth = useScoreSheet((state) => (id ? (state.undoStacksByMatch[id]?.length ?? 0) : 0));
  // 手動 libero 上/下場前，要先自己存一份復原快照（記分/一般換人是走 controller 的
  // score()/substitute() 幫忙存，libero 是元件直接改 store，所以在這裡自己叫）。
  const snapshotForUndo = useScoreSheet((state) => state.snapshotForUndo);
  // 記分/開局/復原/下一局改走 controller：本地即時更新畫面，同時在背景寫進後端
  // sets/rallies/events；進頁時也由它從 API 重建這場的記錄。setLiberoSubstitution 仍留在
  // store（純前端、不進 API，reload 後歸零——真正的自由球員持久化是 #43 的範圍）。
  const {
    isHydrating,
    start,
    score,
    undo,
    goNextSet,
    substitute,
    callTimeout,
    // 背景寫入還沒送成功的筆數，＋手動催一次的動作（#64 PR4）。
    pendingWrites,
    retryWrites,
    // 完賽狀態與切換它的兩個動作（#218）。這兩個動作是「後端優先」的（PATCH 成功後重建），
    // 跟其他動作的「本地優先」相反，理由見 useScoreSheet.ts 的 setMatchStatus 註解。
    isFinished,
    finishMatch,
    reopenMatch,
  } = useScoreSheetController(id ?? "");
  // 這場比賽目前的自由球員替補狀態——現在跟著 matchId 存在 useScoreSheet 裡（見
  // types/scoresheet.ts 的說明），不會再跟別場比賽的計分表互相污染。
  const liberoSubstitution = record?.liberoSubstitution ?? null;
  // 一般換人（issue #42 Phase B）：以前是這個元件自己的 useState，reload 就整包歸零；
  // 現在跟 liberoSubstitution 一樣搬進 useScoreSheet store，跟著 matchId 走、由
  // useScoreSheetController 從後端 /sets/:setId/substitutions 重建，reload 後不會消失。
  const regularSubs = record?.regularSubs ?? [];
  const subCountsHistory = record?.subCountsHistory ?? [];
  // 暫停清單/歷史（issue #44），跟換人一樣從 record 衍生、由 controller 從後端重建，reload 不消失。
  const timeouts = record?.timeouts ?? [];
  const timeoutCountsHistory = record?.timeoutCountsHistory ?? [];

  const [gesture, setGesture] = useState<Gesture | null>(null);
  // 「結束比賽」確認視窗開著沒（#218）。PO 決策：**不自動彈窗**——勝局條件達成只會把按鈕
  // 變成強調樣式，彈不彈由記錄者決定。理由是誤判風險：記錯一球就被彈窗打斷，比「忘記按」
  // 更惱人，而忘記按的成本很低（回列表隨時能再進來按）。
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);

  // ── 自由球員替換記憶 ──
  // useRef 讓 useEffect 讀到最新值，避免陳舊閉包（stale closure）。
  const [previousLiberoTarget, setPreviousLiberoTarget] = useState<string | null>(null);
  const liberoSubRef = useRef(liberoSubstitution);
  liberoSubRef.current = liberoSubstitution;
  const prevLiberoRef = useRef(previousLiberoTarget);
  prevLiberoRef.current = previousLiberoTarget;

  // ── 一般換人 ──
  // regularSubs/subCountsHistory 已搬到上面從 record 衍生；這裡只留「換人模式選中哪個場邊
  // 球員」這個純 UI 互動狀態（跟後端無關，不用持久化）。
  const [selectedBenchPlayer, setSelectedBenchPlayer] = useState<string | null>(null);

  // ── 自由球員選定（名單有兩位候選時，記使用者選了哪一位）──
  // tang 2026-07-31 要求：這個選擇要撐過重新整理頁面，但又不是「這場比賽的紀錄」（換誰上場
  // 才是紀錄，這裡只是「鈕現在代表哪一位」的畫面偏好）——所以不走 controller/後端那條路
  // （那條路是給真的要記錄的動作用的，見 handleLiberoSubstitute 旁的註解「libero 替補是純
  // 前端狀態、沒寫後端」），改用 localStorage，key 帶上 matchId 避免跟別場比賽的選擇互相污染。
  // 用 useState 的 lazy initializer 讀初值，避免每個 render 都重新讀一次 localStorage。
  const [selectedLiberoId, setSelectedLiberoIdState] = useState<string | null>(() =>
    id ? window.localStorage.getItem(`libero-pick:${id}`) : null,
  );
  // matchId 換場時（例如從別場比賽切過來），重新從那一場自己的 localStorage key 讀一次，
  // 不要沿用上一場殘留在 state 裡的選擇——跟 useRotationTable 用 dataByMatch[matchId] 分片
  // 是同一種「不同比賽的暫存狀態不該互相污染」的原則（issue #119）。
  useEffect(() => {
    setSelectedLiberoIdState(id ? window.localStorage.getItem(`libero-pick:${id}`) : null);
  }, [id]);
  const handleSelectLibero = (playerId: string) => {
    setSelectedLiberoIdState(playerId);
    if (id) window.localStorage.setItem(`libero-pick:${id}`, playerId);
  };

  // ── 計分表的先發快照（issue #115，#231 PR3 收斂成「一份資料 + 一道門檻」）──
  //
  // 這裡以前有三個 lineup 變數（capturableLineup / editableLineup / activeLineup），是舊表示法
  // 留下的稅：站位存在 store 裡是六輪座標陣列，所以「讀出來給人看」跟「讀出來判斷能不能開賽」
  // 各要走一支不同的轉換函式，兩份結果再兜。現在 store 存的就是 LineupSnapshot 本人，只剩：
  //   editableLineup —— 現在排了誰（0~6 人，照實回報）
  //   isLineupFull()  —— 夠不夠開賽（獨立的門檻，不會把「還在排」誤判成「沒有」）
  //
  // 為什麼「顯示」跟「把關」一定要分開：拿把關語意去畫編輯中的面板，排第一個人就會讀回 null
  // 整個變空，變成「點了放不上去」的死結（要看到第 1 個人得先有 6 個人）——#174 踩過。
  const lineup = record?.lineup ?? null;
  // 開賽前右欄面板「顯示」用的那一份：只濾掉已不在名單上的幽靈站位，人數照實。
  const editableLineup = useMemo(
    () => (match ? filterLineupToRoster(storedLineup ?? {}, match.players) : null),
    [match, storedLineup],
  );
  // 還沒凍結前，「能不能從當下站位擷取出一份完整先發」——湊滿 6 個號位才算數，否則 null。
  const capturableLineup = editableLineup && isLineupFull(editableLineup) ? editableLineup : null;
  // activeLineup：優先用已凍結的，其次用可擷取的——球場渲染、開賽擷取都以它為準。
  const activeLineup = lineup ?? capturableLineup;

  // ── 自由球員自動輪轉接替 ──
  // 每次我方輪轉（ourRotation 變動）檢查被替換的球員是否已輪到前排。
  // 規則本體已抽到 lib/liberoRotation.ts（issue #303）——那裡是純函式、有單元測試釘住三條
  // 分支；這個 effect 只剩「湊出輸入、把結果寫回去」，沒有任何領域判斷。
  const currentSet = record?.currentSet;
  useEffect(() => {
    const libSub = liberoSubRef.current;
    if (!currentSet || currentSet.serving === null || !libSub || !id || !activeLineup) return;

    // 從計分表自己的先發快照算出「這一輪」場上 6 人的座標（不再讀全域 rotations）。
    const positions = lineupToPositions(activeLineup, currentSet.ourRotation);
    const state = { current: libSub, previousTarget: prevLiberoRef.current };
    const next = resolveLiberoOnRotation(state, positions);
    // 沒事發生時 resolveLiberoOnRotation 回傳的就是傳進去的那個物件，比對參照即可跳過
    // 兩次寫入（少一輪 render，也避免把相同的值重新灌進 store）。
    if (next === state) return;

    setPreviousLiberoTarget(next.previousTarget);
    setLiberoSubstitution(id, next.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSet?.ourRotation]);

  // 比賽本體或計分記錄還在載入/重建時，先顯示載入狀態，避免在資料到位前閃現「誰先發球？」。
  if (id && (isMatchLoading || isHydrating)) {
    return (
      <div className="flex min-h-screen w-full flex-col items-center justify-center gap-4 bg-[#0a0b07] px-4 text-center font-dash text-[#f5f5f0]">
        <p className="text-[#a9b096]">載入計分記錄中…</p>
      </div>
    );
  }

  if (!match || !id) {
    return (
      <div className="flex min-h-screen w-full flex-col items-center justify-center gap-4 bg-[#0a0b07] px-4 text-center font-dash text-[#f5f5f0]">
        <p className="text-[#a9b096]">找不到這場比賽。</p>
        {/* 不用共用的 BackToMatchListButton：那顆元件走 shadcn Button 的淺色配色，是給
            MatchAnalytics/TournamentDetail 這幾個還沒換膚的頁面用的，這裡直接刻一顆
            跟這頁其他按鈕同一套語言的深色版本，不動共用元件本身（改了會連帶影響那些
            還沒套用深色語言的頁面）。 */}
        <Link href="/" className={SECONDARY_BUTTON_CLASS}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          比賽列表
        </Link>
      </div>
    );
  }

  // 開始記錄前要求先發已排好。改讀計分表自己的快照（issue #115）：已凍結的先發，或還沒凍結前
  // 「輪轉表當下能擷取出一份完整先發」（activeLineup 非 null）就放行。門檻仍是「滿 6 個號位」
  // （captureLineupFromRotations 內建，跟舊的 isLineupComplete 同一條規則，見 issue #37）。
  const hasLineup = activeLineup !== null;
  // 先發只有在「這一局還沒開打」時能改（開局凍結，見 hooks/useScoreSheet.ts 的 start()）：
  // 開賽前右欄顯示的是共用真相（capturableLineup），可以直接編輯、每一次改動都即時生效
  // （setLineupFromSnapshot 直接寫回 useRotationTable）；開賽後已經記進去的球是綁著
  // record.lineup 這份凍結快照的，這時候改站位會讓歷史對不上，所以只能看不能改，
  // 要動陣容得走換人。
  //
  // 判準是「有沒有凍結先發」（lineup，即 record.lineup），不是「有沒有選過發球方」（serving）。
  // 舊寫法只看 serving，會踩到一個死結：某條路徑（背景寫入只成功了一半、或曾在沒先發時就寫出
  // 發球方，見 hooks/useScoreSheet.ts 的 start() guard 與 #64）讓後端出現「有 firstServer、
  // 沒 lineup」的殘缺 set，rehydrate 後 serving 非 null（→ 右欄被鎖成唯讀）但 record.lineup
  // 是 null（→ 中央喊「還沒排先發」），變成「要排先發才解得開、卻被鎖住排不了」的死結。
  // 改看 lineup 就沒有這個矛盾：只要還沒真的凍結先發，右欄一律可編輯——而沒有先發本來就記不了
  // 球（記分 UI 整段藏在 hasLineup 分支裡），開放編輯是安全的。
  const canEditLineup = lineup === null;
  // 球場要畫的「這一輪我方 6 人座標」，從快照即時換算（不再讀全域 rotations）。
  const ourPositions =
    activeLineup && currentSet ? lineupToPositions(activeLineup, currentSet.ourRotation) : [];
  const completedSets = record?.completedSets ?? [];
  // 換人「次數」要用原始計數 subCount，不能用 regularSubs.length（issue #289）：後者是淨疊加，
  // 連鎖換人／換回先發會讓兩個數字對不上，教練靠這個數字判斷還能不能換人，必須是原始次數。
  const currentSubCount = record?.subCount ?? 0;
  const totalSubCount = subCountsHistory.reduce((a, b) => a + b, 0) + currentSubCount;
  // 暫停計數（issue #44）：本局每一方各用了幾次（排球規則每隊每局上限 2 次），加全場累計。
  const ourTimeoutCount = timeouts.filter((t) => t.side === "us").length;
  const opponentTimeoutCount = timeouts.filter((t) => t.side === "opponent").length;
  const currentTimeoutCount = timeouts.length;
  const totalTimeoutCount = timeoutCountsHistory.reduce((a, b) => a + b, 0) + currentTimeoutCount;
  // 局比數走 matchOutcome.countSetWins（#226 PR2），不再各頁手寫一份。
  const { ourWins: ourSetsWon, opponentWins: opponentSetsWon } = countSetWins(completedSets);

  // 「這場比賽的勝負已經分出來了嗎」（#218）——決定要不要把「結束比賽」變成強調鈕。
  //
  // 這裡刻意**把進行中那一局也算進去**（[...completedSets, currentSet]），而右欄
  // MatchInfoRail 的 isMatchFinished 只看 completedSets。兩者不是同一個問題，所以沒有抽成
  // 共用函式：
  //   - 那邊問的是「已經封存的局數足以定勝負了嗎」（要不要把整場標成已完成的回顧視角）。
  //   - 這裡問的是「**這一球記完**就分出勝負了嗎」——正是要提示記錄者「可以收尾了」的那個
  //     瞬間，如果只看 completedSets，得等按了「下一局」才會亮，那時候提示已經沒意義了。
  // 硬要共用一支函式，只會把「要傳哪些局進去」這個真正重要的決定藏進函式名稱裡。
  const matchDecided =
    currentSet !== undefined &&
    getMatchWinner([...completedSets, currentSet], winsNeededFor(match.format)) !== null;

  // 確認視窗裡要攤開的「最終」比分（#218）。跟上面 matchDecided 同一個道理，要把進行中那局
  // 也算進去——記錄者正要結束的就是包含剛打完那一局的整場比賽。
  // 過濾條件跟 ScoreSheetStats 的各局比分表一致（serving !== null＝這局真的開過球）：
  // 剛按過「下一局」但還沒開球的空局不該出現在最終比分裡。
  const finalSetScores = [
    ...completedSets,
    ...(currentSet && currentSet.serving !== null ? [currentSet] : []),
  ];
  const { ourWins: finalOurSetsWon, opponentWins: finalOpponentSetsWon } =
    countSetWins(finalSetScores);

  // 確認結束：先關掉視窗（避免 await 期間視窗還開著、使用者重複按），再寫後端狀態，
  // 成功後導去分析頁——分析頁就是 PO 決策 3 選定的「賽後畫面」，不另做一頁賽後摘要
  // （MatchAnalytics 已經有比分總覽／各局比分／球員矩陣，再做一頁只會變成兩份重複的東西）。
  const handleFinishMatch = async () => {
    setShowFinishConfirm(false);
    await finishMatch();
    setLocation(`/matches/${id}/analytics`);
  };

  // 統計欄目前只顯示「本場」。跨場統計需要「列出本使用者所有有記錄的場」的 API 策略，
  // 留到 Phase 3b-ii（連同 events 讀回、球員矩陣重建）一起做。
  const statsMatches = [match];

  // 左側導覽軌（issue #160）的「比」按鈕要導回去的頁面。規則本身寫在 matchBackHref
  // 裡，三個 match-scoped 頁面共用同一個函式，「回列表」的行為才不會各頁飄掉。
  const backHref = matchBackHref(match.tournamentId);

  const handlePlayerTouch = (target: TouchedTarget) => {
    if (selectedBenchPlayer && target.side === "us" && target.playerId) {
      handleRegularSub(selectedBenchPlayer, target.playerId);
      return;
    }
    setGesture({ step: "action", target });
  };

  // 右欄比分卡本身可以點：不挑細節、只記「這一球是哪一方做的」，取代原本球場上的
  // 「我方(全體)」「對手(全體)」虛線框（使用者決定改放這裡，省球場版面）。跟球場的
  // 「畫線連到目標」手勢不同、是單純點擊，但終點一樣進 handlePlayerTouch，後面選動作／
  // 選得失分那兩步完全共用同一套邏輯，不用另外寫一條平行路徑。
  // gesture !== null 時代表選單已經開著，不重複觸發；currentSet 不存在（開賽前的「誰
  // 先發球」畫面也會渲染 scoreDisplay）時記錄沒有意義，一併擋掉。
  const handleScoreCardTouch = (side: Side) => (e: ReactPointerEvent) => {
    if (gesture !== null || !currentSet) return;
    handlePlayerTouch({ side, screenX: e.clientX, screenY: e.clientY });
  };

  const handleActionSelect = (action: PlayAction | "noSight") => {
    if (!gesture || gesture.step !== "action") return;
    setGesture({
      step: "outcome",
      target: gesture.target,
      // 「沒看到」代表知道是哪一方、但不知道實際動作——action 留空，handleOutcomeSelect
      // 那邊 touchedBy.side 還是會照樣記下去，不是完全不記錄。
      action: action === "noSight" ? undefined : action,
    });
  };

  const handleOutcomeSelect = (outcome: Outcome) => {
    if (!gesture || gesture.step !== "outcome") return;
    // 「得分／失分」→「誰拿到這一分」的換算規則收在 resolveScoringSide（issue #226）：
    // 原本這一行判斷直接寫在這個事件處理器裡、完全沒有測試，抽成 lib 純函式後才測得到。
    const actorSide = gesture.target.side;
    const side = resolveScoringSide(actorSide, outcome);
    score(side, {
      action: gesture.action,
      touchedBy: {
        side: gesture.target.side,
        playerId: gesture.target.playerId,
        zone: gesture.target.zone,
      },
    });
    setGesture(null);
  };

  const handleLiberoSubstitute = (targetPlayerId: string) => {
    // 手動把自由球員換上場是一個「使用者動作」，先存快照才能被「復原」退掉（issue #41）。
    // backendKind null：libero 替補是純前端狀態、沒寫後端（見 controller 說明），復原只還原畫面。
    snapshotForUndo(id, null);
    if (liberoSubstitution !== null) {
      setPreviousLiberoTarget(liberoSubstitution);
    }
    setLiberoSubstitution(id, targetPlayerId);
    setSelectedBenchPlayer(null);
  };

  const handleRegularSub = (inPlayerId: string, outPlayerId: string) => {
    // 換人動作（本地即時更新 + 背景寫進後端）現在都收在 controller 的 substitute() 裡，
    // 跟 score() 是同一套「本地優先、背景持久化」的分工，這裡只管畫面互動（清掉自由球員
    // 替補殘留狀態、關掉換人模式）。
    substitute(outPlayerId, inPlayerId);
    if (outPlayerId === liberoSubstitution) {
      setLiberoSubstitution(id, null);
    }
    setSelectedBenchPlayer(null);
  };

  const handleUndo = () => {
    undo();
    // previousLiberoTarget 是「自動回位」用的啟發式記憶，存在 component state、不在復原快照裡。
    // 復原可能把 liberoSubstitution 一起退回去，這裡順手清掉這份記憶，避免它跟還原後的替補
    // 狀態對不上（清成 null 是安全的：頂多讓之後的自動回位走預設行為，不會出錯）。
    setPreviousLiberoTarget(null);
  };

  const handleNextSet = () => {
    // 勝局條件檢查（issue #45）：一般局 25 分、決勝局 15 分，且都要領先 2 分以上才算贏。
    // 這裡不強制擋下（教練可能有特殊情況想提早結束），但比分沒達標就先跳確認，
    // 避免 0:0 之類的空局被誤按成一局封存。
    if (
      currentSet &&
      !isSetComplete(currentSet.setNumber, currentSet.ourScore, currentSet.opponentScore)
    ) {
      const target = currentSet.setNumber >= 5 ? 15 : 25;
      const ok = window.confirm(
        `目前比分 ${currentSet.ourScore}:${currentSet.opponentScore}，還沒達到勝局條件（${target} 分且領先 2 分以上）。\n確定要結束這一局、進入下一局嗎？`,
      );
      if (!ok) return;
    }
    // goNextSet() 底層的 nextSet 動作已經會把 record.lineup 清成 null（見
    // hooks/useScoreSheet.ts 的 nextSet 註解——先發是「每局可不同」，換新的一局要先清空
    // 舊局的快照），清空之後 activeLineup 自然改讀 capturableLineup（共用真相現在長什麼樣），
    // 右欄也就自動變回「開賽前、可編輯」的樣子——不需要另外一套「right rail 進編輯模式」
    // 的狀態機來銜接這一步。
    goNextSet();
    setPreviousLiberoTarget(null);
    setSelectedBenchPlayer(null);
  };

  // 左側導覽軌（issue #173，原 issue #160 C3 的 TacticsRailMenu 已收斂進 NavRail）「戰」
  // 子清單的「+ 新增戰術」：NavRail 自己管開關/清單/彈窗，這裡只需要告訴它「計分頁的『現在
  // 站位』要怎麼查」——見 NewTacticDialog.tsx 開頭那段「為什麼擷取來源要由呼叫端注入」的
  // 說明。計分頁的現在站位＝activeLineup（計分表自己的逐局先發快照）。為什麼不直接讀全域
  // 輪轉表 store：activeLineup 已經幫我們處理好「開賽前讀共用站位、開賽後讀該局凍結快照」
  // 的分岔，而戰術板要的是「計分頁此刻畫面上那一份」——第 3 局進行中時，共用站位可能已經
  // 被改成第 4 局的先發了，直接讀 store 會抓到未來的陣容。
  const captureCurrentForBoard = () => {
    if (!activeLineup || !currentSet) {
      // 理論上不會被呼叫到——NavRail 在 captureDisabled 為真時，會把「擷取
      // 目前站位」這個選項停用，使用者按不到這裡。但 captureCurrent 的型別要求永遠回傳一張
      // CourtSnapshot（不能是 null/undefined），所以保底給一張空站位，純粹滿足型別、不會
      // 真的被用到。
      return captureBlank({ matchId: id });
    }
    return captureFromScoreSheet(activeLineup, currentSet.ourRotation, match.players, {
      matchId: id,
    });
  };

  // 局數 label + 大比分 + 我方/對手：開賽前的「誰先發球」畫面跟比賽進行中的右欄操作區都會用到，
  // 抽成一個區塊避免兩處各寫一份、日後改一邊忘另一邊漂移。
  const scoreDisplay = (
    <div className="flex flex-col items-center gap-2">
      <span className="text-sm font-bold text-[#f5f5f0]">第 {currentSet?.setNumber ?? 1} 局</span>

      {/* 大分數：借鏡實體翻牌計分板（黑卡＋粗體大數字＋卡片間距）的排版節奏。字體真的換了：
        JetBrains Mono 這個專案只掛到 700 字重，撐不出翻牌板那種黑體量感，改用 font-score
        （Anton）——這是 design-spec.md 第 3 節明文留的例外「真的需要大字展示、而且內容以
        英文/數字為主的場合」，之前 PR #129 review 判 Anton 死刑是因為套在 17–18px 中英混排
        的卡片標題上最難讀，跟這裡純數字、大尺寸的展示情境是兩回事；只在 font-score 用，不
        碰 font-dash/font-sans，中文內容不會被牽連。套上我方＝萊姆綠／對手＝紅這組既有配色
        （跟下面局數框、#199 對手珊瑚橘系語彙同一套）。
        發球指示原本是卡片下方一顆 🏐，改成發球方卡片邊框＋外光暈直接亮起來——照 design-spec
        第 4 節「發光效果只留給真正需要被看見的狀態」那條原則，發球正是這種狀態；副作用是
        兩張卡不再因為一顆 emoji 而寬度不一致，永遠等寬。
        局數框（原本掛在「第 N 局」那行）搬進這一排、卡在兩張比分卡中間——照實體翻牌計分板
        的樣子，所有卡片是掛在同一條頂邊上的（大卡片只是比較高，會往下多長一截），所以外層
        改成 items-start 對齊上緣，而不是原本跟著比分卡置底；局數框矮很多，跟著同一條上緣
        對齊，整排看起來才像掛在同一條線上、不是各自對齊各自的。 */}
      <div className="flex items-start gap-3">
        {/* 比分卡現在也是「我方(全體)」的記錄入口（見 handleScoreCardTouch）：點下去跳過球場
          畫線，直接開「選動作」選單，只知道是我方做的、不挑是場上哪一位球員。cursor-pointer
          只在真的能記錄時（有 currentSet）才加，開賽前的「誰先發球」畫面共用同一份 JSX，
          那裡點下去本來就會被 handleScoreCardTouch 內部的 !currentSet 檔掉，游標樣式跟著
          誠實反映當下能不能點。 */}
        <div
          onPointerDown={handleScoreCardTouch("us")}
          className={`flex flex-col items-center gap-1 rounded-2xl border px-5 py-3 transition-shadow ${
            currentSet?.serving === "us"
              ? "border-[#C6F135] shadow-[0_0_18px_rgba(198,241,53,0.4)]"
              : "border-white/[0.14] shadow-lg shadow-black/30"
          } ${currentSet ? "cursor-pointer" : ""} bg-black/30`}
        >
          <span className="font-score text-5xl tabular-nums text-[#C6F135]">
            {currentSet?.ourScore ?? 0}
          </span>
          <span className="text-caption font-semibold text-[#a9b096]">我方</span>
        </div>

        {/* 局數勝負：原本是「局數 Y:Z」文字，改成兩顆小方框數字——跟翻牌計分板中間那兩張
          小卡（局/game 計數）同一個語彙，圖像化取代文字標籤，不用再讀「局數」兩個字才懂
          這兩個數字是什麼。哪隊領先，框線／數字就亮對應隊色，沒領先維持中性灰白。 */}
        {completedSets.length > 0 && (
          <div className="flex items-center gap-1">
            <span
              className={`flex h-5 min-w-5 items-center justify-center rounded border font-score text-xs tabular-nums leading-none ${
                ourSetsWon > opponentSetsWon
                  ? "border-[#C6F135] text-[#C6F135]"
                  : "border-white/20 text-[#a9b096]"
              }`}
            >
              {ourSetsWon}
            </span>
            <span
              className={`flex h-5 min-w-5 items-center justify-center rounded border font-score text-xs tabular-nums leading-none ${
                opponentSetsWon > ourSetsWon
                  ? "border-[#ef4444] text-[#ef4444]"
                  : "border-white/20 text-[#a9b096]"
              }`}
            >
              {opponentSetsWon}
            </span>
          </div>
        )}

        <div
          onPointerDown={handleScoreCardTouch("opponent")}
          className={`flex flex-col items-center gap-1 rounded-2xl border px-5 py-3 transition-shadow ${
            currentSet?.serving === "opponent"
              ? "border-[#ef4444] shadow-[0_0_18px_rgba(239,68,68,0.4)]"
              : "border-white/[0.14] shadow-lg shadow-black/30"
          } ${currentSet ? "cursor-pointer" : ""} bg-black/30`}
        >
          <span className="font-score text-5xl tabular-nums text-[#ef4444]">
            {currentSet?.opponentScore ?? 0}
          </span>
          <span className="text-caption font-semibold text-[#a9b096]">對手</span>
        </div>
      </div>

      {/* 局點提示（tang 2026-08-04 要求）：issue #45 當初只讓「下一局」按下去時才檢查
          isSetComplete（沒達標跳確認視窗），達標之後完全沒有任何提示——教練得自己記得
          分數、自己想到要按下一局。這裡補一個不擋操作的提示：達標（一般局 25 分／第五局
          15 分，且淨勝 2 分以上）就跳出琥珀色提示條，跟 MatchEntryLinks.tsx「尚未排先發」
          用同一套「柔性提醒、不鎖版面」語彙（design-spec 既有慣例）。比分卡、球場手勢
          完全不受影響——照 #45 的既有理由，比分打到 25 之後可能還有特殊情況要繼續記
          （教練刻意要求不強制擋），這裡只解決「達標後沒人提醒」，不改動「達標後還能不能
          繼續記分」。開賽前分數是 0:0，isSetComplete 天然回 false，這個提示不會提早出現
          在「這局由誰先發球」那個畫面（scoreDisplay 兩處共用同一份 JSX，不用另外分支）。 */}
      {currentSet &&
        isSetComplete(currentSet.setNumber, currentSet.ourScore, currentSet.opponentScore) && (
          <p className="max-w-[220px] rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-center text-xs font-semibold text-amber-300">
            {setWinner(currentSet) === "us" ? "我方" : "對手"}已達勝局點，可按「下一局」封存
          </p>
        )}
    </div>
  );

  return (
    // issue #172：三欄骨架交給 AppShell（mode="A"）。以前這裡是自己手刻的
    // `<div className="flex h-screen w-full">` + NavRail + 一整個 `flex-1` 內容區，
    // 現在拆成 nav / aside / children 三個插槽——nav 是共用導覽軌（不變）；aside 是原本那塊
    // `w-72` 深色玻璃右欄（站位面板 + 比賽統計）的「內容」，寬度不再由這個頁面自己寫死
    // `w-72 flex-none`，改交給 AppShell 的 ASIDE_WIDTH 常數決定（這一環兩者剛好都是
    // w-72＝288px，數字沒變，只是「誰負責定義這個數字」換人了）。
    // issue #131／整頁改版：背景改成跟戰術板（TacticsBoard.tsx）同一套——兩顆柔光暈疊底層
    // 斜切漸層＋一道低調斜向光影（.tb-beam），比原本的斜線網格更有層次，也讓球場毛玻璃地板
    // （.court-glass 的 backdrop-blur）有更豐富的東西可以模糊。三欄內容（nav／children／aside）
    // 都要補 `relative z-10`，才能疊在 backdrop 的 .tb-beam（position:absolute + z-index:1）
    // 之上——理由見 TacticsBoard.tsx 第 2 點的詳細說明。.tb-mark 大字標刻意不加：計分時
    // 球場跟大比分佔滿畫面，那顆置中大字會被蓋住又搶操作注意力（跟戰術板唯讀檢視的情境不同）。
    <AppShell
      mode="A"
      className={APP_SHELL_CLASS}
      style={APP_BACKGROUND_STYLE}
      backdrop={<div className="tb-beam" />}
      nav={
        <div className="relative z-10 h-full">
          <NavRail
            matchId={id}
            backHref={backHref}
            active="record"
            // issue #160 C3 起，計分頁的「戰」就不是單純導覽連結，而是列出已存戰術＋新增戰術的
            // 子清單——#173 把這段行為從獨立的 TacticsRailMenu 收斂進 NavRail 本身，這裡不用
            // 再像以前那樣透過 boardSlot 塞一整塊自訂 UI 進去，只需要把「擷取現在站位」這一小段
            // 因頁而異的邏輯傳進去。
            captureCurrent={captureCurrentForBoard}
            captureLabel="擷取目前計分站位"
            captureDisabled={!activeLineup || !currentSet}
          />
        </div>
      }
      aside={
        // ── 右欄：站位／統計／快速戰術板（深色玻璃，跟中間計分區切開） ──
        // 外殼 class 收斂到 lib/appChromeStyles（原本這裡跟另外兩個右欄各寫一份字面相同的字串，
        // 見那個檔案的說明）。寬度（原本 w-72 flex-none）由 AppShell 的 ASIDE_WIDTH 負責，
        // 這裡只多加 `relative z-10` 疊在 .tb-beam 之上。
        <div className={`relative z-10 ${INFO_RAIL_BASE_CLASS}`}>
          {/* ── 站位面板（issue #120，共用真相版）──
            開賽前（canEditLineup）：lineup 讀的是 activeLineup，此時等於
            capturableLineup——輪轉表當下的共用真相，可以直接編輯；onLineupChange
            呼叫 setLineupFromSnapshot 把改動寫回 useRotationTable，跟戰術板讀的是
            同一份資料，改這裡戰術板也會立刻看到。
            開賽後：record.lineup 已經凍結（開局凍結，見 hooks/useScoreSheet.ts 的
            start()），這時 activeLineup 讀到的就是那份凍結快照，readOnly 鎖住不給改——
            已經記進去的球是綁著這份站位算的，中途改會讓歷史跟站位對不上。 */}
          <RotationRailPanel
            // 可編輯時顯示 editableLineup（排幾個顯示幾個），唯讀時顯示 activeLineup
            // （該局凍結的完整快照）。理由見上方 editableLineup 的宣告處。
            lineup={canEditLineup ? editableLineup : activeLineup}
            roster={match.players}
            rotation={currentSet?.ourRotation ?? 0}
            // 完賽後一律唯讀（#218）：完賽時 record.lineup 是 null（沒有「目前這一局」），
            // canEditLineup 會算成 true，右欄就會變回可編輯的開賽前樣子——但這場比賽已經打完，
            // 這裡沒有任何「下一局的先發」要排，讓它可編輯只會讓人以為改了會影響什麼。
            readOnly={!canEditLineup || isFinished}
            onLineupChange={
              canEditLineup && !isFinished ? (next) => setLineupFromSnapshot(id, next) : undefined
            }
          />

          <div className="flex shrink-0 items-center justify-between border-b border-white/[0.10] px-3 py-2 text-xs font-bold text-[#9AA08C]">
            <span>比賽統計</span>
            {statsMatches.length > 1 && (
              <span className="font-normal text-[#9AA08C]/70">← 滑動看其他場</span>
            )}
          </div>

          {/* 每個 snap pane 是一場比賽的統計；CSS scroll-snap 不需要任何 JS */}
          <div className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {statsMatches.map((m) => (
              // 這一格以前寫死 `w-72`，意思其實是「跟右欄一樣寬」——現在右欄多寬只由
              // AppShell 的 ASIDE_WIDTH 一處決定，這裡改成 w-full 直接吃滿父層（也就是
              // aside 插槽）給的寬度，不用在第二個地方重複寫一次同一個數字。如果以後只改
              // AppShell 的常數、忘記回來改這裡，w-72 寫死的話畫面就會悄悄跟右欄實際寬度
              // 不一致（scroll-snap 的每一格可能露出下一格一小角）——改成 w-full 之後這種
              // 情況不可能發生。
              <div key={m.id} className="flex min-h-0 w-full flex-none snap-center flex-col">
                {/* 這裡原本有一條「vs {對手} / 本場 / i+1/length」的分頁小標題，跟頁面最上面
                  的 <h1>vs {match.opponent}</h1> 重複——而且 statsMatches 目前是寫死的單一
                  元素陣列（見上面 statsMatches 宣告處的註解：跨場統計要等 Phase 3b-ii），
                  「i+1/length」永遠是「1/1」，不是現在真的有用的分頁資訊，純粹佔右欄空間、
                  逼使用者多滑一段才看得到下面的統計。刪掉，省下的高度用來讓比賽統計不用
                  捲軸就看得到。等 Phase 3b-ii 真的做多場統計時，那時候的人可以照那個功能
                  的實際形狀決定要不要重新加標題，不必現在先猜。 */}
                <div className="flex-1 overflow-y-auto">
                  <ScoreSheetStats
                    players={m.players}
                    record={m.id === id ? record : undefined}
                    currentSetSubCount={m.id === id ? currentSubCount : undefined}
                    totalSubCount={m.id === id ? totalSubCount : undefined}
                    currentSetTimeoutCount={m.id === id ? currentTimeoutCount : undefined}
                    totalTimeoutCount={m.id === id ? totalTimeoutCount : undefined}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      }
    >
      <div className="relative z-10 flex h-full min-h-0 flex-1 flex-col">
        {/* relative + 絕對定位的徽章：標題要維持「置中於整條標題列」，如果改用 flex 的
            justify-between 讓徽章佔一格，標題就會被推得偏左，而且徽章一出現／消失標題還會
            跳動。把徽章抬出文件流就沒有這個問題——它有沒有出現都不影響標題的位置。 */}
        <header className="relative flex shrink-0 items-center justify-center border-b border-white/[0.08] bg-white/[0.02] px-4 py-3 backdrop-blur-sm">
          <h1 className="text-lg font-bold">vs {match.opponent}</h1>
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <UnsyncedWritesBadge count={pendingWrites} onRetry={retryWrites} />
          </div>
        </header>

        <div className="flex flex-1 min-h-0 justify-center">
          {isFinished ? (
            // ── 完賽態（#218）──
            // PO 決策：結束後**可逆、且不藏起來**——這一頁照樣進得來，只是不能再記分
            //（沒有球場、沒有比分卡、沒有暫停/換人/下一局），並且提供「重新開啟比賽」把
            // status 改回 in_progress 繼續補記。記錄者事後對帳是常態，鎖死只會逼人去砍掉重記。
            //
            // 為什麼這個分支要放在最前面：完賽後 record.currentSet 是一個空的佔位局
            //（serving/lineup 都是 null，見 reconstructRecording），如果讓它往下掉，就會落進
            // 下面「這局由誰先發球？」的分支——一場已經打完的比賽卻在問誰發球，明顯是錯的。
            <div className="flex flex-1 flex-col items-center justify-center gap-5 px-4 text-center">
              <p className="text-sm font-bold tracking-widest text-[#a9b096]">這場比賽已結束</p>
              {/* 最終局比數。用跟計分板同一套語彙（font-score 大數字＋我方萊姆綠／對手紅），
                讓「最後結果」在視覺上就是這一頁的主角。 */}
              <div className="flex items-end gap-4">
                <div className="flex flex-col items-center gap-1">
                  <span className="font-score text-6xl tabular-nums text-[#C6F135]">
                    {ourSetsWon}
                  </span>
                  <span className="text-caption font-semibold text-[#a9b096]">我方</span>
                </div>
                <span className="pb-6 font-score text-3xl text-[#a9b096]">:</span>
                <div className="flex flex-col items-center gap-1">
                  <span className="font-score text-6xl tabular-nums text-[#F0776C]">
                    {opponentSetsWon}
                  </span>
                  <span className="text-caption font-semibold text-[#a9b096]">
                    {match.opponent}
                  </span>
                </div>
              </div>
              {/* 各局比分不在這裡重畫一份——右欄的 ScoreSheetStats 本來就有一張完整的
                「各局比分」表，完賽後每一局都在 completedSets 裡，那張表自然就是完整的。 */}
              <p className="text-xs text-[#a9b096]">各局比分在右欄「比賽統計」。</p>
              <div className="mt-2 flex gap-3">
                <Link href={`/matches/${id}/analytics`} className={PRIMARY_BUTTON_CLASS}>
                  查看分析
                </Link>
                <button className={SECONDARY_BUTTON_CLASS} onClick={() => void reopenMatch()}>
                  重新開啟比賽
                </button>
              </div>
              <p className="max-w-xs text-xs text-[#a9b096]">
                記錯了？「重新開啟比賽」會回到最後一局繼續記，已記的球不會消失。
              </p>
            </div>
          ) : !hasLineup ? (
            // 這場還沒有先發。以前這裡是一顆「前往戰術板」把使用者踢出計分頁，現在右欄的
            // 站位面板在開賽前本來就是可編輯的（不用另外切換模式），所以這裡只留一句指路，
            // 不再提供離開這一頁的入口（PO 指示），也不連去戰術板——戰術板現在是唯讀的白板，
            // 不是排先發的地方（issue #154）。
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
              <p className="text-[#f5f5f0]">還沒排先發。</p>
              <p className="text-sm text-[#a9b096]">
                在右邊的「場上站位」點號位、再點球員，湊滿 6 人就能開始記錄。
              </p>
            </div>
          ) : !lineup || !currentSet ? (
            // 開賽前／殘缺 set 自癒（aila 在 main 修的死結，見 canEditLineup 的說明）：
            // 判準看「有沒有凍結先發」（lineup）而非 serving——serving 已被寫過、但 lineup
            // 還是 null 時，也要落到這個分支「再問一次」發球方，讓教練重排滿 6 人後重選，
            // start() 這次就能把先發真正凍結＋補寫後端。還沒有球場可畫，比分區＋「這局誰
            // 先發球」置中就好，不用左右分欄。
            <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
              {scoreDisplay}
              <p className="text-sm font-bold text-[#f5f5f0]">這局由誰先發球？</p>
              <div className="flex gap-3">
                <button className={PRIMARY_BUTTON_CLASS} onClick={() => start("us", activeLineup)}>
                  我方先發
                </button>
                <button
                  className={SECONDARY_BUTTON_CLASS}
                  onClick={() => start("opponent", activeLineup)}
                >
                  對手先發
                </button>
              </div>
              {/* 先發是「每局可不同」的（issue #115）：選先發方那一刻，會把當下的站位凍結成
                這一局的先發（開局凍結）。開賽前右欄的站位面板本來就是可以直接編輯的——
                不用另外按「改」切換模式，改了立刻生效。 */}
              <p className="mt-1 max-w-xs text-center text-xs text-[#a9b096]">
                這一局會用右欄目前的站位，隨時可以直接在右欄改。
              </p>
            </div>
          ) : (
            // 比賽進行中：往左右發展——球場放左邊（吃滿剩餘寬度、放大），比分＋操作按鈕收在
            // 右邊一直欄（使用者要求：不要把功能都擠成上下一長條）。
            <>
              {/* ── 左：球場 ── */}
              <div className="flex min-w-0 flex-col gap-2 p-4">
                {selectedBenchPlayer ? (
                  <div className="flex w-full items-center justify-between rounded-lg border border-[#3b82f6]/40 bg-[#3b82f6]/15 px-3 py-1.5 text-sm">
                    <span className="font-semibold text-[#93c5fd]">
                      換人模式：點球場上的球員換下
                    </span>
                    <button
                      onClick={() => setSelectedBenchPlayer(null)}
                      className="text-xs text-[#93c5fd] underline"
                    >
                      取消
                    </button>
                  </div>
                ) : (
                  <p className="shrink-0 text-center text-xs text-[#a9b096]">
                    在球場上畫線連到球員記一球，長按球員可以換人
                  </p>
                )}

                <div className="flex min-h-0 w-full flex-1 items-center justify-center">
                  <ScoreSheetCourt
                    ourPositions={ourPositions}
                    roster={match.players}
                    opponentRotation={currentSet.opponentRotation}
                    serving={currentSet.serving}
                    interactive={gesture === null}
                    onPlayerTouch={handlePlayerTouch}
                    onLiberoSubstitute={handleLiberoSubstitute}
                    regularSubs={regularSubs}
                    selectedBenchPlayer={selectedBenchPlayer}
                    onBenchPlayerSelect={setSelectedBenchPlayer}
                    onRegularSub={handleRegularSub}
                    liberoSubstitution={liberoSubstitution}
                    selectedLiberoId={selectedLiberoId}
                    onSelectLibero={handleSelectLibero}
                  />
                </div>
              </div>

              {/* ── 右：比分 + 操作按鈕（直欄） ──
                  垂直置中（justify-center）、不加分隔線——跟左邊球場之間單純靠留白區隔，
                  不需要一條實體邊框線。 */}
              <div className="flex w-[280px] shrink-0 flex-col items-center justify-center gap-6 overflow-y-auto p-5">
                {scoreDisplay}

                {/* 暫停（issue #44）：每一方一顆鈕，標籤帶「已用/上限」，達到 2 次就反灰
                  （MAX_TIMEOUTS_PER_SET，理由見常數註解）。叫暫停跟得分/換人一樣走
                  controller 的 callTimeout：本地即時記一筆、背景寫進後端、可被「復原」退掉。 */}
                <div className="flex w-full gap-2">
                  <button
                    className={`${SECONDARY_SM_BUTTON_CLASS} flex-1`}
                    disabled={ourTimeoutCount >= MAX_TIMEOUTS_PER_SET}
                    onClick={() => callTimeout("us")}
                  >
                    我方暫停 {ourTimeoutCount}/{MAX_TIMEOUTS_PER_SET}
                  </button>
                  <button
                    className={`${SECONDARY_SM_BUTTON_CLASS} flex-1`}
                    disabled={opponentTimeoutCount >= MAX_TIMEOUTS_PER_SET}
                    onClick={() => callTimeout("opponent")}
                  >
                    對手暫停 {opponentTimeoutCount}/{MAX_TIMEOUTS_PER_SET}
                  </button>
                </div>

                {/* 復原/下一局/結束比賽：原本 2×2 還有一顆「沒看到」，現在併進球場改成
                  「我方(全體)」（跟「對手(全體)」對稱的虛線框，走一模一樣的選動作／選得失分
                  流程，見 ScoreSheetCourt.tsx 的 hitTargets 說明），剩三顆排成一列。 */}
                <div className="grid w-full grid-cols-3 gap-2">
                  {/* 一顆「復原」鈕，一次退最近一個動作（得分／一般換人／手動 libero／暫停），
                    連按就一路往回（issue #41）。可用與否看復原堆疊深度，不是只看記了幾顆球
                    ——這樣剛換完人、還沒記下一球時也退得掉那次換人。 */}
                  <button
                    className={GHOST_BUTTON_CLASS}
                    disabled={undoDepth === 0}
                    onClick={handleUndo}
                  >
                    復原
                  </button>
                  <button className={GHOST_BUTTON_CLASS} onClick={handleNextSet}>
                    下一局
                  </button>
                  {/* 結束比賽（issue #20 → #218 改寫）：以前這裡是一顆 <Link>，按下去只是
                    導去分析頁——資料上完全沒有「這場打完了」這件事，最後一局也因此永遠被
                    當成進行中而不算數。現在它是一個**真正的動作**：開確認視窗 → 寫
                    matches.status = finished → 才導去分析頁。
                    樣式（#218 PO 決策 2「提示但不強制」）：勝局條件一達成就從 GHOST 換成
                    PRIMARY（萊姆綠實心），讓記錄者一眼看到「可以收尾了」，但畫面不會被彈窗
                    打斷、也還能繼續記分——記錯一球被強制中斷，比忘記按更惱人。 */}
                  <button
                    className={matchDecided ? PRIMARY_BUTTON_CLASS : GHOST_BUTTON_CLASS}
                    onClick={() => setShowFinishConfirm(true)}
                  >
                    結束比賽
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {gesture?.step === "action" && (
          <RadialMenu
            center={{ x: gesture.target.screenX, y: gesture.target.screenY }}
            // #50：六顆動作永遠留在固定方位（肌肉記憶），只把當下不可能的那顆「反灰」（不是
            // 拿掉）。disabledActions 依 發球方/動作方 算出要反灰的動作（規則#1 發球/接發互斥，
            // 恰好一顆）。選項數固定 6 個，RadialMenu 的環狀角度不會因為反灰而跑掉。
            options={[
              ...ACTION_OPTIONS.map((o) => ({
                ...o,
                disabled: disabledActions(
                  currentSet?.serving ?? null,
                  gesture.target.side,
                ).includes(o.value),
              })),
              // 「沒看到」只在比分卡觸發（沒有 playerId 也沒有 zone，代表「不挑細節、只知道
              // 是哪一方」）時才多這一顆——球場上點了明確的球員/號位，代表已經知道是誰做的，
              // 沒有「沒看到」的空間；只有這種「已知哪一方、但沒指定球員」的情境，才需要多
              // 一條連動作都不確定的逃生口。
              ...(!gesture.target.playerId && gesture.target.zone === undefined
                ? [{ value: "noSight" as const, label: "沒看到" }]
                : []),
            ]}
            onSelect={handleActionSelect}
            onCancel={() => setGesture(null)}
          />
        )}
        {gesture?.step === "outcome" && (
          <RadialMenu
            center={{ x: gesture.target.screenX, y: gesture.target.screenY }}
            options={OUTCOME_OPTIONS}
            onSelect={handleOutcomeSelect}
            onCancel={() => setGesture(null)}
            startAngle={180}
          />
        )}

        {/* 結束比賽的確認視窗（#218）。
          為什麼要有這一步、而不是按了就結束：這是這一頁唯一一個「改變整場比賽狀態」的動作，
          而它右邊就是「下一局」——手滑按錯的成本不對稱（按錯下一局頂多多一局空白，按錯結束
          會讓比賽在列表變成已完賽）。視窗裡直接把**最終局比數＋各局比分**攤開，讓記錄者用
          自己記的數字核對一次，而不是只問一句「確定嗎？」——後者其實沒有給人任何判斷依據。

          手刻 overlay 而不是用 shadcn 的 Dialog：跟這一頁其他按鈕同一個理由（見檔案上方
          PRIMARY_BUTTON_CLASS 那段），shadcn 那套元件的顏色綁在給淺色頁面用的 CSS 變數上，
          套在這個深色頁面會整個看不見。 */}
        {showFinishConfirm && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
            // 點視窗外面＝取消（跟按「還沒結束」等價）。onClick 掛在遮罩、內層 stopPropagation，
            // 是最小成本的「點外面關閉」，不用額外的 ref + document listener。
            onClick={() => setShowFinishConfirm(false)}
          >
            <div
              className="w-full max-w-sm rounded-2xl border border-white/[0.14] bg-[#14170f] p-6 text-center shadow-2xl shadow-black/60"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-base font-bold text-[#f5f5f0]">要結束這場比賽嗎？</h2>
              <div className="mt-4 flex items-end justify-center gap-3">
                <span className="font-score text-4xl tabular-nums text-[#C6F135]">
                  {finalOurSetsWon}
                </span>
                <span className="pb-1 font-score text-xl text-[#a9b096]">:</span>
                <span className="font-score text-4xl tabular-nums text-[#F0776C]">
                  {finalOpponentSetsWon}
                </span>
              </div>
              <div className="mt-3 space-y-1">
                {finalSetScores.map((s) => (
                  <div key={s.setNumber} className="text-xs text-[#a9b096]">
                    第 {s.setNumber} 局{" "}
                    <span
                      className={
                        setWinner(s) === "us" ? "font-bold text-[#C6F135]" : "text-[#f5f5f0]"
                      }
                    >
                      {s.ourScore}:{s.opponentScore}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs text-[#a9b096]">
                結束後這一頁會變成唯讀，但隨時可以按「重新開啟比賽」回來補記。
              </p>
              <div className="mt-5 flex justify-center gap-3">
                <button
                  className={SECONDARY_BUTTON_CLASS}
                  onClick={() => setShowFinishConfirm(false)}
                >
                  還沒結束
                </button>
                <button className={PRIMARY_BUTTON_CLASS} onClick={handleFinishMatch}>
                  確認結束
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
