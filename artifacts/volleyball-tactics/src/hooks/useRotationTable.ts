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
  liberoReplacesPlayerId: null,
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

  // 一次寫定「先發自由球員是誰 ＋ 他頂替誰」（issue #327 的第七格）。
  //
  // 這支取代了舊的 setStartingLiberoId（只寫得了一半）跟 placePlayerOnCourt 的 L 分支
  // （輸入是「號位」，因為它服務的是球場拖曳——使用者指的是畫面上某一格）。第七格的輸入
  // 是**人**（「L 頂替 12 號」），中間沒有格子；硬要用號位表示就得先把人反查回號位、再
  // 換算回起始號位，多繞兩層還會被 currentRotation 影響，等於把一件簡單的事重新編碼成
  // 座標——正是 #326 判定為方向錯誤的那種做法。那兩支已在 #328 收尾時刪除（見檔尾註）。
  //
  // 兩個參數一起寫也是刻意的：這兩個欄位描述的是**同一件事**（哪一位 L 上場頂替哪一位）。
  // 拆成兩支各寫一半，就會出現「L 換人了但頂替對象還是舊的」這種中間狀態——store 端不該
  // 讓那種狀態存在得起來。
  setLiberoAssignment: (
    matchId: string,
    liberoId: string | null,
    replacesPlayerId: string | null,
  ) => void;

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

  // 註：舊的 loadRotationData（整批把存檔覆蓋回輪轉表）已在 #154 PR B 移除。載入已存戰術
  // 改成唯讀檢視、不再反向寫回輪轉表，所以輪轉表不需要、也刻意不提供這個「被別人整包覆蓋」
  // 的入口——反向寫回的能力從型別上就不存在了。
  //
  // ── #328 收尾（本次）：四支沒有消費者的寫入動作已刪除 ────────────────────────────
  // placePlayerOnCourt / removePlayerFromCourt / setStartingLiberoId / resetAll。
  // 前兩支的呼叫端只有戰術板中央的輪轉畫法（#328 退役），而「排先發」這件事本身早就改由
  // setLineupZones ＋ lib/rotationLogic 的 assignPlayerToZone 承接（#231 PR3、#174 的跨欄
  // 拖曳）；setStartingLiberoId 只寫得了「L 是誰」一半，#327 之後一律走 setLiberoAssignment
  // 兩個欄位一起寫；resetAll 從頭到尾沒有任何呼叫端。
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

      setLiberoAssignment: (matchId, liberoId, replacesPlayerId) =>
        set((state) =>
          updateMatch(state, matchId, (m) => {
            // 收掉整個指派：L 下場、也不再頂替任何人。
            if (liberoId === null) {
              if (m.startingLiberoId === null && m.liberoReplacesPlayerId === null) return m;
              return { ...m, startingLiberoId: null, liberoReplacesPlayerId: null };
            }

            // ── 白名單把關 ──
            // 兩道檢查都寫成「必須等於允許的值」而不是「不可以是危險值」（見專案 memory
            // 「安全閘門一律白名單」）：這個 action 的輸入來自拖曳事件的 dataTransfer，
            // 那是外部字串，別的分頁、桌面上的一段文字都可能丟進來。
            //   (a) 這個人必須真的在這場名單裡、而且真的是自由球員——不然會寫進一個
            //       deriveRotation 永遠找不到人的幽靈 id。
            //   (b) 被頂替的人必須真的在先發裡——頂替一個不在場上的人沒有意義。
            //
            // 刻意**不**檢查「被頂替者是不是站後排」，不是漏寫：這個 action 的手勢是
            // 「指定 L 要頂誰」——「頂替 12 號，等他轉到後排我再上」是完全合法的計畫。
            // 被頂替者在前排時 L 不在場上，由 deriveRotation 推導出來（#326），不需要在
            // 寫入這端先擋掉。（舊的 placePlayerOnCourt 有一條「L 不准放前排」的把關，因為
            // 它的手勢是「把 L 拖到某一格站著」、前排站位在規則上不存在；那支已在 #328
            // 收尾時整個刪掉，所以現在寫入端只剩這一條語意。）
            if (!m.roster.some((p) => p.id === liberoId && p.role === "L")) return m;
            const replaced =
              replacesPlayerId !== null && Object.values(m.lineup).includes(replacesPlayerId)
                ? replacesPlayerId
                : null;

            if (m.startingLiberoId === liberoId && m.liberoReplacesPlayerId === replaced) return m;
            return { ...m, startingLiberoId: liberoId, liberoReplacesPlayerId: replaced };
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

            // 頂替狀態也要跟著名單清乾淨，兩種情況都算「這次替換不再成立」：
            //   (a) 先發 L 被移出名單——場上那位 L 不存在了
            //   (b) **被頂替的那個人**被移出名單——沒有人被頂替，L 也就沒有位置可站
            // (b) 是換表示法之後才需要顧的：舊模型記的是號位，人被刪掉頂多讓那格空著；新
            // 模型記的是人，指向已刪除球員的 id 會讓 deriveRotation 每次都算出「L 不在場上」，
            // 畫面雖然沒錯，但 store 裡留著一個永遠不會成真的殘留值。
            const replacedStillExists = roster.some((p) => p.id === m.liberoReplacesPlayerId);
            const liberoReplacesPlayerId =
              currentStillExists && replacedStillExists ? m.liberoReplacesPlayerId : null;

            return {
              ...m,
              roster,
              lineup,
              liberoReplacesPlayerId,
              startingLiberoId: currentStillExists ? m.startingLiberoId : (liberos[0]?.id ?? null),
            };
          }),
        ),

      resetPositions: (matchId) =>
        set((state) =>
          updateMatch(state, matchId, (m) => ({
            ...m,
            lineup: {},
            liberoReplacesPlayerId: null,
          })),
        ),

      setLineupZones: (matchId, lineup) =>
        set((state) =>
          updateMatch(state, matchId, (m) => ({
            ...m,
            lineup,
            // ⚠️ 行為變更（#327）：這裡以前是無條件 `liberoReplacesPlayerId: null`。
            // 當時說得通——那時右欄面板沒有任何地方能指定 L，這支的每個呼叫端都是「教練
            // 剛動過六個號位」，順手清掉一個永遠是別處設的殘留值不會有人察覺。
            // 第七格搬進同一個面板之後就完全不同了：教練排好 L、接著調整任何一格，L 就會
            // 無聲消失，看起來就是「設了沒用」。
            // 改成：被頂替的人還在新的先發裡，這次頂替就繼續成立；被換掉/擠掉了就收回
            // null（#326：系統不替教練猜下一個頂替對象）。#328 收尾刪掉 placePlayerOnCourt
            // 之後，這條規則在 store 裡只剩這一份，不再需要跟另一支保持同步。
            liberoReplacesPlayerId: Object.values(lineup).includes(m.liberoReplacesPlayerId ?? "")
              ? m.liberoReplacesPlayerId
              : null,
          })),
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
