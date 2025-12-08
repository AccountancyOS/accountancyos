import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Code2, Building2, User, Calendar, FileText } from "lucide-react";
import { format, addMonths } from "date-fns";
import { JobTemplateMetadata, EntityContext } from "@/lib/job-template-types";

interface DynamicPlaceholdersPreviewProps {
  metadata?: Partial<JobTemplateMetadata>;
  periodStart?: Date;
  periodEnd?: Date;
}

type PreviewContext = "vat_company" | "non_vat_company" | "sole_trader";

const SAMPLE_CONTEXTS: Record<PreviewContext, EntityContext> = {
  vat_company: {
    entityType: "company",
    entityId: "sample-company-1",
    organizationId: "sample-org",
    company: {
      id: "sample-company-1",
      company_name: "Acme Ltd",
      company_number: "12345678",
      vat_registered: true,
      vat_frequency: "QUARTERLY",
      vat_stagger_group: 1,
      year_end_month: 3,
      year_end_day: 31,
      status: "active",
    },
  },
  non_vat_company: {
    entityType: "company",
    entityId: "sample-company-2",
    organizationId: "sample-org",
    company: {
      id: "sample-company-2",
      company_name: "Smith & Sons Ltd",
      company_number: "87654321",
      vat_registered: false,
      vat_frequency: null,
      vat_stagger_group: null,
      year_end_month: 12,
      year_end_day: 31,
      status: "active",
    },
  },
  sole_trader: {
    entityType: "client",
    entityId: "sample-client-1",
    organizationId: "sample-org",
    client: {
      id: "sample-client-1",
      first_name: "John",
      last_name: "Smith",
      email: "john.smith@example.com",
      status: "active",
    },
  },
};

interface PlaceholderDefinition {
  key: string;
  label: string;
  category: "company" | "client" | "period" | "deadline" | "vat";
  resolver: (context: EntityContext, dates: { periodStart?: Date; periodEnd?: Date; deadline?: Date }) => string;
}

const PLACEHOLDER_DEFINITIONS: PlaceholderDefinition[] = [
  // Company placeholders
  {
    key: "{{company.name}}",
    label: "Company Name",
    category: "company",
    resolver: (ctx) => ctx.company?.company_name || "N/A",
  },
  {
    key: "{{company.number}}",
    label: "Company Number",
    category: "company",
    resolver: (ctx) => ctx.company?.company_number || "N/A",
  },
  {
    key: "{{company.year_end}}",
    label: "Year End Date",
    category: "company",
    resolver: (ctx) => {
      if (!ctx.company?.year_end_month || !ctx.company?.year_end_day) return "N/A";
      const now = new Date();
      const yearEnd = new Date(now.getFullYear(), ctx.company.year_end_month - 1, ctx.company.year_end_day);
      return format(yearEnd, "dd MMMM");
    },
  },
  {
    key: "{{company.vat_registered}}",
    label: "VAT Registered",
    category: "company",
    resolver: (ctx) => ctx.company?.vat_registered ? "Yes" : "No",
  },
  // Client placeholders
  {
    key: "{{client.name}}",
    label: "Client Full Name",
    category: "client",
    resolver: (ctx) => 
      ctx.client ? `${ctx.client.first_name} ${ctx.client.last_name}` : "N/A",
  },
  {
    key: "{{client.first_name}}",
    label: "Client First Name",
    category: "client",
    resolver: (ctx) => ctx.client?.first_name || "N/A",
  },
  {
    key: "{{client.last_name}}",
    label: "Client Last Name",
    category: "client",
    resolver: (ctx) => ctx.client?.last_name || "N/A",
  },
  {
    key: "{{client.email}}",
    label: "Client Email",
    category: "client",
    resolver: (ctx) => ctx.client?.email || "N/A",
  },
  // Period placeholders
  {
    key: "{{period.start}}",
    label: "Period Start",
    category: "period",
    resolver: (_, dates) => dates.periodStart ? format(dates.periodStart, "dd MMM yyyy") : "N/A",
  },
  {
    key: "{{period.end}}",
    label: "Period End",
    category: "period",
    resolver: (_, dates) => dates.periodEnd ? format(dates.periodEnd, "dd MMM yyyy") : "N/A",
  },
  {
    key: "{{period}}",
    label: "Period Label",
    category: "period",
    resolver: (_, dates) => {
      if (!dates.periodStart || !dates.periodEnd) return "N/A";
      return `${format(dates.periodStart, "MMM yyyy")} - ${format(dates.periodEnd, "MMM yyyy")}`;
    },
  },
  {
    key: "{{period.quarter}}",
    label: "Quarter",
    category: "period",
    resolver: (_, dates) => {
      if (!dates.periodEnd) return "N/A";
      const q = Math.ceil((dates.periodEnd.getMonth() + 1) / 3);
      return `Q${q} ${format(dates.periodEnd, "yyyy")}`;
    },
  },
  // Deadline placeholders
  {
    key: "{{deadline.due_date}}",
    label: "Filing Deadline",
    category: "deadline",
    resolver: (_, dates) => dates.deadline ? format(dates.deadline, "dd MMM yyyy") : "N/A",
  },
  {
    key: "{{deadline.days_remaining}}",
    label: "Days Until Deadline",
    category: "deadline",
    resolver: (_, dates) => {
      if (!dates.deadline) return "N/A";
      const days = Math.ceil((dates.deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      return `${days} days`;
    },
  },
  // VAT placeholders
  {
    key: "{{vat.period_start}}",
    label: "VAT Period Start",
    category: "vat",
    resolver: (ctx, dates) => {
      if (!ctx.company?.vat_registered) return "N/A";
      return dates.periodStart ? format(dates.periodStart, "dd MMM yyyy") : "N/A";
    },
  },
  {
    key: "{{vat.period_end}}",
    label: "VAT Period End",
    category: "vat",
    resolver: (ctx, dates) => {
      if (!ctx.company?.vat_registered) return "N/A";
      return dates.periodEnd ? format(dates.periodEnd, "dd MMM yyyy") : "N/A";
    },
  },
  {
    key: "{{vat.frequency}}",
    label: "VAT Frequency",
    category: "vat",
    resolver: (ctx) => ctx.company?.vat_frequency || "N/A",
  },
];

const CATEGORY_CONFIG = {
  company: { label: "Company", icon: Building2, color: "bg-blue-500/10 text-blue-600" },
  client: { label: "Client", icon: User, color: "bg-green-500/10 text-green-600" },
  period: { label: "Period", icon: Calendar, color: "bg-purple-500/10 text-purple-600" },
  deadline: { label: "Deadline", icon: FileText, color: "bg-orange-500/10 text-orange-600" },
  vat: { label: "VAT", icon: FileText, color: "bg-red-500/10 text-red-600" },
};

export function DynamicPlaceholdersPreview({
  metadata,
  periodStart,
  periodEnd,
}: DynamicPlaceholdersPreviewProps) {
  const [previewContext, setPreviewContext] = useState<PreviewContext>("vat_company");

  const context = SAMPLE_CONTEXTS[previewContext];

  // Calculate sample dates based on metadata or use defaults
  const sampleDates = useMemo(() => {
    const now = new Date();
    const start = periodStart || new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const end = periodEnd || new Date(now.getFullYear(), now.getMonth(), 0);
    const offset = metadata?.relativeDueOffset || 37;
    const deadline = new Date(end);
    deadline.setDate(deadline.getDate() + offset);
    return { periodStart: start, periodEnd: end, deadline };
  }, [metadata, periodStart, periodEnd]);

  // Group placeholders by category
  const groupedPlaceholders = PLACEHOLDER_DEFINITIONS.reduce((acc, placeholder) => {
    if (!acc[placeholder.category]) acc[placeholder.category] = [];
    acc[placeholder.category].push(placeholder);
    return acc;
  }, {} as Record<string, PlaceholderDefinition[]>);

  return (
    <div className="flex flex-col h-full flex-1 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center gap-2 mb-3">
          <Code2 className="h-4 w-4" />
          <h3 className="font-semibold text-sm">Placeholder Preview</h3>
        </div>
        <Select value={previewContext} onValueChange={(v) => setPreviewContext(v as PreviewContext)}>
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="vat_company">VAT Registered Company</SelectItem>
            <SelectItem value="non_vat_company">Non-VAT Company</SelectItem>
            <SelectItem value="sole_trader">Sole Trader (Client)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Context Info */}
      <div className="px-4 py-2 border-b bg-muted/50">
        <div className="text-xs text-muted-foreground">
          <strong>Preview using:</strong>{" "}
          {context.company?.company_name || `${context.client?.first_name} ${context.client?.last_name}`}
        </div>
        <div className="text-xs text-muted-foreground">
          <strong>Period:</strong>{" "}
          {format(sampleDates.periodStart, "dd MMM")} - {format(sampleDates.periodEnd, "dd MMM yyyy")}
        </div>
      </div>

      {/* Placeholders List */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {Object.entries(groupedPlaceholders).map(([category, placeholders]) => {
            const config = CATEGORY_CONFIG[category as keyof typeof CATEGORY_CONFIG];
            const Icon = config.icon;

            return (
              <div key={category}>
                <div className="flex items-center gap-2 mb-2">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {config.label}
                  </span>
                </div>
                <div className="space-y-1">
                  {placeholders.map((placeholder) => {
                    const resolvedValue = placeholder.resolver(context, sampleDates);
                    const isNA = resolvedValue === "N/A";

                    return (
                      <div
                        key={placeholder.key}
                        className="flex items-center justify-between p-2 rounded-md bg-background border text-sm"
                      >
                        <div className="flex-1 min-w-0">
                          <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                            {placeholder.key}
                          </code>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {placeholder.label}
                          </div>
                        </div>
                        <div className={`text-right ${isNA ? "text-muted-foreground" : "font-medium"}`}>
                          {resolvedValue}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Helper Text */}
      <div className="p-3 border-t text-xs text-muted-foreground">
        Use these placeholders in task names, descriptions, and folder paths. They'll be replaced with actual values when jobs are generated.
      </div>
    </div>
  );
}
