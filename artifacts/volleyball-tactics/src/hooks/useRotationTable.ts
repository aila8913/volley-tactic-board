import { create } from "zustand";
import { persist } from "zustand/middleware";
import { PerMatchRotationState, CircleLabelType } from "../types/rotationTable";
import {
  BACK_ROW_ZONES,
  rotateZone,
  assignPlayerToZone,
  filterLineupToRoster,
} from "../lib/rotationLogic";
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
  setStartingLiberoId: (matchId: string, id: string | null) => void;

  // 一次寫定「先發自由球員是誰 ＋ 他頂替誰」（issue #327 的第七格）。
  //
  // 為什麼不沿用既有的兩支（setStartingLiberoId ＋ placePlayerOnCourt）：那兩支的輸入是
  // 「號位」，因為它們服務的是球場拖曳——使用者指的是畫面上某一格。第七格的輸入是**人**
  //（「L 頂替 12 號」），中間沒有格子。硬要湊成 placePlayerOnCourt 就得先把人反查回號位、
  // 再讓它換算回起始號位，多繞兩層還會被 currentRotation 影響，等於把一件簡單的事重新
  // 編碼成座標——正是 #326 判定為方向錯誤的那種做法。
  //
  // 兩個參數一起寫也是刻意的：這兩個欄位描述的是**同一件事**（哪一位 L 上場頂替哪一位）。
  // 拆成兩支各寫一半，就會出現「L 換人了但頂替對象還是舊的」這種中間狀態——store 端不該
  // 讓那種狀態存在得起來。
  setLiberoAssignment: (
    matchId: string,
    liberoId: string | null,
    replacesPlayerId: string | null,
  ) => void;

  // 把球員放到場上某個格子（1~6 號位）——不管是從球員設定名單拖上場的新人，還是把
  // 已經在場上的人拖到別的格子，都是呼叫這個。放開時格子已經有人會直接互換位置；
  // 這個格子排定之後，其他 5 個輪次會依照「輪轉了幾格」自動推算，不用每輪都重新拖
  //（#231 PR3 之後這句話變成字面意義上的真：其他輪次不是被寫進 state，而是渲染時才算）。
  placePlayerOnCourt: (
    matchId: string,
    playerId: string,
    zone: number,
    referenceRotation?: number,
  ) => void;
  // 把球員從場上移除（右鍵刪除、3×2 格子的「×」按鈕用這個）。一般球員拿掉就是六輪都拿掉
  // （先發只有一份）；自由球員拿掉就是「不頂替任何人」＝整場下場（#326：L 沒有各輪獨立的
  // 站位可以只清一輪）。
  removePlayerFromCourt: (matchId: string, playerId: string) => void;
  // 清空這場的站位（RotationTable「重置站位」按鈕）。
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
  resetAll: (matchId: string) => void;
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

// 把某一輪看到的號位換算回「起始號位」（lineup 的 key 基準）。
// 起始號位 s 的人，轉了 r 輪之後會出現在 rotateZone(s, r)；反過來要從「這一輪的第 zone 格」
// 回推起始號位，就是往回轉 r 格。負數 rotateZone 內部已經處理過取模，直接傳負值即可。
function toStartZone(zone: number, rotation: number): number {
  return rotateZone(zone, -rotation);
}

export const useRotationTable = create<RotationTableStore>()(
  persist(
    (set) => ({
      circleLabel: "name",
      dataByMatch: {},

      setCircleLabel: (label) => set({ circleLabel: label }),

      setCurrentRotation: (matchId, index) =>
        set((state) => updateMatch(state, matchId, (m) => ({ ...m, currentRotation: index }))),

      setStartingLiberoId: (matchId, id) =>
        set((state) => updateMatch(state, matchId, (m) => ({ ...m, startingLiberoId: id }))),

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
            // 刻意**不**檢查「被頂替者是不是站後排」，這跟 placePlayerOnCourt 的自由球員
            // 分支不一樣，不是漏寫：那邊的手勢是「把 L 拖到球場的某一格站著」，落在前排格
            // 是規則上不存在的站位，當然要擋。這裡的手勢是「指定 L 要頂誰」——「頂替 12 號，
            // 等他轉到後排我再上」是完全合法的計畫。被頂替者在前排時 L 不在場上，由
            // deriveRotation 推導出來（#326），不需要在寫入這端先擋掉。
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

      placePlayerOnCourt: (matchId, playerId, zone, referenceRotation) =>
        set((state) =>
          updateMatch(state, matchId, (m) => {
            const player = m.roster.find((p) => p.id === playerId);
            const isLibero = player?.role === "L";

            // ── 自由球員邏輯 ──────────────────────────────────────────────────────
            // 自由球員不輪轉、只能站後排（1/5/6 號位），一次只能有一個 L 在場上。
            //
            // #326 之後，「把 L 拖到某一格」記下來的不是那一格，而是**那一格當下站著誰**：
            // 拖曳這個動作的真實語意是「讓 L 頂替這個人」，格子只是使用者指到那個人的方式。
            if (isLibero) {
              if (!BACK_ROW_ZONES.has(zone)) return m; // 前排拒絕放置

              // zone 是「使用者在目前這一輪看到的號位」，lineup 的 key 是起始號位，
              // 所以要先換算回去才問得出「這一格站的是誰」（跟下面一般球員那段同一條換算）。
              const startZone = toStartZone(zone, m.currentRotation);
              const target = m.lineup[startZone];
              // 那格還沒人＝沒有可頂替的對象，這次拖曳無法表示成任何狀態，直接忽略。
              // 這跟上面「前排拒絕放置」是同一類把關：新模型只認得「L 頂替某個人」，
              // 「L 站在一個空格上」在規則上本來就不存在（他是替換上場的，不佔輪轉序）。
              if (target === undefined) return m;
              if (m.liberoReplacesPlayerId === target && m.startingLiberoId === playerId) return m;

              // 不管這個 L 是從備位區拖上場、還是直接從名單拖上場，
              // 都要同步把它設成 startingLiberoId——這樣每場只會追蹤一個「先發」L，
              // 備位區才不會跟場上狀態脫節（這正是 issue #14 bug 1 的根本原因）。
              return { ...m, liberoReplacesPlayerId: target, startingLiberoId: playerId };
            }

            // ── 一般球員邏輯 ──────────────────────────────────────────────────────
            // referenceRotation 讓呼叫方指定「這個 zone 是第幾輪看到的號位」。lineup 存的是
            // 起始號位，所以要先換算回去（toStartZone）；換算完之後，「其他 5 輪怎麼站」
            // 根本不用處理——它們是 deriveRotation 現算出來的，不是存起來的第二份資料。
            const r = referenceRotation ?? m.currentRotation;
            const startZone = toStartZone(zone, r);

            if (m.lineup[startZone] === playerId) return m; // 拖到自己原本站的格子，沒變化

            // 「拖到已有人的格子要互換、拖上場的新人要擠掉原本佔格的人」這條規則，
            // 跟換局換輪視窗（SetLineupDialog）重新排位是同一條領域規則，PR2 起就直接複用
            // assignPlayerToZone，不再自己手刻第二份一模一樣的判斷（見 issue #231）。
            //
            // ⚠️ 行為變更（#231 PR3）：這裡不再需要「先把自由球員的站位濾掉」那一步——
            // lineup 裡本來就沒有 L。舊版那個 filter 正是「一般球員可以跟 L 疊在同一格」
            // 這個 bug 的成因（L 站的格子在濾掉之後看起來是空的，不觸發互換也不觸發擠位）。
            // 新表示法下「那格有沒有人」只有一個答案，bug 自然消失。
            const lineup = assignPlayerToZone(m.lineup, startZone, playerId);

            // 擠位有可能把「正被 L 頂替的那個人」整個擠出先發（assignPlayerToZone 的語意：
            // 板凳球員佔了誰的格子，誰就直接離場）。人都不在場上了，那次頂替自然不成立——
            // 清成 null 而不是改成「頂替新來的那個人」，是 #326 那條規則的直接後果：系統不
            // 替教練猜下一個頂替對象，寧可讓 L 回到場外等他自己再派一次。
            const replacedStillOnCourt = Object.values(lineup).includes(
              m.liberoReplacesPlayerId ?? "",
            );
            return {
              ...m,
              lineup,
              liberoReplacesPlayerId: replacedStillOnCourt ? m.liberoReplacesPlayerId : null,
            };
          }),
        ),

      // 右鍵刪除球員：
      // - 自由球員（L）：解除頂替＝L 下場。被他替換下場的人會自動回到場上——那個人本來就
      //   一直在 lineup 裡，只是渲染時被 L 蓋住，蓋子拿掉就露出來了。
      //   ⚠️ 行為變更（#326）：舊版是「只清目前這一輪」，那件事在新表示法下不再可表示——
      //   L 沒有各輪獨立的站位可以分開清。而且舊行為本來就跟規則對不上：教練把 L 換下場是
      //   一個當下的動作，不是「只有第 3 輪他不上場」。
      // - 一般球員：從 lineup 移除，等於六輪一起消失（先發只有一份）。順手檢查他是不是正
      //   被 L 頂替著——是的話那次頂替也不成立了（人都不在場上了，沒有誰可以頂替）。
      removePlayerFromCourt: (matchId, playerId) =>
        set((state) =>
          updateMatch(state, matchId, (m) => {
            const player = m.roster.find((p) => p.id === playerId);

            if (player?.role === "L") {
              if (m.liberoReplacesPlayerId === null) return m;
              return { ...m, liberoReplacesPlayerId: null };
            }

            const lineup = Object.fromEntries(
              Object.entries(m.lineup)
                .filter(([, pid]) => pid !== playerId)
                .map(([zoneStr, pid]) => [Number(zoneStr), pid]),
            );
            return {
              ...m,
              lineup,
              liberoReplacesPlayerId:
                m.liberoReplacesPlayerId === playerId ? null : m.liberoReplacesPlayerId,
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

      resetAll: (matchId) => set((state) => updateMatch(state, matchId, () => emptyPerMatch())),

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
            // 改成跟 placePlayerOnCourt 同一條規則：被頂替的人還在新的先發裡，這次頂替就
            // 繼續成立；被換掉/擠掉了就收回 null（#326：系統不替教練猜下一個頂替對象）。
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
