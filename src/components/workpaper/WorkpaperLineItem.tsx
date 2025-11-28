/**
 * Workpaper Line Item Component
 * Shows per-line source tracking with icons/tooltips
 */
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Edit,
  FileSpreadsheet,
  Calculator,
  FileQuestion,
  PenLine,
  MessageSquare,
  Paperclip,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface WorkpaperLineValue {
  label: string;
  amount: number;
  source: "trial_balance" | "questionnaire" | "manual" | "calculation" | "manual_adjustment";
  sourceReference?: string;
  isKeyField: boolean;
  displayOrder: number;
  notes?: string;
}

interface WorkpaperLineItemProps {
  fieldName: string;
  value: WorkpaperLineValue;
  isOverridden: boolean;
  originalValue?: any;
  note?: string;
  isLocked: boolean;
  onEdit: (fieldName: string, value: any, note?: string) => void;
  onDocumentClick?: (fieldName: string) => void;
  linkedDocumentCount?: number;
  isExpanded?: boolean;
  isDetailLine?: boolean;
}

const sourceConfig = {
  trial_balance: {
    icon: FileSpreadsheet,
    label: "Trial Balance",
    color: "text-blue-500",
    bgColor: "bg-blue-50 dark:bg-blue-950",
    borderColor: "border-blue-200 dark:border-blue-800",
  },
  questionnaire: {
    icon: FileQuestion,
    label: "Questionnaire",
    color: "text-purple-500",
    bgColor: "bg-purple-50 dark:bg-purple-950",
    borderColor: "border-purple-200 dark:border-purple-800",
  },
  calculation: {
    icon: Calculator,
    label: "Calculated",
    color: "text-green-500",
    bgColor: "bg-green-50 dark:bg-green-950",
    borderColor: "border-green-200 dark:border-green-800",
  },
  manual: {
    icon: PenLine,
    label: "Manual Entry",
    color: "text-orange-500",
    bgColor: "bg-orange-50 dark:bg-orange-950",
    borderColor: "border-orange-200 dark:border-orange-800",
  },
  manual_adjustment: {
    icon: PenLine,
    label: "Manual Adjustment",
    color: "text-amber-500",
    bgColor: "bg-amber-50 dark:bg-amber-950",
    borderColor: "border-amber-200 dark:border-amber-800",
  },
};

export function WorkpaperLineItem({
  fieldName,
  value,
  isOverridden,
  originalValue,
  note,
  isLocked,
  onEdit,
  onDocumentClick,
  linkedDocumentCount = 0,
  isExpanded,
  isDetailLine,
}: WorkpaperLineItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value.amount);
  const [editNote, setEditNote] = useState(note || "");

  const source = value.source || "manual";
  const config = sourceConfig[source] || sourceConfig.manual;
  const SourceIcon = config.icon;

  const handleSave = () => {
    onEdit(fieldName, { ...value, amount: editValue }, editNote || undefined);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(value.amount);
    setEditNote(note || "");
    setIsEditing(false);
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
      minimumFractionDigits: 2,
    }).format(amount);
  };

  return (
    <div
      className={cn(
        "border rounded-lg p-3 transition-colors",
        config.bgColor,
        config.borderColor,
        isDetailLine && "ml-6 border-l-4",
        !value.isKeyField && "opacity-75"
      )}
    >
      <div className="flex items-start justify-between gap-4">
        {/* Left side: Label and source info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {/* Source Icon with Tooltip */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className={cn("flex items-center gap-1", config.color)}>
                    <SourceIcon className="h-4 w-4" />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <div className="space-y-1">
                    <p className="font-medium">{config.label}</p>
                    {value.sourceReference && (
                      <p className="text-xs text-muted-foreground">
                        {source === "trial_balance"
                          ? `Account: ${value.sourceReference}`
                          : value.sourceReference}
                      </p>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Label */}
            <Label
              className={cn(
                "text-sm",
                value.isKeyField ? "font-semibold" : "font-normal"
              )}
            >
              {value.label}
            </Label>

            {/* Override badge */}
            {isOverridden && (
              <Badge variant="outline" className="text-xs bg-amber-100 text-amber-700 border-amber-300">
                Overridden
              </Badge>
            )}

            {/* Source badge */}
            <Badge variant="secondary" className="text-xs">
              {config.label}
            </Badge>
          </div>

          {/* Source reference details */}
          {value.sourceReference && source === "trial_balance" && (
            <p className="text-xs text-muted-foreground ml-6">
              Accounts: {value.sourceReference}
            </p>
          )}

          {/* Note display */}
          {note && !isEditing && (
            <div className="flex items-start gap-1 mt-1 ml-6">
              <MessageSquare className="h-3 w-3 text-muted-foreground mt-0.5" />
              <p className="text-xs text-muted-foreground">{note}</p>
            </div>
          )}
        </div>

        {/* Right side: Amount and actions */}
        <div className="flex items-center gap-2">
          {isEditing ? (
            <div className="space-y-2">
              <Input
                type="number"
                step="0.01"
                value={editValue}
                onChange={(e) => setEditValue(parseFloat(e.target.value) || 0)}
                className="w-32 text-right"
              />
              <Textarea
                placeholder="Add note..."
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                className="w-48 h-16 text-xs"
              />
              <div className="flex gap-1 justify-end">
                <Button size="sm" variant="outline" onClick={handleCancel}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSave}>
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Amount */}
              <div className="text-right">
                <p
                  className={cn(
                    "font-mono",
                    value.isKeyField ? "text-base font-semibold" : "text-sm",
                    value.amount < 0 ? "text-red-600" : ""
                  )}
                >
                  {formatAmount(value.amount)}
                </p>
                {isOverridden && originalValue !== undefined && (
                  <p className="text-xs text-muted-foreground line-through">
                    {formatAmount(originalValue)}
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1">
                {/* Document attachment button */}
                {onDocumentClick && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="relative"
                          onClick={() => onDocumentClick(fieldName)}
                        >
                          <Paperclip className="h-4 w-4" />
                          {linkedDocumentCount > 0 && (
                            <span className="absolute -top-1 -right-1 h-4 w-4 text-xs bg-primary text-primary-foreground rounded-full flex items-center justify-center">
                              {linkedDocumentCount}
                            </span>
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {linkedDocumentCount > 0
                          ? `${linkedDocumentCount} linked document(s)`
                          : "Link documents"}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}

                {/* Edit button */}
                {!isLocked && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setIsEditing(true)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
