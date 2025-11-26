import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

interface JobSettingsTabProps {
  job: any;
}

export default function JobSettingsTab({ job }: JobSettingsTabProps) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Recurring Job Settings</CardTitle>
          <CardDescription>
            Configure if this job should repeat automatically
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="recurring">Enable recurring schedule</Label>
            <Switch
              id="recurring"
              checked={job.is_recurring}
              disabled
            />
          </div>
          {job.is_recurring && (
            <p className="text-sm text-muted-foreground">
              Recurring settings: Coming soon
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Template</CardTitle>
          <CardDescription>
            View or change the template used for this job
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            {job.template_id ? "Template-based job" : "Manual job"}
          </p>
          <Button variant="outline" disabled>
            Change Template
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Danger Zone</CardTitle>
          <CardDescription>
            Irreversible actions for this job
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" disabled>
            Delete Job
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
