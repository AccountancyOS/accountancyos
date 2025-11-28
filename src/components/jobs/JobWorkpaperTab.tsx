import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { FileSpreadsheet, RefreshCw, FolderOpen } from "lucide-react";
import { format } from "date-fns";
import { useState, useMemo } from "react";
import { WorkpaperLineItem, WorkpaperLineValue } from "@/components/workpaper/WorkpaperLineItem";
import { WorkpaperDocumentPanel } from "@/components/workpaper/WorkpaperDocumentPanel";
import { WorkpaperStatusActions } from "@/components/workpaper/WorkpaperStatusActions";

interface JobWorkpaperTabProps {
  jobId: string;
}

export function JobWorkpaperTab({ jobId }: JobWorkpaperTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [documentPanelOpen, setDocumentPanelOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();
  const [selectedCategoryLabel, setSelectedCategoryLabel] = useState<string | undefined>();

  const { data: workpaper, isLoading } = useQuery({
    queryKey: ["job-workpaper", jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workpaper_instances")
        .select("*")
        .eq("job_id", jobId)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
  });

  const updateWorkpaperMutation = useMutation({
    mutationFn: async (updates: { field_values?: any; field_overrides?: any; field_notes?: any }) => {
      if (!workpaper) return;

      const { error } = await supabase
        .from("workpaper_instances")
        .update(updates)
        .eq("id", workpaper.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job-workpaper", jobId] });
      toast({ title: "Workpaper updated" });
    },
    onError: () => {
      toast({ title: "Failed to update workpaper", variant: "destructive" });
    },
  });

  const handleFieldEdit = (fieldName: string, value: any, note?: string) => {
    if (!workpaper) return;

    const currentFieldValues = workpaper.field_values as Record<string, any> || {};
    const currentOverrides = workpaper.field_overrides as Record<string, any> || {};
    const currentNotes = workpaper.field_notes as Record<string, any> || {};

    // Track original value if this is an override
    const originalValue = currentFieldValues[fieldName];
    const isOverride = JSON.stringify(originalValue) !== JSON.stringify(value);

    const newFieldValues = {
      ...currentFieldValues,
      [fieldName]: value,
    };

    const newOverrides = isOverride
      ? { ...currentOverrides, [fieldName]: originalValue }
      : currentOverrides;

    const newNotes = note
      ? { ...currentNotes, [fieldName]: note }
      : currentNotes;

    updateWorkpaperMutation.mutate({
      field_values: newFieldValues,
      field_overrides: newOverrides,
      field_notes: newNotes,
    });
  };

  const handleDocumentClick = (fieldName: string, label: string) => {
    setSelectedCategory(fieldName);
    setSelectedCategoryLabel(label);
    setDocumentPanelOpen(true);
  };

  // Organize fields into sections
  const sections = useMemo(() => {
    if (!workpaper?.field_values) return [];
    
    const fieldValues = workpaper.field_values as unknown as Record<string, WorkpaperLineValue>;
    const entries = Object.entries(fieldValues);
    
    // Group by key fields vs detail lines
    const keyFields = entries.filter(([_, v]) => v.isKeyField);
    const detailFields = entries.filter(([_, v]) => !v.isKeyField);

    // Create sections based on workpaper type
    const serviceType = workpaper.service_type;
    
    if (serviceType === "accounts" || serviceType === "ct600") {
      return [
        {
          id: "pnl",
          title: "Profit & Loss",
          fields: keyFields
            .filter(([k]) => 
              ["turnover", "other_income", "cost_of_sales", "gross_profit", 
               "administrative_expenses", "directors_remuneration", "depreciation",
               "operating_profit", "interest_payable", "profit_before_tax"].includes(k)
            )
            .sort((a, b) => (a[1].displayOrder || 0) - (b[1].displayOrder || 0)),
        },
        {
          id: "balance_sheet",
          title: "Balance Sheet",
          fields: keyFields
            .filter(([k]) => 
              ["fixed_assets", "current_assets", "trade_debtors", "bank",
               "trade_creditors", "other_creditors", "net_current_assets",
               "long_term_liabilities", "net_assets", "share_capital",
               "retained_earnings", "shareholders_funds"].includes(k)
            )
            .sort((a, b) => (a[1].displayOrder || 0) - (b[1].displayOrder || 0)),
        },
        {
          id: "tax_comp",
          title: "Tax Computation",
          fields: keyFields
            .filter(([k]) => 
              ["accounting_profit", "depreciation_addback", "capital_allowances",
               "disallowable_expenses", "trading_profit", "property_income",
               "chargeable_gains", "total_profits", "qualifying_donations",
               "profits_chargeable", "corporation_tax"].includes(k)
            )
            .sort((a, b) => (a[1].displayOrder || 0) - (b[1].displayOrder || 0)),
        },
        {
          id: "details",
          title: "Account Details",
          fields: detailFields.sort((a, b) => (a[1].displayOrder || 0) - (b[1].displayOrder || 0)),
        },
      ].filter(s => s.fields.length > 0);
    }

    if (serviceType === "vat_return") {
      return [
        {
          id: "vat_boxes",
          title: "VAT Return Boxes",
          fields: keyFields.sort((a, b) => (a[1].displayOrder || 0) - (b[1].displayOrder || 0)),
        },
        {
          id: "details",
          title: "Account Details",
          fields: detailFields.sort((a, b) => (a[1].displayOrder || 0) - (b[1].displayOrder || 0)),
        },
      ].filter(s => s.fields.length > 0);
    }

    // Default sections for self_assessment and others
    return [
      {
        id: "income",
        title: "Income",
        fields: keyFields
          .filter(([k]) => k.includes("income") || k.includes("turnover") || k.includes("dividends"))
          .sort((a, b) => (a[1].displayOrder || 0) - (b[1].displayOrder || 0)),
      },
      {
        id: "expenses",
        title: "Expenses & Deductions",
        fields: keyFields
          .filter(([k]) => k.includes("expense") || k.includes("deduction") || k.includes("pension") || k.includes("gift"))
          .sort((a, b) => (a[1].displayOrder || 0) - (b[1].displayOrder || 0)),
      },
      {
        id: "calculations",
        title: "Tax Calculations",
        fields: keyFields
          .filter(([k]) => k.includes("tax") || k.includes("allowance") || k.includes("profit") || k.includes("national_insurance"))
          .sort((a, b) => (a[1].displayOrder || 0) - (b[1].displayOrder || 0)),
      },
      {
        id: "details",
        title: "Details",
        fields: detailFields.sort((a, b) => (a[1].displayOrder || 0) - (b[1].displayOrder || 0)),
      },
    ].filter(s => s.fields.length > 0);
  }, [workpaper]);

  if (isLoading) {
    return <div className="text-center py-8">Loading workpaper...</div>;
  }

  if (!workpaper) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <FileSpreadsheet className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">
            Workpaper will be created from Trial Balance snapshot or questionnaire
          </p>
        </CardContent>
      </Card>
    );
  }

  const isLocked = workpaper.locked || workpaper.status === "finalised";
  const fieldValues = (workpaper.field_values as unknown as Record<string, WorkpaperLineValue>) || {};
  const fieldOverrides = (workpaper.field_overrides as unknown as Record<string, any>) || {};
  const fieldNotes = (workpaper.field_notes as unknown as Record<string, string>) || {};

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold">{workpaper.name}</h3>
          <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
            <span>
              {workpaper.period_label} • Created{" "}
              {format(new Date(workpaper.created_at), "d MMM yyyy")}
            </span>
            {workpaper.source_type && (
              <Badge variant="secondary">Source: {workpaper.source_type}</Badge>
            )}
            {workpaper.last_data_sync_at && (
              <span>
                Last synced:{" "}
                {format(new Date(workpaper.last_data_sync_at), "d MMM yyyy HH:mm")}
              </span>
            )}
          </div>
        </div>

        {/* Status Actions */}
        <WorkpaperStatusActions
          workpaperId={workpaper.id}
          jobId={jobId}
          currentStatus={workpaper.status}
          isLocked={isLocked}
          preparedBy={workpaper.prepared_by || undefined}
          preparedAt={workpaper.prepared_at || undefined}
          reviewedBy={workpaper.reviewed_by || undefined}
          reviewedAt={workpaper.reviewed_at || undefined}
          finalisedBy={workpaper.finalised_by || undefined}
          finalisedAt={workpaper.finalised_at || undefined}
        />
      </div>

      {/* Section Navigation */}
      <div className="flex gap-2 border-b pb-2 overflow-x-auto">
        <Button
          variant={selectedSection === null ? "default" : "ghost"}
          size="sm"
          onClick={() => setSelectedSection(null)}
        >
          All
        </Button>
        {sections.map((section) => (
          <Button
            key={section.id}
            variant={selectedSection === section.id ? "default" : "ghost"}
            size="sm"
            onClick={() => setSelectedSection(section.id)}
          >
            {section.title}
          </Button>
        ))}
        <div className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setSelectedCategory(undefined);
            setSelectedCategoryLabel(undefined);
            setDocumentPanelOpen(true);
          }}
        >
          <FolderOpen className="mr-2 h-4 w-4" />
          All Documents
        </Button>
      </div>

      {/* Workpaper Lines */}
      <Card>
        <CardHeader>
          <CardTitle>
            {selectedSection
              ? sections.find((s) => s.id === selectedSection)?.title
              : "Workpaper Fields"}
          </CardTitle>
          <CardDescription>
            Click the source icon for details. Edit values to create overrides.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {sections
              .filter((s) => selectedSection === null || s.id === selectedSection)
              .map((section) => (
                <div key={section.id} className="space-y-2">
                  {selectedSection === null && (
                    <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide mt-4 mb-2">
                      {section.title}
                    </h4>
                  )}
                  {section.fields.map(([fieldName, value]) => (
                    <WorkpaperLineItem
                      key={fieldName}
                      fieldName={fieldName}
                      value={value}
                      isOverridden={fieldOverrides[fieldName] !== undefined}
                      originalValue={fieldOverrides[fieldName]}
                      note={fieldNotes[fieldName]}
                      isLocked={isLocked}
                      onEdit={handleFieldEdit}
                      onDocumentClick={() =>
                        handleDocumentClick(fieldName, value.label)
                      }
                      isDetailLine={!value.isKeyField}
                    />
                  ))}
                </div>
              ))}
          </div>
        </CardContent>
      </Card>

      {/* Finalisation info */}
      {workpaper.finalised_at && (
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">
              Finalised on{" "}
              {format(new Date(workpaper.finalised_at), "d MMM yyyy HH:mm")}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Document Panel */}
      <WorkpaperDocumentPanel
        isOpen={documentPanelOpen}
        onClose={() => setDocumentPanelOpen(false)}
        workpaperId={workpaper.id}
        jobId={jobId}
        selectedCategory={selectedCategory}
        categoryLabel={selectedCategoryLabel}
      />
    </div>
  );
}
