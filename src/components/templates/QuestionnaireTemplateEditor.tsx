import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, GripVertical, Settings, Eye, Copy, ChevronDown, ChevronUp } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface QuestionnaireQuestion {
  id: string;
  type: "text" | "longtext" | "number" | "date" | "yesno" | "select" | "multiselect" | "file" | "repeatable";
  label: string;
  helpText?: string;
  placeholder?: string;
  required: boolean;
  options?: string[]; // For select/multiselect
  validation?: {
    min?: number;
    max?: number;
    minDate?: string;
    maxDate?: string;
    pattern?: string;
  };
  logic?: {
    conditions: Array<{
      questionId: string;
      operator: "is" | "is_not" | "contains" | "greater_than" | "less_than";
      value: string;
    }>;
    action: "show" | "hide" | "jump_to";
    targetQuestionId?: string;
  };
  repeatableConfig?: {
    minItems?: number;
    maxItems?: number;
    addButtonLabel?: string;
    fields: Omit<QuestionnaireQuestion, "repeatableConfig">[];
  };
}

interface QuestionnaireTemplateEditorProps {
  content: any;
  onChange: (content: any) => void;
}

export default function QuestionnaireTemplateEditor({ content, onChange }: QuestionnaireTemplateEditorProps) {
  const questions: QuestionnaireQuestion[] = content.questions || [];
  const settings = content.settings || {
    allowSaveAndResume: true,
    showProgressBar: true,
    thankYouText: "Thank you for completing this questionnaire!",
  };

  const [previewMode, setPreviewMode] = useState(false);
  const [currentPreviewQuestion, setCurrentPreviewQuestion] = useState(0);

  const addQuestion = (type: QuestionnaireQuestion["type"]) => {
    const newQuestion: QuestionnaireQuestion = {
      id: crypto.randomUUID(),
      type,
      label: getDefaultLabel(type),
      required: false,
    };

    if (type === "select" || type === "multiselect") {
      newQuestion.options = ["Option 1", "Option 2"];
    }

    if (type === "repeatable") {
      newQuestion.repeatableConfig = {
        addButtonLabel: "Add another",
        fields: [],
      };
    }

    onChange({ ...content, questions: [...questions, newQuestion] });
  };

  const getDefaultLabel = (type: string) => {
    const labels: Record<string, string> = {
      text: "What is your answer?",
      longtext: "Please provide details",
      number: "Enter a number",
      date: "Select a date",
      yesno: "Yes or No?",
      select: "Choose an option",
      multiselect: "Select all that apply",
      file: "Upload your documents",
      repeatable: "Add items",
    };
    return labels[type] || "Question";
  };

  const updateQuestion = (questionId: string, updates: Partial<QuestionnaireQuestion>) => {
    const updatedQuestions = questions.map((q) =>
      q.id === questionId ? { ...q, ...updates } : q
    );
    onChange({ ...content, questions: updatedQuestions });
  };

  const deleteQuestion = (questionId: string) => {
    onChange({ ...content, questions: questions.filter((q) => q.id !== questionId) });
  };

  const moveQuestion = (questionId: string, direction: "up" | "down") => {
    const index = questions.findIndex((q) => q.id === questionId);
    if (
      (direction === "up" && index === 0) ||
      (direction === "down" && index === questions.length - 1)
    ) {
      return;
    }

    const newQuestions = [...questions];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    [newQuestions[index], newQuestions[targetIndex]] = [newQuestions[targetIndex], newQuestions[index]];
    onChange({ ...content, questions: newQuestions });
  };

  const duplicateQuestion = (questionId: string) => {
    const question = questions.find((q) => q.id === questionId);
    if (!question) return;

    const duplicate = { ...question, id: crypto.randomUUID(), label: `${question.label} (copy)` };
    const index = questions.findIndex((q) => q.id === questionId);
    const newQuestions = [...questions];
    newQuestions.splice(index + 1, 0, duplicate);
    onChange({ ...content, questions: newQuestions });
  };

  const updateSettings = (updates: Partial<typeof settings>) => {
    onChange({ ...content, settings: { ...settings, ...updates } });
  };

  if (previewMode) {
    const currentQ = questions[currentPreviewQuestion];
    const progress = ((currentPreviewQuestion + 1) / questions.length) * 100;

    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Preview Mode</CardTitle>
          <Button variant="outline" onClick={() => setPreviewMode(false)}>
            Exit Preview
          </Button>
        </CardHeader>
        <CardContent>
          <div className="max-w-2xl mx-auto space-y-6">
            {settings.showProgressBar && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Question {currentPreviewQuestion + 1} of {questions.length}</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {currentQ && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <h3 className="text-2xl font-semibold">
                    {currentQ.label}
                    {currentQ.required && <span className="text-destructive ml-1">*</span>}
                  </h3>
                  {currentQ.helpText && (
                    <p className="text-muted-foreground">{currentQ.helpText}</p>
                  )}
                </div>

                <div className="py-4">
                  {currentQ.type === "text" && (
                    <Input placeholder={currentQ.placeholder} className="text-lg" />
                  )}
                  {currentQ.type === "longtext" && (
                    <Textarea placeholder={currentQ.placeholder} rows={5} className="text-lg" />
                  )}
                  {currentQ.type === "number" && (
                    <Input type="number" placeholder={currentQ.placeholder} className="text-lg" />
                  )}
                  {currentQ.type === "date" && (
                    <Input type="date" className="text-lg" />
                  )}
                  {currentQ.type === "yesno" && (
                    <div className="flex gap-4">
                      <Button variant="outline" size="lg" className="flex-1">Yes</Button>
                      <Button variant="outline" size="lg" className="flex-1">No</Button>
                    </div>
                  )}
                  {currentQ.type === "select" && (
                    <Select>
                      <SelectTrigger className="text-lg">
                        <SelectValue placeholder="Choose an option" />
                      </SelectTrigger>
                      <SelectContent>
                        {currentQ.options?.map((opt, i) => (
                          <SelectItem key={i} value={opt}>{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {currentQ.type === "file" && (
                    <div className="border-2 border-dashed rounded-lg p-8 text-center">
                      <p className="text-muted-foreground">Click or drag files here to upload</p>
                    </div>
                  )}
                </div>

                <div className="flex justify-between pt-4">
                  <Button
                    variant="outline"
                    onClick={() => setCurrentPreviewQuestion(Math.max(0, currentPreviewQuestion - 1))}
                    disabled={currentPreviewQuestion === 0}
                  >
                    Back
                  </Button>
                  <Button
                    onClick={() =>
                      currentPreviewQuestion < questions.length - 1
                        ? setCurrentPreviewQuestion(currentPreviewQuestion + 1)
                        : setPreviewMode(false)
                    }
                  >
                    {currentPreviewQuestion < questions.length - 1 ? "Next" : "Finish"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Questionnaire Builder</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setPreviewMode(true)}>
              <Eye className="mr-2 h-4 w-4" />
              Preview
            </Button>
            <Button onClick={() => addQuestion("text")}>
              <Plus className="mr-2 h-4 w-4" />
              Add Question
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="questions">
            <TabsList>
              <TabsTrigger value="questions">Questions ({questions.length})</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>

            <TabsContent value="questions" className="space-y-4">
              {questions.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed rounded-lg">
                  <p className="text-muted-foreground mb-4">No questions yet</p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    <Button variant="outline" onClick={() => addQuestion("text")}>Short Text</Button>
                    <Button variant="outline" onClick={() => addQuestion("longtext")}>Long Text</Button>
                    <Button variant="outline" onClick={() => addQuestion("number")}>Number</Button>
                    <Button variant="outline" onClick={() => addQuestion("date")}>Date</Button>
                    <Button variant="outline" onClick={() => addQuestion("yesno")}>Yes/No</Button>
                    <Button variant="outline" onClick={() => addQuestion("select")}>Dropdown</Button>
                    <Button variant="outline" onClick={() => addQuestion("multiselect")}>Checkboxes</Button>
                    <Button variant="outline" onClick={() => addQuestion("file")}>File Upload</Button>
                    <Button variant="outline" onClick={() => addQuestion("repeatable")}>Repeatable Group</Button>
                  </div>
                </div>
              ) : (
                <Accordion type="single" collapsible className="space-y-4">
                  {questions.map((question, index) => (
                    <AccordionItem key={question.id} value={question.id} className="border rounded-lg">
                      <div className="flex items-center gap-2 p-4">
                        <GripVertical className="h-5 w-5 text-muted-foreground cursor-move" />
                        <Badge variant="outline">{question.type}</Badge>
                        <AccordionTrigger className="flex-1 hover:no-underline">
                          <div className="flex items-center gap-2 text-left">
                            <span className="font-medium">{question.label}</span>
                            {question.required && <Badge variant="destructive" className="text-xs">Required</Badge>}
                            {question.logic && <Badge variant="secondary" className="text-xs">Has Logic</Badge>}
                          </div>
                        </AccordionTrigger>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => moveQuestion(question.id, "up")}
                            disabled={index === 0}
                          >
                            <ChevronUp className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => moveQuestion(question.id, "down")}
                            disabled={index === questions.length - 1}
                          >
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => duplicateQuestion(question.id)}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteQuestion(question.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <AccordionContent>
                        <div className="p-4 pt-0 space-y-4 border-t">
                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                              <Label>Question Label *</Label>
                              <Input
                                value={question.label}
                                onChange={(e) => updateQuestion(question.id, { label: e.target.value })}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Question Type</Label>
                              <Select
                                value={question.type}
                                onValueChange={(value) =>
                                  updateQuestion(question.id, { type: value as any })
                                }
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
                                  <SelectItem value="repeatable">Repeatable Group</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label>Help Text (optional)</Label>
                            <Input
                              value={question.helpText || ""}
                              onChange={(e) => updateQuestion(question.id, { helpText: e.target.value })}
                              placeholder="Additional instructions for this question"
                            />
                          </div>

                          <div className="space-y-2">
                            <Label>Placeholder (optional)</Label>
                            <Input
                              value={question.placeholder || ""}
                              onChange={(e) => updateQuestion(question.id, { placeholder: e.target.value })}
                              placeholder="Placeholder text"
                            />
                          </div>

                          {(question.type === "select" || question.type === "multiselect") && (
                            <div className="space-y-2">
                              <Label>Options</Label>
                              {question.options?.map((opt, i) => (
                                <div key={i} className="flex gap-2">
                                  <Input
                                    value={opt}
                                    onChange={(e) => {
                                      const newOptions = [...(question.options || [])];
                                      newOptions[i] = e.target.value;
                                      updateQuestion(question.id, { options: newOptions });
                                    }}
                                  />
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                      const newOptions = question.options?.filter((_, idx) => idx !== i);
                                      updateQuestion(question.id, { options: newOptions });
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
                                  const newOptions = [...(question.options || []), `Option ${(question.options?.length || 0) + 1}`];
                                  updateQuestion(question.id, { options: newOptions });
                                }}
                              >
                                <Plus className="mr-2 h-4 w-4" />
                                Add Option
                              </Button>
                            </div>
                          )}

                          <div className="flex items-center gap-2">
                            <Switch
                              checked={question.required}
                              onCheckedChange={(checked) =>
                                updateQuestion(question.id, { required: checked })
                              }
                            />
                            <Label>Required</Label>
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
            </TabsContent>

            <TabsContent value="settings" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Questionnaire Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={settings.allowSaveAndResume}
                      onCheckedChange={(checked) =>
                        updateSettings({ allowSaveAndResume: checked })
                      }
                    />
                    <Label>Allow clients to save and resume later</Label>
                  </div>

                  <div className="flex items-center gap-2">
                    <Switch
                      checked={settings.showProgressBar}
                      onCheckedChange={(checked) =>
                        updateSettings({ showProgressBar: checked })
                      }
                    />
                    <Label>Show progress bar</Label>
                  </div>

                  <div className="space-y-2">
                    <Label>Thank You Message</Label>
                    <Textarea
                      value={settings.thankYouText}
                      onChange={(e) => updateSettings({ thankYouText: e.target.value })}
                      rows={3}
                      placeholder="Message shown after submission"
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
