import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ChevronDown, Star, Save, Trash2, Check } from "lucide-react";
import type { SavedView } from "@/lib/jobs-filter-service";

interface SavedViewsDropdownProps {
  savedViews: SavedView[];
  currentViewId?: string;
  hasActiveFilters: boolean;
  onApplyView: (view: SavedView) => void;
  onSaveView: (name: string, isDefault: boolean) => Promise<boolean>;
  onDeleteView: (viewId: string) => Promise<boolean>;
  isLoading?: boolean;
}

export function SavedViewsDropdown({
  savedViews,
  currentViewId,
  hasActiveFilters,
  onApplyView,
  onSaveView,
  onDeleteView,
  isLoading,
}: SavedViewsDropdownProps) {
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!newViewName.trim()) return;
    setIsSaving(true);
    try {
      await onSaveView(newViewName.trim(), isDefault);
      setShowSaveDialog(false);
      setNewViewName("");
      setIsDefault(false);
    } finally {
      setIsSaving(false);
    }
  };

  const currentView = savedViews.find(v => v.id === currentViewId);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={isLoading}>
            {currentView ? currentView.view_name : "Saved Views"}
            <ChevronDown className="ml-2 h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {savedViews.length > 0 ? (
            <>
              {savedViews.map((view) => (
                <DropdownMenuItem
                  key={view.id}
                  onClick={() => onApplyView(view)}
                  className="flex items-center justify-between"
                >
                  <span className="flex items-center gap-2">
                    {view.is_default && <Star className="h-3 w-3 text-yellow-500" />}
                    {view.view_name}
                  </span>
                  {currentViewId === view.id && <Check className="h-4 w-4" />}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
            </>
          ) : (
            <DropdownMenuItem disabled>No saved views</DropdownMenuItem>
          )}
          
          {hasActiveFilters && (
            <DropdownMenuItem onClick={() => setShowSaveDialog(true)}>
              <Save className="mr-2 h-4 w-4" />
              Save Current View
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save View</DialogTitle>
            <DialogDescription>
              Save your current filters as a reusable view
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="view-name">View Name</Label>
              <Input
                id="view-name"
                value={newViewName}
                onChange={(e) => setNewViewName(e.target.value)}
                placeholder="e.g., My Overdue SA Jobs"
              />
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="is-default"
                checked={isDefault}
                onCheckedChange={setIsDefault}
              />
              <Label htmlFor="is-default">Set as default view</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!newViewName.trim() || isSaving}>
              {isSaving ? "Saving..." : "Save View"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
