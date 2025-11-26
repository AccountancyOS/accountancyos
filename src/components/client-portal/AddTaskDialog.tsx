import { useState } from "react";
import { useOrganization } from "@/lib/organization-context";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface AddTaskDialogProps {
  clientId: string;
}

export function AddTaskDialog({ clientId }: AddTaskDialogProps) {
  const { organization } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    visibility: "client_visible" as "client_visible" | "internal_only",
    due_date: "",
  });

  const createTaskMutation = useMutation({
    mutationFn: async () => {
      if (!organization) throw new Error("No organization");

      const { error } = await supabase
        .from("client_tasks")
        .insert({
          organization_id: organization.id,
          client_id: clientId,
          title: form.title,
          description: form.description || null,
          visibility: form.visibility,
          due_date: form.due_date || null,
          status: "not_started",
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-tasks", clientId] });
      toast({
        title: "Task created",
        description: "The task has been added",
      });
      setOpen(false);
      setForm({
        title: "",
        description: "",
        visibility: "client_visible",
        due_date: "",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error creating task",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createTaskMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Add Task
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add Client Task</DialogTitle>
          <DialogDescription>
            Create a new task for this client
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Task Title *</Label>
            <Input
              id="title"
              required
              placeholder="e.g. Upload bank statements"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Additional details..."
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="due_date">Due Date</Label>
            <Input
              id="due_date"
              type="date"
              value={form.due_date}
              onChange={(e) => setForm({ ...form, due_date: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label>Visibility</Label>
            <RadioGroup
              value={form.visibility}
              onValueChange={(value) => setForm({ ...form, visibility: value as any })}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="client_visible" id="client_visible" />
                <Label htmlFor="client_visible" className="font-normal cursor-pointer">
                  Client-facing (client can see this)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="internal_only" id="internal_only" />
                <Label htmlFor="internal_only" className="font-normal cursor-pointer">
                  Internal only (staff only)
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createTaskMutation.isPending}>
              {createTaskMutation.isPending ? "Creating..." : "Create Task"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
