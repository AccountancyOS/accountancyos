import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Blocks,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Plus,
  Search,
  FileText,
  Clock,
  CheckSquare,
} from "lucide-react";
import { TaskTemplate, JobTemplateContent } from "@/lib/job-template-types";

interface TemplateBlock {
  id: string;
  organization_id: string;
  block_name: string;
  block_type: string;
  content: JobTemplateContent;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

interface ReusableBlocksPanelProps {
  onInsertBlock: (tasks: TaskTemplate[]) => void;
  selectedTasks?: TaskTemplate[];
  onCreateBlock?: (name: string, description: string) => void;
}

export function ReusableBlocksPanel({
  onInsertBlock,
  selectedTasks = [],
  onCreateBlock,
}: ReusableBlocksPanelProps) {
  const { organization } = useOrganization();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(["task_group"]));
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newBlockName, setNewBlockName] = useState("");
  const [newBlockDescription, setNewBlockDescription] = useState("");

  // Fetch template blocks
  const { data: blocks, isLoading } = useQuery({
    queryKey: ["template-blocks", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from("template_blocks")
        .select("*")
        .eq("organization_id", organization.id)
        .eq("is_active", true)
        .order("block_name");

      if (error) throw error;
      return (data || []) as TemplateBlock[];
    },
    enabled: !!organization?.id,
  });

  // Create block mutation
  const createBlockMutation = useMutation({
    mutationFn: async ({ name, description }: { name: string; description: string }) => {
      if (!organization?.id) throw new Error("No organization");

      const content: JobTemplateContent = {
        sections: [],
        tasks: selectedTasks.map((t, index) => ({
          ...t,
          id: crypto.randomUUID(),
          order: index,
          isFromBlock: false,
        })),
        recordsRequestGroups: [],
        recordsRequests: [],
        reusableBlockIds: [],
      };

      const { error } = await supabase
        .from("template_blocks")
        .insert({
          organization_id: organization.id,
          block_name: name,
          block_type: "task_group",
          content,
          description,
          is_active: true,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["template-blocks"] });
      toast.success("Block created from selection");
      setShowCreateDialog(false);
      setNewBlockName("");
      setNewBlockDescription("");
    },
    onError: (error) => {
      toast.error("Failed to create block");
      console.error(error);
    },
  });

  // Group blocks by type
  const groupedBlocks = blocks?.reduce((acc, block) => {
    const type = block.block_type || "other";
    if (!acc[type]) acc[type] = [];
    acc[type].push(block);
    return acc;
  }, {} as Record<string, TemplateBlock[]>) || {};

  // Filter blocks by search
  const filteredGroups = Object.entries(groupedBlocks).reduce((acc, [type, typeBlocks]) => {
    const filtered = typeBlocks.filter(
      (b) =>
        searchQuery === "" ||
        b.block_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );
    if (filtered.length > 0) acc[type] = filtered;
    return acc;
  }, {} as Record<string, TemplateBlock[]>);

  const toggleGroup = (group: string) => {
    const newSet = new Set(expandedGroups);
    if (newSet.has(group)) {
      newSet.delete(group);
    } else {
      newSet.add(group);
    }
    setExpandedGroups(newSet);
  };

  const getBlockTypeLabel = (type: string) => {
    switch (type) {
      case "task_group":
        return "Task Groups";
      case "records_request":
        return "Records Requests";
      case "deadline_block":
        return "Deadline Blocks";
      default:
        return type.replace(/_/g, " ");
    }
  };

  const getBlockTypeIcon = (type: string) => {
    switch (type) {
      case "task_group":
        return <CheckSquare className="h-4 w-4" />;
      case "records_request":
        return <FileText className="h-4 w-4" />;
      case "deadline_block":
        return <Clock className="h-4 w-4" />;
      default:
        return <Blocks className="h-4 w-4" />;
    }
  };

  const handleInsertBlock = (block: TemplateBlock) => {
    const content = block.content as JobTemplateContent;
    if (content?.tasks && content.tasks.length > 0) {
      // Generate new IDs for inserted tasks
      const tasksWithNewIds = content.tasks.map((task) => ({
        ...task,
        id: crypto.randomUUID(),
        isFromBlock: true,
        blockId: block.id,
      }));
      onInsertBlock(tasksWithNewIds);
      toast.success(`Inserted "${block.block_name}" block`);
    } else {
      toast.error("Block has no tasks to insert");
    }
  };

  return (
    <div className="flex flex-col h-full border-l bg-muted/30">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Blocks className="h-4 w-4" />
            Reusable Blocks
          </h3>
          {selectedTasks.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowCreateDialog(true)}
            >
              <Plus className="h-3 w-3 mr-1" />
              Create
            </Button>
          )}
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search blocks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
      </div>

      {/* Blocks List */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-2">
          {isLoading ? (
            <div className="text-sm text-muted-foreground text-center py-8">
              Loading blocks...
            </div>
          ) : Object.keys(filteredGroups).length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8">
              {searchQuery ? "No blocks match your search" : "No reusable blocks yet"}
              {selectedTasks.length > 0 && (
                <p className="mt-2 text-xs">
                  Select tasks and click "Create" to make a reusable block
                </p>
              )}
            </div>
          ) : (
            Object.entries(filteredGroups).map(([type, typeBlocks]) => (
              <Collapsible
                key={type}
                open={expandedGroups.has(type)}
                onOpenChange={() => toggleGroup(type)}
              >
                <CollapsibleTrigger className="flex items-center justify-between w-full p-2 rounded-md hover:bg-muted text-sm font-medium">
                  <div className="flex items-center gap-2">
                    {getBlockTypeIcon(type)}
                    <span>{getBlockTypeLabel(type)}</span>
                    <Badge variant="secondary" className="text-xs">
                      {typeBlocks.length}
                    </Badge>
                  </div>
                  {expandedGroups.has(type) ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="pl-2 space-y-1 mt-1">
                    {typeBlocks.map((block) => {
                      const content = block.content as JobTemplateContent;
                      const taskCount = content?.tasks?.length || 0;

                      return (
                        <div
                          key={block.id}
                          className="group flex items-start gap-2 p-2 rounded-md border bg-background hover:border-primary/50 cursor-grab transition-colors"
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("block-id", block.id);
                            e.dataTransfer.setData("block-tasks", JSON.stringify(content?.tasks || []));
                          }}
                          onClick={() => handleInsertBlock(block)}
                        >
                          <GripVertical className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">
                              {block.block_name}
                            </div>
                            {block.description && (
                              <p className="text-xs text-muted-foreground truncate">
                                {block.description}
                              </p>
                            )}
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="outline" className="text-xs">
                                {taskCount} {taskCount === 1 ? "task" : "tasks"}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Create Block Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Reusable Block</DialogTitle>
            <DialogDescription>
              Create a reusable block from the {selectedTasks.length} selected task(s)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Block Name</label>
              <Input
                value={newBlockName}
                onChange={(e) => setNewBlockName(e.target.value)}
                placeholder="e.g., Standard VAT Review Tasks"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description (optional)</label>
              <Input
                value={newBlockDescription}
                onChange={(e) => setNewBlockDescription(e.target.value)}
                placeholder="Brief description of this block"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                createBlockMutation.mutate({
                  name: newBlockName,
                  description: newBlockDescription,
                })
              }
              disabled={!newBlockName.trim() || createBlockMutation.isPending}
            >
              Create Block
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
