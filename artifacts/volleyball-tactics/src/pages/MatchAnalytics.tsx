// 單場比賽分析頁（#65 分析頁三視圖裡的「視圖一」）。
//
// 架構決策（已定案，寫在這裡讓之後接手的人知道為什麼長這樣）：
//   - 這一步走「Option 3」：完全重用簡易版計分表的既有資料（sets/rallies/events/
//     substitutions），零 schema 變更、幾乎純前端組裝。跟計分表共用同一個純函數
//     reconstructRecording（見 lib/scoreSheetMapping.ts）＋ buildPlayerMatrix
//     （lib/statsMapping.ts），不新寫一套平行統計邏輯——這樣兩個畫面看到的數字
//     保證一致，規則改一次兩邊一起生效。
//   - 這裡是唯讀頁面：用 useMatchRecording（而不是 useScoreSheetController）讀資料，
//     不會意外寫入/污染正在進行中的計分表 optimistic 快取。
//   - 差異化區塊（到位率、球線熱區）目前刻意留「誠實空狀態」：現有的簡易記錄
//     （PointRecord 只記「決定球」，沒有座標/品質這些欄位）算不出這些數字，硬湊
//     假資料只會讓使用者以為系統在唬爛，等進階記錄（賽後補填）真的落地了才點亮。
import { useState } from "react";
import { useParams, Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import AppShell from "@/components/AppShell";
import NavRail, { matchBackHref } from "@/components/NavRail";
import AnalyticsRotationRail from "@/components/AnalyticsRotationRail";
import { APP_BACKGROUND_STYLE, APP_SHELL_CLASS } from "@/lib/appChromeStyles";
import { countSetWins, setWinner, winsNeededFor } from "@/lib/matchOutcome";
import { useMatchWithRoster } from "@/hooks/useMatches";
import { useMatchRecording } from "@/hooks/useMatchRecording";
import { ACTIONS, ACTION_LABELS, buildPlayerMatrix, buildRotationStats } from "@/lib/statsMapping";
import { PointRecord } from "@/types/scoresheet";
import { captureBlank } from "@/lib/courtSnapshot";

// 找不到比賽時的「回列表」次要按鈕，跟 ScoreSheet.tsx 同一套語言（見該檔案同名常數的
// 註解：不透過 shadcn Button，因為那套元件的顏色綁在給淺色頁面用的 CSS 變數上）。
const SECONDARY_BUTTON_CLASS =
  "inline-flex items-center justify-center rounded-full border border-white/[0.26] " +
  "bg-white/[0.05] px-5 py-2 text-sm font-bold text-[#f5f5f0] transition " +
  "hover:border-[#c6f135] hover:text-[#c6f135]";

// 每個統計區塊共用的玻璃卡片外觀，跟 ListItemCard.tsx 的卡片語言一致（rounded-2xl +
// border-white/[0.12] + bg-white/[0.07] + backdrop-blur-md）。
const GLASS_SECTION_CLASS =
  "rounded-2xl border border-white/[0.12] bg-white/[0.07] p-4 shadow-lg shadow-black/35 backdrop-blur-md";

// ── 分數成長階梯圖的純函數 ──
// 跟 buildPlayerMatrix 一樣的理由：把「資料 → 圖表座標」的計算抽成不碰 React 的純函數，
// 邏輯獨立好驗證，也讓下面的 JSX 只管畫、不管算。
type ScoreStepChart = {
  width: number;
  height: number;
  padLeft: number;
  xEnd: number;
  usPath: string;
  oppPath: string;
  usFinal: number;
  oppFinal: number;
  usLabelY: number;
  oppLabelY: number;
  gridLines: { y: number; score: number }[];
  fillRects: { x: number; y: number; width: number; height: number; ahead: "us" | "opp" | "tie" }[];
};

// 把一局的 history（每筆 PointRecord＝一個 rally＝一分）攤成「階梯狀比分成長圖」要畫的所有
// 座標。命名沿用 buildPlayerMatrix 的風格：輸入是純資料，輸出是畫面要用的最終數字，中間
// 過程不留副作用。
function buildScoreStepChart(history: PointRecord[]): ScoreStepChart {
  // 逐分還原「我方 / 對手」的累計比分：PointRecord.side === 'us' 代表這一分是我方拿下，
  // 其餘（'opponent'）是對手拿下。從 0:0（陣列的第一個元素）開始，每處理一筆 history
  // 就讓其中一邊 +1，另一邊維持不變——這樣兩條陣列的第 i 個元素，就是第 i 個 rally
  // 「結束當下」的比分，剛好可以拿來畫「比分隨時間變化」的折線。
  const us: number[] = [0];
  const opponent: number[] = [0];
  for (const point of history) {
    const prevUs = us[us.length - 1];
    const prevOpponent = opponent[opponent.length - 1];
    if (point.side === "us") {
      us.push(prevUs + 1);
      opponent.push(prevOpponent);
    } else {
      us.push(prevUs);
      opponent.push(prevOpponent + 1);
    }
  }

  const rallyCount = history.length; // us/opponent 陣列長度都是 rallyCount + 1（含起點 0:0）
  const finalMax = Math.max(us[us.length - 1], opponent[opponent.length - 1], 1);
  // Y 軸刻度固定每 5 分一條、無條件進位到 5 的倍數（例如打到 17 分，格線畫到 20），
  // 圖表最上緣才會留一點呼吸空間，折線不會貼死在圖表邊框上。
  const yMax = Math.ceil(finalMax / 5) * 5 || 5;

  // 版面尺寸與留白（padding）。左邊留給 Y 軸刻度數字、右邊留給兩條線終點的直接文字標籤
  // （「我方 N」/「對手 N」，這張圖只有兩個數列，用端點文字取代圖例框，畫面更乾淨）。
  // 寬度隨 rally 數量增加（rally 越多，橫軸需要越多空間才不會擠成一團），但設下限
  // 320px，避免一局才打沒幾分時圖表窄到變形。
  const padLeft = 28;
  const padRight = 60;
  const padTop = 12;
  const padBottom = 12;
  const width = Math.max(320, rallyCount * 14 + padLeft + padRight);
  const height = 160;
  const innerWidth = width - padLeft - padRight;
  const innerHeight = height - padTop - padBottom;
  const xEnd = padLeft + innerWidth;

  // 資料座標 → 像素座標的轉換函式（圖表數學的核心）：
  //   X：把「第幾個 rally」（0 ~ rallyCount）等分佈在 innerWidth 這段像素寬度上。
  //   Y：SVG 的座標系「往下才是正方向」，跟一般人直覺「數字越大格子越往上」剛好相反，
  //      所以用 (1 - 分數/yMax) 把方向反過來——分數是 0 時换算結果落在圖表最下緣，
  //      分數是 yMax 時換算結果落在圖表最上緣。
  const xOf = (rallyIndex: number) =>
    padLeft + (rallyCount === 0 ? 0 : (rallyIndex / rallyCount) * innerWidth);
  const yOf = (score: number) => padTop + (1 - score / yMax) * innerHeight;

  // 畫「階梯狀」折線：這裡刻意不用平滑曲線，而是「先水平（H）再垂直（V）」的兩段式路徑
  // ——分數在拿到那一分之前維持不變（水平線），拿到那一分的瞬間才整段垂直跳到新高度，
  // 視覺上就是每贏一分往上跳一階，符合排球「一分一分累計」的本質（不是連續變化的量）。
  const buildStepPath = (values: number[]): string => {
    let d = `M ${xOf(0)} ${yOf(values[0])}`;
    for (let i = 1; i < values.length; i++) {
      d += ` H ${xOf(i)} V ${yOf(values[i])}`;
    }
    return d;
  };

  const gridLines: { y: number; score: number }[] = [];
  for (let score = 0; score <= yMax; score += 5) {
    gridLines.push({ y: yOf(score), score });
  }

  // 「有號分差」的填色帶：兩條累計比分線之間的垂直空隙，本身就是每個當下的分差
  // （差距越大，兩線離越遠）。與其為了畫分差另外開一條第三條線／第二個 Y 軸
  // （dual-axis 是資料視覺化的常見反例——兩個座標系疊在一起，讀者很容易誤判哪個數字
  // 對應哪個軸），不如直接把兩線之間的帶狀區域填色：領先方換人時顏色跟著換，
  // 讀者掃一眼色塊就知道「這段時間是誰在領先、領先多少」，資訊量跟兩條線本身共用同一個
  // 座標系統，不會多長出一個新的視覺元素要學。
  //
  // 具體做法：每一個 rally 區間（第 i 分打完、到第 i+1 分打完之間）各畫一塊矩形，
  // 高度＝這個區間裡兩隊分數的垂直距離（yOf(us[i]) 到 yOf(opponent[i])——用區間「起點」
  // 的分數，剛好對應階梯線在這個區間裡水平（H）不變的那一段，兩者是同一份資料），
  // 顏色由「這一刻是我方領先、對手領先、還是平手」決定。因為排球每次只加 1 分，
  // 逐區間分開畫矩形，比起想辦法拼一個「單一多邊形」簡單、不容易算錯，且色塊在
  // 領先方換人的那個 rally 邊界自然切齊、自動變色，不需要額外偵測「交叉點」在哪裡。
  const fillRects: ScoreStepChart["fillRects"] = [];
  for (let i = 0; i < rallyCount; i++) {
    const diff = us[i] - opponent[i];
    if (diff === 0) continue; // 平手：帶寬是 0，畫了也看不到，直接跳過
    const yUs = yOf(us[i]);
    const yOpp = yOf(opponent[i]);
    fillRects.push({
      x: xOf(i),
      y: Math.min(yUs, yOpp),
      width: xOf(i + 1) - xOf(i),
      height: Math.abs(yUs - yOpp),
      ahead: diff > 0 ? "us" : "opp",
    });
  }

  return {
    width,
    height,
    padLeft,
    xEnd,
    usPath: buildStepPath(us),
    oppPath: buildStepPath(opponent),
    usFinal: us[us.length - 1],
    oppFinal: opponent[opponent.length - 1],
    usLabelY: yOf(us[us.length - 1]),
    oppLabelY: yOf(opponent[opponent.length - 1]),
    gridLines,
    fillRects,
  };
}

export default function MatchAnalytics() {
  const { id } = useParams<{ id: string }>();
  const { match, isLoading: isMatchLoading } = useMatchWithRoster(Number(id));
  // record＝重建出來的計分狀態；ralliesBySetNumber/allRallies＝原始 rally，用來算「各輪次
  // 得失分」（可依局篩選，見下方 rotationStats）。三者都來自同一支唯讀 hook，一起 loading。
  //
  // 第二個參數（#218）：已完賽的比賽，最後一局也是「已結束局」，不能再被當成進行中那局
  // 丟掉——這正是以前分析頁少算一局的原因。match 還沒載入完時先當 false，等它到位會重算。
  const {
    record,
    ralliesBySetNumber,
    allRallies,
    isLoading: isRecordLoading,
  } = useMatchRecording(id ?? "", match?.status === "finished");

  // 全頁共用的「範圍」狀態：整場（"all"）或某一局（setNumber）。這是純前端 UI 狀態——
  // 不影響資料、reload 就重置，用 useState 就夠。React 規定 hooks 不能寫在 if/return 後面
  // （否則每次 render 呼叫的 hooks 數量可能不一樣，React 會對不上內部狀態順序），所以放在
  // 下面那些 early return 之前，即使此刻還沒有資料可以決定預設值。
  //
  // 設計（#65 這一輪 PO 定案）：把「比分總覽」裡的每一局比分卡片本身當成篩選按鈕，點某一局
  // 就把底下所有統計（球員、換人、各輪次、分數成長圖）全部篩到那一局；另加一顆「全場」按鈕
  // 回到整場彙總。所以只需要這一個 scope 狀態驅動全頁，不再是每個區塊各有一組切換。
  const [scope, setScope] = useState<number | "all">("all");

  if (id && (isMatchLoading || isRecordLoading)) {
    return (
      <div className="flex min-h-screen w-full flex-col items-center justify-center gap-4 bg-[#0a0b07] px-4 text-center font-dash text-[#f5f5f0]">
        <Spinner className="size-6" />
        <p className="text-[#a9b096]">載入比賽數據中…</p>
      </div>
    );
  }

  if (!match || !id) {
    return (
      <div className="flex min-h-screen w-full flex-col items-center justify-center gap-4 bg-[#0a0b07] px-4 text-center font-dash text-[#f5f5f0]">
        <p className="text-[#a9b096]">找不到這場比賽。</p>
        {/* 不用共用的 BackToMatchListButton：那顆元件走 shadcn Button 的淺色配色，是給
            還沒套用深色語言的頁面用的，這裡直接刻一顆跟這頁其他元素同一套語言的版本，
            不動共用元件本身。 */}
        <Link href="/" className={SECONDARY_BUTTON_CLASS}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          比賽列表
        </Link>
      </div>
    );
  }

  const completedSets = record?.completedSets ?? [];
  const currentSet = record?.currentSet;

  // 比分總覽：已結束的局 + 進行中的那一局（跟 ScoreSheetStats 的 setRows 是同一套判定：
  // currentSet.serving !== null 才代表這局真的已經開球，避免顯示一個 0:0 的空局）。
  type SetRow = {
    setNumber: number;
    ourScore: number;
    opponentScore: number;
    status: "completed" | "in-progress";
  };
  const setRows: SetRow[] = [
    ...completedSets.map((s) => ({
      setNumber: s.setNumber,
      ourScore: s.ourScore,
      opponentScore: s.opponentScore,
      status: "completed" as const,
    })),
    ...(currentSet && currentSet.serving !== null
      ? [
          {
            setNumber: currentSet.setNumber,
            ourScore: currentSet.ourScore,
            opponentScore: currentSet.opponentScore,
            status: "in-progress" as const,
          },
        ]
      : []),
  ];
  // 局比數走 matchOutcome.countSetWins（#226 PR2），不再各頁手寫一份。
  const { ourWins: ourSetsWon, opponentWins: opponentSetsWon } = countSetWins(completedSets);

  // 球員統計：completedSets 全部 history + currentSet.history 一起丟給 buildPlayerMatrix。
  const allHistory: PointRecord[] = [
    ...completedSets.flatMap((s) => s.history ?? []),
    ...(currentSet?.history ?? []),
  ];

  // 「有實際球序可看」的各局清單：球員統計的「場/局」切換、分數成長圖的選局，都是同一份
  // 候選名單，抽出來共用一次就好。跟上面 setRows 的判定邏輯類似（completedSets 全收，
  // currentSet 要 serving !== null 才算真的開賽），但這裡再多加一層「history 至少有一筆」
  // ——完全沒有分數紀錄的局，選了也只會看到空狀態，不值得在切換列上多佔一個位置。
  const setsWithHistory: { setNumber: number; history: PointRecord[] }[] = [
    ...completedSets.map((s) => ({ setNumber: s.setNumber, history: s.history ?? [] })),
    ...(currentSet && currentSet.serving !== null
      ? [{ setNumber: currentSet.setNumber, history: currentSet.history }]
      : []),
  ].filter((s) => s.history.length > 0);

  // 目前選到的局是否真的有球序可看：scope 是某一局、但那局不在 setsWithHistory 裡（理論上
  // 不會，因為按鈕就是從 setsWithHistory／setRows 長出來的），保守當作沒有。
  const scopedSet =
    scope === "all" ? undefined : setsWithHistory.find((s) => s.setNumber === scope);
  // 給底下各區塊的小標籤用：「全場」或「第 N 局」，讓使用者一眼知道現在看的是哪個範圍。
  const scopeLabel = scope === "all" ? "全場" : `第 ${scope} 局`;

  // ── 底下所有統計都吃同一個 scope，換範圍＝換一份輸入資料 ──
  // 球員決定球矩陣：全場用 allHistory 彙總，選某一局就只餵那一局的 history。
  const statsHistorySource: PointRecord[] =
    scope === "all" ? allHistory : (scopedSet?.history ?? []);
  const playerRows = buildPlayerMatrix(statsHistorySource, match.players);

  // 各輪次得失分：全場用整場 rallies，選某一局就只餵那一局的 rallies（依局篩選，見
  // useMatchRecording 把 rallies 遞出來的理由）。
  const rotationStats = buildRotationStats(
    scope === "all" ? allRallies : (ralliesBySetNumber.get(scope) ?? []),
  );

  // 分數成長階梯圖：只在「選了某一局」時畫那一局的走勢（全場沒有單一條連續比分可畫——
  // 每局都是從 0:0 重新開始，硬接成一條反而看不懂）。
  const scoreStepChart = scopedSet ? buildScoreStepChart(scopedSet.history) : null;

  // 換人統計：全場＝各局加總；選某一局＝只顯示那一局的次數。已結束各局的次數存在
  // subCountsHistory（陣列順序對齊 completedSets），進行中那一局是 record.subCount。
  // 注意 subCount 是原始換人計數，不是 record.regularSubs.length（issue #289）：後者是淨疊加
  // 清單，連鎖換人／換回先發會讓兩個數字對不上——換人「次數」統計要的是前者。
  const subCountsHistory = record?.subCountsHistory ?? [];
  const currentSubCount = record?.subCount ?? 0;
  const totalSubCount = subCountsHistory.reduce((a, b) => a + b, 0) + currentSubCount;
  const subCountForScope = (() => {
    if (scope === "all") return totalSubCount;
    const idx = completedSets.findIndex((s) => s.setNumber === scope);
    if (idx >= 0) return subCountsHistory[idx] ?? 0;
    // 不是已結束的局＝進行中那一局（只有未完成的比賽才有）。
    if (currentSet?.setNumber === scope) return currentSubCount;
    return 0;
  })();

  // 左側導覽軌（issue #160）的「比」按鈕要導回去的頁面，規則共用 matchBackHref。
  const backHref = matchBackHref(match.tournamentId);

  // issue #173：NavRail「戰」子清單的「+ 新增戰術」需要呼叫端注入一段「現在站位怎麼擷取」
  // 的邏輯（見 NavRail.tsx / NewTacticDialog.tsx 開頭的說明——這個元件自己不猜資料來源）。
  // 但數據分析頁跟戰術頁／計分頁不一樣：這裡從頭到尾沒有「當下站位」這個概念（沒有輪轉表、
  // 沒有先發快照，純粹是唯讀的賽後統計），所以沒有東西可以擷取。與其為了湊出一個假的擷取
  // 函式，這裡直接把「擷取目前站位」這個選項整個停用（captureDisabled=true），只留「空站位」
  // 這一條路可以開始新戰術；captureCurrent 仍要給一個型別合法的函式（NewTacticDialog 的
  // captureCurrent 是 required prop），但因為按鈕被停用，使用者永遠按不到它，回傳值不會被
  // 真的使用。
  const captureCurrentForAnalytics = () => captureBlank({ matchId: id ?? null });

  return (
    // issue #172：三欄骨架交給 AppShell（mode="A"）。issue #193 補上 aside——用唯讀的
    // AnalyticsRotationRail（不重用 MatchInfoRail，理由見該檔案開頭的說明），讓教練在
    // 分析頁也能回看各局的先發站位，不用切回計分頁才看得到。原本的「回列表」「回計分表」
    // header 連結統一交給 NavRail（issue #160 起就是共用元件，#173 併入戰術子清單/
    // 匯出子清單後改名 NavRail）。
    <AppShell
      mode="A"
      nav={
        <div className="relative z-10 h-full">
          <NavRail
            matchId={id ?? ""}
            backHref={backHref}
            active="analytics"
            captureCurrent={captureCurrentForAnalytics}
            captureLabel="此頁沒有可擷取的站位，僅能從空站位開始"
            captureDisabled
          />
        </div>
      }
      aside={
        <div className="relative z-10 h-full">
          <AnalyticsRotationRail
            record={record}
            roster={match.players}
            winsNeeded={winsNeededFor(match.format)}
          />
        </div>
      }
      // 背景改用 lib/appChromeStyles 的共用常數（tang 2026-07-30 要求全站背景統一）：
      // 這裡原本停在 #131 改版之前的斜線網格版本，說明見那個檔案。
      className={APP_SHELL_CLASS}
      style={APP_BACKGROUND_STYLE}
    >
      {/* 原本是 min-h-screen（讓整個瀏覽器視窗跟著內容變長、由視窗自己捲）。AppShell 改成
          h-screen 固定版面之後，捲動責任下放到這一層：min-h-0 + flex-1 讓它剛好吃滿中央
          主區的高度、不多不少，再由自己的 overflow-y-auto 捲內容。留著 min-h-screen 的話，
          這塊的最小高度會被釘在 100vh，之後若中央主區上面多一條 header，它就會超出容器
          一個 header 的高度、把捲軸推到看不見的地方。
          relative z-10：跟 backdrop 的 .tb-beam（position:absolute + z-index:1）疊圖時要贏過去，
          理由見 TacticsBoard.tsx 同一種寫法的說明。 */}
      <div className="relative z-10 min-h-0 w-full flex-1 overflow-y-auto">
        <header className="flex items-center justify-center border-b border-white/[0.08] bg-white/[0.02] px-4 py-3 backdrop-blur-sm">
          <h1 className="text-lg font-bold">vs {match.opponent} · 數據分析</h1>
        </header>

        <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
          {/* ── 比分總覽（＝全頁的範圍選擇器）── */}
          <section className={GLASS_SECTION_CLASS}>
            <h2 className="mb-1 text-sm font-bold text-[#f5f5f0]">比分總覽</h2>
            {/* 點某一局＝把底下所有數據篩到那一局；「全場」回到整場彙總。用比分卡片本身當按鈕
                （PO 定案），不另外放一排切換 chip，少一層 UI 也讓「這些數字屬於哪一局」更直覺。 */}
            <p className="mb-3 text-xs text-[#a9b096]">
              點選某一局即可篩選下方所有數據，或選「全場」看整場彙總。
            </p>
            {setRows.length === 0 ? (
              <p className="text-sm text-[#a9b096]">尚未開始記分。</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {/* 「全場」按鈕：擺在最前面，卡片上直接顯示局數比數（例如 2:1），選中時亮萊姆綠框。 */}
                <button
                  type="button"
                  onClick={() => setScope("all")}
                  aria-pressed={scope === "all"}
                  className={`flex min-w-[52px] flex-col items-center rounded border px-3 py-1.5 text-center transition ${
                    scope === "all"
                      ? "border-[#c6f135] bg-[#c6f135]/10"
                      : "border-white/[0.18] bg-white/[0.04] hover:border-[#c6f135]/60"
                  }`}
                >
                  <span className="text-caption leading-none text-[#a9b096]">全場</span>
                  {/* 局數比分（X:Y）：跟計分板大比分同一套「分數展示」語彙，2026-08-07 從
                      font-numeric 改用 font-score（Anton）——這裡不是表格裡的普通統計數字，
                      是真的分數比例。 */}
                  <span className="mt-1 font-score text-sm font-bold leading-none tabular-nums text-[#f5f5f0]">
                    {ourSetsWon}:{opponentSetsWon}
                  </span>
                </button>
                {setRows.map((s) => {
                  const weWon = setWinner(s) === "us";
                  const inProgress = s.status === "in-progress";
                  const selected = scope === s.setNumber;
                  // 選中的局用實心萊姆綠框強調（跟「全場」一致）；沒選中時維持原本依勝負／進行中
                  // 上色的低調卡片，滑鼠移上去才提示可點。
                  const base =
                    "flex min-w-[52px] flex-col items-center rounded border px-3 py-1.5 text-center transition";
                  const tone = selected
                    ? "border-[#c6f135] bg-[#c6f135]/15"
                    : inProgress
                      ? "border-sky-400/30 bg-sky-400/10 hover:border-sky-300"
                      : weWon
                        ? "border-[#c6f135]/30 bg-[#c6f135]/10 hover:border-[#c6f135]/70"
                        : "border-[#ef4444]/30 bg-[#ef4444]/10 hover:border-[#ef4444]/70";
                  return (
                    <button
                      key={s.setNumber}
                      type="button"
                      onClick={() => setScope(s.setNumber)}
                      aria-pressed={selected}
                      className={`${base} ${tone}`}
                    >
                      <span className="text-caption leading-none text-[#a9b096]">
                        第 {s.setNumber} 局{inProgress ? "（進行中）" : ""}
                      </span>
                      {/* 單局比分（X:Y），理由同上面「全場」那顆——font-score 不是 font-numeric。 */}
                      <span
                        className={`mt-1 font-score text-sm font-bold leading-none tabular-nums ${
                          inProgress ? "text-sky-300" : weWon ? "text-[#c6f135]" : "text-[#ef4444]"
                        }`}
                      >
                        {s.ourScore}:{s.opponentScore}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* ── 分數成長階梯圖（純前端重建，見上方 buildScoreStepChart 註解） ──
                只在「選了某一局」時畫（全場沒有單一條連續比分可畫）。選局＝直接看該局走勢，
                不再需要額外的展開／收合按鈕。 */}
            {scope !== "all" && (
              <div className="mt-3 border-t border-white/[0.08] pt-3">
                {scoreStepChart ? (
                  <div className="flex flex-col gap-2">
                    <svg
                      viewBox={`0 0 ${scoreStepChart.width} ${scoreStepChart.height}`}
                      className="h-auto w-full"
                      role="img"
                      aria-label={`${scopeLabel}分數成長階梯圖`}
                    >
                      {/* 有號分差填色帶（見上方 buildScoreStepChart 的 fillRects 註解）：畫在最
                          下面（先畫＝疊在最底層），格線、兩條比分線都蓋在它上面，填色只是背景
                          提示、不搶線條焦點。0.15 低透明度是刻意的：色塊面積比線條大很多，滿
                          彩度會太搶眼。 */}
                      {scoreStepChart.fillRects.map((r, i) => (
                        <rect
                          key={i}
                          x={r.x}
                          y={r.y}
                          width={r.width}
                          height={r.height}
                          fill={r.ahead === "us" ? "rgba(198,241,53,0.15)" : "rgba(239,68,68,0.15)"}
                        />
                      ))}
                      {/* 背景橫向格線：每 5 分一條，純視覺輔助，顏色壓得很低調（white/[0.08]）。 */}
                      {scoreStepChart.gridLines.map((g) => (
                        <g key={g.score}>
                          <line
                            x1={scoreStepChart.padLeft}
                            y1={g.y}
                            x2={scoreStepChart.xEnd}
                            y2={g.y}
                            stroke="rgba(255,255,255,0.08)"
                            strokeWidth={1}
                          />
                          <text
                            x={scoreStepChart.padLeft - 4}
                            y={g.y + 3}
                            textAnchor="end"
                            fontSize={9}
                            fill="#a9b096"
                          >
                            {g.score}
                          </text>
                        </g>
                      ))}
                      {/* 我方／對手兩條階梯線，沿用頁面既有得/失分配色（#c6f135＝我方、
                          #ef4444＝對手）。 */}
                      <path
                        d={scoreStepChart.usPath}
                        fill="none"
                        stroke="#c6f135"
                        strokeWidth={2}
                        strokeLinejoin="round"
                      />
                      <path
                        d={scoreStepChart.oppPath}
                        fill="none"
                        stroke="#ef4444"
                        strokeWidth={2}
                        strokeLinejoin="round"
                      />
                      {/* 終點分數直接標在線尾，取代圖例框；也讓色盲/色弱不必只靠顏色分辨。 */}
                      <text
                        x={scoreStepChart.xEnd + 4}
                        y={scoreStepChart.usLabelY + 3}
                        fontSize={10}
                        fontWeight="bold"
                        fill="#c6f135"
                      >
                        我方 {scoreStepChart.usFinal}
                      </text>
                      <text
                        x={scoreStepChart.xEnd + 4}
                        y={scoreStepChart.oppLabelY + 3}
                        fontSize={10}
                        fontWeight="bold"
                        fill="#ef4444"
                      >
                        對手 {scoreStepChart.oppFinal}
                      </text>
                    </svg>
                    <p className="text-caption text-[#a9b096]">
                      {scopeLabel}分數成長：填色＝當下領先方（萊姆綠我方、紅色對手），帶寬＝分差。
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-[#a9b096]">這一局沒有可畫的球序資料。</p>
                )}
              </div>
            )}
          </section>

          {/* ── 球員統計（決定球矩陣） ── */}
          <section className={GLASS_SECTION_CLASS}>
            <div className="flex items-baseline gap-2">
              <h2 className="text-sm font-bold text-[#f5f5f0]">球員統計</h2>
              {/* 範圍標籤：跟著上面「比分總覽」選的局走，讓使用者清楚這張表算的是哪個範圍。 */}
              <span className="text-xs font-semibold text-[#c6f135]">{scopeLabel}</span>
            </div>
            {/* 語意說明：見 lib/statsMapping.ts 的 buildPlayerMatrix 註解——這是「決定球歸屬」
              統計，不是逐觸球統計，接—舉—攻只有最後一人被記，舉球員數字會系統性偏低。 */}
            <p className="mb-3 mt-1 text-xs text-[#a9b096]">
              這是「決定球歸屬」統計：一分只記終結那一球是誰、做了什麼動作，接—舉—攻只有最後一人被記
              到，舉球員的數字會系統性偏低，不代表他表現不好。
            </p>
            {playerRows.length === 0 ? (
              <p className="text-sm text-[#a9b096]">尚無記錄。</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="border-b-2 border-white/[0.2]">
                      <th className="pb-1 text-left text-[#a9b096] font-normal w-8">#</th>
                      {ACTIONS.map((a) => (
                        <th
                          key={a}
                          colSpan={2}
                          className="pb-1 text-center font-semibold text-[#f5f5f0] border-l border-white/[0.08] px-1"
                        >
                          {ACTION_LABELS[a]}
                        </th>
                      ))}
                    </tr>
                    <tr className="border-b border-white/[0.08]">
                      <th className="pb-0.5" />
                      {ACTIONS.flatMap((a) => [
                        <th
                          key={`${a}-won`}
                          className="pb-0.5 text-right font-medium text-[#c6f135] border-l border-white/[0.08] px-1"
                        >
                          得
                        </th>,
                        <th
                          key={`${a}-lost`}
                          className="pb-0.5 text-right font-medium text-[#ef4444] px-1"
                        >
                          失
                        </th>,
                      ])}
                    </tr>
                  </thead>
                  <tbody>
                    {playerRows.map((row) => (
                      <tr key={row.playerId} className="border-b border-white/[0.06]">
                        {/* 背號跟得/失都是「分數、背號」規則管的東西（2026-08-07 tang 定案，
                            跟 components/ScoreSheetStats.tsx 那張同構的表一起改），從
                            font-numeric 換成 font-score。 */}
                        <td className="py-1 font-score font-semibold text-[#f5f5f0]">
                          {row.number}
                        </td>
                        {ACTIONS.flatMap((a) => {
                          const s = row.stats[a];
                          const hasData = s.won + s.lost > 0;
                          return [
                            <td
                              key={`${a}-won`}
                              className={`py-1 text-right font-score tabular-nums border-l border-white/[0.08] px-1 ${
                                hasData ? "text-[#c6f135]" : "text-white/20"
                              }`}
                            >
                              {hasData ? s.won : "—"}
                            </td>,
                            <td
                              key={`${a}-lost`}
                              className={`py-1 text-right font-score tabular-nums px-1 ${
                                hasData ? "text-[#ef4444]" : "text-white/20"
                              }`}
                            >
                              {hasData ? s.lost : "—"}
                            </td>,
                          ];
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ── 換人統計 ── */}
          <section className={GLASS_SECTION_CLASS}>
            <div className="mb-2 flex items-baseline gap-2">
              <h2 className="text-sm font-bold text-[#f5f5f0]">換人統計</h2>
              <span className="text-xs font-semibold text-[#c6f135]">{scopeLabel}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-numeric text-2xl font-bold tabular-nums text-[#f5f5f0]">
                {subCountForScope}
              </span>
              <span className="text-sm text-[#a9b096]">
                次{scope === "all" ? "（全場累計，含進行中的這局）" : ""}
              </span>
            </div>
            <p className="mt-1 text-caption text-[#a9b096]">僅計入一般換人（不含自由球員）。</p>
          </section>

          {/* ── 各輪次得失分（#65 M2） ──
              純用 rallies.homeRotation / winner 算（見 lib/statsMapping.ts 的 buildRotationStats）。
              改成前端算，就能跟著上面選的局一起篩選（後端那支聚合查詢只能算整場）。side-out% /
              破發率需要知道每分是誰發球，rallies 沒有直接存這欄，還在規劃中，先留一行說明。 */}
          <section className={GLASS_SECTION_CLASS}>
            <div className="mb-2 flex items-baseline gap-2">
              <h2 className="text-sm font-bold text-[#f5f5f0]">各輪次得失分</h2>
              <span className="text-xs font-semibold text-[#c6f135]">{scopeLabel}</span>
            </div>
            {rotationStats.length === 0 ? (
              <p className="text-sm text-[#a9b096]">尚無記錄。</p>
            ) : (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b-2 border-white/[0.2]">
                    <th className="pb-1 text-left font-normal text-[#a9b096]">輪次</th>
                    <th className="pb-1 text-right font-normal text-[#a9b096]">得</th>
                    <th className="pb-1 text-right font-normal text-[#a9b096]">失</th>
                    <th className="pb-1 text-right font-normal text-[#a9b096]">得分率</th>
                  </tr>
                </thead>
                <tbody>
                  {rotationStats.map((r) => {
                    const total = r.pointsWon + r.pointsLost;
                    return (
                      <tr key={r.rotation} className="border-b border-white/[0.06]">
                        {/* homeRotation 存的是「從先發起算的第幾輪（0–5）」，畫面上習慣從
                            「第 1 輪」開始數，所以顯示時 +1。 */}
                        <td className="py-1 font-semibold text-[#f5f5f0]">
                          第 {r.rotation + 1} 輪
                        </td>
                        {/* 得/失是真的分數（不是得分率那種衍生百分比），2026-08-07 跟
                            上面球員動作統計表一起從 font-numeric 換成 font-score。 */}
                        <td className="py-1 text-right font-score tabular-nums text-[#c6f135]">
                          {r.pointsWon}
                        </td>
                        <td className="py-1 text-right font-score tabular-nums text-[#ef4444]">
                          {r.pointsLost}
                        </td>
                        <td className="py-1 text-right font-numeric tabular-nums text-[#a9b096]">
                          {total === 0 ? "—" : `${Math.round((r.pointsWon / total) * 100)}%`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <p className="mt-2 text-caption text-[#a9b096]">
              side-out% / 破發率需要更完整的發球序追蹤，規劃中。
            </p>
          </section>

          {/* ── 差異化：需要進階記錄才會點亮（誠實空狀態，不放假圖表） ── */}
          <section className={`${GLASS_SECTION_CLASS} border-dashed`}>
            <div className="mb-2 flex items-center gap-2">
              <h2 className="text-sm font-bold text-[#f5f5f0]">防守到位率 / 對手球線分布</h2>
              <span className="rounded bg-white/[0.08] px-1.5 py-0.5 text-micro font-semibold text-[#a9b096]">
                需要進階記錄
              </span>
            </div>
            <p className="text-sm text-[#a9b096]">
              目前的簡易記錄只存「這一球是誰、做了什麼動作」，沒有座標/落點/品質——算不出到位率跟球線
              熱區。等進階記錄（賽後影片補填）落地後，這裡才會顯示真實數字。
            </p>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
