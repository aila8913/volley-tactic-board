// 純粹的排球規則計算（issue #226）：一分怎麼影響比分/輪轉/發球權、換人怎麼淨疊加、
// 「哪一局算進行中」這個慣例，這三件事以前各自被實作兩份——一份是 live 記分
// （hooks/useScoreSheet.ts，教練點一下畫面要零延遲更新）、一份是 replay 重建
// （lib/scoreSheetMapping.ts，reload 或分析頁要從後端 rally/substitution 流水帳
// 重算出同一份狀態）。兩份手寫邏輯字面上一模一樣，卻各自維護——這正是最容易「改一邊、
// 忘記改另一邊」的地方，而且一旦兩邊算出的比分/輪轉兜不起來，教練會直接看到錯的分數，
// 是這個 app 最不能出錯的一塊。所以把「規則本身」抽成這裡的純函式，live／replay
// 兩邊都呼叫同一份，之後只要改一次、兩邊保證同步。
//
// 這份檔案比照 matchOutcome.ts 的設計哲學：只吃「規則需要的最原始資料」，不吃任何一邊
// 的容器型別（不吃 SetRecordingState、不吃後端的 Rally DTO）。原本 issue 討論時曾提議
// 讓 applyRally 直接吃「一顆 rally 物件」，但 replay 端的 rally 是 DB row（有 id、
// homeScore/awayScore 等欄位）、live 端的「這一球」目前根本還沒有物件形態（只是使用者
// 點的 side）——硬要兩邊都先組出同一種 rally 物件才能呼叫，等於讓純規則反過來被兩種
// 儲存形狀綁住，呼叫端還要多做一層轉換。改成只吃「誰贏這一分」＋「贏之前的狀態」，
// 呼叫端各自把規則嵌進自己的容器（live 嵌進 zustand store、replay 嵌進 for 迴圈的
// local 變數），規則本身完全不用知道外面長什麼樣子。
import type { Side, RegularSub } from "../types/scoresheet";

// 規則計算需要的最小狀態：一局「當下」的比分/發球方/輪轉。
// serving 刻意不是 Side | null——規則只在「已經選定先發方」之後才適用（選先發方之前
// 根本不能記分，呼叫端本來就要先擋掉 serving === null 的情況，型別上收窄成 Side，
// 呼叫這個函式的人就不用再處理「還沒開賽」這個規則管不到的分支）。
export interface RuleState {
  ourScore: number;
  opponentScore: number;
  serving: Side;
  ourRotation: number; // 0~5，六個輪轉位置的其中一個
  opponentRotation: number;
}

// 記一分：套用排球的「side-out 才輪轉」規則，回傳新的狀態。
//
// 規則本身（排球規則，不是這個 app 發明的）：
//   - 一分的贏家如果不是原本的發球方，代表發球權易主（side-out），奪回發球權的那一方
//     要輪轉一個位置；發球方自己再得一分只加分、不輪轉——輪轉永遠發生在「剛拿到發球權」
//     的那一刻，不是每得一分就轉。
//   - 我方、對手各自獨立輪轉（各自六個位置的循環），不互相影響。
//   - 贏家分數 +1，發球權轉給贏家（不管有沒有 side-out，下一球永遠是這分贏家發球）。
//
// wasSideOut 特地跟新 state 一起回傳、不是只回傳 state 讓呼叫端自己再判一次：
// 兩個呼叫端都需要這個布林值（live 要塞進 history 的 PointRecord.wasSideOut 供復原/
// 顯示用，replay 要塞進重建出來的 PointRecord），如果只回傳 state，呼叫端就得各自重新
// 比較一次「winner !== 呼叫前的 serving」——這個比較的邏輯只應該存在一個地方（就是這裡），
// 讓它變成這個函式的「產出」而不是「呼叫端自己再推一次」，才不會有第三份重複邏輯悄悄長出來。
export function applyRally(
  state: RuleState,
  winner: Side,
): { state: RuleState; wasSideOut: boolean } {
  const wasSideOut = winner !== state.serving;
  const ourRotation =
    wasSideOut && winner === "us" ? (state.ourRotation + 1) % 6 : state.ourRotation;
  const opponentRotation =
    wasSideOut && winner === "opponent" ? (state.opponentRotation + 1) % 6 : state.opponentRotation;

  return {
    state: {
      ourScore: winner === "us" ? state.ourScore + 1 : state.ourScore,
      opponentScore: winner === "opponent" ? state.opponentScore + 1 : state.opponentScore,
      serving: winner,
      ourRotation,
      opponentRotation,
    },
    wasSideOut,
  };
}

// 一般換人的「淨疊加摺疊」：把一筆新換人接上清單，同時把「被這次換人頂替掉」的舊紀錄
// 濾掉。因為 UI 只關心「現在」場上實際站的是誰，不是完整的換人流水帳——後端
// substitutions 表是 append-only（換幾次就存幾筆），這個函式做的就是把那種流水帳摺疊成
// 「現在」的淨結果。
//
// 連鎖換人（issue #247）：場上先前已經是「A 被換成 B」（清單有 {out:A,in:B}），這次又把
// B 換成 C（新紀錄 {out:B,in:C}）。這裡要找出「這個位置真正的原始先發」——不是這次換人
// 表面上的 outPlayerId=B，而是往前追一筆：清單裡有沒有一筆 inPlayerId 等於這次的
// outPlayerId？如果有（{out:A,in:B} 的 inPlayerId=B 命中了），代表 B 本身也是替補上場
// 的，這個位置的原始先發其實是那一筆的 outPlayerId=A。摺疊結果因此是 **{out:A,in:C}**，
// 不是 {out:B,in:C}——因為 types/scoresheet.ts 裡 RegularSub 型別的欄位註解本來就寫明
// 淨疊加該產出「原始先發 → 現在場上的人」，而 ScoreSheetCourt.tsx 是拿 outPlayerId 當
// key 去查先發名單那格「現在被誰頂替」，查的必須是原始先發 A，查 B 會找不到格子。
//
// 特例：換人換回原始先發本人（A→B 之後 B→A），這個位置淨效果等於沒換過，整筆從清單
// 拿掉——留著 {out:A,in:A} 會讓球場畫面誤以為 A 被自己頂替。
//
// 這是跟 applyRally 同一種病（live 一次呼叫／replay 逐筆 reduce 重放）、同一種藥，
// 但刻意不併進 applyRally 變成同一顆函式：換人的輸入形狀（RegularSub 清單 + 一筆新
// 換人）跟計分的輸入形狀（RuleState + 贏家）完全不同，維持的不變量也不同（換人維持的是
// 「同一位置只留原始先發 → 現在的人」，計分維持的是「比分/輪轉/發球權」），硬併成一個
// reducer 只會讓函式簽名變得四不像。同檔為鄰（都在 volleyballRules.ts）已經解決「兩邊
// 各自維護一份」的問題，不需要連函式本身都合併。
export function applyRegularSub(list: RegularSub[], sub: RegularSub): RegularSub[] {
  // 這次換下來的人，可能自己就是先前某次換人「換上去」的替補——那樣的話這個格子的
  // 原始先發是更早那筆的 outPlayerId，要沿用它，而不是這次的 outPlayerId。
  const prev = list.find((r) => r.inPlayerId === sub.outPlayerId);
  const rest = list.filter((r) => r.inPlayerId !== sub.outPlayerId);
  const outPlayerId = prev ? prev.outPlayerId : sub.outPlayerId;
  // 換回原始先發本人（A→B 之後 B→A）：這個格子淨值歸零，整筆不留——留下
  // {out:A, in:A} 會讓球場畫面把 A 標成「被自己頂替」。
  if (outPlayerId === sub.inPlayerId) return rest;
  return [...rest, { outPlayerId, inPlayerId: sub.inPlayerId }];
}

// 「最後一個元素＝進行中，其餘都是已結束」——這個慣例在計分表的 reconstructRecording
// 用來切分 sets 陣列，在分析頁的後端聚合（api-server/src/routes/analysis.ts 算
// setResults 那段）也用同一個慣例算「已結束局」，抽成這支小函式一次講清楚「為什麼」，
// 不要讓 slice(0, -1) / arr[arr.length-1] 這種魔法切法散落在好幾個地方各自重複。
//
// 為什麼「最後一局是進行中」在**比賽還沒結束時**成立：#63 修法之後，教練按「下一局」的
// 當下就會先建一筆 firstServer=null 的空 set row（見 lib/db/src/schema/sets.ts 與
// reconstructSetFromRallies 的空局防呆），也就是說「使用者已經進到的每一局」都保證有
// 對應的 DB row——不會有「剛按下一局但還沒開球」卻沒寫進後端、reload 後被誤判成上一局
// 還在進行中的情況。所以「陣列最後一個＝目前這局」這個切法才站得住。
//
// ⚠️ 這個切法**只在比賽還沒結束時**成立，這正是 #218 的病根。原本這裡的註解宣稱這個假設
// 「永遠成立」，理由是「schema 沒有『這局結束了嗎』的旗標」——但那句話真正的意思是
// 「我們沒有辦法知道，所以只好一律當進行中」。代價是：打完最後一球、整場比賽結束之後，
// 那最後一局仍然被當成進行中，於是**局比數、分析頁、資料夾戰績全部少算一局**。當時的
// 測試資料要靠「補一局空 set」才能讓完賽比賽顯示正確（見 #215），等於這個慣例在逼資料造假。
//
// #218 加了 matches.status 欄位（in_progress / finished，見 lib/db/src/schema/matches.ts），
// 就是當初缺的那個旗標。所以這支函式現在多收一個 isFinished：
//   - false（預設，比賽還在進行）→ 維持原本的切法，最後一局是進行中那局。
//   - true（記錄者已按下「結束比賽」）→ 每一局都是已結束局，沒有進行中的那局
//     （current 回 undefined，呼叫端自己決定要拿什麼當「目前這局」的佔位）。
// 預設值是 false 而不是必填，是刻意的取捨：這支函式在測試與尚未接上 status 的呼叫端還有
// 用，預設值選「維持既有行為」那一邊最安全（跟 getMatchWinner 的 winsNeeded 刻意做成必填
// 是相反的判斷——那裡的預設值會算出**錯的勝負**，這裡的預設值只是保守地少算最後一局）。
//
// 泛型（不綁 MatchSet 型別）：呼叫端傳 MatchSet[] 或任何依局序排好的陣列都能用，這裡
// 只管「陣列位置」的切分邏輯，不需要認識「一局」的欄位長什麼樣子。
//
// 後端 api-server/src/routes/analysis.ts 有同一個慣例的 SQL 版鏡射（allSetScores 依
// m.status 決定要不要 slice(0, -1)），刻意不共用這支函式——後端是獨立部署的 Node 專案，
// import 不到前端 src 底下的檔案；而且照 docs/adr（ADR-0003）的決定，後端聚合本來就該留在
// SQL／後端自己算，不該讓後端反過來依賴前端程式碼。兩邊各自實作、靠註解互相指過去，是
// 刻意的取捨——改其中一邊時務必同時改另一邊。
export function splitCompletedAndCurrent<T>(
  sets: T[],
  isFinished = false,
): { completed: T[]; current: T | undefined } {
  if (isFinished) return { completed: sets, current: undefined };
  return { completed: sets.slice(0, -1), current: sets[sets.length - 1] };
}

// 「這個局數選擇器有幾格可以滑」（issue #352）。
//
// 這是 splitCompletedAndCurrent() 的下游：切分回答的是「哪些局已結束、哪一局進行中」，
// 這支回答的是從那個切分推出來的下一件事——UI 上到底要排出幾格。兩顆右欄元件
//（AnalyticsRotationRail 唯讀、MatchInfoRail 最後一格可編輯）以前各自手寫同一段
// 三行算式，#349「已完賽的比賽預設停在不存在的第 4 局」因此修了兩次才修完（PR #350 只
// 改了其中一份，PR #351 才補上另一份）。規則模組原本就該多劃這一格邊界。
//
// 規則本身：
//   - **未完賽** → 已結束局數 + 1。那個 +1 是「目前這一局」，可能還在打，也可能還沒開賽
//     而正等著在右欄排先發（MatchInfoRail 的可編輯分支），一定要留。
//   - **已完賽** → #218 之後沒有「進行中的那一局」，重建出來的 currentSet 只是個
//     serving=null 的佔位，無條件 +1 會多開一格永遠空白、而且預設就停在上面的格子。
//   - **例外：已完賽但目前這局真的記過分**（hasCurrentSetData）→ 例如三戰兩勝已經 2:0，
//     教練仍按了「下一局」並繼續記分，那一局有真實資料，不能因為判定完賽就滑不到。
//     所以判準不是「完賽與否」，是**那一格裡到底有沒有東西**（PR #351 修正的判準）。
//   - 保底 1 格：完賽卻連一局都沒有（資料異常或紀錄被刪光）時仍要留一格，否則回傳 0
//     會讓呼叫端的 clamp 算出 -1 這種不存在的索引。
//
// 為什麼吃三個原始值、不直接吃 ScoreSheetState：跟這個檔案開頭寫的設計哲學一致——規則
// 模組只吃「規則需要的最原始資料」，不吃任何呼叫端的容器型別。兩顆元件手上的 record 現在
// 剛好同型別，但讓純規則反過來依賴 UI 的狀態形狀，正是 applyRally 當初刻意避開的耦合。
//
// 為什麼參數包成物件、不是 issue 裡草擬的三個位置參數：後兩個都是 boolean，
// `visibleSetCount(3, false, true)` 在呼叫端完全讀不出哪個是哪個，寫反了型別也不會擋。
// 具名欄位讓呼叫端自我說明，也讓日後多一個條件時不會又是一個沒名字的布林。
export function visibleSetCount(input: {
  completedSetCount: number;
  hasCurrentSetData: boolean;
  isMatchFinished: boolean;
}): number {
  const { completedSetCount, hasCurrentSetData, isMatchFinished } = input;
  if (!isMatchFinished) return completedSetCount + 1;
  return Math.max(completedSetCount + (hasCurrentSetData ? 1 : 0), 1);
}
