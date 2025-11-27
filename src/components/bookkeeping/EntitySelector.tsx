import { useState } from "react";
import { Check, ChevronsUpDown, Building2, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";

export interface BookkeepingEntity {
  type: "client" | "company";
  id: string;
  name: string;
  displayName: string;
}

interface EntitySelectorProps {
  value: BookkeepingEntity | null;
  onValueChange: (entity: BookkeepingEntity | null) => void;
}

export function EntitySelector({ value, onValueChange }: EntitySelectorProps) {
  const [open, setOpen] = useState(false);
  const { organization } = useOrganization();

  // Fetch clients
  const { data: clients } = useQuery({
    queryKey: ["bookkeeping-clients", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from("clients")
        .select("id, first_name, last_name")
        .eq("organization_id", organization.id)
        .order("last_name");

      if (error) throw error;
      return data;
    },
    enabled: !!organization?.id,
  });

  // Fetch companies
  const { data: companies } = useQuery({
    queryKey: ["bookkeeping-companies", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from("companies")
        .select("id, company_name")
        .eq("organization_id", organization.id)
        .order("company_name");

      if (error) throw error;
      return data;
    },
    enabled: !!organization?.id,
  });

  // Build unified entity list
  const entities: BookkeepingEntity[] = [
    ...(companies || []).map((c) => ({
      type: "company" as const,
      id: c.id,
      name: c.company_name,
      displayName: `${c.company_name} (company)`,
    })),
    ...(clients || []).map((c) => ({
      type: "client" as const,
      id: c.id,
      name: `${c.first_name} ${c.last_name}`,
      displayName: `${c.first_name} ${c.last_name} (individual)`,
    })),
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-[400px] justify-between"
        >
          {value ? (
            <span className="flex items-center gap-2">
              {value.type === "company" ? (
                <Building2 className="h-4 w-4" />
              ) : (
                <User className="h-4 w-4" />
              )}
              {value.displayName}
            </span>
          ) : (
            "Select client or company..."
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0">
        <Command>
          <CommandInput placeholder="Search..." />
          <CommandEmpty>No entities found.</CommandEmpty>
          <CommandGroup>
            {entities.map((entity) => (
              <CommandItem
                key={`${entity.type}-${entity.id}`}
                value={entity.displayName}
                onSelect={() => {
                  onValueChange(
                    value?.id === entity.id ? null : entity
                  );
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    value?.id === entity.id ? "opacity-100" : "opacity-0"
                  )}
                />
                {entity.type === "company" ? (
                  <Building2 className="mr-2 h-4 w-4" />
                ) : (
                  <User className="mr-2 h-4 w-4" />
                )}
                {entity.displayName}
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
