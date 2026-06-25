import { useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
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
import { matchFormSchema, MatchPlayer, PLAYER_ROLES } from "@/types/match";

// 直接重用 matchFormSchema 裡球員名單那一段的驗證規則（姓名必填、背號 0~99 等），
// 不用自己重寫一份一樣的規則，兩邊（新增比賽表單跟這個編輯名單彈窗）才不會兜不起來。
const rosterFormSchema = z.object({ players: matchFormSchema.shape.players });
type RosterFormValues = z.infer<typeof rosterFormSchema>;

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
                <div key={field.id} className="flex items-start gap-2">
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
              ))}
              <Button
                type="button"
                variant="outline"
                onClick={() => append({ name: "", number: 0, role: "S" })}
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
