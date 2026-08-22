import { create } from "zustand";
import { persist } from "zustand/middleware";
import { PerMatchRotationState, CircleLabelType } from "../types/rotationTable";
import { filterLineupToRoster } from "../lib/rotationLogic";
import type { MatchPlayer } from "../types/match";
import type { LineupZones } from "../types/scoresheet";

// 一場比賽剛開始（還沒任何站位）的空白狀態。dataByMatch 裡某個 matchId 還不存在時，
// 各 action 先用這個當基底再套上這次的改動——跟 useScoreSheet 的 getOrInitRecord 同一招。
const emptyPerMatch = (): PerMatchRotationState => ({
  roster: [],
  lineup: {},
  currentRotation: 0,
  startingLiberoId: null,
});

interface RotationTableStore {
  // ── 全域顯示偏好（不隨 match 走）──
  // circleLabel 是「圈圈顯示姓名/背號/位置」的裝置偏好，計分表的 ScoreSheetCourt 也直接讀它。
  // 它不是「某一場比賽」的資料，所以留在 store 頂層當全域欄位、不進 dataByMatch 分片；
  // persist 也只存它一個（見檔尾 partialize）——這正是不變量允許 persist 的例外情況
  //（裝置偏好，而非使用者資料的唯一副本）。
  circleLabel: CircleLabelType;
  setCircleLabel: (label: CircleLabelType) => void;

  // ── per-match 分片（issue #119）──
  // 會跨場污染的狀態（名單、先發、目前輪次、先發 L）全部改用 matchId 當 key 分開存，
  // 一場一份。刻意不用 persist：未存的工作狀態是暫時性的（PO 2026-07-13 決策：只有存成
  // 戰術才算數），重整頁面就回到空白，要保留就存成戰術。這樣「切到別場就看到上一場站位」
  // 的污染從根本上不可能發生——每場各讀自己的 key。
  dataByMatch: Record<string, PerMatchRotationState>;

  // 以下每個 action 第一個參數都收 matchId，指定「要動哪一場的分片」——跟 useScoreSheet
  // 的每個 reducer 收 matchId 是同一套設計，元件用 useParams 拿到 URL 的 id 再傳進來。
  setRoster: (matchId: string, roster: MatchPlayer[]) => void;
  setCurrentRotation: (matchId: string, index: number) => void;

  // 指定這一場的先發自由球員是誰（issue #327 的第七格），null＝這場不派 L。
  //
  // 輸入是**人**不是號位：使用者在第七格回答的是「我們的 L 是誰」。#328 之前另有一支
  // placePlayerOnCourt 從球場拖曳寫進來（輸入是號位，得反查成人再換算），那條路連同它的
  // 畫面一起退役了。
  //
  // ⚠️ 這支以前叫 setLiberoAssignment，一次寫兩個欄位（誰 ＋ 他頂替誰），因為那時兩件事
  // 被視為同一個決定、拆開寫會出現「L 換人了但頂替對象還是舊的」這種中間狀態。#425 之後
  // 賽前根本不記頂替對象（見 types/rotationTable.ts 的說明），這支就只剩一個欄位可寫，
  // 名字也跟著誠實化——那個中間狀態現在從型別上就不存在。
  setStartingLibero: (matchId: string, liberoId: string | null) => void;

  // 清空這場的先發（RotationControlsFooter 的「重置先發」按鈕）。
  //
  // ⚠️ 行為變更（#231 PR3）：這顆以前叫 resetCurrentRotationPositions，只清「目前這一輪」。
  // 新表示法下那件事不再可表示——先發只有一份、六輪共用，沒有「只有第 3 輪是空的」這種
  // 狀態。而且舊行為其實也名不副實：清掉第 3 輪之後，只要再拖任何一個人，六輪就會全部從
  // 那一輪重新推算，被清掉的其他輪資料本來就留不住。所以改成誠實地清全部，UI 文案一併改。
  resetPositions: (matchId: string) => void;

  // 計分頁右欄（issue #120 第二階段）editing 共用真相用的入口：教練在計分頁排先發，
  // 排的其實就是這裡的 lineup——輪轉表跟計分頁本來就該是「同一份站位」，不是各自
  // 保管一份副本（PO 決策：見本次任務說明）。
  //
  // #231 PR3 之後這個 action 幾乎變成一行賦值：以前它要把一份號位快照「展開」成六輪座標
  // （兩種表示法之間的翻譯），現在 store 存的本來就是同一種 LineupZones，不用翻譯了。
  // LineupZones 本來就不記自由球員（見 types/scoresheet.ts），所以這支只管六個號位；
  // 自由球員的頂替狀態只在「被頂替的人不在新先發裡」時才收掉（理由見實作處的 ⚠️）。
  setLineupZones: (matchId: string, lineup: LineupZones) => void;

  // 從後端「已經凍結的先發」把這一場的站位補進來（issue #431）。
  //
  // 為什麼需要它：在這支之前，這份 store 的 lineup **只有一個寫入點**——計分頁在
  // 「還沒開賽、允許編輯先發」時的拖曳（ScoreSheet.tsx 的 setLineupZones）。而 dataByMatch
  // 刻意不 persist（見下面 partialize），所以「已經開賽或打完的比賽」在這份 store 裡永遠是
  // 空的：戰術板的六宮格對教練最常工作的那些比賽一律顯示六格 `—`。這直接違反 07-21 PO 定案
  // 的「站位＝全站共用單一真相」——戰術板讀到的根本不是同一份真相，是一份大部分時候是空的
  // 分片。缺的不是「再存一份」，是**把已經存在後端的那份讀回來**。
  //
  // ⚠️ 已經有先發時一律不覆蓋（見實作處）。這條讓它不會變成「第二條會跟使用者搶方向盤的
  // 寫入路徑」——那正是這顆 store 反覆出 bug 的形狀（見檔尾 #328 那段）。它只填空，不改寫。
  //
  // 餵進來的必須是**起始先發**（後端 lineups 那一列），不是即時輪轉後的當下站位：store 的
  // lineup 定義就是「第 0 輪站哪一格」，其他輪次由 rotateZone 現算（見 types/rotationTable.ts）。
  // 同理，這裡只收「先發 L 是誰」不收「他頂替誰」——賽前規劃側根本沒有那個欄位（ADR-0013／
  // #425），把後端快照裡的頂替對象讀回來就是把「紀錄」倒灌回「計畫」。
  hydrateLineup: (matchId: string, lineup: LineupZones, startingLiberoId: string | null) => void;

  // 註：舊的 loadRotationData（整批把存檔覆蓋回輪轉表）已在 #154 PR B 移除。載入已存戰術
  // 改成唯讀檢視、不再反向寫回輪轉表，所以輪轉表不需要、也刻意不提供這個「被別人整包覆蓋」
  // 的入口——反向寫回的能力從型別上就不存在了。
  //
  // ── #328 收尾（本次）：四支沒有消費者的寫入動作已刪除 ────────────────────────────
  // placePlayerOnCourt / removePlayerFromCourt / setStartingLiberoId / resetAll。
  // 前兩支的呼叫端只有戰術板中央的輪轉畫法（#328 退役），而「排先發」這件事本身早就改由
  // setLineupZones ＋ lib/rotationLogic 的 assignPlayerToZone 承接（#231 PR3、#174 的跨欄
  // 拖曳）；setStartingLiberoId 被 setLiberoAssignment 取代（#327；#425 之後它又收斂回
  // 單一欄位、改名 setStartingLibero）；resetAll 從頭到尾沒有任何呼叫端。
  //
  // 為什麼是刪不是留著備用：**同一份 state 有兩條寫入路徑**正是這顆 store 反覆出過 bug 的
  // 形狀（#14 兩個 L、#231 的四份先發表示法）。留著一條沒人走、也沒人維護的寫法，下一個人
  // 只會在兩者之間挑錯的那條。真的需要時，從這段註解找回 git 歷史比維護死碼便宜。
}

// 在 set() 裡對「某一場的分片」做 immutable 更新的共用小工具：拿舊分片（沒有就用空白），
// 交給 updater 算出新分片，再包回 dataByMatch。省得每個 action 都重寫一次展開語法。
function updateMatch(
  state: RotationTableStore,
  matchId: string,
  updater: (prev: PerMatchRotationState) => PerMatchRotationState,
): Pick<RotationTableStore, "dataByMatch"> {
  const prev = state.dataByMatch[matchId] ?? emptyPerMatch();
  return { dataByMatch: { ...state.dataByMatch, [matchId]: updater(prev) } };
}

// 註：這裡以前還有一支 toStartZone（把「這一輪看到的號位」換算回起始號位）。它只服務球場
// 拖曳——使用者指的是畫面上第 r 輪的某一格，而 lineup 的 key 是起始號位，中間需要一層換算。
// 那些拖曳入口在 #328 全部消失（中央球場的輪轉畫法退役），右欄輪轉表則是直接以起始號位為
// 介面，所以這層換算沒有人需要了。公式本身仍在 lib/rotationLogic 的 rotateZone。

export const useRotationTable = create<RotationTableStore>()(
  persist(
    (set) => ({
      circleLabel: "name",
      dataByMatch: {},

      setCircleLabel: (label) => set({ circleLabel: label }),

      setCurrentRotation: (matchId, index) =>
        set((state) => updateMatch(state, matchId, (m) => ({ ...m, currentRotation: index }))),

      setStartingLibero: (matchId, liberoId) =>
        set((state) =>
          updateMatch(state, matchId, (m) => {
            if (liberoId === null) {
              if (m.startingLiberoId === null) return m;
              return { ...m, startingLiberoId: null };
            }

            // ── 白名單把關 ──
            // 寫成「必須等於允許的值」而不是「不可以是危險值」（見專案 memory「安全閘門
            // 一律白名單」）：這個 action 的輸入來自拖曳事件的 dataTransfer，那是外部字串，
            // 別的分頁、桌面上的一段文字都可能丟進來。這個人必須真的在這場名單裡、而且真的
            // 是自由球員——不然會寫進一個渲染時永遠找不到人的幽靈 id。
            if (!m.roster.some((p) => p.id === liberoId && p.role === "L")) return m;

            if (m.startingLiberoId === liberoId) return m;
            return { ...m, startingLiberoId: liberoId };
          }),
        ),

      // 更新名單時同步維護 startingLiberoId：
      // 若先發 L 已被移出名單，改選名單裡第一個 L；若名單沒有 L 則清空。
      setRoster: (matchId, roster) =>
        set((state) =>
          updateMatch(state, matchId, (m) => {
            const liberos = roster.filter((p) => p.role === "L");
            const currentStillExists = liberos.some((p) => p.id === m.startingLiberoId);

            // 幽靈站位清理（issue #35）：名單裡被刪掉的球員，如果還卡在 lineup 裡，
            // 畫面上找不到球員就不渲染，看起來正常，但那格其實還被佔著、既看不到也選不到。
            // 所以存檔名單時要順手把指向「已不存在球員」的號位掃掉。
            //
            // 關鍵：filterLineupToRoster 在「沒清到任何東西」時會回傳**原本那個物件參照**。
            // 為什麼重要——TacticsBoard 進頁的 effect 會用 match.players 呼叫 setRoster，而 match
            // 每次 render 都是新物件，所以 setRoster 會被反覆呼叫。若這裡每次都產生新的 lineup
            // 物件，訂閱 lineup 的元件就會重繪 → effect 又跑 setRoster → 無限迴圈
            //（Maximum update depth exceeded）。（見 memory：zustand stable ref in effect actions）
            const lineup = filterLineupToRoster(m.lineup, roster);

            // 註：這裡以前還要順手清「L 頂替誰」——先發 L 或被頂替者任一被移出名單，那次
            // 頂替就不再成立。#425 之後賽前不記頂替對象，這段清理連同欄位一起消失：少一個
            // 欄位，就少一種「兩個欄位對不起來」的殘留。
            return {
              ...m,
              roster,
              lineup,
              startingLiberoId: currentStillExists ? m.startingLiberoId : (liberos[0]?.id ?? null),
            };
          }),
        ),

      resetPositions: (matchId) =>
        set((state) =>
          updateMatch(state, matchId, (m) => ({
            ...m,
            lineup: {},
          })),
        ),

      setLineupZones: (matchId, lineup) =>
        set((state) =>
          // 只動先發。這裡曾經有一段「調整號位時，L 的頂替關係要不要跟著失效」的規則
          // （#327 修過一次無聲清空的 bug），#425 之後賽前不記頂替對象，那段規則沒有對象
          // 可以維護了——動六個號位就只是動六個號位。
          updateMatch(state, matchId, (m) => ({
            ...m,
            lineup,
          })),
        ),

      hydrateLineup: (matchId, lineup, startingLiberoId) =>
        set((state) =>
          updateMatch(state, matchId, (m) => {
            // 只填空，不覆蓋：這一場在這個分頁裡已經有先發（教練剛排的、或上一次 hydrate
            // 進來的），就原封不動退回去。回傳同一個 m 參照 → 訂閱 lineup 的元件不會重繪，
            // 也就不會有「effect 寫 → 元件重繪 → effect 再寫」的迴圈（同一個坑見 setRoster
            // 裡 filterLineupToRoster 的說明）。
            if (Object.keys(m.lineup).length > 0) return m;

            // 這裡刻意不做 setStartingLibero 那種「必須在名單裡而且 role === 'L'」的白名單
            // 把關。那道關卡擋的是拖曳事件的 dataTransfer——外部字串，什麼都可能丟進來；
            // 這裡的來源是我們自己的後端，而且 lineups 的球員欄位有外鍵指著 players，
            // 它給的 id 一定是這場比賽真實存在的球員。真正的順序風險（先發已經 hydrate 進來、
            // 名單卻還沒抓回來）由 setRoster 的 filterLineupToRoster 收尾：名單一到就會把
            // 對不上的號位掃掉。
            return { ...m, lineup, startingLiberoId };
          }),
        ),
    }),
    {
      name: "volleyboard_rotationtable",
      // 只持久化 circleLabel 這個裝置顯示偏好。dataByMatch（各場的名單/站位）刻意不進
      // localStorage——它是「未存的工作狀態」，PO 決策是只有存成戰術才算數；而且不變量規定
      // persist 永不能帶著 match 資料。這兩條合起來，正好只剩 circleLabel 可以留存。
      partialize: (state) => ({ circleLabel: state.circleLabel }),
    },
  ),
);
