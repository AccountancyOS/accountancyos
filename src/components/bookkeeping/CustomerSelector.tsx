import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Check, ChevronsUpDown, Plus, User } from "lucide-react";
import { cn } from "@/lib/utils";

interface Customer {
  id: string;
  name: string;
  email: string | null;
}

interface CustomerSelectorProps {
  entity: { type: "client" | "company"; id: string };
  value: string;
  onSelect: (customer: Customer | null) => void;
  onCreateNew: () => void;
  disabled?: boolean;
}

export type { Customer };

export function CustomerSelector({ 
  entity, 
  value, 
  onSelect, 
  onCreateNew,
  disabled = false
}: CustomerSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { organization } = useOrganization();

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["customers", entity.id, entity.type],
    queryFn: async () => {
      if (!organization?.id) return [];
      
      const query = supabase
        .from("customers")
        .select("id, name, email")
        .eq("organization_id", organization.id)
        .eq("is_active", true)
        .order("name");

      if (entity.type === "client") {
        query.eq("client_id", entity.id);
      } else {
        query.eq("company_id", entity.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Customer[];
    },
    enabled: !!organization?.id,
  });

  const selectedCustomer = customers.find(c => c.id === value);
  
  const filteredCustomers = search
    ? customers.filter(c => 
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.email?.toLowerCase().includes(search.toLowerCase())
      )
    : customers;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
        >
          {selectedCustomer ? (
            <span className="flex items-center gap-2">
              <User className="h-4 w-4" />
              {selectedCustomer.name}
            </span>
          ) : (
            <span className="text-muted-foreground">Select customer...</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command>
          <CommandInput 
            placeholder="Search customers..." 
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              {isLoading ? "Loading..." : "No customers found."}
            </CommandEmpty>
            
            {filteredCustomers.length > 0 && (
              <CommandGroup heading="Customers">
                {filteredCustomers.map((customer) => (
                  <CommandItem
                    key={customer.id}
                    value={customer.id}
                    onSelect={() => {
                      onSelect(customer.id === value ? null : customer);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === customer.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <div className="flex flex-col">
                      <span>{customer.name}</span>
                      {customer.email && (
                        <span className="text-xs text-muted-foreground">{customer.email}</span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            
            <CommandSeparator />
            
            <CommandGroup>
              <CommandItem
                onSelect={() => {
                  setOpen(false);
                  onCreateNew();
                }}
                className="text-primary"
              >
                <Plus className="mr-2 h-4 w-4" />
                Create new customer
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
