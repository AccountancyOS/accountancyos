import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Upload } from "lucide-react";

interface PracticeProfileStepProps {
  organizationId: string;
  onComplete: () => void;
  onSkip: () => void;
}

export const PracticeProfileStep = ({ organizationId, onComplete, onSkip }: PracticeProfileStepProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    address_line_1: "",
    address_line_2: "",
    city: "",
    postcode: "",
    country: "UK",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase
        .from("organizations")
        .update(formData)
        .eq("id", organizationId);

      if (error) throw error;

      toast({
        title: "Profile updated",
        description: "Your practice profile has been saved.",
      });

      onComplete();
    } catch (error: any) {
      toast({
        title: "Error updating profile",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Practice Logo (Optional)</Label>
          <div className="border-2 border-dashed rounded-lg p-8 text-center">
            <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Upload your practice logo (Coming soon)
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="address_line_1">Address Line 1</Label>
            <Input
              id="address_line_1"
              value={formData.address_line_1}
              onChange={(e) => setFormData({ ...formData, address_line_1: e.target.value })}
              placeholder="123 High Street"
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="address_line_2">Address Line 2 (Optional)</Label>
            <Input
              id="address_line_2"
              value={formData.address_line_2}
              onChange={(e) => setFormData({ ...formData, address_line_2: e.target.value })}
              placeholder="Suite 100"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="city">City</Label>
            <Input
              id="city"
              value={formData.city}
              onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              placeholder="London"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="postcode">Postcode</Label>
            <Input
              id="postcode"
              value={formData.postcode}
              onChange={(e) => setFormData({ ...formData, postcode: e.target.value })}
              placeholder="SW1A 1AA"
            />
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            "Save & Continue"
          )}
        </Button>
        <Button type="button" variant="ghost" onClick={onSkip}>
          Skip for Now
        </Button>
      </div>
    </form>
  );
};
