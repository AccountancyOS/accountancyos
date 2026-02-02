import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

interface YearEndEditorProps {
  companyId: string;
  currentMonth?: number | null;
  currentDay?: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

const MONTHS = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

// Days in each month (using 28 for Feb for simplicity)
const getDaysInMonth = (month: number): number => {
  const daysPerMonth: Record<number, number> = {
    1: 31, 2: 28, 3: 31, 4: 30, 5: 31, 6: 30,
    7: 31, 8: 31, 9: 30, 10: 31, 11: 30, 12: 31,
  };
  return daysPerMonth[month] || 31;
};

export function YearEndEditor({
  companyId,
  currentMonth,
  currentDay,
  open,
  onOpenChange,
  onSaved,
}: YearEndEditorProps) {
  const { toast } = useToast();
  const [month, setMonth] = useState<string>(currentMonth?.toString() || "");
  const [day, setDay] = useState<string>(currentDay?.toString() || "");
  const [saving, setSaving] = useState(false);

  const maxDay = month ? getDaysInMonth(parseInt(month)) : 31;
  const days = Array.from({ length: maxDay }, (_, i) => i + 1);

  // Reset day if it exceeds max for selected month
  const handleMonthChange = (newMonth: string) => {
    setMonth(newMonth);
    const newMaxDay = getDaysInMonth(parseInt(newMonth));
    if (parseInt(day) > newMaxDay) {
      setDay(newMaxDay.toString());
    }
  };

  const handleSave = async () => {
    if (!month || !day) {
      toast({
        title: "Missing fields",
        description: "Please select both month and day",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("companies")
        .update({
          year_end_month: parseInt(month),
          year_end_day: parseInt(day),
        })
        .eq("id", companyId);

      if (error) throw error;

      toast({
        title: "Year end updated",
        description: `Year end set to ${day}/${month}`,
      });

      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast({
        title: "Error saving year end",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // Common year end presets
  const presets = [
    { label: "31 March", month: "3", day: "31" },
    { label: "30 June", month: "6", day: "30" },
    { label: "30 September", month: "9", day: "30" },
    { label: "31 December", month: "12", day: "31" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Set Year End Date</DialogTitle>
          <DialogDescription>
            Configure the company's accounting year end date. This is used to calculate filing deadlines.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Quick presets */}
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">Common year ends</Label>
            <div className="flex flex-wrap gap-2">
              {presets.map((preset) => (
                <Button
                  key={preset.label}
                  variant={month === preset.month && day === preset.day ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setMonth(preset.month);
                    setDay(preset.day);
                  }}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Custom selection */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="month">Month</Label>
              <Select value={month} onValueChange={handleMonthChange}>
                <SelectTrigger id="month">
                  <SelectValue placeholder="Select month" />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="day">Day</Label>
              <Select value={day} onValueChange={setDay} disabled={!month}>
                <SelectTrigger id="day">
                  <SelectValue placeholder="Select day" />
                </SelectTrigger>
                <SelectContent>
                  {days.map((d) => (
                    <SelectItem key={d} value={d.toString()}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {month && day && (
            <p className="text-sm text-muted-foreground">
              Year end will be set to <strong>{day} {MONTHS.find(m => m.value === month)?.label}</strong>
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !month || !day}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Year End
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
