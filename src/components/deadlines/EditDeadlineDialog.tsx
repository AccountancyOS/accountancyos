import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  due_date: z.date({ required_error: "Due date is required" }),
});
type FormData = z.infer<typeof schema>;

export interface EditableDeadline {
  id: string;
  name: string;
  description?: string | null;
  due_date: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deadline: EditableDeadline | null;
}

/**
 * Accountant-side edit of a deadline (date / name / notes). Updates the single
 * canonical `deadlines` row, so the change shows in both the accountant app and the
 * client portal (which reads the same table, view-only). The warning/chaser date is
 * kept 30 days before the (possibly new) due date.
 */
export const EditDeadlineDialog = ({ open, onOpenChange, deadline }: Props) => {
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (deadline) {
      form.reset({
        name: deadline.name ?? "",
        description: deadline.description ?? "",
        due_date: deadline.due_date ? new Date(deadline.due_date) : undefined,
      });
    }
  }, [deadline]); // eslint-disable-line react-hooks/exhaustive-deps

  const onSubmit = async (data: FormData) => {
    if (!deadline) return;
    setIsSubmitting(true);
    try {
      const due = format(data.due_date, "yyyy-MM-dd");
      const warning = format(new Date(data.due_date.getTime() - 30 * 24 * 60 * 60 * 1000), "yyyy-MM-dd");
      const { error } = await supabase
        .from("deadlines")
        .update({ name: data.name, description: data.description ?? null, due_date: due, warning_date: warning })
        .eq("id", deadline.id);
      if (error) throw error;
      toast.success("Deadline updated");
      queryClient.invalidateQueries({ queryKey: ["deadlines"] });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Failed to update deadline");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Deadline</DialogTitle>
          <DialogDescription>Changes apply for both you and the client (portal is read-only).</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="due_date" render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Due Date</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button variant="outline" className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                        {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel>Notes (optional)</FormLabel>
                <FormControl><Textarea {...field} value={field.value ?? ""} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Saving…" : "Save"}</Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
