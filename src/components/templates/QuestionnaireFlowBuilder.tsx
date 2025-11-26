import { useState, useCallback, useEffect } from "react";
import {
  ReactFlow,
  Node,
  Edge,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Panel,
  MarkerType,
  Handle,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Settings, Save } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface QuestionnaireQuestion {
  id: string;
  type: "text" | "longtext" | "number" | "date" | "yesno" | "select" | "multiselect" | "file";
  label: string;
  helpText?: string;
  placeholder?: string;
  required: boolean;
  options?: string[];
  branchLogic?: {
    yesTarget?: string; // Question ID to jump to on Yes
    noTarget?: string;  // Question ID to jump to on No
    // For select/multiselect, map option values to target question IDs
    optionTargets?: Record<string, string>;
  };
}

interface QuestionnaireFlowBuilderProps {
  content: any;
  onChange: (content: any) => void;
}

const questionTypeColors: Record<string, string> = {
  text: "#3b82f6",
  longtext: "#8b5cf6",
  number: "#10b981",
  date: "#f59e0b",
  yesno: "#ef4444",
  select: "#06b6d4",
  multiselect: "#ec4899",
  file: "#6366f1",
};

const QuestionNode = ({ data }: { data: any }) => {
  const bgColor = questionTypeColors[data.type] || "#6b7280";
  
  return (
    <>
      <Handle type="target" position={Position.Top} />
      <div
        className="px-4 py-3 rounded-lg border-2 shadow-lg bg-background min-w-[200px] cursor-pointer hover:shadow-xl transition-shadow"
        style={{ borderColor: bgColor }}
        onClick={data.onEdit}
      >
        <div className="flex items-center gap-2 mb-2">
          <Badge style={{ backgroundColor: bgColor }} className="text-white border-0">
            {data.type}
          </Badge>
          {data.required && <Badge variant="destructive" className="text-xs">Required</Badge>}
        </div>
        <div className="font-medium text-sm line-clamp-2">{data.label}</div>
        {data.hasLogic && (
          <Badge variant="secondary" className="text-xs mt-2">Has Branching</Badge>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </>
  );
};

const nodeTypes = {
  question: QuestionNode,
};

export default function QuestionnaireFlowBuilder({ content, onChange }: QuestionnaireFlowBuilderProps) {
  const questions: QuestionnaireQuestion[] = content.questions || [];
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedQuestion, setSelectedQuestion] = useState<QuestionnaireQuestion | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  // Convert questions to nodes and edges
  useEffect(() => {
    const newNodes: Node[] = questions.map((q, index) => ({
      id: q.id,
      type: "question",
      position: { x: 250, y: index * 150 + 50 },
      data: {
        ...q,
        hasLogic: !!(q as any).branchLogic,
        onEdit: () => {
          setSelectedQuestion(q);
          setEditDialogOpen(true);
        },
      },
    }));

    // Add start and end nodes
    if (questions.length > 0) {
      newNodes.unshift({
        id: "start",
        type: "input",
        position: { x: 250, y: -50 },
        data: { label: "Start" },
      });
      newNodes.push({
        id: "end",
        type: "output",
        position: { x: 250, y: questions.length * 150 + 50 },
        data: { label: "Submit" },
      });
    }

    const newEdges: Edge[] = [];
    
    // Create default flow edges
    if (questions.length > 0) {
      newEdges.push({
        id: "e-start-first",
        source: "start",
        target: questions[0].id,
        type: "smoothstep",
        animated: true,
      });
    }

    questions.forEach((q, index) => {
      const branchLogic = (q as any).branchLogic;
      
      if (q.type === "yesno" && branchLogic) {
        // Yes branch
        if (branchLogic.yesTarget) {
          newEdges.push({
            id: `e-${q.id}-yes-${branchLogic.yesTarget}`,
            source: q.id,
            target: branchLogic.yesTarget,
            type: "smoothstep",
            animated: true,
            label: "If Yes",
            markerEnd: { type: MarkerType.ArrowClosed },
            style: { stroke: "#10b981", strokeWidth: 2 },
          });
        } else if (index < questions.length - 1) {
          // Default to next question
          newEdges.push({
            id: `e-${q.id}-yes-${questions[index + 1].id}`,
            source: q.id,
            target: questions[index + 1].id,
            type: "smoothstep",
            label: "If Yes",
            markerEnd: { type: MarkerType.ArrowClosed },
            style: { stroke: "#10b981" },
          });
        }

        // No branch
        if (branchLogic.noTarget) {
          newEdges.push({
            id: `e-${q.id}-no-${branchLogic.noTarget}`,
            source: q.id,
            target: branchLogic.noTarget,
            type: "smoothstep",
            animated: true,
            label: "If No",
            markerEnd: { type: MarkerType.ArrowClosed },
            style: { stroke: "#ef4444", strokeWidth: 2 },
          });
        } else if (index < questions.length - 1) {
          // Default to next question
          newEdges.push({
            id: `e-${q.id}-no-${questions[index + 1].id}`,
            source: q.id,
            target: questions[index + 1].id,
            type: "smoothstep",
            label: "If No",
            markerEnd: { type: MarkerType.ArrowClosed },
            style: { stroke: "#ef4444" },
          });
        }
      } else if ((q.type === "select" || q.type === "multiselect") && branchLogic?.optionTargets) {
        // Branch for each option
        Object.entries(branchLogic.optionTargets).forEach(([option, targetId]) => {
          if (targetId && typeof targetId === 'string') {
            newEdges.push({
              id: `e-${q.id}-${option}-${targetId}`,
              source: q.id,
              target: targetId,
              type: "smoothstep",
              animated: true,
              label: `"${option}"`,
              markerEnd: { type: MarkerType.ArrowClosed },
              style: { stroke: "#3b82f6", strokeWidth: 2 },
            });
          }
        });
        
        // Default path if no option matches
        if (index < questions.length - 1) {
          newEdges.push({
            id: `e-${q.id}-default-${questions[index + 1].id}`,
            source: q.id,
            target: questions[index + 1].id,
            type: "smoothstep",
            label: "Other",
            markerEnd: { type: MarkerType.ArrowClosed },
            style: { stroke: "#6b7280" },
          });
        }
      } else {
        // Normal flow to next question (no branching)
        if (index < questions.length - 1) {
          newEdges.push({
            id: `e-${q.id}-${questions[index + 1].id}`,
            source: q.id,
            target: questions[index + 1].id,
            type: "smoothstep",
            markerEnd: { type: MarkerType.ArrowClosed },
          });
        } else {
          // Last question to end
          newEdges.push({
            id: `e-${q.id}-end`,
            source: q.id,
            target: "end",
            type: "smoothstep",
            markerEnd: { type: MarkerType.ArrowClosed },
          });
        }
      }
    });

    setNodes(newNodes);
    setEdges(newEdges);
  }, [questions]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const addQuestion = (type: QuestionnaireQuestion["type"]) => {
    const newQuestion: QuestionnaireQuestion = {
      id: crypto.randomUUID(),
      type,
      label: "",
      required: true,
    };

    if (type === "select" || type === "multiselect") {
      newQuestion.options = ["Option 1", "Option 2"];
    }

    onChange({ ...content, questions: [...questions, newQuestion] });
    
    // Automatically open edit dialog for the new question
    setTimeout(() => {
      setSelectedQuestion(newQuestion);
      setEditDialogOpen(true);
    }, 100);
  };

  const updateQuestion = (questionId: string, updates: Partial<QuestionnaireQuestion>) => {
    const updatedQuestions = questions.map((q) =>
      q.id === questionId ? { ...q, ...updates } : q
    );
    onChange({ ...content, questions: updatedQuestions });
  };

  const deleteQuestion = (questionId: string) => {
    onChange({ ...content, questions: questions.filter((q) => q.id !== questionId) });
    setEditDialogOpen(false);
  };

  const addBranchLogic = (questionId: string, targetQuestionId: string, condition: string) => {
    const question = questions.find((q) => q.id === questionId);
    if (!question) return;

    const updatedQuestion = {
      ...question,
      logic: {
        action: "jump_to",
        targetQuestionId,
        conditions: [
          {
            questionId,
            operator: "is",
            value: condition,
          },
        ],
      },
    };

    updateQuestion(questionId, updatedQuestion);
  };

  return (
    <div className="h-[calc(100vh-12rem)] w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
      >
        <Background />
        <Controls />
        <Panel position="top-left" className="bg-background border rounded-lg p-4 shadow-lg space-y-2">
          <h3 className="font-semibold text-sm mb-2">Add Question</h3>
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" variant="outline" onClick={() => addQuestion("text")}>
              Text
            </Button>
            <Button size="sm" variant="outline" onClick={() => addQuestion("yesno")}>
              Yes/No
            </Button>
            <Button size="sm" variant="outline" onClick={() => addQuestion("select")}>
              Dropdown
            </Button>
            <Button size="sm" variant="outline" onClick={() => addQuestion("number")}>
              Number
            </Button>
            <Button size="sm" variant="outline" onClick={() => addQuestion("date")}>
              Date
            </Button>
            <Button size="sm" variant="outline" onClick={() => addQuestion("file")}>
              File
            </Button>
          </div>
        </Panel>
      </ReactFlow>

      {/* Edit Question Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedQuestion?.label || "New Question"}</DialogTitle>
          </DialogHeader>
          {selectedQuestion && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Question Text *</Label>
                <Textarea
                  value={selectedQuestion.label}
                  onChange={(e) => {
                    const updated = { ...selectedQuestion, label: e.target.value };
                    setSelectedQuestion(updated);
                    updateQuestion(selectedQuestion.id, { label: e.target.value });
                  }}
                  placeholder="Enter your question here"
                  rows={2}
                  className="text-base"
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label>Question Type</Label>
                <Select
                  value={selectedQuestion.type}
                  onValueChange={(value) => {
                    const updated = { ...selectedQuestion, type: value as any };
                    setSelectedQuestion(updated);
                    updateQuestion(selectedQuestion.id, { type: value as any });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Short Text</SelectItem>
                    <SelectItem value="longtext">Long Text</SelectItem>
                    <SelectItem value="number">Number</SelectItem>
                    <SelectItem value="date">Date</SelectItem>
                    <SelectItem value="yesno">Yes/No</SelectItem>
                    <SelectItem value="select">Dropdown</SelectItem>
                    <SelectItem value="multiselect">Checkboxes</SelectItem>
                    <SelectItem value="file">File Upload</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Help Text (optional)</Label>
                <Input
                  value={selectedQuestion.helpText || ""}
                  onChange={(e) => {
                    const updated = { ...selectedQuestion, helpText: e.target.value };
                    setSelectedQuestion(updated);
                    updateQuestion(selectedQuestion.id, { helpText: e.target.value });
                  }}
                  placeholder="Additional instructions or context for the client"
                />
              </div>

              <div className="space-y-2">
                <Label>Placeholder (optional)</Label>
                <Input
                  value={selectedQuestion.placeholder || ""}
                  onChange={(e) => {
                    const updated = { ...selectedQuestion, placeholder: e.target.value };
                    setSelectedQuestion(updated);
                    updateQuestion(selectedQuestion.id, { placeholder: e.target.value });
                  }}
                  placeholder="Example: Enter your full name"
                />
              </div>

              {(selectedQuestion.type === "select" || selectedQuestion.type === "multiselect") && (
                <div className="space-y-2">
                  <Label>Options</Label>
                  {selectedQuestion.options?.map((opt, i) => (
                    <div key={i} className="flex gap-2">
                      <Input
                        value={opt}
                        onChange={(e) => {
                          const newOptions = [...(selectedQuestion.options || [])];
                          newOptions[i] = e.target.value;
                          const updated = { ...selectedQuestion, options: newOptions };
                          setSelectedQuestion(updated);
                          updateQuestion(selectedQuestion.id, { options: newOptions });
                        }}
                        placeholder={`Option ${i + 1}`}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          const newOptions = selectedQuestion.options?.filter(
                            (_, idx) => idx !== i
                          );
                          const updated = { ...selectedQuestion, options: newOptions };
                          setSelectedQuestion(updated);
                          updateQuestion(selectedQuestion.id, { options: newOptions });
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const newOptions = [
                        ...(selectedQuestion.options || []),
                        "",
                      ];
                      const updated = { ...selectedQuestion, options: newOptions };
                      setSelectedQuestion(updated);
                      updateQuestion(selectedQuestion.id, { options: newOptions });
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add Option
                  </Button>
                </div>
              )}

              <div className="flex items-center gap-2">
                <Switch
                  checked={selectedQuestion.required}
                  onCheckedChange={(checked) => {
                    const updated = { ...selectedQuestion, required: checked };
                    setSelectedQuestion(updated);
                    updateQuestion(selectedQuestion.id, { required: checked });
                  }}
                />
                <Label>Required question</Label>
              </div>

              {/* Branching Logic */}
              <div className="space-y-4 pt-4 border-t">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold">Question Branching</Label>
                  <p className="text-xs text-muted-foreground">
                    Choose where clients go based on their answer
                  </p>
                </div>

                {selectedQuestion.type === "yesno" && (
                  <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">If client answers "Yes"</Label>
                      <Select
                        value={(selectedQuestion as any).branchLogic?.yesTarget || "next"}
                        onValueChange={(value) => {
                          const updated = {
                            ...selectedQuestion,
                            branchLogic: {
                              ...(selectedQuestion as any).branchLogic,
                              yesTarget: value === "next" ? undefined : value,
                            },
                          };
                          setSelectedQuestion(updated);
                          updateQuestion(selectedQuestion.id, updated);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="next">Continue to next question</SelectItem>
                          {questions
                            .filter((q) => q.id !== selectedQuestion.id)
                            .map((q) => (
                              <SelectItem key={q.id} value={q.id}>
                                Jump to: {q.label || "Untitled question"}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-medium">If client answers "No"</Label>
                      <Select
                        value={(selectedQuestion as any).branchLogic?.noTarget || "next"}
                        onValueChange={(value) => {
                          const updated = {
                            ...selectedQuestion,
                            branchLogic: {
                              ...(selectedQuestion as any).branchLogic,
                              noTarget: value === "next" ? undefined : value,
                            },
                          };
                          setSelectedQuestion(updated);
                          updateQuestion(selectedQuestion.id, updated);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="next">Continue to next question</SelectItem>
                          {questions
                            .filter((q) => q.id !== selectedQuestion.id)
                            .map((q) => (
                              <SelectItem key={q.id} value={q.id}>
                                Jump to: {q.label || "Untitled question"}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {((selectedQuestion as any).branchLogic?.yesTarget || (selectedQuestion as any).branchLogic?.noTarget) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const updated = { ...selectedQuestion, branchLogic: undefined };
                          setSelectedQuestion(updated);
                          updateQuestion(selectedQuestion.id, updated);
                        }}
                      >
                        Clear all branching
                      </Button>
                    )}
                  </div>
                )}

                {(selectedQuestion.type === "select" || selectedQuestion.type === "multiselect") && (
                  <div className="space-y-3 p-4 border rounded-lg bg-muted/50">
                    <Label className="text-sm font-medium">Branch by option</Label>
                    {selectedQuestion.options?.map((option, i) => (
                      <div key={i} className="space-y-1">
                        <Label className="text-xs text-muted-foreground">If "{option}"</Label>
                        <Select
                          value={(selectedQuestion as any).branchLogic?.optionTargets?.[option] || "next"}
                          onValueChange={(value) => {
                            const updated = {
                              ...selectedQuestion,
                              branchLogic: {
                                ...(selectedQuestion as any).branchLogic,
                                optionTargets: {
                                  ...(selectedQuestion as any).branchLogic?.optionTargets,
                                  [option]: value === "next" ? undefined : value,
                                },
                              },
                            };
                            setSelectedQuestion(updated);
                            updateQuestion(selectedQuestion.id, updated);
                          }}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="next">Continue to next question</SelectItem>
                            {questions
                              .filter((q) => q.id !== selectedQuestion.id)
                              .map((q) => (
                                <SelectItem key={q.id} value={q.id}>
                                  Jump to: {q.label || "Untitled question"}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter className="flex justify-between">
            <Button 
              variant="destructive" 
              onClick={() => {
                if (selectedQuestion) {
                  deleteQuestion(selectedQuestion.id);
                }
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
            <Button 
              onClick={() => setEditDialogOpen(false)}
              disabled={!selectedQuestion?.label.trim()}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
