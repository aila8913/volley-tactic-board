import { useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { useMatches } from '@/hooks/useMatches';
import { Match, matchFormSchema, MatchFormValues, matchToFormValues, PLAYER_ROLES } from '@/types/match';

const emptyDefaults: MatchFormValues = {
  name: '',
  opponent: '',
  dateTime: '',
  players: [{ name: '', number: 0, role: 'S' }],
};

interface MatchFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // 有傳 match 就是編輯模式，沒傳就是新增模式。
  match?: Match | null;
}

export default function MatchFormDialog({ open, onOpenChange, match }: MatchFormDialogProps) {
  const addMatch = useMatches((state) => state.addMatch);
  const updateMatch = useMatches((state) => state.updateMatch);
  const isEditing = !!match;

  const form = useForm<MatchFormValues>({
    resolver: zodResolver(matchFormSchema),
    defaultValues: emptyDefaults,
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'players',
  });

  // 這個 dialog 元件在新增/編輯之間共用、不會每次開啟都重新 mount，
  // 所以每次打開時要自己用 reset 把表單填成對應的初始值（新增 -> 空白，編輯 -> 帶入既有比賽）。
  useEffect(() => {
    if (open) {
      form.reset(match ? matchToFormValues(match) : emptyDefaults);
    }
  }, [open, match, form]);

  const onSubmit = (values: MatchFormValues) => {
    if (match) {
      updateMatch(match.id, values);
    } else {
      addMatch(values);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? '編輯比賽' : '新增比賽'}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>比賽名稱</FormLabel>
                  <FormControl>
                    <Input placeholder="例如：2026 春季聯賽 vs 台大" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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
                onClick={() => append({ name: '', number: 0, role: 'S' })}
              >
                新增球員
              </Button>
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                取消
              </Button>
              <Button type="submit">{isEditing ? '儲存變更' : '建立比賽'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
