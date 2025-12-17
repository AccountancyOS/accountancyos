import { useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useOrganization } from "@/lib/organization-context";
import { createCustomerSafe, type CustomerInput } from "@/lib/customer-safe-service";
import type { BookkeepingEntity } from "./EntitySelector";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { toast } from "sonner";

interface CreateCustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity: BookkeepingEntity;
  onCreated: (customer: { id: string; name: string }) => void;
}

interface FormData {
  name: string;
  email: string;
  phone: string;
  companyName: string;
  vatNumber: string;
  billingLine1: string;
  billingLine2: string;
  billingCity: string;
  billingPostcode: string;
  billingCountry: string;
  paymentTermsDays: number;
  defaultCurrency: string;
  internalNotes: string;
}

export function CreateCustomerDialog({
  open,
  onOpenChange,
  entity,
  onCreated,
}: CreateCustomerDialogProps) {
  const { organization } = useOrganization();
  const queryClient = useQueryClient();
  
  const { register, handleSubmit, reset, watch, setValue } = useForm<FormData>({
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      companyName: "",
      vatNumber: "",
      billingLine1: "",
      billingLine2: "",
      billingCity: "",
      billingPostcode: "",
      billingCountry: "UK",
      paymentTermsDays: 30,
      defaultCurrency: "GBP",
      internalNotes: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      if (!organization?.id) throw new Error("No organization");

      const input: CustomerInput = {
        name: data.name,
        email: data.email || undefined,
        phone: data.phone || undefined,
        companyName: data.companyName || undefined,
        vatNumber: data.vatNumber || undefined,
        billingAddress: {
          line1: data.billingLine1 || undefined,
          line2: data.billingLine2 || undefined,
          city: data.billingCity || undefined,
          postcode: data.billingPostcode || undefined,
          country: data.billingCountry || undefined,
        },
        paymentTermsDays: data.paymentTermsDays,
        defaultCurrency: data.defaultCurrency,
        internalNotes: data.internalNotes || undefined,
      };

      const result = await createCustomerSafe(
        organization.id,
        entity.type,
        entity.id,
        input
      );

      if (!result.success) {
        throw new Error(result.error || "Failed to create customer");
      }

      return { id: result.customer_id!, name: data.name };
    },
    onSuccess: (customer) => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Customer created");
      reset();
      onCreated(customer);
    },
    onError: (error) => {
      toast.error("Failed to create customer", {
        description: error.message,
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Customer</DialogTitle>
          <DialogDescription>
            Add a new customer for invoicing
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit((data) => createMutation.mutate(data))} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Display Name *</Label>
            <Input
              id="name"
              {...register("name", { required: true })}
              placeholder="Customer name"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                {...register("email")}
                placeholder="customer@example.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                {...register("phone")}
                placeholder="+44 1234 567890"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="companyName">Company Name</Label>
              <Input
                id="companyName"
                {...register("companyName")}
                placeholder="Company Ltd"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="vatNumber">VAT Number</Label>
              <Input
                id="vatNumber"
                {...register("vatNumber")}
                placeholder="GB123456789"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Billing Address</Label>
            <Input
              {...register("billingLine1")}
              placeholder="Address line 1"
              className="mb-2"
            />
            <Input
              {...register("billingLine2")}
              placeholder="Address line 2"
              className="mb-2"
            />
            <div className="grid grid-cols-2 gap-2">
              <Input {...register("billingCity")} placeholder="City" />
              <Input {...register("billingPostcode")} placeholder="Postcode" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="paymentTermsDays">Payment Terms (days)</Label>
              <Input
                id="paymentTermsDays"
                type="number"
                {...register("paymentTermsDays", { valueAsNumber: true })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="defaultCurrency">Default Currency</Label>
              <Select
                value={watch("defaultCurrency")}
                onValueChange={(value) => setValue("defaultCurrency", value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GBP">GBP</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="internalNotes">Internal Notes</Label>
            <Textarea
              id="internalNotes"
              {...register("internalNotes")}
              placeholder="Notes visible only to your team"
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create Customer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
