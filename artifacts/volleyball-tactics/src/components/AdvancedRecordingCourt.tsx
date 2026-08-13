import { useEffect, useMemo, useRef, useState } from "react";
import { getZoneLayout } from "../lib/rotationLogic";
import type { Side, PlayAction } from "../types/scoresheet";
import type { MatchPlayer } from "../types/match";
import type { PlayerPosition } from "../types/rotationTable";
import { CourtGradientDefs, CourtSurface, CourtBorder, CourtLines } from "../lib/courtTheme";
import { toSvg, fromScreen, toScreen, rowOf } from "../lib/courtGeometry";
import {
  HIT_RADIUS,
  DWELL_MS,
  DWELL_MOVE_TOLERANCE,
  MOVE_CANCEL_SVG,
  dist,
  radialSelection,
} from "../lib/courtGesture";
import PlayerMarker from "./PlayerMarker";
import RadialMenu, { RadialMenuOption } from "./RadialMenu";
import { resolveScoringSide } from "../lib/scoreSheetMapping";
import { useAdvancedRecording, type DraftEvent } from "../hooks/useAdvancedRecording";

// 進階版補填專用的球場（issue #392）。**刻意不**在 ScoreSheetCourt.tsx 裡加一個
// `advanced` 分支，理由跟 ADR-0010 一致，寫在這裡而不是只留在 issue 討論裡：
//   1. ScoreSheetCourt 的 pointer handler 已經跟賽中專屬功能（一般換人、自由球員拖曳、
//      長按換人清單）纏在一起——那些狀態機（selectedBenchPlayer/regularSubs/liberoPlayer…）
//      進階版完全用不到，硬塞一個條件分支只會把兩套互不相關的手勢邏輯揉進同一個
//      pointerdown/pointermove/pointerup，改一邊要小心不要動到另一邊。
//   2. ADR-0010 的「後果」段落明講：進階版的滑「方向」跟簡易版相反（簡易版是從球員畫線
//      出去、鬆開命中目標；進階版是按下當下立刻彈出選單、滑向選項），且**刻意不改簡易版**
//      ——那是已經在用的東西。兩份程式碼在檔案層級分開，簡易版的 git diff 在這張票的 PR 上
//      肉眼可證是零；如果擠進同一個檔案、同一組 handler，要靠人工 review 才能相信「簡易版
//      真的沒被動到」，遠不如「這個檔案根本沒改」可靠。
//
// 因此這個元件**不吃**任何 onRegularSub / onLiberoSubstitute / selectedBenchPlayer 之類
// 賽中專屬的 prop——它只認球員/名單/對手輪轉，用來畫出球場跟命中判定。

interface AdvancedRecordingCourtProps {
  matchId: string;
  // 這一分要畫的我方站位——由外層（ScoreSheet.tsx）從輪轉表/計分表換算好傳進來，
  // 跟 ScoreSheetCourt 拿 ourPositions 當 prop 是同一個理由：這個元件不用知道站位怎麼算的。
  ourPositions: PlayerPosition[];
  roster: MatchPlayer[];
  opponentRotation: number;
  // 這一分收尾了：勝方是誰、最後一球是誰打的什麼動作（可能是 null——使用者也可以什麼球都
  // 沒記就直接判一分）。這個元件**自己不加分**：加分要動的是計分表那一整套（比分、輪轉、
  // 發球權、寫進後端 rallies/events），而那套東西住在 useScoreSheetController，是頁面
  // （ScoreSheet.tsx）在拿的。球場只負責「看懂手勢」，把結論往上報。
  //
  // 這是刻意的分工，不是懶得接：同一個結論（誰得這一分）必須跟簡易版走**同一條**加分路徑，
  // 兩邊各接一次的話，之後只要有人改了記分流程（例如加一道賽末點判斷），一定會有一邊沒改到。
  onFinishRally: (winner: Side, lastBall: DraftEvent | null) => void;
}

// 動作選單的 6 顆選項。刻意不共用 ScoreSheet.tsx（頁面）裡那份 ACTION_OPTIONS——那份混了
// disabledActions（依發球方灰掉不可能的動作）等賽中專屬的情境判斷，進階版補填沒有「現在是
// 誰發球」這種即時語境（賽後對著影片，任何動作在任何時間點都可能發生），簡單重列一份 6
// 顆固定選項更清楚。EXPORT 出去是因為 ScoreSheet.tsx 的提示列（見該檔案 isAdvanced 分支）
// 要把「目前半完成的球是什麼動作」翻成中文顯示，兩處共用同一份文案，不要各寫一次。
export const ADVANCED_ACTION_OPTIONS: RadialMenuOption<PlayAction>[] = [
  { value: "serve", label: "發球" },
  { value: "receive", label: "接發" },
  { value: "set", label: "舉球" },
  { value: "attack", label: "攻擊" },
  { value: "block", label: "攔網" },
  { value: "dig", label: "防守" },
];
const ACTION_LABEL: Record<PlayAction, string> = Object.fromEntries(
  ADVANCED_ACTION_OPTIONS.map((o) => [o.value, o.label]),
) as Record<PlayAction, string>;
export function actionLabel(action: PlayAction): string {
  return ACTION_LABEL[action];
}

// 動作選單實際彈出來的選項＝6 個動作 ＋ 第 7 格「取消」（PO 2026-08-13 定案）。
//
// 為什麼取消要佔一格，而不是畫在圓心：圓心是**球員自己**。把 ✕ 蓋在球員頭上，等於在
// 使用者按住的那顆圈上面壓一個「刪除」符號，看起來像「刪掉這個球員」而不是「不選動作」。
// 開第 7 格則完全沒有這個歧義——它跟其他六個選項一樣是「往那個方向滑」，只是滑到它
// 什麼都不會發生。radialOptionOffsets 的半徑會自動從 56 放大成 56×7/6，七顆鈕之間的
// 間距維持原樣，不用另外調版面（見 courtGesture.ts 那支函式的說明）。
//
// 型別是 PlayAction 的**擴充**而不是另開一個平行清單：選單值域比 PlayAction 多一個
// "cancel"，讓 TypeScript 在 pointerup 那裡強迫我們處理它（漏掉會編不過），而不是靠
// 註解提醒「記得排除取消」。
type ActionMenuValue = PlayAction | "cancel";
const ACTION_MENU_OPTIONS: RadialMenuOption<ActionMenuValue>[] = [
  ...ADVANCED_ACTION_OPTIONS,
  { value: "cancel", label: "取消" },
];

type Outcome = "win" | "lose";
// 跟簡易版（ScoreSheet.tsx 的 OUTCOME_OPTIONS）同一套排版決定：[lose, win] 搭配
// startAngle=180，2 個選項會落在左（180°）／右（0°）——PO 明確要求得失分維持「左右」。
// 所以這一組**不加**第 7 格取消（會變成 3 顆、左右就不成立了）；它的取消是「放開在死區」，
// 而這個選單的圓心是球場上一個落點、不是球員，所以中央畫 ✕ 沒有上面那個歧義問題。
const OUTCOME_OPTIONS: RadialMenuOption<Outcome>[] = [
  { value: "lose", label: "失分" },
  { value: "win", label: "得分" },
];
const ACTION_START_ANGLE = -90; // RadialMenu 的預設值，這裡明寫出來是因為判定命中要用同一個角度。
const OUTCOME_START_ANGLE = 180;

// 命中判定清單裡的一格——跟 ScoreSheetCourt.tsx 的 HitTarget 形狀一樣（我方球員 or
// 對手號位），但這裡不需要 xNorm/yNorm（那是自由球員後排判定用的，這個元件沒有自由球員）。
interface HitTarget {
  side: Side;
  playerId: string | null; // 對手一律 null，跟 DraftEvent.playerId 對齊
  zone?: number; // 只有對手側有意義，純粹拿來畫面上比對「是不是同一顆圈」，不進 DraftEvent
  x: number;
  y: number;
}

export default function AdvancedRecordingCourt({
  matchId,
  ourPositions,
  roster,
  opponentRotation,
  onFinishRally,
}: AdvancedRecordingCourtProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const screenToSvg = (clientX: number, clientY: number) =>
    fromScreen(clientX, clientY, svgRef.current);
  const svgToScreen = (x: number, y: number) => toScreen(x, y, svgRef.current);

  const draft = useAdvancedRecording((state) => state.chainsByMatch[matchId]);
  const startBall = useAdvancedRecording((state) => state.startBall);
  const setLandingPoint = useAdvancedRecording((state) => state.setLandingPoint);
  // 取消半完成的那一球不由這個元件觸發——那顆「取消」鈕住在球場上方的提示列
  // （pages/ScoreSheet.tsx），它直接呼叫 store 的 cancelCurrentBall。這正是把這份狀態放進
  // store（而不是元件內 useState）換來的好處：球場以外的元件也讀得到、也改得動。
  const balls = draft?.balls ?? [];
  const current = draft?.current ?? null;

  const opponentZones = getZoneLayout(opponentRotation, true);
  const hitTargets = useMemo<HitTarget[]>(
    () => [
      ...opponentZones.map((slot) => ({
        side: "opponent" as const,
        playerId: null,
        zone: slot.zone,
        ...toSvg(slot),
      })),
      ...ourPositions.map((pos) => ({
        side: "us" as const,
        playerId: pos.playerId,
        ...toSvg(pos),
      })),
    ],
    [opponentZones, ourPositions],
  );

  const findNearestHit = (pt: { x: number; y: number }): HitTarget | null => {
    let nearest: HitTarget | null = null;
    let nearestD = Infinity;
    for (const t of hitTargets) {
      const d = dist(pt.x, pt.y, t.x, t.y);
      if (d < nearestD) {
        nearestD = d;
        nearest = t;
      }
    }
    return nearest && nearestD <= HIT_RADIUS ? nearest : null;
  };

  // ── 選單狀態 ──
  // menu 只管畫面：「現在有沒有彈出選單、彈的是動作還是得失分、圓心在螢幕哪裡」。
  // 選中之後要拿來寫進 store 的東西（是哪個球員／哪一側）**不放這裡**，放 gestureRef——
  // 那是判定用的資料，pointerup 當下就要讀得到，不能等 React 重繪（見 gestureRef 的說明）。
  type MenuPhase = "action" | "outcome";
  const [menu, setMenu] = useState<{
    phase: MenuPhase;
    center: { x: number; y: number };
  } | null>(null);
  // 拖曳中「離哪個選項最近」，餵給 RadialMenu 的 highlightedValue（見該元件的說明：
  // 拖曳型選單沒有原生 hover，要外部算好告訴它該亮哪顆）。型別是兩種選單選項值的聯集
  // （動作選單開著時是 PlayAction，得失分選單開著時是 Outcome），不是泛用的 string——
  // 這樣才能直接餵給 RadialMenu<T> 泛型化過的 highlightedValue prop，不用另外轉型。
  const [highlighted, setHighlighted] = useState<ActionMenuValue | Outcome | null>(null);
  // 目前半完成中的那一球，具體是「哪一顆圈」被選中——這個資訊只有畫面需要（持續高亮那顆圈、
  // 判斷「點回同一顆＝取消」），DraftEvent 本身不存它：DraftEvent 的形狀要對齊
  // events 表（只有 playerId，沒有「對手是哪個號位」這種概念，見該型別的註解），
  // 所以這裡額外用一份純畫面用的 local state 記著，不污染 store 的資料形狀。
  const [halfCompleteTarget, setHalfCompleteTarget] = useState<HitTarget | null>(null);
  // 補落點時跟著指尖跑的那條預覽線的終點（SVG 座標），null ＝ 現在沒有在補落點。
  // 跟簡易版畫線手勢的 dragCurrent（ScoreSheetCourt.tsx）是同一種東西：手勢進行中的
  // 「你現在會記到哪裡」即時回饋，手指放開就消失，所以是純畫面用的 local state。
  const [previewPoint, setPreviewPoint] = useState<{ x: number; y: number } | null>(null);

  // 預覽線的起點（見下面 JSX 的說明）。上一球的落點優先；沒有上一球時退回剛滑中的那顆圈。
  const lastBall = balls.length > 0 ? balls[balls.length - 1] : null;
  const previewOrigin =
    lastBall && lastBall.toX !== null && lastBall.toY !== null
      ? { x: lastBall.toX, y: lastBall.toY }
      : halfCompleteTarget
        ? { x: halfCompleteTarget.x, y: halfCompleteTarget.y }
        : null;

  // 這份高亮是 store 的 current（半完成的那一球）的**畫面回音**，不是第二份真相：current
  // 一旦消失（tap 補完落點、或使用者按了提示列的「取消」鈕），高亮就要跟著熄掉。
  //
  // 為什麼要用 effect 而不是「在補完落點那一行順手清掉」：取消鈕在另一個元件裡（見上面
  // cancelCurrentBall 那段），它清掉的是 store 的 current，碰不到這裡的 local state——
  // 靠「每個會清掉 current 的地方都記得也清一次高亮」是那種一定會漏掉一處的寫法（漏掉的
  // 症狀是圈一直亮著、但其實沒有球在等落點）。改成單向跟隨 store，就只有一個地方要對。
  //
  // 只在「該熄而還亮著」時才寫 state，所以不會每次 render 都觸發更新、不會無限迴圈。
  useEffect(() => {
    if (!current && halfCompleteTarget) setHalfCompleteTarget(null);
  }, [current, halfCompleteTarget]);

  // 手勢判定中間狀態（跟 ScoreSheetCourt.tsx 的 longPressTimerRef 等同一種考量：這些純粹是
  // 判斷用的中繼值，不需要驅動畫面重繪，放 ref 不放 state，避免 pointermove 頻繁觸發重繪）。
  const gestureRef = useRef<
    // center（選單圓心的螢幕座標）刻意在 ref 裡也留一份，不是只放在 menu 這個 state 裡：
    // pointerdown 呼叫 setMenu 之後，React 要到下一次 render 才會讓 handlePointerMove 讀到
    // 新的 menu。而**第一個 pointermove 很可能就發生在那次 render 之前**（手指落下的瞬間
    // 一定會抖），那一刻 menu 還是 null，用它算「離圓心多遠」會得到一個荒謬的大數字，
    // 長按判定當場被清掉——正是 PO 回報「長按滑得失分按不出來」的其中一條路徑。
    // ref 是同步寫入的，沒有這個時間差。
    | {
        // 按在球員/號位圈上 → 動作選單。
        kind: "slide";
        startSvg: { x: number; y: number };
        target: HitTarget;
        center: { x: number; y: number };
      }
    | {
        // 按在球場空白處。兩種可能，放開（或停駐計時器觸發）之前分不出來：
        //   a. 短按 → 這一球的落點
        //   b. 按著不游移超過 DWELL_MS → 升級成 kind: "outcome"，得失分選單就開在這一點
        // dwellAnchor 是「目前這一段停駐從哪裡開始算」（螢幕座標）；手指游移就換一個新的
        // 起點重新計時（見 handlePointerMove）。null ＝ 這次按下沒有資格開得失分選單。
        kind: "tap";
        startSvg: { x: number; y: number };
        dwellAnchor: { x: number; y: number } | null;
      }
    | {
        // 停駐已觸發，得失分選單開在手指停住的那一點。
        //   side    ＝ 最後一球是誰打的，用來把「得分/失分」解成「哪一方拿到這一分」
        //   landing ＝ 這一點同時也是最後一球的落點（還沒記進去，收尾時一起補），
        //             null 代表落點早就記過了（走的是「已經 tap 完、事後才想收尾」那條路）
        kind: "outcome";
        side: Side;
        center: { x: number; y: number };
        landing: { x: number; y: number } | null;
      }
    | null
  >(null);
  const dwellTimerRef = useRef<number | null>(null);

  const clearDwellTimer = () => {
    if (dwellTimerRef.current !== null) {
      window.clearTimeout(dwellTimerRef.current);
      dwellTimerRef.current = null;
    }
  };

  // 停駐計時器上膛：等 DWELL_MS 之後，把這次手勢升級成「選得失分」，選單開在 anchor 這一點。
  // 抽成一支函式是因為它有兩個呼叫點——pointerdown 第一次上膛、pointermove 手指游移後重新
  // 計時——兩邊必須做完全一樣的事，各寫一次遲早會漂走。
  //
  // 升級要同時改 ref（判定用，pointerup 立刻要讀）跟 state（畫面用）：ref 是同步的，state 要
  // 等下一次 render，而使用者放開手指的那一刻可能就在下一次 render 之前。
  const armDwellTimer = (
    anchorScreen: { x: number; y: number },
    side: Side,
    landing: { x: number; y: number } | null,
  ) => {
    dwellTimerRef.current = window.setTimeout(() => {
      dwellTimerRef.current = null;
      gestureRef.current = { kind: "outcome", side, center: anchorScreen, landing };
      setMenu({ phase: "outcome", center: anchorScreen });
      setHighlighted(null);
    }, DWELL_MS);
  };

  // 目前開著的選單，選項清單跟起始角是什麼——選取判定（pointerup）、高亮判定（pointermove）
  // 跟畫面（<RadialMenu/>）三個地方都要用同一組，各寫一次遲早會有一處忘了跟著改。
  const menuOptionsFor = (
    phase: MenuPhase,
  ): { options: RadialMenuOption<string>[]; startAngle: number } =>
    phase === "action"
      ? { options: ACTION_MENU_OPTIONS, startAngle: ACTION_START_ANGLE }
      : { options: OUTCOME_OPTIONS, startAngle: OUTCOME_START_ANGLE };

  // 指尖目前選到選單裡的哪一顆；null ＝ 還在死區裡（＝取消）。判定收在 courtGesture.ts 的
  // radialSelection，跟 RadialMenu 畫選項用的是同一套角度數學，畫面跟判定不會漂走。
  const selectionAt = (
    center: { x: number; y: number },
    phase: MenuPhase,
    client: { x: number; y: number },
  ): ActionMenuValue | Outcome | null => {
    const { options, startAngle } = menuOptionsFor(phase);
    const idx = radialSelection(center, client, options.length, startAngle);
    // menuOptionsFor 為了能回傳兩種不同值域的清單，宣告成 RadialMenuOption<string>[]，
    // 這裡轉回實際的聯集型別。安全的理由是兩份清單的值都在這個聯集裡（就在上面幾行，
    // 一眼可證），而不是「反正跑起來會對」。
    return idx === null ? null : (options[idx].value as ActionMenuValue | Outcome);
  };

  // ── Step 1：pointerdown 分岔 ──
  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    // 跟 ScoreSheetCourt.tsx 的自由球員拖曳同一招：setPointerCapture 讓後續的
    // pointermove/pointerup 不管手指實際移到哪裡（包括滑出球場 SVG 的範圍），都繼續打在
    // 這個元素上——選單疊在球場最上層，沒有這行的話，手指一滑進選單的 DOM 節點，
    // pointermove/pointerup 就會改成打在選單上，這個元件收不到後續事件，手勢會斷掉。
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = screenToSvg(e.clientX, e.clientY);
    const hit = findNearestHit(pt);

    if (hit) {
      // ── 滑類分支：按下當下立刻彈出動作選單 ──
      // 這正是跟簡易版方向相反的地方（ADR-0010「後果」段落）：簡易版是放開手指才彈選單，
      // 進階版是按下當下就彈、使用者接著把手指滑向想要的選項。
      // 這裡**不上**停駐計時器：收尾這一分的長按掛在球場上（見下面的 tap 分支），不在球員身上。
      const center = svgToScreen(hit.x, hit.y);
      gestureRef.current = { kind: "slide", startSvg: pt, target: hit, center };
      setMenu({ phase: "action", center });
      setHighlighted(null);
      return;
    }

    // ── tap 候選分支：沒命中任何圈，等放開手指（或停駐計時器觸發）才知道這次要幹嘛 ──
    //
    // 「這一分打完了、算誰得分」的收尾手勢掛在這裡：**按在球場上不游移超過 1 秒**，得失分
    // 選單就在手指下方彈出來（PO 2026-08-13 定案）。它跟「點一下記落點」共用同一次按壓——
    // 短放＝落點、按住＝這球就落在這裡而且這一分到此結束。改成這樣之前要先 tap 完落點、
    // 再回頭長按同一顆點，等於同一個意思要按兩次。
    //
    // side（這一分算誰贏要從誰的動作去解）取「最後一球是誰打的」：優先用還在等落點的那顆
    // （current），沒有的話用已經記完的最後一球——後者是「落點早就 tap 完了，事後才想起來
    // 要收尾」那條路，這時 landing 傳 null，收尾時就不用再補落點。
    // 兩顆都沒有＝這一分一球都還沒記，沒有東西可以歸屬，就不上膛。
    const anchorBall = current ?? lastBall;
    if (anchorBall) {
      const landing = current ? pt : null;
      armDwellTimer({ x: e.clientX, y: e.clientY }, anchorBall.side, landing);
    }
    gestureRef.current = {
      kind: "tap",
      startSvg: pt,
      dwellAnchor: anchorBall ? { x: e.clientX, y: e.clientY } : null,
    };

    // 已經有一顆球在等落點的話，按下的當下就把預覽線畫出來（不用等到手指開始移動）——
    // 觸控裝置沒有 hover，如果只在 pointermove 才畫，使用者「按下去、直接放開」這種
    // 最常見的 tap 就從頭到尾看不到那條線。
    if (current) setPreviewPoint(pt);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const gesture = gestureRef.current;
    if (!gesture) return;

    if (gesture.kind === "tap") {
      const pt = screenToSvg(e.clientX, e.clientY);
      // 補落點中：預覽線的終點跟著指尖走。
      if (current) setPreviewPoint(pt);

      // 手指游移出容許範圍 → 這一段停駐**重新從現在這一點開始算**，不是取消。
      // 「停駐一秒」講的是「停在某處一秒」，使用者本來就是一邊移動一邊找落點，找到才停下來；
      // 一動就永久取消的話，只有那種一按下去就剛好按在對的位置的人才叫得出這個選單。
      if (
        gesture.dwellAnchor &&
        dist(gesture.dwellAnchor.x, gesture.dwellAnchor.y, e.clientX, e.clientY) >
          DWELL_MOVE_TOLERANCE
      ) {
        clearDwellTimer();
        const anchorBall = current ?? lastBall;
        if (anchorBall) {
          gesture.dwellAnchor = { x: e.clientX, y: e.clientY };
          armDwellTimer(gesture.dwellAnchor, anchorBall.side, current ? pt : null);
        }
      }
      return;
    }

    // 即時更新選單高亮：算出指尖現在落在哪一扇。
    // 圓心讀 ref（理由見 gestureRef 的說明），phase 讀 state——menu 還沒就位的那一兩幀
    // 就先不更新高亮，反正那時手指還在死區裡，該亮的本來就沒有（highlighted 初始值是 null）。
    if (menu) {
      setHighlighted(selectionAt(gesture.center, menu.phase, { x: e.clientX, y: e.clientY }));
    }
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    clearDwellTimer();
    const gesture = gestureRef.current;
    gestureRef.current = null;
    setPreviewPoint(null);
    if (!gesture) return;

    if (gesture.kind === "slide") {
      const picked = selectionAt(gesture.center, "action", {
        x: e.clientX,
        y: e.clientY,
      }) as ActionMenuValue | null;
      // 兩種都是「不記」：picked === null ＝ 放開在死區（手指沒離開球員就鬆手），
      // "cancel" ＝ 明確滑到第 7 格取消。分開寫是為了讓 TypeScript 逼我們處理 "cancel"，
      // 但結果一樣什麼都不做——所以下面 startBall 收到的一定是真正的 PlayAction。
      if (picked !== null && picked !== "cancel") {
        startBall(matchId, gesture.target.side, gesture.target.playerId, picked);
        setHalfCompleteTarget(gesture.target);
      }
      setMenu(null);
      setHighlighted(null);
      return;
    }

    if (gesture.kind === "outcome") {
      const picked = selectionAt(gesture.center, "outcome", {
        x: e.clientX,
        y: e.clientY,
      }) as Outcome | null;
      if (picked !== null) {
        // 停駐的那一點就是最後一球的落點——先把它補進去（landing 是 null 代表落點稍早已經
        // tap 過了，這裡沒有東西要補）。順序不能反：收尾時要把「最後一球」報上去，那顆球
        // 得先是完整的。
        let finishedBall = current;
        if (gesture.landing && current) {
          setLandingPoint(matchId, gesture.landing.x, gesture.landing.y);
          finishedBall = { ...current, toX: gesture.landing.x, toY: gesture.landing.y };
        }
        // 這一分的勝方＝解出「最後一球是誰打的（gesture.side）＋得分/失分」對應到誰贏。
        // resolveScoringSide 跟簡易版（ScoreSheet.tsx handleOutcomeSelect）共用同一支純函式。
        onFinishRally(resolveScoringSide(gesture.side, picked), finishedBall ?? lastBall);
      }
      setMenu(null);
      setHighlighted(null);
      return;
    }

    // ── Step 2b：tap 候選 ──
    const pt = screenToSvg(e.clientX, e.clientY);
    const moved = dist(gesture.startSvg.x, gesture.startSvg.y, pt.x, pt.y);
    if (moved >= MOVE_CANCEL_SVG) return; // 無效手勢（有明顯位移但沒命中任何圈）：直接丟棄，不猜

    if (!current) return; // 沒有半完成的球可以補落點，這次點擊不代表任何事

    // tap 在球場上只有一個意思：**這一球的落點**（PO 2026-08-13 定案）。
    //
    // 這裡曾經有一個「點回原本那顆圈＝取消這一球」的分支。拿掉的理由有兩層：
    //   1. 產品上：那讓球場出現一塊「記不了落點」的死區（被選中那顆圈周圍 HIT_RADIUS 之內），
    //      而落點確實可能落在那裡——例如防守把球救成高球，球就落在自己頭上。取消這件事
    //      改由提示列那顆看得見的「取消」鈕負責（見 pages/ScoreSheet.tsx），使用者不用猜
    //      「點哪裡算取消」。
    //   2. 那個分支其實從來沒有執行過：走到這一段的前提是 pointerdown 當下 **沒有**命中
    //      任何圈（否則會走上面的滑類分支），所以放開時 findNearestHit 幾乎必然也是 null，
    //      而比對函式碰到 null 一律回 false。**一個看似在做判斷、實際上永遠走同一邊的
    //      條件式，比沒有這個條件式更危險**——它會讓讀程式的人以為某個行為存在。
    setLandingPoint(matchId, pt.x, pt.y);
  };

  // pointer 被系統取消（例如觸控被手勢導覽搶走）：跟 handlePointerUp 不同，這裡不猜使用者
  // 想記什麼，單純把手勢中斷、關掉選單，不呼叫任何 store 動作——半完成的球（如果有）維持
  // 原樣，使用者下次的手勢還能接著補完或取消它。
  const handlePointerCancel = () => {
    clearDwellTimer();
    gestureRef.current = null;
    setMenu(null);
    setHighlighted(null);
    setPreviewPoint(null);
  };

  const playerLabel = (p: { name: string; number: number; role: string }) =>
    p.name || `${p.role}${p.number}`;

  return (
    <div className="mx-auto flex h-full w-full max-w-[480px] items-center justify-center">
      <div
        className="court-shell relative flex-shrink-0"
        style={{ height: "100%", aspectRatio: "1/2" }}
      >
        <div className="court-glass absolute inset-0 shadow-lg shadow-black/30">
          <div className="court-edge-light" />
          <svg
            ref={svgRef}
            viewBox="0 0 100 200"
            preserveAspectRatio="none"
            className="h-full w-full touch-none select-none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
          >
            <CourtGradientDefs id="adv-court-gradient" />
            <CourtSurface />
            <CourtBorder />
            <CourtLines id="adv-court-gradient" />

            {/* 對手號位圈：跟 ScoreSheetCourt.tsx 共用同一組視覺語彙（珊瑚紅、70% 不透明度），
                直接沿用這 6 個既有的圈當滑的起點，不新增專屬的「對手」標記——使用者在簡易版
                已經認得這 6 個圈（見票面「對手側」那段）。 */}
            {opponentZones.map((slot) => {
              const { x, y } = toSvg(slot);
              const isHalfComplete =
                halfCompleteTarget?.side === "opponent" && halfCompleteTarget.zone === slot.zone;
              return (
                <g key={`opp-${slot.zone}`} transform={`translate(${x},${y})`}>
                  {/* 半完成高亮：常駐邊框、不做動畫（票面明講「不要動畫」）。 */}
                  {isHalfComplete && (
                    <circle r="9.5" fill="none" stroke="#CCFF00" strokeWidth="1.5" />
                  )}
                  <PlayerMarker
                    number={slot.zone}
                    name=""
                    color="rgba(239, 68, 68, 0.7)"
                    radius={6}
                    glowBlur={0.75}
                  />
                </g>
              );
            })}

            {/* 我方球員圈：前排/後排配色跟 ScoreSheetCourt.tsx 同一套（rowOf → 前排萊姆綠、
                後排白），半完成時額外套一圈常駐高亮邊框。這個元件沒有換人/自由球員概念，
                ourPositions 給的就是這一分要畫的名單，不用再處理格主/蓋格那些狀態機。 */}
            {ourPositions.map((pos) => {
              const player = roster.find((p) => p.id === pos.playerId);
              if (!player) return null;
              const { x, y } = toSvg(pos);
              const isFrontRow = rowOf(pos.y) === "front";
              const isHalfComplete =
                halfCompleteTarget?.side === "us" && halfCompleteTarget.playerId === pos.playerId;
              const color = isFrontRow ? "#CCFF00" : "#FFFFFF";
              return (
                <g key={pos.playerId} transform={`translate(${x},${y})`}>
                  {isHalfComplete && (
                    <circle r="9.5" fill="none" stroke="#CCFF00" strokeWidth="1.5" />
                  )}
                  <PlayerMarker
                    number={player.number}
                    name={playerLabel(player)}
                    color={color}
                    radius={6}
                  />
                </g>
              );
            })}

            {/* 已完成的球線：相鄰兩球用線段相連（前一球的落點 → 這一球的落點），ADR-0010
                決定 2——from 不存，起點在這裡現算。第一球沒有起點，只標落點。 */}
            {balls.map((ball, i) => {
              const prev = i > 0 ? balls[i - 1] : null;
              const label = ballLabel(ball, roster);
              return (
                <g key={ball.id}>
                  {prev &&
                    prev.toX !== null &&
                    prev.toY !== null &&
                    ball.toX !== null &&
                    ball.toY !== null && (
                      // 細直線（PO 2026-08-13：「線都可以是細一點的直線」）。一分裡球線
                      // 可能疊到十幾條，粗線會把球場糊成一團。
                      <line
                        x1={prev.toX}
                        y1={prev.toY}
                        x2={ball.toX}
                        y2={ball.toY}
                        stroke="#F5F5F0"
                        strokeOpacity="0.55"
                        strokeWidth="0.5"
                      />
                    )}
                  {ball.toX !== null && ball.toY !== null && (
                    <>
                      <circle cx={ball.toX} cy={ball.toY} r="1.8" fill="#C6F135" />
                      <text
                        x={ball.toX}
                        y={ball.toY - 3}
                        fontSize="3.4"
                        fill="#F5F5F0"
                        textAnchor="middle"
                        className="pointer-events-none"
                      >
                        {label}
                      </text>
                    </>
                  )}
                </g>
              );
            })}

            {/* 補落點中的預覽線（PO 2026-08-13 要的「滑完動作後、點落點時也要有一條線」）。
                跟簡易版畫線手勢同一套視覺語彙：細虛線＋終點一個小圈。
                起點的取法就是 ADR-0010 決定 2 那條規則本身——「一球的起點＝上一球的落點」，
                只有第一球沒有上一球，退回用「剛剛滑中的那顆圈」當起點（球確實是從那個人
                身上出去的）。所以這條線不需要任何新欄位，全部是現算的衍生值。 */}
            {previewOrigin && previewPoint && (
              <>
                <line
                  x1={previewOrigin.x}
                  y1={previewOrigin.y}
                  x2={previewPoint.x}
                  y2={previewPoint.y}
                  stroke="#C6F135"
                  strokeOpacity="0.8"
                  strokeWidth="0.5"
                  strokeDasharray="2 2"
                />
                <circle
                  cx={previewPoint.x}
                  cy={previewPoint.y}
                  r="1.8"
                  fill="none"
                  stroke="#C6F135"
                  strokeWidth="0.5"
                />
              </>
            )}
          </svg>
        </div>
      </div>

      {menu && (
        <RadialMenu<string>
          center={menu.center}
          // 選項與起始角一律走 menuOptionsFor，跟判定（selectionAt）讀的是同一支函式——
          // 畫面跟命中判定各寫一份 ternary 是這 repo 踩過的漂移坑（#352）。
          options={menuOptionsFor(menu.phase).options}
          startAngle={menuOptionsFor(menu.phase).startAngle}
          highlightedValue={highlighted ?? undefined}
          // 只有得失分選單畫圓心 ✕：它的圓心是球場上一個落點。動作選單的圓心是**球員本人**，
          // 在他頭上壓一個 ✕ 會讀成「刪掉這個球員」——所以動作選單的取消改成環上的第 7 格
          // （PO 2026-08-13 定案，見 ACTION_MENU_OPTIONS 的說明）。
          showDeadZoneCancel={menu.phase === "outcome"}
          // 拖曳型選單的放開/選取邏輯完全由這個元件的 pointerup 處理（命中判定要跟球場共用
          // 同一份 pointer session，不能交給 RadialMenu 自己的 onPointerDown）；onSelect
          // 因此是 no-op，onCancel 也一樣——選單本身不需要能被「點背景」關掉：背景點擊
          // 事件在拖曳中根本不會發生（pointer 從 pointerdown 那刻就被球場的 <svg> capture
          // 住，見 handlePointerDown 的說明），選單只是這個元件狀態的「畫面」，不是獨立的
          // 互動來源。
          onSelect={() => {}}
          onCancel={() => {}}
        />
      )}
    </div>
  );
}

// 一球的簡短標籤（球員/對手 + 動作），畫在落點旁邊。
function ballLabel(ball: DraftEvent, roster: MatchPlayer[]): string {
  const who = ball.playerId ? (roster.find((p) => p.id === ball.playerId)?.name ?? "?") : "對手";
  return `${who} ${actionLabel(ball.action)}`;
}
