import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

interface ClientJobsTabProps {
  clientId: string;
}

export default function ClientJobsTab({ clientId }: ClientJobsTabProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Jobs & Work</CardTitle>
          <CardDescription>
            Active and completed jobs for this client
          </CardDescription>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          New Job
        </Button>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">
          Jobs list coming soon. This will show all active accounts, tax returns, and other work items for this client.
        </p>
      </CardContent>
    </Card>
  );
}
