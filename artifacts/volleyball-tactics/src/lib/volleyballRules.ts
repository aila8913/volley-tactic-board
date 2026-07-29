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
// ⚠️ 連鎖換人的實際行為，跟你可能預期的不一樣，這裡講明白：場上先前已經是「A 被換成 B」
// （清單有 {out:A,in:B}），這次又把 B 換成 C（新紀錄 {out:B,in:C}）。舊那筆的 inPlayerId=B
// 剛好等於這次的 outPlayerId=B，所以被濾掉，清單最後只剩 **{out:B,in:C}**——留下的是
// 「最近一次換人的雙方」，**不是**「最原始的先發 A → 現在的 C」。也就是說摺疊之後，
// 「A 曾經是先發、現在被頂替掉了」這件事在清單裡消失了。
//
// 這是從 issue #226 之前就存在的既有行為（live 與 replay 兩份實作一致地這樣算，
// scoreSheetMapping.test.ts 也照這個結果斷言），#226 只負責把兩份合併成一份、不改行為，
// 所以這裡照實描述而不是偷偷改掉。至於「這個行為本身對不對」——ScoreSheetCourt.tsx 是用
// outPlayerId 當 key 查「這個先發被誰頂替」，連鎖換人後查不到 A，畫面可能顯示錯人——
// 那是另一張 issue 的範圍，不在 #226 裡處理。
//
// 這是跟 applyRally 同一種病（live 一次呼叫／replay 逐筆 reduce 重放）、同一種藥，
// 但刻意不併進 applyRally 變成同一顆函式：換人的輸入形狀（RegularSub 清單 + 一筆新
// 換人）跟計分的輸入形狀（RuleState + 贏家）完全不同，維持的不變量也不同（換人維持的是
// 「同一位置只留最新結果」，計分維持的是「比分/輪轉/發球權」），硬併成一個 reducer 只會
// 讓函式簽名變得四不像。同檔為鄰（都在 volleyballRules.ts）已經解決「兩邊各自維護一份」
// 的問題，不需要連函式本身都合併。
export function applyRegularSub(list: RegularSub[], sub: RegularSub): RegularSub[] {
  return [...list.filter((r) => r.inPlayerId !== sub.outPlayerId), sub];
}

// 「最後一個元素＝進行中，其餘都是已結束」——這個慣例在計分表的 reconstructRecording
// 用來切分 sets 陣列，在分析頁的後端聚合（api-server/src/routes/analysis.ts 算
// setResults 那段）也用同一個慣例算「已結束局」，抽成這支小函式一次講清楚「為什麼」，
// 不要讓 slice(0, -1) / arr[arr.length-1] 這種魔法切法散落在好幾個地方各自重複。
//
// 為什麼「最後一局一定是進行中」這個假設永遠成立：schema 沒有「這局結束了嗎」的旗標，
// 但 #63 修法之後，教練按「下一局」的當下就會先建一筆 firstServer=null 的空 set row
// （見 lib/db/src/schema/sets.ts 與 reconstructSetFromRallies 的空局防呆），也就是說
// 「使用者已經進到的每一局」都保證有對應的 DB row——不會有「剛按下一局但還沒開球」
// 卻沒寫進後端、reload 後被誤判成上一局還在進行中的情況。所以「陣列最後一個＝目前這局」
// 這個切法才站得住。
//
// 泛型（不綁 MatchSet 型別）：呼叫端傳 MatchSet[] 或任何依局序排好的陣列都能用，這裡
// 只管「陣列位置」的切分邏輯，不需要認識「一局」的欄位長什麼樣子。
//
// 後端 api-server/src/routes/analysis.ts 有同一個慣例的 SQL 版鏡射（allSetScores.slice(0,
// -1)），刻意不共用這支函式——後端是獨立部署的 Node 專案，import 不到前端 src 底下的
// 檔案；而且照 docs/adr（ADR-0003）的決定，後端聚合本來就該留在 SQL／後端自己算，
// 不該讓後端反過來依賴前端程式碼。兩邊各自實作、靠註解互相指過去，是刻意的取捨。
export function splitCompletedAndCurrent<T>(sets: T[]): { completed: T[]; current: T | undefined } {
  return { completed: sets.slice(0, -1), current: sets[sets.length - 1] };
}
