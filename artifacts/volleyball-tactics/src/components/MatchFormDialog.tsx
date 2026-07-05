import { useEffect, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Trash2 } from "lucide-react";
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
  players: [{ name: "", number: 0, role: "S" }],
};

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
    }
  }, [open, match, fetchedMatch, form]);

  const onSubmit = async (values: MatchFormValues) => {
    setSubmitting(true);
    try {
      if (match) {
        await updateMatch(Number(match.id), values, existingPlayers);
      } else {
        await createMatch(values, tournamentId);
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
