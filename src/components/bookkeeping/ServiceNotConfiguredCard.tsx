import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface ServiceNotConfiguredCardProps {
  serviceName: string;
  entityName?: string;
  entityType: 'client' | 'company';
  entityId: string;
}

export function ServiceNotConfiguredCard({ 
  serviceName, 
  entityName,
  entityType,
  entityId 
}: ServiceNotConfiguredCardProps) {
  const navigate = useNavigate();

  const handleConfigureService = () => {
    // Navigate to the client/company detail page where engagements can be configured
    if (entityType === 'company') {
      navigate(`/company/${entityId}?tab=settings`);
    } else {
      navigate(`/clients?id=${entityId}`);
    }
  };

  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <div className="rounded-full bg-muted p-4 mb-4">
          <Lock className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-2">
          {serviceName} Not Enabled
        </h3>
        <p className="text-muted-foreground mb-6 max-w-md">
          {serviceName} is not configured for {entityName || "this entity"}. 
          Add it to their engagement to start using {serviceName.toLowerCase()} features.
        </p>
        <Button onClick={handleConfigureService}>
          Configure Service
        </Button>
      </CardContent>
    </Card>
  );
}
