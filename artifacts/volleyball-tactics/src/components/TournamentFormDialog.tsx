import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { Button } from "@/components/ui/button";
import { useTournaments } from "@/hooks/useTournaments";
import { Tournament, TournamentFormValues, tournamentFormSchema } from "@/types/tournament";

const emptyDefaults: TournamentFormValues = { name: "" };

interface TournamentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // 有傳 tournament 就是編輯（改名），沒傳就是新增資料夾。
  tournament?: Tournament | null;
}

export default function TournamentFormDialog({
  open,
  onOpenChange,
  tournament,
}: TournamentFormDialogProps) {
  const addTournament = useTournaments((state) => state.addTournament);
  const updateTournament = useTournaments((state) => state.updateTournament);
  const isEditing = !!tournament;

  const form = useForm<TournamentFormValues>({
    resolver: zodResolver(tournamentFormSchema),
    defaultValues: emptyDefaults,
  });

  // 跟 MatchFormDialog 一樣：這個 dialog 在新增/編輯之間共用、不會重新 mount，
  // 所以每次打開時要自己 reset 表單。
  useEffect(() => {
    if (open) {
      form.reset(tournament ? { name: tournament.name } : emptyDefaults);
    }
  }, [open, tournament, form]);

  const onSubmit = (values: TournamentFormValues) => {
    if (tournament) {
      updateTournament(tournament.id, values);
    } else {
      addTournament(values);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? "編輯資料夾" : "新增資料夾"}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>資料夾名稱</FormLabel>
                  <FormControl>
                    <Input placeholder="例如：2026 春季聯賽" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                取消
              </Button>
              <Button type="submit">{isEditing ? "儲存變更" : "建立資料夾"}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
