import { useEffect } from "react";
import { useForm, useFieldArray, useWatch, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { v4 as uuidv4 } from "uuid";
import { Trash2 } from "lucide-react";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormControl, FormMessage } from "@/components/ui/form";
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
import PlayerRosterMatchHint from "@/components/PlayerRosterMatchHint";
import { usePersonList } from "@/hooks/usePeople";
import { matchFormSchema, MatchPlayer, PLAYER_ROLES } from "@/types/match";

// 直接重用 matchFormSchema 裡球員名單那一段的驗證規則（姓名必填、背號 0~99 等），
// 不用自己重寫一份一樣的規則，兩邊（新增比賽表單跟這個編輯名單彈窗）才不會兜不起來。
const rosterFormSchema = z.object({ players: matchFormSchema.shape.players });
type RosterFormValues = z.infer<typeof rosterFormSchema>;

// #222：這個彈窗原本完全沒有去重 UX——新增的列 personId 永遠是 null，加進來的球員在
// /analytics/people 的跨場統計裡等於不存在，而且畫面上沒有任何提示。掛上跟比賽表單同一塊
// PlayerRosterMatchHint 之後，兩條新增球員的路徑看到的東西一樣。
//
// 這裡是 MatchDetailForm 那支 MatchFormRosterMatchHint 的雙胞胎，差別只在表單型別
//（這支表單只有 players 一個欄位）。兩支都只有三行接線，共用它們反而要跟 react-hook-form
// 的泛型 Path<T> 纏鬥，不划算——共用的是底下那塊真正有邏輯的 UI。
function RosterFormMatchHint({
  form,
  index,
  people,
}: {
  form: UseFormReturn<RosterFormValues>;
  index: number;
  people: { id: number; name: string }[];
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

interface RosterEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roster: MatchPlayer[];
  onSave: (players: MatchPlayer[]) => void;
}

export default function RosterEditDialog({
  open,
  onOpenChange,
  roster,
  onSave,
}: RosterEditDialogProps) {
  const form = useForm<RosterFormValues>({
    resolver: zodResolver(rosterFormSchema),
    defaultValues: { players: roster },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "players",
  });

  // 跨場身分（Person）列表，給去重提示比對「這個名字是不是先前記錄過的某個人」用（#222）。
  const { people } = usePersonList();

  // 這個 dialog 不會每次開關都重新 mount，所以要自己在開啟時用 reset 把表單填回目前的名單，
  // 不然上次編輯到一半沒存檔的內容會殘留在表單裡。
  useEffect(() => {
    if (open) {
      form.reset({ players: roster });
    }
  }, [open, roster, form]);

  const onSubmit = (values: RosterFormValues) => {
    // 編輯時帶著既有球員的 id（保留身份，戰術板場上站位才認得是同一個人），
    // 新增的球員列沒有 id，這裡統一補上一次——之後不管是存回 roster 還是存回
    // 比賽名單，用的都是同一份補好 id 的資料，兩邊 id 才會一致。
    const players: MatchPlayer[] = values.players.map((p) => ({
      id: p.id ?? uuidv4(),
      name: p.name,
      number: p.number,
      role: p.role,
      // 這個彈窗目前只編輯姓名/背號/位置，不碰名單去重（personId 的對應/解除是
      // MatchDetailForm 裡才有的 UX，見 #213），所以原封不動地把表單帶著的 personId
      // 傳回去——沒有 personId 的表單值（p.personId 為 undefined，理論上不會發生，
      // 因為 zod schema 有 default(null)）就保底成 null。
      personId: p.personId ?? null,
    }));
    onSave(players);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>編輯球員名單</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                  {/* 這一列的同名對應提示／已對應狀態（#222），跟比賽表單是同一塊。 */}
                  <RosterFormMatchHint form={form} index={index} people={people} />
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
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                取消
              </Button>
              <Button type="submit">儲存</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
