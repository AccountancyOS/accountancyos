import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
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

interface PayeScheme {
  id: string;
  paye_reference: string;
  accounts_office_reference: string | null;
}

interface PayeSchemeSelectorProps {
  entityType: "client" | "company";
  entityId: string;
  value: string | null;
  onValueChange: (schemeId: string | null) => void;
}

export function PayeSchemeSelector({ 
  entityType, 
  entityId, 
  value, 
  onValueChange 
}: PayeSchemeSelectorProps) {
  const [open, setOpen] = useState(false);
  const { organization } = useOrganization();

  const { data: schemes } = useQuery({
    queryKey: ["paye-schemes-for-entity", entityType, entityId],
    queryFn: async () => {
      if (!organization?.id || !entityId) return [];
      
      let query = supabase
        .from("paye_schemes")
        .select("id, paye_reference, accounts_office_reference")
        .eq("organization_id", organization.id);

      if (entityType === "company") {
        query = query.eq("company_id", entityId);
      } else {
        query = query.eq("client_id", entityId);
      }

      const { data, error } = await query.order("paye_reference");
      if (error) throw error;
      return data as PayeScheme[];
    },
    enabled: !!organization?.id && !!entityId,
  });

  const selectedScheme = schemes?.find(s => s.id === value);

  // If only one scheme, auto-select it
  if (schemes?.length === 1 && !value) {
    onValueChange(schemes[0].id);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-[220px] justify-between"
        >
          {selectedScheme ? (
            <span>{selectedScheme.paye_reference}</span>
          ) : (
            "All PAYE Schemes"
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0">
        <Command>
          <CommandInput placeholder="Search schemes..." />
          <CommandEmpty>No schemes found.</CommandEmpty>
          <CommandGroup>
            <CommandItem
              value="all"
              onSelect={() => {
                onValueChange(null);
                setOpen(false);
              }}
            >
              <Check
                className={cn(
                  "mr-2 h-4 w-4",
                  value === null ? "opacity-100" : "opacity-0"
                )}
              />
              All PAYE Schemes
            </CommandItem>
            {schemes?.map((scheme) => (
              <CommandItem
                key={scheme.id}
                value={scheme.paye_reference}
                onSelect={() => {
                  onValueChange(scheme.id === value ? null : scheme.id);
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    value === scheme.id ? "opacity-100" : "opacity-0"
                  )}
                />
                {scheme.paye_reference}
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
