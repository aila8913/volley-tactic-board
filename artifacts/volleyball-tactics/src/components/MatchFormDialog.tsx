import { useEffect, useState } from "react";
import { useForm, useFieldArray, useWatch, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Trash2, X } from "lucide-react";
import type { Person } from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { useCreateMatch, useUpdateMatch, useMatchWithRoster } from "@/hooks/useMatches";
import { useTeamList, useCreateTeam } from "@/hooks/useTeams";
import { usePersonList, useCreatePerson } from "@/hooks/usePeople";
import {
  Match,
  matchFormSchema,
  MatchFormValues,
  matchToFormValues,
  PLAYER_ROLES,
} from "@/types/match";
import { useToast } from "@/hooks/use-toast";

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

// 球員名單去重 UX（#213）：在姓名輸入框下方，比對這一列的姓名跟既有的 people（跨場身分）
// 是否「trim 後不分大小寫完全相同」。
//   - 還沒對應到任何人、且比對到同名的既有身分 → 顯示建議 chip，要使用者親自按「是同一人」
//     才會寫入 personId。絕不自動綁定：自動綁對了省一步，綁錯了會把兩個不同人的生涯數據
//     混在一起，而且事後很難發現，所以這一步一定要使用者明示。
//   - 已經對應到某個人 → 顯示「已對應：XXX」＋一個可以解除的 ✕（解除＝把 personId 設回 null）。
//   - 沒對到、也還沒對應過 → 什麼都不顯示，保持名單編輯的清爽。
function PlayerRosterMatchHint({
  form,
  index,
  people,
}: {
  form: UseFormReturn<MatchFormValues>;
  index: number;
  people: Person[];
}) {
  // useWatch 而不是直接讀 form.getValues：要讓這個提示隨著使用者打字/按鈕即時更新，
  // 而 react-hook-form 預設不會因為某個欄位變動就重繪整個表單（那樣效能太差），
  // 訂閱特定欄位才能拿到「這欄變了就重繪我」的效果。
  const name = useWatch({ control: form.control, name: `players.${index}.name` });
  const personId = useWatch({ control: form.control, name: `players.${index}.personId` });

  if (personId != null) {
    const matched = people.find((p) => p.id === personId);
    return (
      <div className="flex items-center gap-1 pl-1 text-xs text-muted-foreground">
        <span>已對應：{matched?.name ?? `#${personId}`}</span>
        <button
          type="button"
          onClick={() => form.setValue(`players.${index}.personId`, null, { shouldDirty: true })}
          className="rounded-sm hover:text-destructive"
          aria-label="解除對應"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    );
  }

  const trimmed = name?.trim() ?? "";
  if (!trimmed) return null;

  const candidate = people.find((p) => p.name.trim().toLowerCase() === trimmed.toLowerCase());
  if (!candidate) return null;

  return (
    <div className="flex items-center gap-2 pl-1 text-xs text-muted-foreground">
      <span>這是先前記錄過的「{candidate.name}」嗎？</span>
      <button
        type="button"
        onClick={() =>
          form.setValue(`players.${index}.personId`, candidate.id, { shouldDirty: true })
        }
        className="rounded border border-input px-1.5 py-0.5 text-foreground hover:bg-accent"
      >
        是同一人
      </button>
    </div>
  );
}

interface MatchFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // 有傳 match 就是編輯模式，沒傳就是新增模式。
  match?: Match | null;
  // 新增時這場比賽要歸到哪個資料夾——null 代表直接放在最上層。編輯時不會用到這個 prop
  // (歸屬的資料夾在這一輪不能改)。
  tournamentId?: string | null;
}

export default function MatchFormDialog({
  open,
  onOpenChange,
  match,
  tournamentId = null,
}: MatchFormDialogProps) {
  const isEditing = !!match;
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const createMatch = useCreateMatch();
  const updateMatch = useUpdateMatch();

  // 球隊標籤是「挑既有／臨時建新」的選擇器，不是 zod 表單欄位（新建的球隊送出前還沒有 id），
  // 所以用獨立的本地 state 管：teamSelection 存下拉目前選的值（sentinel 或 String(id)），
  // newTeamName 只有選了「建立新球隊」時才會用到。
  const { teams } = useTeamList();
  const createTeam = useCreateTeam();
  const [teamSelection, setTeamSelection] = useState<string>(TEAM_NONE);
  const [newTeamName, setNewTeamName] = useState("");

  // 跨場身分（Person）列表，給名單去重 UX 比對「這個名字是不是先前記錄過的某個人」用；
  // 也給 onSubmit 在送出時「幫還沒對應的名單列自動建一個新身分」用。
  const { people } = usePersonList();
  const createPerson = useCreatePerson();

  // 編輯模式才需要抓「伺服器目前的完整名單」——用來預填表單、也用來讓儲存時算出名單差異
  // （新增/修改/刪除哪些球員）。列表傳進來的 match 只有身份、沒有名單（避免列表 N+1）。
  const { match: fetchedMatch } = useMatchWithRoster(match ? Number(match.id) : 0, isEditing);
  const existingPlayers = fetchedMatch?.players ?? [];

  const form = useForm<MatchFormValues>({
    resolver: zodResolver(matchFormSchema),
    defaultValues: emptyDefaults,
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "players",
  });

  // 這個 dialog 元件在新增/編輯之間共用、不會每次開啟都重新 mount，
  // 所以每次打開時要自己用 reset 把表單填成對應的初始值（新增 -> 空白，編輯 -> 帶入既有比賽）。
  // 編輯時等 fetchedMatch（含名單）抓回來再填，才不會只填到對手/時間卻沒有球員列。
  useEffect(() => {
    if (open) {
      const source = fetchedMatch ?? match;
      form.reset(source ? matchToFormValues(source) : emptyDefaults);
      // 球隊選擇不在 form 裡，要自己隨開窗重置：編輯模式預填這場原本的球隊，新增模式回到「未指定」。
      setTeamSelection(source?.teamId != null ? String(source.teamId) : TEAM_NONE);
      setNewTeamName("");
    }
  }, [open, match, fetchedMatch, form]);

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
      // （見 PlayerRosterMatchHint），這裡絕不自己猜著合併。但送出時如果某列還是沒有
      // personId，就自動幫他建一個新的 person 並綁上——這個不對稱是刻意的：
      //   - 建新身分永遠安全：最壞情況只是同一個人多了一筆待合併的身分，
      //     資料還是對的，只是分散在兩個 id 底下，之後仍可人工合併回來。
      //   - 自動合併到既有身分不安全：一旦猜錯人，兩個不同人的生涯數據就會被混在一起，
      //     而且事後很難發現、很難修正。
      // 所以「建新」可以是預設值，「合併」必須使用者明示——跟 #215 那條「合理預設值 vs
      // 沉默的錯誤答案」是同一條判準：這裡敢給預設，正是因為預設的方向不會產生錯誤答案。
      const playersWithPersonId = await Promise.all(
        values.players.map(async (p) => {
          if (p.personId != null) return p;
          const personId = await createPerson(p.name);
          return { ...p, personId };
        }),
      );
      const resolvedValues: MatchFormValues = { ...values, players: playersWithPersonId };

      if (match) {
        await updateMatch(Number(match.id), resolvedValues, existingPlayers, teamId);
      } else {
        await createMatch(resolvedValues, tournamentId, teamId);
      }
      onOpenChange(false);
    } catch {
      // 後端寫入失敗（網路、驗證等）時不關閉彈窗，讓使用者可以重試。
      toast({ title: "儲存失敗", description: "請稍後再試一次", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "編輯比賽" : "新增比賽"}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="opponent"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>對手</FormLabel>
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
                  <FormLabel>日期時間</FormLabel>
                  <FormControl>
                    <Input type="datetime-local" {...field} />
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
                  <FormLabel>賽制</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="best_of_3">三戰兩勝</SelectItem>
                      <SelectItem value="best_of_5">五戰三勝</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* 球隊標籤（可選）。不是 react-hook-form 欄位，所以直接用 Label + Select 手接
                本地 state，不走 FormField。選「建立新球隊」時才展開一格名稱輸入。 */}
            <div className="space-y-2">
              <Label>球隊（可選）</Label>
              <Select value={teamSelection} onValueChange={setTeamSelection}>
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
                  onChange={(e) => setNewTeamName(e.target.value)}
                />
              )}
            </div>

            <div className="space-y-3">
              <Label>球員名單</Label>
              {fields.map((field, index) => (
                <div key={field.id} className="space-y-1">
                  <div className="flex items-start gap-2">
                    <FormField
                      control={form.control}
                      name={`players.${index}.name`}
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormControl>
                            <Input placeholder="球員姓名" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`players.${index}.number`}
                      render={({ field }) => (
                        <FormItem className="w-20">
                          <FormControl>
                            <Input type="number" placeholder="背號" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`players.${index}.role`}
                      render={({ field }) => (
                        <FormItem className="w-28">
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
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
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={fields.length <= 1}
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  {/* 這一列的同名對應提示／已對應狀態，見 PlayerRosterMatchHint 上方註解。 */}
                  <PlayerRosterMatchHint form={form} index={index} people={people} />
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                onClick={() => append({ name: "", number: 0, role: "S", personId: null })}
              >
                新增球員
              </Button>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                取消
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "儲存中…" : isEditing ? "儲存變更" : "建立比賽"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
