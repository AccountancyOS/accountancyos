import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FileCheck, Search } from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { useState } from "react";

const FILING_TYPE_OPTIONS = [
  { value: "all", label: "All Types" },
  { value: "RTI_FPS", label: "RTI - FPS" },
  { value: "RTI_EPS", label: "RTI - EPS" },
  { value: "CIS_RETURN", label: "CIS Return" },
  { value: "self_assessment", label: "Self Assessment" },
  { value: "ct600", label: "Corporation Tax" },
  { value: "vat_return", label: "VAT Return" },
  { value: "companies_house", label: "Companies House" },
];

export default function Filings() {
  const navigate = useNavigate();
  const { organization } = useApp();
  const [searchQuery, setSearchQuery] = useState("");
  const [filingTypeFilter, setFilingTypeFilter] = useState("all");

  const { data: filings, isLoading, error } = useQuery({
    queryKey: ["filings", organization?.id, searchQuery, filingTypeFilter],
    queryFn: async () => {
      if (!organization?.id) return [];

      let query = supabase
        .from("filings")
        .select(`
          *,
          clients (first_name, last_name),
          companies (company_name),
          jobs (job_name)
        `)
        .eq("organization_id", organization.id)
        .order("created_at", { ascending: false });

      if (searchQuery) {
        query = query.or(
          `filing_type.ilike.%${searchQuery}%,tax_year.ilike.%${searchQuery}%`
        );
      }

      if (filingTypeFilter && filingTypeFilter !== "all") {
        query = query.eq("filing_type", filingTypeFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!organization?.id,
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "filed":
        return "bg-green-500";
      case "approved":
      case "ready_to_file":
        return "bg-blue-500";
      case "awaiting_approval":
        return "bg-yellow-500";
      case "rejected":
        return "bg-red-500";
      case "draft":
        return "bg-gray-400";
      default:
        return "bg-gray-500";
    }
  };

  const getFilingTypeLabel = (filingType: string) => {
    const option = FILING_TYPE_OPTIONS.find(o => o.value === filingType);
    return option?.label || filingType;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Filings</h1>
            <p className="text-muted-foreground mt-1">
              Manage statutory filings and submissions
            </p>
          </div>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by filing type or tax year..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={filingTypeFilter} onValueChange={setFilingTypeFilter}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  {FILING_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <div className="text-center py-8">Loading filings...</div>
            ) : filings && filings.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client/Company</TableHead>
                    <TableHead>Filing Type</TableHead>
                    <TableHead>Tax Year</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Tax Due/Refund</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filings.map((filing) => (
                    <TableRow key={filing.id}>
                      <TableCell>
                        {filing.clients
                          ? `${filing.clients.first_name} ${filing.clients.last_name}`
                          : filing.companies?.company_name || "N/A"}
                      </TableCell>
                      <TableCell className="font-medium">{getFilingTypeLabel(filing.filing_type)}</TableCell>
                      <TableCell>{filing.tax_year}</TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(filing.status)}>
                          {filing.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {filing.tax_due ? (
                          <span className="text-red-600">
                            £{filing.tax_due.toLocaleString()}
                          </span>
                        ) : filing.tax_refund ? (
                          <span className="text-green-600">
                            +£{filing.tax_refund.toLocaleString()}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        {format(new Date(filing.created_at), "d MMM yyyy")}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => navigate(`/filings/${filing.id}`)}
                        >
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-12">
                <FileCheck className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No filings found</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
