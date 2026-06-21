import { useMemo, useState } from "react";
import { useOrganization } from "@/lib/organization-context";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import DashboardLayout from "@/components/DashboardLayout";

type BillingModel = "fixed" | "monthly" | "hourly";

interface Service {
  id: string;
  code: string;
  name: string;
  description: string | null;
  billing_model: BillingModel;
  default_price: number;
  is_bookkeeping_related: boolean;
  active: boolean;
  canonical_service_code: string | null;
}

interface CanonicalService {
  code: string;
  name: string;
  category: string;
  is_recurring: boolean;
  default_billing_frequency: string | null;
  notes: string | null;
  active: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  accounts: "Accounts Production",
  tax: "Corporation Tax",
  personal_tax: "Personal Tax",
  personal_tax_mtd: "Personal Tax (MTD ITSA)",
  partnership_tax: "Partnership Tax",
  capital_gains_tax: "Capital Gains Tax",
  payroll: "Payroll",
  payroll_pension: "Pensions",
  payroll_tax: "Benefits & Expenses",
  bookkeeping: "Bookkeeping",
  vat: "VAT",
  cis: "CIS",
  company_secretarial: "Company Secretarial",
  management_reporting: "Management Reporting",
  advisory: "Advisory",
  charity: "Charity",
  charity_tax: "Charity Tax",
  trust_compliance: "Trusts",
  property_tax: "Property",
  software: "Software",
  custom: "Custom",
};

const billingModelLabels: Record<BillingModel, string> = {
  fixed: "Fixed Price",
  monthly: "Monthly Recurring",
  hourly: "Hourly Rate",
};

const defaultBillingModelFor = (frequency: string | null | undefined): BillingModel =>
  frequency === "monthly" ? "monthly" : "fixed";

const Services = () => {
  const { organization } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);

  const [formData, setFormData] = useState({
    code: "",
    name: "",
    description: "",
    billing_model: "fixed" as BillingModel,
    default_price: "",
    is_bookkeeping_related: false,
    active: true,
  });

  const { data: services, isLoading } = useQuery({
    queryKey: ["services", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from("services_catalog")
        .select("*")
        .eq("organization_id", organization.id)
        .order("code");
      if (error) throw error;
      return data as Service[];
    },
    enabled: !!organization?.id,
  });

  const { data: canonicalServices, isLoading: isLoadingCanonical } = useQuery({
    queryKey: ["canonical-services"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("canonical_services")
        .select("code,name,category,is_recurring,default_billing_frequency,notes,active")
        .eq("active", true)
        .order("category")
        .order("name");
      if (error) throw error;
      return data as CanonicalService[];
    },
  });

  // Index practice rows by canonical code for fast overlay lookup
  const overlayByCode = useMemo(() => {
    const m = new Map<string, Service>();
    (services ?? []).forEach((s) => {
      if (s.canonical_service_code) m.set(s.canonical_service_code, s);
    });
    return m;
  }, [services]);

  const customServices = useMemo(
    () => (services ?? []).filter((s) => !s.canonical_service_code),
    [services]
  );

  const canonicalByCategory = useMemo(() => {
    const groups = new Map<string, CanonicalService[]>();
    (canonicalServices ?? []).forEach((cs) => {
      if (cs.code === "custom_advisory") return; // handled by custom section
      const arr = groups.get(cs.category) ?? [];
      arr.push(cs);
      groups.set(cs.category, arr);
    });
    return Array.from(groups.entries()).sort(([a], [b]) =>
      (CATEGORY_LABELS[a] ?? a).localeCompare(CATEGORY_LABELS[b] ?? b)
    );
  }, [canonicalServices]);

  // Upsert practice configuration for a canonical service
  const configureCanonicalMutation = useMutation({
    mutationFn: async (input: {
      canonical: CanonicalService;
      patch: Partial<Pick<Service, "active" | "default_price" | "billing_model">>;
    }) => {
      const existing = overlayByCode.get(input.canonical.code);
      if (existing) {
        const { error } = await supabase
          .from("services_catalog")
          .update(input.patch)
          .eq("id", existing.id);
        if (error) throw error;
        return;
      }
      const billingModel = input.patch.billing_model
        ?? defaultBillingModelFor(input.canonical.default_billing_frequency);
      const { error } = await supabase.from("services_catalog").insert({
        organization_id: organization!.id,
        code: input.canonical.code,
        name: input.canonical.name,
        description: input.canonical.notes,
        billing_model: billingModel,
        default_price: input.patch.default_price ?? 0,
        is_recurring: input.canonical.is_recurring,
        is_bookkeeping_related: input.canonical.category === "bookkeeping",
        entity_scope: "company",
        active: input.patch.active ?? true,
        canonical_service_code: input.canonical.code,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["services", organization?.id] });
    },
    onError: (error: any) => {
      toast({
        title: "Could not update service",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const generateCodeFromName = async (name: string): Promise<string> => {
    const base = (name || "service")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "SERVICE";
    const { data: existing } = await supabase
      .from("services_catalog")
      .select("code")
      .eq("organization_id", organization!.id)
      .ilike("code", `${base}%`);
    const taken = new Set((existing ?? []).map((r) => r.code));
    if (!taken.has(base)) return base;
    let i = 2;
    while (taken.has(`${base}_${i}`)) i++;
    return `${base}_${i}`;
  };

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const code = data.code?.trim() || (await generateCodeFromName(data.name));
      const { error } = await supabase.from("services_catalog").insert({
        organization_id: organization!.id,
        ...data,
        code,
        default_price: parseFloat(data.default_price),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["services", organization?.id] });
      toast({ title: "Service created successfully" });
      resetForm();
      setIsDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error creating service",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData & { id: string }) => {
      const { error } = await supabase
        .from("services_catalog")
        .update({
          ...data,
          default_price: parseFloat(data.default_price),
        })
        .eq("id", data.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["services", organization?.id] });
      toast({ title: "Service updated successfully" });
      resetForm();
      setIsDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error updating service",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("services_catalog")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["services", organization?.id] });
      toast({ title: "Service deleted successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Error deleting service",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      code: "",
      name: "",
      description: "",
      billing_model: "fixed",
      default_price: "",
      is_bookkeeping_related: false,
      active: true,
    });
    setEditingService(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingService) {
      updateMutation.mutate({ ...formData, id: editingService.id });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEdit = (service: Service) => {
    setEditingService(service);
    setFormData({
      code: service.code,
      name: service.name,
      description: service.description || "",
      billing_model: service.billing_model,
      default_price: service.default_price.toString(),
      is_bookkeeping_related: service.is_bookkeeping_related,
      active: service.active,
    });
    setIsDialogOpen(true);
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-foreground">Services Catalogue</h1>
          <p className="text-muted-foreground mt-1">
            Configure the AccountancyOS canonical service catalogue for your practice, or add your own custom services
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Custom Service
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingService ? "Edit Custom Service" : "Add Custom Service"}
              </DialogTitle>
              <DialogDescription>
                Use this for bespoke offerings outside the AccountancyOS canonical catalogue. Jobs and deadlines for custom services are not auto-generated.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Service Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="Self Assessment Tax Return"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="billing_model">Billing Model</Label>
                <Select
                  value={formData.billing_model}
                  onValueChange={(value: any) =>
                    setFormData({ ...formData, billing_model: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">Fixed Price</SelectItem>
                    <SelectItem value="monthly">Monthly Recurring</SelectItem>
                    <SelectItem value="hourly">Hourly Rate</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="Complete preparation and filing of self assessment tax return"
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="price">Default Price (£)</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  value={formData.default_price}
                  onChange={(e) =>
                    setFormData({ ...formData, default_price: e.target.value })
                  }
                  placeholder="250.00"
                  required
                />
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="bookkeeping"
                  checked={formData.is_bookkeeping_related}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, is_bookkeeping_related: checked })
                  }
                />
                <Label htmlFor="bookkeeping">Bookkeeping-related service</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="active"
                  checked={formData.active}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, active: checked })
                  }
                />
                <Label htmlFor="active">Active</Label>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsDialogOpen(false);
                    resetForm();
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit">
                  {editingService ? "Update" : "Create"} Service
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="canonical" className="space-y-4">
        <TabsList>
          <TabsTrigger value="canonical">Canonical Catalogue</TabsTrigger>
          <TabsTrigger value="custom">
            Custom Services{customServices.length ? ` (${customServices.length})` : ""}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="canonical" className="space-y-6">
          {isLoadingCanonical || isLoading ? (
            <TableSkeleton columns={5} rows={8} />
          ) : (
            canonicalByCategory.map(([category, items]) => (
              <div key={category} className="border rounded-lg">
                <div className="px-4 py-3 border-b bg-muted/30">
                  <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
                    {CATEGORY_LABELS[category] ?? category}
                  </h2>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40%]">Service</TableHead>
                      <TableHead>Billing Model</TableHead>
                      <TableHead className="text-right">Price (£)</TableHead>
                      <TableHead className="text-right">Enabled</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((cs) => {
                      const row = overlayByCode.get(cs.code);
                      const enabled = !!row?.active;
                      const billingModel: BillingModel =
                        row?.billing_model ?? defaultBillingModelFor(cs.default_billing_frequency);
                      const price = row?.default_price ?? 0;
                      return (
                        <TableRow key={cs.code}>
                          <TableCell>
                            <div className="font-medium">{cs.name}</div>
                            <div className="flex gap-1 mt-1">
                              {cs.is_recurring && (
                                <Badge variant="outline" className="text-xs">Recurring</Badge>
                              )}
                              {cs.default_billing_frequency && (
                                <Badge variant="outline" className="text-xs capitalize">
                                  {cs.default_billing_frequency.replace("_", " ")}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={billingModel}
                              onValueChange={(value: BillingModel) =>
                                configureCanonicalMutation.mutate({
                                  canonical: cs,
                                  patch: { billing_model: value, active: row?.active ?? true },
                                })
                              }
                            >
                              <SelectTrigger className="h-8 w-[180px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="fixed">Fixed Price</SelectItem>
                                <SelectItem value="monthly">Monthly Recurring</SelectItem>
                                <SelectItem value="hourly">Hourly Rate</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              defaultValue={price}
                              key={`${cs.code}-${price}`}
                              className="h-8 w-32 ml-auto text-right"
                              onBlur={(e) => {
                                const next = parseFloat(e.target.value);
                                if (Number.isNaN(next) || next === price) return;
                                configureCanonicalMutation.mutate({
                                  canonical: cs,
                                  patch: { default_price: next, active: row?.active ?? true },
                                });
                              }}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Switch
                              checked={enabled}
                              onCheckedChange={(checked) =>
                                configureCanonicalMutation.mutate({
                                  canonical: cs,
                                  patch: { active: checked },
                                })
                              }
                              aria-label={`Enable ${cs.name}`}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="custom">
          {isLoading ? (
            <TableSkeleton columns={5} rows={4} />
          ) : !customServices.length ? (
            <div className="text-center py-12 border border-dashed rounded-lg">
              <p className="text-muted-foreground mb-4">No custom services yet</p>
              <Button onClick={() => setIsDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Custom Service
              </Button>
            </div>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Billing Model</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customServices.map((service) => (
                    <TableRow key={service.id}>
                      <TableCell>
                        <div className="font-medium">{service.name}</div>
                        {service.description && (
                          <div className="text-sm text-muted-foreground line-clamp-1">
                            {service.description}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {billingModelLabels[service.billing_model]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        £{Number(service.default_price).toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={service.active ? "default" : "secondary"}>
                          {service.active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(service)}
                            aria-label={`Edit service ${service.name}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (confirm("Delete this custom service?")) {
                                deleteMutation.mutate(service.id);
                              }
                            }}
                            aria-label={`Delete service ${service.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default Services;
