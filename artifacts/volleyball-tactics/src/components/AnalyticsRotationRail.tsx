import { useState } from "react";
import RotationRailPanel from "@/components/RotationRailPanel";
import { getMatchWinner } from "@/lib/matchOutcome";
import { INFO_RAIL_BASE_CLASS } from "@/lib/appChromeStyles";
import type { MatchPlayer } from "@/types/match";
import type { LineupSnapshot, ScoreSheetState } from "@/types/scoresheet";

// 數據分析頁（#193）專用的「場上站位」右欄——刻意不重用 MatchInfoRail，理由有兩個：
//
// 1. **沒有可寫的東西可以寫**。MatchInfoRail「目前這局還沒開賽」那個分支是可編輯的
//    （讀/寫 useRotationTable 共用 store，教練可以直接在右欄排先發）。分析頁從頭到尾是
//    唯讀頁面（見 MatchAnalytics.tsx 開頭「這裡是唯讀頁面」的說明），不該讓它意外獲得
//    一個「可以動先發」的入口——重用 MatchInfoRail 等於把一個只在比賽列表頁才成立的
//    「可編輯」語意，悄悄帶進一個號稱唯讀的頁面。
// 2. **不该 import 共用輪轉表 store**。MatchInfoRail 靠 useRotationTable 讀「現役站位」；
//    分析頁只看已經發生的比賽紀錄（record，來自 useMatchRecording），跟「現在教練排到
//    哪裡」完全無關，混進去只會製造一條分析頁不需要的資料依賴。
//
// 所以這裡自己重刻一份「算這局要顯示什麼」的邏輯——邏輯上跟 MatchInfoRail 的 if/else
// 分支同構（historical / live / upcoming 三種），但資料來源换成單純的 record + roster，
// 而且永遠 readOnly，沒有 onLineupChange 這條路。
//
// 局數選擇器（stepper）只放在這一個元件裡：#193 明文寫的坑是「左右各自一份選擇器會
// 失去同步」（例如中央主區也做一個局數切換，兩邊各自 useState，使用者切了一邊、另一邊
// 沒跟著換，畫面對不起來）。這裡只有右欄這一份 UI 摸得到局數，中央主區的「比分總覽」
// 卡片本來就是列出全部局數、不需要「切到某一局」的概念，天生不會有第二份選擇器跟這裡
// 打架。
interface AnalyticsRotationRailProps {
  record: ScoreSheetState | undefined;
  roster: MatchPlayer[];
  // 「贏幾局才算贏」（#215）。刻意用呼叫端已經算好的數字當 prop，而不是讓這個元件自己收
  // match.format 再呼叫 winsNeededFor——理由跟上面「不重用 MatchInfoRail」的第 2 點一樣：
  // 這顆元件刻意只吃 record + roster 這種最原始的資料，多一個 match 型別的依賴就是多一條
  // 這個唯讀元件本來不需要的耦合，讓呼叫端（MatchAnalytics.tsx，手上本來就有 match）多做
  // 一次 winsNeededFor(match.format) 換算就好。
  winsNeeded: number;
}

// 這裡原本是刻意抄一份 MatchInfoRail 的字面值，理由寫著「抄一份字串比為了共用兩行 class
// 特地拉一個共用檔案划算」。2026-07-30 推翻：那個判斷成立的前提是「這串 class 不會變」，
// 但實際上第三個呼叫端（ScoreSheet.tsx 的右欄）也複製了同一份，而且 tang 要改材質
//（實色 → 半透明玻璃）時就得同時記得改三個地方——複製的成本不在寫的當下，在改的時候。
// 現在收斂到 lib/appChromeStyles.ts，材質決定也寫在那裡。
const RAIL_BASE_CLASS = INFO_RAIL_BASE_CLASS;

export default function AnalyticsRotationRail({
  record,
  roster,
  winsNeeded,
}: AnalyticsRotationRailProps) {
  // null＝跟著「目前這局」走（預設）；使用者按過 stepper 之後變成一個具體數字。
  // 跟 MatchInfoRail 同一套設計，見該檔案的說明。
  const [manualSetIndex, setManualSetIndex] = useState<number | null>(null);

  const completedSets = record?.completedSets ?? [];
  const isMatchFinished = getMatchWinner(completedSets, winsNeeded) !== null;
  const totalSets = completedSets.length + 1;
  const clampedIndex = Math.min(Math.max(manualSetIndex ?? totalSets - 1, 0), totalSets - 1);

  let lineup: LineupSnapshot | null;
  let setStatus: "historical" | "live" | "upcoming";
  let score: { our: number; opponent: number } | null;

  if (clampedIndex < completedSets.length) {
    // 已經打完的某一局：讀那一局封存當下的先發快照跟比分。
    lineup = completedSets[clampedIndex].lineup;
    setStatus = "historical";
    score = {
      our: completedSets[clampedIndex].ourScore,
      opponent: completedSets[clampedIndex].opponentScore,
    };
  } else if (isMatchFinished) {
    // 整場已經打完：不管目前這局有沒有資料一律算歷史。
    lineup = record?.lineup ?? null;
    setStatus = "historical";
    score =
      record?.currentSet && record.currentSet.serving !== null
        ? { our: record.currentSet.ourScore, opponent: record.currentSet.opponentScore }
        : null;
  } else if (record?.lineup) {
    // 目前這局已經開賽：讀開賽當下凍結的先發快照跟即時比分。
    lineup = record.lineup;
    setStatus = "live";
    score =
      record.currentSet.serving !== null
        ? { our: record.currentSet.ourScore, opponent: record.currentSet.opponentScore }
        : { our: 0, opponent: 0 };
  } else {
    // 目前這局還沒開賽：唯讀頁不讀共用輪轉表的現役草稿，沒有先發可看，也沒有分可看。
    lineup = null;
    setStatus = "upcoming";
    score = null;
  }

  return (
    <div className={RAIL_BASE_CLASS}>
      <RotationRailPanel
        readOnly
        axis="set"
        lineup={lineup}
        roster={roster}
        rotation={clampedIndex}
        setStatus={setStatus}
        score={score}
        onStep={(delta) =>
          setManualSetIndex(Math.min(Math.max(clampedIndex + delta, 0), totalSets - 1))
        }
        canStepPrev={clampedIndex > 0}
        canStepNext={clampedIndex < totalSets - 1}
        title="場上站位"
      />
    </div>
  );
}
