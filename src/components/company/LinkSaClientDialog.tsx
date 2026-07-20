import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Loader2, User } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getClientTypeLabel } from "@/lib/client-types";

interface LinkSaClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  organizationId: string;
  personId: string;
  personName: string;
}

/**
 * "Also an SA client" action: link an existing person (director/contact) to
 * an existing individual `clients` row via link_person_to_sa_client.
 *
 * Creating a brand-new SA client inline was deliberately NOT built here: the
 * existing creation path (src/components/clients/AddClientDialog.tsx)
 * requires a client-type selection, a mandatory unique email, and
 * type-specific detail-table inserts (client_detail_sa etc.) — a "minimal"
 * insert bypassing that would produce an incomplete client record, and
 * `clients.email` is NOT NULL so it can't be created from just a person's
 * name. Instead this dialog fully supports linking to an existing client and
 * points the user at the existing Add Client flow for the create-new case.
 */
export function LinkSaClientDialog({
  open,
  onOpenChange,
  companyId,
  organizationId,
  personId,
  personName,
}: LinkSaClientDialogProps) {
  const queryClient = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  const { data: clients, isLoading } = useQuery({
    queryKey: ["link-sa-client-candidates", organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, first_name, last_name, client_type")
        .eq("organization_id", organizationId)
        .order("first_name");
      if (error) throw error;
      return data;
    },
    enabled: open && !!organizationId,
  });

  const selectedClient = clients?.find((c) => c.id === selectedClientId) || null;

  const linkMutation = useMutation({
    mutationFn: async (clientId: string) => {
      const { data, error } = await supabase.rpc("link_person_to_sa_client" as any, {
        p_person_id: personId,
        p_client_id: clientId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Linked to SA client");
      queryClient.invalidateQueries({ queryKey: ["company-contacts-panel", companyId] });
      onOpenChange(false);
      setSelectedClientId(null);
    },
    onError: (error: any) => {
      toast.error("Failed to link SA client", { description: error.message });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Link {personName} to an SA client</DialogTitle>
          <DialogDescription>
            Connect this person to an existing individual client record so their director role and
            self-assessment work sit under a single login.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" role="combobox" aria-expanded={pickerOpen} className="w-full justify-between">
                {selectedClient ? (
                  <span className="flex items-center gap-2 truncate">
                    <User className="h-4 w-4 shrink-0" />
                    {selectedClient.first_name} {selectedClient.last_name}
                  </span>
                ) : (
                  "Select an existing client..."
                )}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
              <Command>
                <CommandInput placeholder="Search clients..." />
                <CommandEmpty>{isLoading ? "Loading..." : "No clients found."}</CommandEmpty>
                <CommandGroup className="max-h-64 overflow-y-auto">
                  {(clients || []).map((c) => (
                    <CommandItem
                      key={c.id}
                      value={`${c.first_name} ${c.last_name}`}
                      onSelect={() => {
                        setSelectedClientId(c.id);
                        setPickerOpen(false);
                      }}
                    >
                      <Check
                        className={cn("mr-2 h-4 w-4", selectedClientId === c.id ? "opacity-100" : "opacity-0")}
                      />
                      <span className="flex-1 truncate">
                        {c.first_name} {c.last_name}
                      </span>
                      <span className="text-xs text-muted-foreground">{getClientTypeLabel(c.client_type)}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </Command>
            </PopoverContent>
          </Popover>

          <p className="text-xs text-muted-foreground mt-3">
            Don't see them? Create the client first from Clients &rarr; Add Client, then come back here to link.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={linkMutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => selectedClientId && linkMutation.mutate(selectedClientId)}
            disabled={!selectedClientId || linkMutation.isPending}
          >
            {linkMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Link Client
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
