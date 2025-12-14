import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { format } from "date-fns";
import { toast } from "sonner";
import { Save, History, ChevronDown, AlertTriangle, Info } from "lucide-react";
import {
  getActiveVATRegistration,
  getVATRegistrationHistory,
  saveVATRegistration,
  validateSchemeEligibility,
  getSchemeDescription,
  FLAT_RATE_SECTORS,
  type VATRegistration,
  type VATScheme,
} from "@/lib/vat-scheme-service";

interface VATRegistrationSettingsProps {
  organizationId: string;
  entityId: string;
  entityType: 'company' | 'client';
  vrn?: string;
}

export function VATRegistrationSettings({
  organizationId,
  entityId,
  entityType,
  vrn,
}: VATRegistrationSettingsProps) {
  const queryClient = useQueryClient();
  const [showHistory, setShowHistory] = useState(false);
  const [formData, setFormData] = useState<Partial<VATRegistration>>({
    vrn: vrn || '',
    scheme: 'STANDARD',
    effective_from: new Date().toISOString().split('T')[0],
  });
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);

  // Fetch current registration
  const { data: currentRegistration, isLoading } = useQuery({
    queryKey: ['vat-registration', entityId, entityType],
    queryFn: () => getActiveVATRegistration(entityId, entityType),
  });

  // Fetch history
  const { data: history } = useQuery({
    queryKey: ['vat-registration-history', entityId, entityType],
    queryFn: () => getVATRegistrationHistory(entityId, entityType),
    enabled: showHistory,
  });

  // Initialize form with current registration
  useEffect(() => {
    if (currentRegistration) {
      setFormData({
        id: currentRegistration.id,
        vrn: currentRegistration.vrn,
        scheme: currentRegistration.scheme,
        flat_rate_percentage: currentRegistration.flat_rate_percentage,
        flat_rate_trade_sector: currentRegistration.flat_rate_trade_sector,
        flat_rate_first_year_discount: currentRegistration.flat_rate_first_year_discount,
        cash_scheme_joined_at: currentRegistration.cash_scheme_joined_at,
        annual_accounting_joined_at: currentRegistration.annual_accounting_joined_at,
        annual_accounting_payment_schedule: currentRegistration.annual_accounting_payment_schedule,
        partial_exemption_applicable: currentRegistration.partial_exemption_applicable,
        partial_exemption_rate: currentRegistration.partial_exemption_rate,
        partial_exemption_method: currentRegistration.partial_exemption_method,
        effective_from: currentRegistration.effective_from,
        notes: currentRegistration.notes,
      });
    }
  }, [currentRegistration]);

  // Validate on form change
  useEffect(() => {
    const result = validateSchemeEligibility(formData.scheme as VATScheme, {
      flatRatePercentage: formData.flat_rate_percentage,
    });
    setValidationWarnings(result.warnings);
  }, [formData]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      return saveVATRegistration(organizationId, entityId, entityType, formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vat-registration'] });
      toast.success('VAT registration saved');
    },
    onError: (error: Error) => {
      toast.error(`Failed to save: ${error.message}`);
    },
  });

  const handleSchemeChange = (scheme: VATScheme) => {
    setFormData(prev => ({
      ...prev,
      scheme,
      // Reset scheme-specific fields when changing schemes
      flat_rate_percentage: scheme === 'FLAT_RATE' ? prev.flat_rate_percentage : undefined,
      flat_rate_trade_sector: scheme === 'FLAT_RATE' ? prev.flat_rate_trade_sector : undefined,
      cash_scheme_joined_at: scheme === 'CASH_ACCOUNTING' ? prev.cash_scheme_joined_at : undefined,
      annual_accounting_joined_at: scheme === 'ANNUAL_ACCOUNTING' ? prev.annual_accounting_joined_at : undefined,
    }));
  };

  const handleSectorChange = (sector: string) => {
    const sectorData = FLAT_RATE_SECTORS[sector];
    setFormData(prev => ({
      ...prev,
      flat_rate_trade_sector: sector,
      flat_rate_percentage: prev.flat_rate_first_year_discount 
        ? sectorData.firstYearRate 
        : sectorData.rate,
    }));
  };

  if (isLoading) {
    return <div className="animate-pulse h-48 bg-muted rounded" />;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>VAT Registration Settings</CardTitle>
          <CardDescription>
            Configure VAT scheme and registration details
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* VRN */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="vrn">VAT Registration Number</Label>
              <Input
                id="vrn"
                value={formData.vrn || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, vrn: e.target.value }))}
                placeholder="GB123456789"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="effective_from">Effective From</Label>
              <Input
                id="effective_from"
                type="date"
                value={formData.effective_from || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, effective_from: e.target.value }))}
              />
            </div>
          </div>

          <Separator />

          {/* Scheme Selection */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>VAT Scheme</Label>
              <Select
                value={formData.scheme}
                onValueChange={(v) => handleSchemeChange(v as VATScheme)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="STANDARD">Standard VAT Accounting</SelectItem>
                  <SelectItem value="CASH_ACCOUNTING">Cash Accounting Scheme</SelectItem>
                  <SelectItem value="FLAT_RATE">Flat Rate Scheme</SelectItem>
                  <SelectItem value="ANNUAL_ACCOUNTING">Annual Accounting Scheme</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                {getSchemeDescription(formData.scheme as VATScheme)}
              </p>
            </div>

            {/* Flat Rate Scheme Options */}
            {formData.scheme === 'FLAT_RATE' && (
              <Card className="border-dashed">
                <CardContent className="pt-4 space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Trade Sector</Label>
                      <Select
                        value={formData.flat_rate_trade_sector || ''}
                        onValueChange={handleSectorChange}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select sector..." />
                        </SelectTrigger>
                        <SelectContent className="max-h-80">
                          {Object.entries(FLAT_RATE_SECTORS).map(([key, sector]) => (
                            <SelectItem key={key} value={key}>
                              {sector.name} ({sector.rate}%)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Flat Rate Percentage</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          step="0.5"
                          min="0"
                          max="100"
                          value={formData.flat_rate_percentage || ''}
                          onChange={(e) => setFormData(prev => ({ 
                            ...prev, 
                            flat_rate_percentage: parseFloat(e.target.value) || undefined 
                          }))}
                          className="w-24"
                        />
                        <span className="text-muted-foreground">%</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch
                      id="firstYearDiscount"
                      checked={formData.flat_rate_first_year_discount || false}
                      onCheckedChange={(checked) => {
                        const sector = formData.flat_rate_trade_sector;
                        const sectorData = sector ? FLAT_RATE_SECTORS[sector] : null;
                        setFormData(prev => ({
                          ...prev,
                          flat_rate_first_year_discount: checked,
                          flat_rate_percentage: sectorData 
                            ? (checked ? sectorData.firstYearRate : sectorData.rate)
                            : prev.flat_rate_percentage,
                        }));
                      }}
                    />
                    <Label htmlFor="firstYearDiscount" className="cursor-pointer">
                      First year discount (1% reduction)
                    </Label>
                  </div>
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      Under the Flat Rate Scheme, you pay a fixed percentage of your gross turnover as VAT. 
                      You cannot reclaim input VAT on most purchases.
                    </AlertDescription>
                  </Alert>
                </CardContent>
              </Card>
            )}

            {/* Cash Accounting Options */}
            {formData.scheme === 'CASH_ACCOUNTING' && (
              <Card className="border-dashed">
                <CardContent className="pt-4 space-y-4">
                  <div className="space-y-2">
                    <Label>Date Joined Cash Accounting</Label>
                    <Input
                      type="date"
                      value={formData.cash_scheme_joined_at || ''}
                      onChange={(e) => setFormData(prev => ({ 
                        ...prev, 
                        cash_scheme_joined_at: e.target.value 
                      }))}
                    />
                  </div>
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      Under Cash Accounting, VAT is only due when payment is received (sales) or made (purchases), 
                      not when invoices are raised. Threshold: £1.35m turnover.
                    </AlertDescription>
                  </Alert>
                </CardContent>
              </Card>
            )}

            {/* Annual Accounting Options */}
            {formData.scheme === 'ANNUAL_ACCOUNTING' && (
              <Card className="border-dashed">
                <CardContent className="pt-4 space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Date Joined Annual Accounting</Label>
                      <Input
                        type="date"
                        value={formData.annual_accounting_joined_at || ''}
                        onChange={(e) => setFormData(prev => ({ 
                          ...prev, 
                          annual_accounting_joined_at: e.target.value 
                        }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Interim Payment Schedule</Label>
                      <Select
                        value={formData.annual_accounting_payment_schedule || 'QUARTERLY'}
                        onValueChange={(v) => setFormData(prev => ({ 
                          ...prev, 
                          annual_accounting_payment_schedule: v as 'MONTHLY' | 'QUARTERLY'
                        }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="QUARTERLY">Quarterly (3 payments)</SelectItem>
                          <SelectItem value="MONTHLY">Monthly (9 payments)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      Under Annual Accounting, you submit one VAT return per year but make interim payments 
                      based on previous year's liability. Threshold: £1.35m turnover.
                    </AlertDescription>
                  </Alert>
                </CardContent>
              </Card>
            )}
          </div>

          <Separator />

          {/* Partial Exemption */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Switch
                id="partialExemption"
                checked={formData.partial_exemption_applicable || false}
                onCheckedChange={(checked) => setFormData(prev => ({ 
                  ...prev, 
                  partial_exemption_applicable: checked 
                }))}
              />
              <Label htmlFor="partialExemption" className="cursor-pointer">
                Partial Exemption Applies
              </Label>
            </div>

            {formData.partial_exemption_applicable && (
              <div className="grid gap-4 sm:grid-cols-2 pl-8">
                <div className="space-y-2">
                  <Label>Recovery Rate (%)</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={formData.partial_exemption_rate ? (Number(formData.partial_exemption_rate) * 100).toFixed(2) : ''}
                      onChange={(e) => setFormData(prev => ({ 
                        ...prev, 
                        partial_exemption_rate: parseFloat(e.target.value) / 100 || undefined 
                      }))}
                      className="w-24"
                    />
                    <span className="text-muted-foreground">%</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    e.g., 85% means 85% of input VAT is recoverable
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Method</Label>
                  <Select
                    value={formData.partial_exemption_method || 'STANDARD'}
                    onValueChange={(v) => setFormData(prev => ({ 
                      ...prev, 
                      partial_exemption_method: v as 'STANDARD' | 'SPECIAL'
                    }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="STANDARD">Standard Method</SelectItem>
                      <SelectItem value="SPECIAL">Special Method (HMRC agreed)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>

          {/* Validation Warnings */}
          {validationWarnings.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <ul className="list-disc pl-4">
                  {validationWarnings.map((warning, i) => (
                    <li key={i}>{warning}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-4">
            <Button
              variant="outline"
              onClick={() => setShowHistory(!showHistory)}
            >
              <History className="w-4 h-4 mr-2" />
              {showHistory ? 'Hide' : 'Show'} History
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || validationWarnings.some(w => w.includes('must be'))}
            >
              <Save className="w-4 h-4 mr-2" />
              {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* History Section */}
      <Collapsible open={showHistory} onOpenChange={setShowHistory}>
        <CollapsibleContent>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <History className="w-4 h-4" />
                Registration History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {history && history.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Scheme</TableHead>
                      <TableHead>Effective From</TableHead>
                      <TableHead>Effective To</TableHead>
                      <TableHead>Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((reg) => (
                      <TableRow key={reg.id}>
                        <TableCell>
                          <Badge variant="outline">{reg.scheme}</Badge>
                        </TableCell>
                        <TableCell>{format(new Date(reg.effective_from), 'dd MMM yyyy')}</TableCell>
                        <TableCell>
                          {reg.effective_to 
                            ? format(new Date(reg.effective_to), 'dd MMM yyyy')
                            : <Badge className="bg-green-500">Current</Badge>
                          }
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {reg.scheme === 'FLAT_RATE' && `${reg.flat_rate_percentage}%`}
                          {reg.partial_exemption_applicable && ` | PE: ${((reg.partial_exemption_rate || 0) * 100).toFixed(1)}%`}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-muted-foreground text-center py-4">No history available</p>
              )}
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
