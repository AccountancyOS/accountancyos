import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import { ChevronLeft, ChevronRight, Check, AlertCircle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

interface QuestionnaireData {
  id: string;
  name: string | null;
  questions: {
    questions: Array<{
      id: string;
      type: string;
      label: string;
      required?: boolean;
      helpText?: string;
      placeholder?: string;
      options?: string[];
      branchLogic?: {
        yesTarget?: string;
        noTarget?: string;
        optionTargets?: Record<string, string>;
      };
    }>;
    settings?: {
      showProgressBar?: boolean;
      allowSaveAndResume?: boolean;
      thankYouText?: string;
    };
  };
  status: string;
  period_label: string | null;
  submitted_at: string | null;
}

interface ResponseData {
  id: string;
  question_id: string;
  answer_text: string | null;
  answer_number: number | null;
  answer_boolean: boolean | null;
  answer_date: string | null;
  answer_array: string[] | null;
}

export default function QuestionnaireResponse() {
  const { instanceId } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  // Fetch questionnaire via secure RPC
  const { data: instance, isLoading, error: fetchError } = useQuery({
    queryKey: ["questionnaire-instance", instanceId, token],
    queryFn: async (): Promise<QuestionnaireData> => {
      if (!instanceId || !token) throw new Error("Missing instance or token");
      
      const { data, error } = await supabase.rpc("get_questionnaire_by_token", {
        p_instance_id: instanceId,
        p_token: token,
      });

      if (error) {
        // Handle specific error messages
        if (error.message.includes("expired")) {
          throw new Error("This link has expired. Please contact your accountant for a new link.");
        }
        if (error.message.includes("revoked")) {
          throw new Error("This link is no longer valid. Please contact your accountant for a new link.");
        }
        if (error.message.includes("Invalid")) {
          throw new Error("Invalid link. Please check the URL or contact your accountant.");
        }
        if (error.message.includes("Rate limit")) {
          throw new Error("Too many attempts. Please try again in a few minutes.");
        }
        throw error;
      }
      
      return data as QuestionnaireData;
    },
    enabled: !!instanceId && !!token,
    retry: false,
  });

  // Fetch existing responses via secure RPC
  const { data: existingResponses } = useQuery({
    queryKey: ["questionnaire-responses", instanceId, token],
    queryFn: async (): Promise<ResponseData[]> => {
      if (!instanceId || !token) return [];
      
      const { data, error } = await supabase.rpc("get_questionnaire_responses_by_token", {
        p_instance_id: instanceId,
        p_token: token,
      });

      if (error) {
        console.error("Error fetching responses:", error);
        return [];
      }
      
      return (data as unknown as ResponseData[]) || [];
    },
    enabled: !!instanceId && !!token && !!instance,
  });

  useEffect(() => {
    if (fetchError) {
      setLinkError((fetchError as Error).message);
    }
  }, [fetchError]);

  useEffect(() => {
    if (existingResponses && existingResponses.length > 0) {
      const loadedAnswers: Record<string, any> = {};
      existingResponses.forEach((response) => {
        if (response.answer_text) loadedAnswers[response.question_id] = response.answer_text;
        if (response.answer_number !== null) loadedAnswers[response.question_id] = response.answer_number;
        if (response.answer_boolean !== null) loadedAnswers[response.question_id] = response.answer_boolean;
        if (response.answer_date) loadedAnswers[response.question_id] = response.answer_date;
        if (response.answer_array) loadedAnswers[response.question_id] = response.answer_array;
      });
      setAnswers(loadedAnswers);
    }
  }, [existingResponses]);

  // Save answer via secure RPC
  const saveAnswerMutation = useMutation({
    mutationFn: async ({ questionId, answer }: { questionId: string; answer: any }) => {
      if (!instanceId || !token) throw new Error("Missing instance or token");

      const params: {
        p_instance_id: string;
        p_token: string;
        p_question_id: string;
        p_answer_text?: string;
        p_answer_number?: number;
        p_answer_boolean?: boolean;
        p_answer_date?: string;
        p_answer_array?: string[];
      } = {
        p_instance_id: instanceId,
        p_token: token,
        p_question_id: questionId,
      };

      if (typeof answer === "string") params.p_answer_text = answer;
      else if (typeof answer === "number") params.p_answer_number = answer;
      else if (typeof answer === "boolean") params.p_answer_boolean = answer;
      else if (answer instanceof Date) params.p_answer_date = answer.toISOString().split("T")[0];
      else if (Array.isArray(answer)) params.p_answer_array = answer;

      const { error } = await supabase.rpc("save_questionnaire_answer_by_token", params);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["questionnaire-responses", instanceId, token] });
    },
    onError: (error: Error) => {
      if (error.message.includes("expired") || error.message.includes("revoked") || error.message.includes("Invalid")) {
        setLinkError(error.message);
      }
    },
  });

  // Submit questionnaire via secure RPC
  const submitQuestionnaireMutation = useMutation({
    mutationFn: async () => {
      if (!instanceId || !token) throw new Error("Missing instance or token");

      const { error } = await supabase.rpc("submit_questionnaire_by_token", {
        p_instance_id: instanceId,
        p_token: token,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      setIsSubmitted(true);
      toast({
        title: "Success!",
        description: "Your responses have been submitted",
      });
    },
    onError: (error: Error) => {
      if (error.message.includes("expired") || error.message.includes("revoked") || error.message.includes("Invalid")) {
        setLinkError(error.message);
      } else {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      }
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading questionnaire...</p>
      </div>
    );
  }

  // Error state - link expired/revoked/invalid
  if (linkError || !instance) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <div className="flex justify-center">
              <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertCircle className="h-8 w-8 text-destructive" />
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">Link Unavailable</h2>
              <p className="text-muted-foreground">
                {linkError || "Questionnaire not found or link has expired"}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              Please contact your accountant if you need a new link.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isSubmitted || instance.status === "submitted") {
    const questionsData = instance.questions;
    const settings = questionsData?.settings || {};
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <Card className="max-w-2xl w-full">
          <CardContent className="pt-12 pb-12 text-center space-y-6">
            <div className="flex justify-center">
              <div className="h-20 w-20 rounded-full bg-green-100 flex items-center justify-center">
                <Check className="h-10 w-10 text-green-600" />
              </div>
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-bold">Thank you!</h1>
              <p className="text-muted-foreground text-lg">
                {settings.thankYouText || "Your responses have been submitted successfully"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const questionsData = instance.questions;
  const questions = questionsData?.questions || [];
  const settings = questionsData?.settings || {};
  const currentQuestion = questions[currentQuestionIndex];
  const progress = ((currentQuestionIndex + 1) / questions.length) * 100;
  const currentAnswer = answers[currentQuestion?.id];

  const isCurrentQuestionAnswered = () => {
    if (!currentQuestion) return false;
    if (!currentQuestion.required) return true;
    
    const answer = answers[currentQuestion.id];
    if (answer === undefined || answer === null || answer === "") return false;
    if (Array.isArray(answer) && answer.length === 0) return false;
    
    return true;
  };

  const handleNext = () => {
    if (currentQuestion && isCurrentQuestionAnswered()) {
      saveAnswerMutation.mutate({
        questionId: currentQuestion.id,
        answer: answers[currentQuestion.id],
      });
    }

    // Check for branch logic
    if (currentQuestion?.branchLogic) {
      const answer = answers[currentQuestion.id];
      let targetQuestionId: string | undefined;

      // Handle Yes/No branching
      if (currentQuestion.type === "yesno") {
        if (answer === "true" && currentQuestion.branchLogic.yesTarget) {
          targetQuestionId = currentQuestion.branchLogic.yesTarget;
        } else if (answer === "false" && currentQuestion.branchLogic.noTarget) {
          targetQuestionId = currentQuestion.branchLogic.noTarget;
        }
      }

      // Handle select/multiselect branching
      if ((currentQuestion.type === "select" || currentQuestion.type === "multiselect") && currentQuestion.branchLogic.optionTargets) {
        targetQuestionId = currentQuestion.branchLogic.optionTargets[answer as string];
      }

      // If we have a target, jump to it
      if (targetQuestionId) {
        const targetIndex = questions.findIndex((q) => q.id === targetQuestionId);
        if (targetIndex !== -1) {
          setCurrentQuestionIndex(targetIndex);
          return;
        }
      }
    }

    // Default: move to next question or submit
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    } else {
      submitQuestionnaireMutation.mutate();
    }
  };

  const handleBack = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  };

  const updateAnswer = (questionId: string, value: any) => {
    setAnswers({ ...answers, [questionId]: value });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted p-4">
      <div className="max-w-3xl mx-auto pt-8 pb-16">
        {/* Progress Bar */}
        {settings.showProgressBar && (
          <div className="mb-8 space-y-2">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Question {currentQuestionIndex + 1} of {questions.length}</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        )}

        {/* Question Card */}
        {currentQuestion && (
          <Card className="shadow-xl">
            <CardContent className="pt-12 pb-8 px-8 space-y-8">
              <div className="space-y-3">
                <h2 className="text-3xl font-bold leading-tight">
                  {currentQuestion.label}
                  {currentQuestion.required && <span className="text-destructive ml-1">*</span>}
                </h2>
                {currentQuestion.helpText && (
                  <p className="text-muted-foreground text-lg">
                    {currentQuestion.helpText}
                  </p>
                )}
              </div>

              <div className="space-y-4">
                {/* Text Input */}
                {currentQuestion.type === "text" && (
                  <Input
                    value={currentAnswer || ""}
                    onChange={(e) => updateAnswer(currentQuestion.id, e.target.value)}
                    placeholder={currentQuestion.placeholder}
                    className="text-lg h-14"
                  />
                )}

                {/* Long Text */}
                {currentQuestion.type === "longtext" && (
                  <Textarea
                    value={currentAnswer || ""}
                    onChange={(e) => updateAnswer(currentQuestion.id, e.target.value)}
                    placeholder={currentQuestion.placeholder}
                    rows={6}
                    className="text-lg"
                  />
                )}

                {/* Number */}
                {currentQuestion.type === "number" && (
                  <Input
                    type="number"
                    value={currentAnswer || ""}
                    onChange={(e) => updateAnswer(currentQuestion.id, parseFloat(e.target.value))}
                    placeholder={currentQuestion.placeholder}
                    className="text-lg h-14"
                  />
                )}

                {/* Date */}
                {currentQuestion.type === "date" && (
                  <Input
                    type="date"
                    value={currentAnswer || ""}
                    onChange={(e) => updateAnswer(currentQuestion.id, e.target.value)}
                    className="text-lg h-14"
                  />
                )}

                {/* Yes/No */}
                {currentQuestion.type === "yesno" && (
                  <div className="grid grid-cols-2 gap-4">
                    <Button
                      variant={currentAnswer === "true" ? "default" : "outline"}
                      size="lg"
                      onClick={() => updateAnswer(currentQuestion.id, "true")}
                      className="h-16 text-lg"
                    >
                      Yes
                    </Button>
                    <Button
                      variant={currentAnswer === "false" ? "default" : "outline"}
                      size="lg"
                      onClick={() => updateAnswer(currentQuestion.id, "false")}
                      className="h-16 text-lg"
                    >
                      No
                    </Button>
                  </div>
                )}

                {/* Select */}
                {currentQuestion.type === "select" && (
                  <Select
                    value={currentAnswer || ""}
                    onValueChange={(value) => updateAnswer(currentQuestion.id, value)}
                  >
                    <SelectTrigger className="h-14 text-lg">
                      <SelectValue placeholder="Choose an option" />
                    </SelectTrigger>
                    <SelectContent>
                      {currentQuestion.options?.map((option, i) => (
                        <SelectItem key={i} value={option} className="text-lg">
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {/* Multi-select */}
                {currentQuestion.type === "multiselect" && (
                  <div className="space-y-3">
                    {currentQuestion.options?.map((option, i) => {
                      const isChecked = Array.isArray(currentAnswer) && currentAnswer.includes(option);
                      return (
                        <div key={i} className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50">
                          <Checkbox
                            checked={isChecked}
                            onCheckedChange={(checked) => {
                              const current = Array.isArray(currentAnswer) ? currentAnswer : [];
                              if (checked) {
                                updateAnswer(currentQuestion.id, [...current, option]);
                              } else {
                                updateAnswer(currentQuestion.id, current.filter((v: string) => v !== option));
                              }
                            }}
                          />
                          <Label className="flex-1 cursor-pointer text-base">
                            {option}
                          </Label>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* File Upload */}
                {currentQuestion.type === "file" && (
                  <div className="border-2 border-dashed rounded-lg p-12 text-center">
                    <p className="text-muted-foreground mb-4">
                      File upload feature coming soon
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Navigation */}
        <div className="flex justify-between items-center mt-8">
          <Button
            variant="outline"
            size="lg"
            onClick={handleBack}
            disabled={currentQuestionIndex === 0}
            className="min-w-32"
          >
            <ChevronLeft className="mr-2 h-5 w-5" />
            Back
          </Button>
          <Button
            size="lg"
            onClick={handleNext}
            disabled={!isCurrentQuestionAnswered()}
            className="min-w-32"
          >
            {currentQuestionIndex < questions.length - 1 ? (
              <>
                Next
                <ChevronRight className="ml-2 h-5 w-5" />
              </>
            ) : (
              "Submit"
            )}
          </Button>
        </div>

        {/* Save & Resume (if enabled) */}
        {settings.allowSaveAndResume && (
          <div className="text-center mt-6">
            <p className="text-sm text-muted-foreground">
              Your progress is saved automatically. You can return to this link anytime.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
