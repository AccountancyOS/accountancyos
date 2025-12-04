import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  Plus, 
  MoreHorizontal, 
  FileCheck, 
  UserPlus, 
  UserMinus, 
  Coins,
  Eye,
  Loader2
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { CS01WorkpaperTab } from "./CS01WorkpaperTab";
import { AP01WorkpaperDialog } from "./AP01WorkpaperDialog";
import { TM01WorkpaperDialog } from "./TM01WorkpaperDialog";
import { SH01WorkpaperDialog } from "./SH01WorkpaperDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface CompanyCoSecJobsTabProps {
  companyId: string;
  organizationId: string;
}

type CoSecFilingType = "CS01" | "AP01" | "TM01" | "SH01";

export function CompanyCoSecJobsTab({ companyId, organizationId }: CompanyCoSecJobsTabProps) {
  const queryClient = useQueryClient();
  const [selectedJob, setSelectedJob] = useState<any>(null);
  const [showCS01Workpaper, setShowCS01Workpaper] = useState(false);
  const [showAP01Dialog, setShowAP01Dialog] = useState(false);
  const [showTM01Dialog, setShowTM01Dialog] = useState(false);
  const [showSH01Dialog, setShowSH01Dialog] = useState(false);

  // Fetch CoSec jobs for this company
  const { data: jobs, isLoading } = useQuery({
    queryKey: ["cosec-jobs", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select(`
          *,
          filings(id, status, filing_type, filed_at)
        `)
        .eq("company_id", companyId)
        .in("service_type", ["CS01", "AP01", "TM01", "TM02", "SH01", "PSC01", "PSC04", "PSC07", "CH01"])
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch company details for CS01 creation
  const { data: company } = useQuery({
    queryKey: ["company-cosec", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("company_name, confirmation_statement_next_due")
        .eq("id", companyId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Create new CoSec job
  const createJobMutation = useMutation({
    mutationFn: async (filingType: CoSecFilingType) => {
      const jobName = getJobName(filingType, company?.company_name || "Company");
      
      const { data, error } = await supabase
        .from("jobs")
        .insert({
          organization_id: organizationId,
          company_id: companyId,
          job_name: jobName,
          service_type: filingType,
          status: "not_started",
          priority: "medium",
        })
        .select()
        .single();
      
      if (error) throw error;
      return { job: data, filingType };
    },
    onSuccess: ({ job, filingType }) => {
      toast.success(`${filingType} job created`);
      queryClient.invalidateQueries({ queryKey: ["cosec-jobs", companyId] });
      
      // Open appropriate dialog
      setSelectedJob(job);
      if (filingType === "CS01") {
        setShowCS01Workpaper(true);
      } else if (filingType === "AP01") {
        setShowAP01Dialog(true);
      } else if (filingType === "TM01") {
        setShowTM01Dialog(true);
      } else if (filingType === "SH01") {
        setShowSH01Dialog(true);
      }
    },
    onError: (error: any) => {
      toast.error("Failed to create job", { description: error.message });
    },
  });

  const handleOpenJob = (job: any) => {
    setSelectedJob(job);
    if (job.service_type === "CS01") {
      setShowCS01Workpaper(true);
    } else if (job.service_type === "AP01") {
      setShowAP01Dialog(true);
    } else if (job.service_type === "TM01") {
      setShowTM01Dialog(true);
    } else if (job.service_type === "SH01") {
      setShowSH01Dialog(true);
    }
  };

  const getJobName = (filingType: CoSecFilingType, companyName: string): string => {
    const year = new Date().getFullYear();
    const names: Record<CoSecFilingType, string> = {
      CS01: `CS01 Confirmation Statement - ${year}`,
      AP01: `AP01 Director Appointment - ${year}`,
      TM01: `TM01 Director Termination - ${year}`,
      SH01: `SH01 Share Allotment - ${year}`,
    };
    return names[filingType];
  };

  const getFilingTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      CS01: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
      AP01: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
      TM01: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
      SH01: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
    };
    return colors[type] || "bg-gray-100 text-gray-800";
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      completed: "default",
      in_progress: "secondary",
      not_started: "outline",
      filed: "default",
    };
    return variants[status] || "outline";
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Actions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Company Secretarial Jobs</CardTitle>
              <CardDescription>
                Manage CS01, appointments, resignations, and share transactions
              </CardDescription>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  New Filing
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => createJobMutation.mutate("CS01")}>
                  <FileCheck className="h-4 w-4 mr-2" />
                  CS01 Confirmation Statement
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => createJobMutation.mutate("AP01")}>
                  <UserPlus className="h-4 w-4 mr-2" />
                  AP01 Appoint Director
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => createJobMutation.mutate("TM01")}>
                  <UserMinus className="h-4 w-4 mr-2" />
                  TM01 Terminate Director
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => createJobMutation.mutate("SH01")}>
                  <Coins className="h-4 w-4 mr-2" />
                  SH01 Allot Shares
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
      </Card>

      {/* Jobs Table */}
      {jobs && jobs.length > 0 ? (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Filing Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => {
                const filing = job.filings?.[0];
                return (
                  <TableRow 
                    key={job.id} 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleOpenJob(job)}
                  >
                    <TableCell className="font-medium">{job.job_name}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getFilingTypeBadge(job.service_type)}`}>
                        {job.service_type}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadge(job.status)}>
                        {job.status.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {filing ? (
                        <Badge variant={filing.status === "filed" ? "default" : "secondary"}>
                          {filing.status.replace(/_/g, " ")}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">Not created</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {format(new Date(job.created_at), "d MMM yyyy")}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleOpenJob(job)}>
                            <Eye className="h-4 w-4 mr-2" />
                            Open Workpaper
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <FileCheck className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">No CoSec Jobs</h3>
            <p className="text-muted-foreground text-sm mt-1">
              Create your first company secretarial filing using the button above
            </p>
          </CardContent>
        </Card>
      )}

      {/* CS01 Workpaper Dialog */}
      <Dialog open={showCS01Workpaper} onOpenChange={setShowCS01Workpaper}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>CS01 Confirmation Statement</DialogTitle>
            <DialogDescription>
              Review and file the confirmation statement
            </DialogDescription>
          </DialogHeader>
          <CS01WorkpaperTab 
            companyId={companyId} 
            jobId={selectedJob?.id}
          />
        </DialogContent>
      </Dialog>

      {/* AP01 Dialog */}
      <AP01WorkpaperDialog
        open={showAP01Dialog}
        onOpenChange={setShowAP01Dialog}
        companyId={companyId}
        organizationId={organizationId}
        jobId={selectedJob?.id}
      />

      {/* TM01 Dialog */}
      <TM01WorkpaperDialog
        open={showTM01Dialog}
        onOpenChange={setShowTM01Dialog}
        companyId={companyId}
        organizationId={organizationId}
        jobId={selectedJob?.id}
      />

      {/* SH01 Dialog */}
      <SH01WorkpaperDialog
        open={showSH01Dialog}
        onOpenChange={setShowSH01Dialog}
        companyId={companyId}
        organizationId={organizationId}
        jobId={selectedJob?.id}
      />
    </div>
  );
}
