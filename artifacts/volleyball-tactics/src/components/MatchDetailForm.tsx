import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useForm, useFieldArray, useWatch, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Trash2 } from "lucide-react";
import type { Person } from "@workspace/api-client-react";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { useCreateMatch, useUpdateMatch } from "@/hooks/useMatches";
import { useTeamList, useCreateTeam, useTeamRosterSuggestions } from "@/hooks/useTeams";
import PlayerRosterMatchHint from "@/components/PlayerRosterMatchHint";
import { usePersonList } from "@/hooks/usePeople";
import { MATCH_FORMAT_LABEL } from "@/components/MatchDetailView";
import {
  Match,
  matchFormSchema,
  MatchFormValues,
  matchToFormValues,
  PLAYER_ROLES,
} from "@/types/match";
import { useToast } from "@/hooks/use-toast";

// 右欄「比賽基本資料 ＋ 球員名單」的**編輯**表單（issue #329）。
//
// 這支檔案的內容幾乎整份來自已刪除的 MatchFormDialog.tsx——#329 要的是「同一份表單搬個家」，
// 不是重寫一套：去重 UX（#213）、球隊建議 chip（#287）、送出時自動建 person、球隊選擇器不是
// zod 欄位這幾件事全部照搬，連同原本的註解一起，因為那些註解記的是「為什麼不能改成另一種
// 寫法」的決策，跟著程式碼走才有用。實際換掉的只有外殼：Dialog/DialogFooter → 右欄裡的
// 一段 flex 版面，「關閉彈窗」→ onCancel/onSaved/onCreated 三個回呼。

const emptyDefaults: MatchFormValues = {
  opponent: "",
  dateTime: "",
  // 預設三戰兩勝：跟 DB 的 default("best_of_3") 呼應（見 lib/db/src/schema/matches.ts）——
  // 系隊/校隊的練習賽、盃賽初賽多半是三戰兩勝，新增比賽表單第一次打開時直接對準最常見情境。
  format: "best_of_3",
  players: [{ name: "", number: 0, role: "S", personId: null }],
};

// 球隊下拉的兩個特殊值。Radix Select 不允許 SelectItem 用空字串當 value（會丟錯），
// 所以「未指定」用一個 sentinel 字串，而不是 ""。"__new__" 是「臨時建一支新球隊」那一列。
const TEAM_NONE = "__none__";
const TEAM_NEW = "__new__";

// ── 為什麼要在這裡覆寫一組 CSS 變數 ──
//
// shadcn 的 Input/SelectTrigger 用的是語意 token（border-input、text-muted-foreground），
// 而這個專案的 token 是**淺色**主題（index.css 的 :root：--input 是 hsl(0 0% 7%)，近乎全黑）。
// 這些元件本來活在白底的 Dialog 裡沒問題，但 #329 把表單搬進右欄之後，底是 #121310 的深色玻璃
// ——近黑的框線在近黑的底上等於沒有框，placeholder 也讀不出來。
//
// 解法選「就地覆寫變數」而不是「每個欄位各自加一串 className」：token 的意義就是「一個地方改、
// 底下全部跟著變」，逐欄硬寫顏色等於把 design token 這層繞過去，之後 tang 調整右欄配色時又要
// 一個一個找。這裡只覆寫顏色會出問題的那三個，其餘（--primary 萊姆綠、--ring）本來就通用。
//
// 注意 Radix 的 SelectContent 是 portal 到 body 的，收不到這裡的覆寫——那塊維持全站既有的
// 淺色下拉面板樣式，跟其他頁面的下拉一致，本來就讀得到，不需要處理。
const DARK_FORM_TOKENS = {
  // 輸入框/下拉的框線：從近黑改成一層淡白，跟右欄其他卡片的 border-white/[0.12] 同一個亮度感。
  "--input": "75 6% 30%",
  "--border": "75 6% 30%",
  // placeholder 跟次要文字：對齊右欄既有的 #9AA08C。
  "--muted-foreground": "75 9% 60%",
  // 主要文字：:root 的 --foreground 是近黑（0 0% 7%），在深色玻璃上讀不到。#222 把去重提示
  // 抽成兩邊共用的元件之後才需要這一條——那塊 UI 現在同時出現在這裡（深底）跟白底的
  // RosterEditDialog，只能靠 token 分辨自己站在哪，不能再寫死 #F5F5F0。值就是 #F5F5F0。
  //
  // 安全性：專案裡 --foreground 的消費者只有 shadcn Input 的 file:text-foreground（檔案上傳
  // 按鈕的偽元素，這份表單沒有 file input），其餘欄位的文字色都是繼承自外層，所以這條覆寫
  // 只影響明確寫了 text-foreground 的元素。
  "--foreground": "60 20% 95%",
} as CSSProperties;

// 名單去重提示（#213）的 react-hook-form 接線。UI 本體已經搬去共用的
// PlayerRosterMatchHint.tsx（#222：戰術板的 RosterEditDialog 也要同一塊），這裡只剩
// 「這一列的值怎麼讀、按下去怎麼寫回表單」這段跟 MatchFormValues 綁在一起的膠水。
//
// useWatch 而不是直接讀 form.getValues：要讓這個提示隨著使用者打字/按鈕即時更新，
// 而 react-hook-form 預設不會因為某個欄位變動就重繪整個表單（那樣效能太差），
// 訂閱特定欄位才能拿到「這欄變了就重繪我」的效果。
function MatchFormRosterMatchHint({
  form,
  index,
  people,
}: {
  form: UseFormReturn<MatchFormValues>;
  index: number;
  people: Person[];
}) {
  const name = useWatch({ control: form.control, name: `players.${index}.name` });
  const personId = useWatch({ control: form.control, name: `players.${index}.personId` });

  return (
    <PlayerRosterMatchHint
      name={name}
      personId={personId}
      people={people}
      onLink={(id) => form.setValue(`players.${index}.personId`, id, { shouldDirty: true })}
      onUnlink={() => form.setValue(`players.${index}.personId`, null, { shouldDirty: true })}
    />
  );
}

// #287：這支球隊之前登錄過的人——父層只有在「球隊（可選）」下拉選了既有球隊時才會傳進
// selectedTeamId（不是 TEAM_NONE／TEAM_NEW），useTeamRosterSuggestions 對 teamId 為 null
// 不發請求。這支元件負責：濾掉已經在這份表單名單裡的 personId（不能重複加同一個人），
// 沒有建議時整塊不顯示，否則列出一顆一顆可點的 chip。
//
// 刻意不自動整批帶入：issue #287 明講是「勾選＋微調」，不是「自動填」。跟 #213/#215 那條
// 判準一樣——「能不能給預設，取決於預設的方向會不會產生錯誤答案」：這裡如果自動把整支球隊
// 的建議名單灌進表單，會覆蓋/淹沒使用者已經打好的列（例如使用者已經先手動加了幾個人，
// 或這場其實有人請假不來），屬於會產生錯誤答案的方向，所以只給建議、由人決定要不要點。
function RosterSuggestions({
  form,
  selectedTeamId,
  append,
  update,
}: {
  form: UseFormReturn<MatchFormValues>;
  selectedTeamId: number | null;
  append: (value: MatchFormValues["players"][number]) => void;
  update: (index: number, value: MatchFormValues["players"][number]) => void;
}) {
  const { suggestions } = useTeamRosterSuggestions(selectedTeamId);
  // 用 useWatch 而不是 form.getValues：名單列每次新增/勾選建議都要重新算「還剩哪些建議
  // 沒被加過」，跟 PlayerRosterMatchHint 同一個理由——要讓這塊隨表單即時更新。
  const players = useWatch({ control: form.control, name: "players" });

  if (selectedTeamId === null) return null;

  const addedPersonIds = new Set(
    (players ?? []).map((p) => p.personId).filter((id): id is number => id != null),
  );
  const available = suggestions.filter((s) => !addedPersonIds.has(s.personId));
  if (available.length === 0) return null;

  const handlePick = (s: (typeof available)[number]) => {
    const current = form.getValues("players");
    // 名單只有一列、且那列還是空白的 emptyDefaults 佔位列時，用選到的建議「取代」它，
    // 不是 append——不然會多留一列空白名字，卡在 zod 的 min(1, "請輸入球員姓名") 驗證過不了。
    const isSinglePlaceholderRow = current.length === 1 && current[0].name.trim() === "";
    const value = { name: s.name, number: s.number, role: s.role, personId: s.personId };
    if (isSinglePlaceholderRow) {
      update(0, value);
    } else {
      append(value);
    }
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-[#9AA08C]">這支球隊登錄過的人</Label>
      <div className="flex flex-wrap gap-1.5">
        {available.map((s) => (
          <button
            key={s.personId}
            type="button"
            onClick={() => handlePick(s)}
            className="rounded-full border border-white/[0.26] px-2 py-0.5 text-micro
              text-[#F5F5F0] transition hover:border-[#C6F135] hover:text-[#C6F135]"
          >
            {s.name} · #{s.number} · {s.role}
            <span className="text-[#9AA08C]"> ({s.matchCount} 場)</span>
          </button>
        ))}
      </div>
    </div>
  );
}

interface MatchDetailFormProps {
  // 有傳 match（含完整名單）就是編輯模式，null 就是新增模式。編輯模式的名單由容器
  // （MatchInfoRail 的 MatchDetailSection）用 useMatchWithRoster 抓好再傳進來，這裡不自己抓：
  // 容器本來就已經為了場上站位抓過同一份資料，再抓一次只是多訂閱一份同樣的快取。
  match: Match | null;
  // 新增時這場比賽要歸到哪個資料夾——null 代表直接放在最上層。編輯時不會用到
  //（歸屬的資料夾在這一輪不能改）。
  tournamentId: string | null;
  // 使用者按「取消」。
  onCancel: () => void;
  // 編輯既有比賽儲存成功。
  onSaved: () => void;
  // 新增成功，帶回後端給的新比賽 id（字串形式，跟 domain Match.id 一致）。
  onCreated: (matchId: string) => void;
  // 表單有沒有被改過，往上報給頁面——「未存檔就切走要不要攔」需要這個值，
  // 見 hooks/useMatchRailSelection.ts。
  onDirtyChange: (dirty: boolean) => void;
  // 夾在「比賽資訊」跟「球員名單」中間的東西——實務上就是場上站位面板（RotationRailPanel）。
  //
  // 為什麼要讓表單長出一個插槽，而不是把站位面板留在表單外面接在下方：PO 定的模組順序是
  // 比賽資訊 → 場上站位 → 第幾局 → 球員名單，而「就地編輯」的重點就是**按下編輯前後，
  // 這一欄的東西不會換位置**，只是欄位從鎖住變成可以打字。站位面板放在表單外，編輯模式
  // 就只能被擠到名單下面，切進切出編輯模式時整欄的模組順序會跳一次，那就不叫就地編輯了。
  //
  // 型別是 ReactNode（不是元件或一堆 props）：這支表單不需要知道插進來的是什麼，
  // 也不該知道——站位的資料與領域規則全在 MatchInfoRail 那邊算好。
  lineupSlot?: ReactNode;
}

export default function MatchDetailForm({
  match,
  tournamentId,
  onCancel,
  onSaved,
  onCreated,
  onDirtyChange,
  lineupSlot,
}: MatchDetailFormProps) {
  const isEditing = match !== null;
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const createMatch = useCreateMatch();
  const updateMatch = useUpdateMatch();

  // 球隊標籤是「挑既有／臨時建新」的選擇器，不是 zod 表單欄位（新建的球隊送出前還沒有 id），
  // 所以用獨立的本地 state 管：teamSelection 存下拉目前選的值（sentinel 或 String(id)），
  // newTeamName 只有選了「建立新球隊」時才會用到。
  const { teams } = useTeamList();
  const createTeam = useCreateTeam();
  const [teamSelection, setTeamSelection] = useState<string>(
    match?.teamId != null ? String(match.teamId) : TEAM_NONE,
  );
  const [newTeamName, setNewTeamName] = useState("");
  // 球隊選擇不在 form 裡，所以 react-hook-form 的 isDirty 看不到它——只改了球隊就切走會
  // 靜默丟掉變更。自己記一格「球隊動過沒有」，跟 isDirty 一起往上報。
  const [teamDirty, setTeamDirty] = useState(false);

  // 跨場身分（Person）列表，給名單去重 UX 比對「這個名字是不是先前記錄過的某個人」用。
  //（「還沒對應的列自動建一個新身分」已經不在這支表單裡做了，見 onSubmit 的說明。）
  const { people } = usePersonList();

  // defaultValues 直接算好，不需要 MatchFormDialog 那個「每次開窗用 reset 重填」的 useEffect：
  // 彈窗是常駐掛載、靠 open 開關顯示，所以得自己重置；這裡則是「進編輯模式才掛載、離開就卸載」，
  // 每次進來本來就是全新的元件實例，defaultValues 只會被讀一次，正是我們要的。
  // 這也順帶消掉了原本那個「match 參照不穩就無限 reset」的地雷（見 useMatches.ts useMemo 註解）。
  const form = useForm<MatchFormValues>({
    resolver: zodResolver(matchFormSchema),
    defaultValues: match ? matchToFormValues(match) : emptyDefaults,
  });

  const { fields, append, remove, update } = useFieldArray({
    control: form.control,
    name: "players",
  });

  // 把「改過沒有」往上報。isDirty 是 react-hook-form 算好的（跟 defaultValues 比對），
  // 訂閱 formState.isDirty 這個欄位才會在它翻動時重繪——react-hook-form 的 formState 是
  // Proxy，沒讀到的欄位不會觸發重繪。
  const isDirty = form.formState.isDirty || teamDirty;
  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  // #287：只有「球隊（可選）」下拉選了既有球隊（不是「未指定」也不是「建立新球隊…」）時，
  // 才有 teamId 能拿去查建議名單——TEAM_NEW 選的球隊送出前根本還沒有 id。
  const selectedTeamId =
    teamSelection !== TEAM_NONE && teamSelection !== TEAM_NEW ? Number(teamSelection) : null;

  const onSubmit = async (values: MatchFormValues) => {
    setSubmitting(true);
    try {
      // 把下拉的選擇解析成要存進比賽的 teamId：
      //   "__none__" → null（未分類）
      //   "__new__"  → 有輸入名字就先建一支新球隊、拿它的 id；沒輸入就當未分類
      //   其他       → 既有球隊的整數 id
      let teamId: number | null = null;
      if (teamSelection === TEAM_NEW) {
        const name = newTeamName.trim();
        teamId = name ? await createTeam(name) : null;
      } else if (teamSelection !== TEAM_NONE) {
        teamId = Number(teamSelection);
      }

      // 名單去重（#213）：「合併到既有身分」只能由使用者在上面按「是同一人」明確指定
      // （見 PlayerRosterMatchHint），這裡絕不自己猜著合併。至於「某列還是沒有 personId
      // 就自動建一個新的」——那段原本寫在這裡，#222 已經搬進 useMatches 的寫入層
      //（resolveRosterPersonIds），因為戰術板的「編輯球員名單」彈窗走的是另一條寫入路徑、
      // 沒有經過這支表單，補在這裡等於只補一半。這裡不再自己做，直接送原始的表單值。
      if (match) {
        await updateMatch(Number(match.id), values, match.players, teamId);
        onSaved();
      } else {
        const newId = await createMatch(values, tournamentId, teamId);
        onCreated(String(newId));
      }
    } catch {
      // 後端寫入失敗（網路、驗證等）時不離開編輯模式，讓使用者可以重試——這正是原本
      // 「失敗不關彈窗」那條規則搬過來的樣子。
      toast({ title: "儲存失敗", description: "請稍後再試一次", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      {/* 版面：標題列（取消/儲存）固定在頂端，其餘內容一起捲。
          站位面板改成跟著內容一起捲、不再釘在欄底（PO 2026-08-09 的模組順序定案）——
          兩份球員名單合併成一份之後，右欄的內容總高度降下來了，原本「名單一長就把站位
          擠出視野」的問題不再靠釘住解決，而是靠不再畫兩份名單解決。 */}
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        style={DARK_FORM_TOKENS}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div
          className="flex shrink-0 items-center justify-between gap-2 border-b border-white/[0.10]
            px-3 py-2"
        >
          <h2 className="truncate text-sm font-bold text-[#C6F135]">
            {isEditing ? "編輯比賽" : "新增比賽"}
          </h2>
          <div className="flex shrink-0 gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onCancel}
              disabled={submitting}
              className="text-[#9AA08C] hover:text-[#F5F5F0]"
            >
              取消
            </Button>
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting ? "儲存中…" : "儲存"}
            </Button>
          </div>
        </div>

        {/* 捲動範圍是「整個內容區」，但內距（px-3 py-3）改由裡面的兩塊各自負責——
            中間插進來的站位面板自己就帶滿版的 px-3/border-b，跟外層再套一次 px-3 會變成
            雙重縮排，跟唯讀模式的同一個面板對不齊。 */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-4 px-3 py-3">
            <FormField
              control={form.control}
              name="opponent"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs text-[#9AA08C]">對手</FormLabel>
                  <FormControl>
                    <Input placeholder="對手隊名" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="dateTime"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs text-[#9AA08C]">日期時間</FormLabel>
                  <FormControl>
                    {/* [color-scheme:dark]：讓瀏覽器原生的日期選擇器圖示/面板用深色版本，
                      不然 Chrome 會在深色輸入框上畫一個黑色的小日曆圖示，幾乎看不見。 */}
                    <Input type="datetime-local" className="[color-scheme:dark]" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* 賽制（#215）：跟 opponent/dateTime 一樣是普通的 react-hook-form 受控欄位
              （見 types/match.ts matchFormSchema 的註解：這欄沒有「還沒建立好」的中間狀態，
              不像 teamId 需要獨立本地 state），所以直接走 FormField，用法跟下面球員名單裡
              的角色下拉一致。 */}
            <FormField
              control={form.control}
              name="format"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs text-[#9AA08C]">賽制</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {/* 文案跟唯讀檢視共用同一份對照表，不在兩邊各寫一次字串。 */}
                      <SelectItem value="best_of_3">{MATCH_FORMAT_LABEL.best_of_3}</SelectItem>
                      <SelectItem value="best_of_5">{MATCH_FORMAT_LABEL.best_of_5}</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* 球隊標籤（可選）。不是 react-hook-form 欄位，所以直接用 Label + Select 手接
              本地 state，不走 FormField。選「建立新球隊」時才展開一格名稱輸入。 */}
            <div className="space-y-2">
              <Label className="text-xs text-[#9AA08C]">球隊（可選）</Label>
              <Select
                value={teamSelection}
                onValueChange={(v) => {
                  setTeamSelection(v);
                  setTeamDirty(true);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TEAM_NONE}>未指定</SelectItem>
                  {teams.map((team) => (
                    <SelectItem key={team.id} value={String(team.id)}>
                      {team.name}
                    </SelectItem>
                  ))}
                  <SelectItem value={TEAM_NEW}>＋ 建立新球隊…</SelectItem>
                </SelectContent>
              </Select>
              {teamSelection === TEAM_NEW && (
                <Input
                  placeholder="新球隊名稱"
                  value={newTeamName}
                  onChange={(e) => {
                    setNewTeamName(e.target.value);
                    setTeamDirty(true);
                  }}
                />
              )}
            </div>
          </div>

          {/* 場上站位（＋第幾局的 stepper）。見 lineupSlot 的說明：擺在這裡是為了讓
              「比賽資訊 → 場上站位 → 第幾局 → 球員名單」這個順序在唯讀/編輯兩種模式下
              一模一樣。編輯模式底下這個面板不畫自己的球員清單（rosterList="hidden"），
              名單由下面那份可增刪的表單版本接手。 */}
          {lineupSlot}

          <div className="space-y-4 px-3 py-3">
            {/* #287：這支球隊之前登錄過的人，勾了才加進名單——見 RosterSuggestions 上方註解。
              編輯模式一樣顯示（回鍋球員一樣好用），不特別擋。 */}
            <RosterSuggestions
              form={form}
              selectedTeamId={selectedTeamId}
              append={append}
              update={update}
            />

            {/* #401：球員名單這一區裡，在輸入框按 Enter 不送出整場比賽。

                原因是 HTML 的 **implicit submission**——表單裡只要有 submit 鈕，在任何單行
                input 按 Enter 瀏覽器就會幫你送出。對「對手隊名」那種單一欄位這是好事（打完
                按 Enter 就存檔很自然），但球員名單是一個多列陣列：使用者打完一位球員的名字
                按 Enter，心裡想的是「下一格／下一位」，不是「這場比賽我填完了」。實際撞到的
                人看到的是驗證錯誤整片亮起來（日期還沒填），開發模式下還會再吃一個 Vite 的
                紅色錯誤覆蓋層。

                只擋 input，不擋 button：刪除鈕、「新增球員」鈕都是 <button>，鍵盤操作的人
                靠 Enter 觸發它們，一起擋掉會讓名單變成滑鼠才能用。Radix 的「位置」下拉在
                DOM 上也是 button（role=combobox），它自己會處理 Enter 展開選單，同樣不能擋。

                只掛在名單這一區、不掛在整個 <form> 上：基本資料那幾格按 Enter 存檔是合理的，
                沒必要跟著一起犧牲。 */}
            <div
              className="space-y-2"
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.target instanceof HTMLInputElement) {
                  e.preventDefault();
                }
              }}
            >
              <Label className="text-xs text-[#9AA08C]">球員名單</Label>
              {fields.map((field, index) => (
                <div key={field.id} className="space-y-1">
                  {/* 右欄比彈窗窄得多（約 270px），姓名/背號/位置/刪除四個東西並排會把姓名
                    擠到只剩「球員姓」三個字看得見、背號只露出半個數字——實測就是這樣。
                    所以拆成兩行：姓名獨佔一行，背號＋位置＋刪除鈕排第二行。 */}
                  <FormField
                    control={form.control}
                    name={`players.${index}.name`}
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Input placeholder="球員姓名" className="h-8" {...field} />
                        </FormControl>
                        <FormMessage className="text-micro" />
                      </FormItem>
                    )}
                  />
                  <div className="flex items-start gap-1.5">
                    <FormField
                      control={form.control}
                      name={`players.${index}.number`}
                      render={({ field }) => (
                        <FormItem className="w-16">
                          <FormControl>
                            <Input type="number" placeholder="背號" className="h-8" {...field} />
                          </FormControl>
                          <FormMessage className="text-micro" />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`players.${index}.role`}
                      render={({ field }) => (
                        <FormItem className="w-20">
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="h-8">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {PLAYER_ROLES.map((role) => (
                                <SelectItem key={role} value={role}>
                                  {role}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage className="text-micro" />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-[#9AA08C] hover:text-[#ef4444]"
                      disabled={fields.length <= 1}
                      onClick={() => remove(index)}
                      aria-label="刪除這位球員"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  {/* 這一列的同名對應提示／已對應狀態，見 PlayerRosterMatchHint 上方註解。 */}
                  <MatchFormRosterMatchHint form={form} index={index} people={people} />
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                // outline variant 的框線色來自 --button-outline，這個專案沒有定義它，
                // 在深色底上會變成看不見的框——直接指定右欄既有的那組描邊色。
                className="w-full border-white/[0.26] text-[#F5F5F0] hover:border-[#C6F135]
                hover:text-[#C6F135]"
                onClick={() => append({ name: "", number: 0, role: "S", personId: null })}
              >
                新增球員
              </Button>
            </div>
          </div>
        </div>
      </form>
    </Form>
  );
}
