import { useState } from "react";
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
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2 } from "lucide-react";

interface Service {
  id: string;
  code: string;
  name: string;
  description: string | null;
  billing_model: "fixed" | "monthly" | "hourly";
  default_price: number;
  is_bookkeeping_related: boolean;
  active: boolean;
}

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
    billing_model: "fixed" as "fixed" | "monthly" | "hourly",
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

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase.from("services_catalog").insert({
        organization_id: organization!.id,
        ...data,
        default_price: parseFloat(data.default_price),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["services"] });
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
      queryClient.invalidateQueries({ queryKey: ["services"] });
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
      queryClient.invalidateQueries({ queryKey: ["services"] });
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

  const billingModelLabels = {
    fixed: "Fixed Price",
    monthly: "Monthly Recurring",
    hourly: "Hourly Rate",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-foreground">Services Catalog</h1>
          <p className="text-muted-foreground mt-1">
            Manage your service offerings and pricing
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Service
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingService ? "Edit Service" : "Add New Service"}
              </DialogTitle>
              <DialogDescription>
                Configure a service offering for your practice
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="code">Service Code</Label>
                  <Input
                    id="code"
                    value={formData.code}
                    onChange={(e) =>
                      setFormData({ ...formData, code: e.target.value.toUpperCase() })
                    }
                    placeholder="SA_RETURN"
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
              </div>

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

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading services...</div>
      ) : !services?.length ? (
        <div className="text-center py-12 border border-dashed rounded-lg">
          <p className="text-muted-foreground mb-4">No services yet</p>
          <Button onClick={() => setIsDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Your First Service
          </Button>
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Billing Model</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {services.map((service) => (
                <TableRow key={service.id}>
                  <TableCell className="font-mono text-sm">{service.code}</TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{service.name}</div>
                      {service.description && (
                        <div className="text-sm text-muted-foreground line-clamp-1">
                          {service.description}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {billingModelLabels[service.billing_model]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    £{service.default_price.toFixed(2)}
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
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (confirm("Delete this service?")) {
                            deleteMutation.mutate(service.id);
                          }
                        }}
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
    </div>
  );
};

export default Services;
