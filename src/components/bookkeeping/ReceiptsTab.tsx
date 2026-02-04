import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Upload, Receipt, Image, Trash2, Link2, Eye, X } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency, formatDate } from "@/lib/format-utils";
import { TableSkeleton } from "@/components/ui/table-skeleton";

interface ReceiptsTabProps {
  entityType: 'client' | 'company';
  entityId: string;
}

const CATEGORIES = [
  "Office Supplies",
  "Travel",
  "Meals & Entertainment",
  "Professional Services",
  "Utilities",
  "Software & Subscriptions",
  "Equipment",
  "Motor Expenses",
  "Other",
];

export function ReceiptsTab({ entityType, entityId }: ReceiptsTabProps) {
  const { organization } = useOrganization();
  const { user } = useAuth();
  const organizationId = organization?.id;
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  
  // Form state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [receiptDate, setReceiptDate] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [vatAmount, setVatAmount] = useState("");
  const [category, setCategory] = useState("");
  const [notes, setNotes] = useState("");

  const { data: receipts, isLoading } = useQuery({
    queryKey: ['receipts', organizationId, entityType, entityId],
    queryFn: async () => {
      const query = supabase
        .from('receipts')
        .select(`
          *,
          bank_transaction:bank_transactions(id, description, amount, transaction_date)
        `)
        .eq('organization_id', organizationId!)
        .order('uploaded_at', { ascending: false });

      if (entityType === 'client') {
        query.eq('client_id', entityId);
      } else {
        query.eq('company_id', entityId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId && !!entityId,
  });

  const { data: unmatchedTransactions } = useQuery({
    queryKey: ['unmatched-transactions', organizationId, entityType, entityId],
    queryFn: async () => {
      const query = supabase
        .from('bank_transactions')
        .select('id, description, amount, transaction_date')
        .eq('organization_id', organizationId!)
        .eq('status', 'MATCHED')
        .is('matched_ledger_entry_id', null);

      if (entityType === 'client') {
        query.eq('client_id', entityId);
      } else {
        query.eq('company_id', entityId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId && !!entityId,
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile || !organizationId) throw new Error("No file selected");

      setUploading(true);
      
      // Upload file to storage
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${organizationId}/${entityType}/${entityId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(filePath, selectedFile);

      if (uploadError) throw uploadError;

      // Create receipt record
      const { error: insertError } = await supabase
        .from('receipts')
        .insert({
          organization_id: organizationId,
          client_id: entityType === 'client' ? entityId : null,
          company_id: entityType === 'company' ? entityId : null,
          file_path: filePath,
          file_name: selectedFile.name,
          file_size: selectedFile.size,
          mime_type: selectedFile.type,
          receipt_date: receiptDate || null,
          vendor_name: vendorName || null,
          total_amount: totalAmount ? parseFloat(totalAmount) : null,
          vat_amount: vatAmount ? parseFloat(vatAmount) : null,
          category: category || null,
          notes: notes || null,
          uploaded_by: user?.id,
          ocr_status: 'pending',
        });

      if (insertError) throw insertError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receipts'] });
      resetForm();
      setShowUploadDialog(false);
      toast.success("Receipt uploaded successfully");
    },
    onError: (error) => {
      toast.error("Failed to upload receipt");
      console.error(error);
    },
    onSettled: () => {
      setUploading(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (receipt: any) => {
      // Delete from storage
      await supabase.storage
        .from('receipts')
        .remove([receipt.file_path]);

      // Delete record
      const { error } = await supabase
        .from('receipts')
        .delete()
        .eq('id', receipt.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receipts'] });
      toast.success("Receipt deleted");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: any) => {
      const { error } = await supabase
        .from('receipts')
        .update(updates)
        .eq('id', selectedReceipt.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receipts'] });
      setShowDetailDialog(false);
      toast.success("Receipt updated");
    },
  });

  const resetForm = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setReceiptDate("");
    setVendorName("");
    setTotalAmount("");
    setVatAmount("");
    setCategory("");
    setNotes("");
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (file.type.startsWith('image/')) {
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);
      } else {
        setPreviewUrl(null);
      }
    }
  };

  const getReceiptUrl = async (filePath: string) => {
    const { data } = await supabase.storage
      .from('receipts')
      .createSignedUrl(filePath, 3600);
    return data?.signedUrl;
  };

  const handleViewReceipt = async (receipt: any) => {
    const url = await getReceiptUrl(receipt.file_path);
    if (url) {
      window.open(url, '_blank');
    }
  };

  if (isLoading) {
    return <TableSkeleton columns={7} rows={5} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">Receipts</h3>
          <p className="text-sm text-muted-foreground">
            Upload and manage receipts for expense tracking
          </p>
        </div>
        <Button onClick={() => setShowUploadDialog(true)}>
          <Upload className="h-4 w-4 mr-2" />
          Upload Receipt
        </Button>
      </div>

      {receipts?.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Receipt className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">No receipts yet</p>
            <p className="text-sm text-muted-foreground mb-4">
              Upload receipts to track expenses and attach to transactions
            </p>
            <Button onClick={() => setShowUploadDialog(true)}>
              <Upload className="h-4 w-4 mr-2" />
              Upload First Receipt
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">VAT</TableHead>
              <TableHead>Linked</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {receipts?.map((receipt) => (
              <TableRow key={receipt.id}>
                <TableCell>
                  {receipt.receipt_date 
                    ? formatDate(receipt.receipt_date, "dayMonthYear")
                    : <span className="text-muted-foreground">Not set</span>
                  }
                </TableCell>
                <TableCell>{receipt.vendor_name || '-'}</TableCell>
                <TableCell>
                  {receipt.category && (
                    <Badge variant="outline">{receipt.category}</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">{formatCurrency(receipt.total_amount)}</TableCell>
                <TableCell className="text-right">{formatCurrency(receipt.vat_amount)}</TableCell>
                <TableCell>
                  {receipt.bank_transaction ? (
                    <Badge variant="secondary" className="text-xs">
                      <Link2 className="h-3 w-3 mr-1" />
                      Transaction
                    </Badge>
                  ) : receipt.invoice_id ? (
                    <Badge variant="secondary" className="text-xs">
                      <Link2 className="h-3 w-3 mr-1" />
                      Invoice
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground text-xs">Unlinked</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleViewReceipt(receipt)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => {
                        setSelectedReceipt(receipt);
                        setShowDetailDialog(true);
                      }}
                    >
                      <Image className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => deleteMutation.mutate(receipt)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Upload Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={(open) => {
        setShowUploadDialog(open);
        if (!open) resetForm();
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Upload Receipt</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div 
              className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              {previewUrl ? (
                <div className="relative">
                  <img src={previewUrl} alt="Preview" className="max-h-48 mx-auto rounded" />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute top-0 right-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFile(null);
                      setPreviewUrl(null);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : selectedFile ? (
                <div className="flex items-center justify-center gap-2">
                  <Receipt className="h-8 w-8 text-muted-foreground" />
                  <span>{selectedFile.name}</span>
                </div>
              ) : (
                <>
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Click to upload or drag and drop
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    PNG, JPG, PDF up to 10MB
                  </p>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="image/*,.pdf"
                onChange={handleFileSelect}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Receipt Date</Label>
                <Input
                  type="date"
                  value={receiptDate}
                  onChange={(e) => setReceiptDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Vendor Name</Label>
                <Input
                  value={vendorName}
                  onChange={(e) => setVendorName(e.target.value)}
                  placeholder="e.g., Amazon"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Total Amount (£)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>VAT Amount (£)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={vatAmount}
                  onChange={(e) => setVatAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any additional details..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUploadDialog(false)}>Cancel</Button>
            <Button 
              onClick={() => uploadMutation.mutate()}
              disabled={!selectedFile || uploading}
            >
              {uploading ? "Uploading..." : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail/Edit Dialog */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Receipt Details</DialogTitle>
          </DialogHeader>
          {selectedReceipt && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Receipt Date</Label>
                  <Input
                    type="date"
                    defaultValue={selectedReceipt.receipt_date || ""}
                    onChange={(e) => setSelectedReceipt({...selectedReceipt, receipt_date: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Vendor Name</Label>
                  <Input
                    defaultValue={selectedReceipt.vendor_name || ""}
                    onChange={(e) => setSelectedReceipt({...selectedReceipt, vendor_name: e.target.value})}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Total Amount (£)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    defaultValue={selectedReceipt.total_amount || ""}
                    onChange={(e) => setSelectedReceipt({...selectedReceipt, total_amount: parseFloat(e.target.value)})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>VAT Amount (£)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    defaultValue={selectedReceipt.vat_amount || ""}
                    onChange={(e) => setSelectedReceipt({...selectedReceipt, vat_amount: parseFloat(e.target.value)})}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Category</Label>
                <Select 
                  defaultValue={selectedReceipt.category || ""}
                  onValueChange={(val) => setSelectedReceipt({...selectedReceipt, category: val})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  defaultValue={selectedReceipt.notes || ""}
                  onChange={(e) => setSelectedReceipt({...selectedReceipt, notes: e.target.value})}
                />
              </div>

              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => handleViewReceipt(selectedReceipt)}
                >
                  <Eye className="h-4 w-4 mr-2" />
                  View Image
                </Button>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDetailDialog(false)}>Cancel</Button>
            <Button onClick={() => updateMutation.mutate({
              receipt_date: selectedReceipt?.receipt_date,
              vendor_name: selectedReceipt?.vendor_name,
              total_amount: selectedReceipt?.total_amount,
              vat_amount: selectedReceipt?.vat_amount,
              category: selectedReceipt?.category,
              notes: selectedReceipt?.notes,
            })}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
