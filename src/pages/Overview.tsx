import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useOrganization } from "@/lib/organization-context";
import { Users, TrendingUp, Clock, CheckCircle2 } from "lucide-react";

const Overview = () => {
  const { organization } = useOrganization();

  const stats = [
    {
      name: "Active Leads",
      value: "12",
      icon: Users,
      change: "+3 this week",
      changeType: "positive" as const,
    },
    {
      name: "Monthly Revenue",
      value: "£24,500",
      icon: TrendingUp,
      change: "+12.5%",
      changeType: "positive" as const,
    },
    {
      name: "Pending Tasks",
      value: "8",
      icon: Clock,
      change: "2 due today",
      changeType: "neutral" as const,
    },
    {
      name: "Completed Jobs",
      value: "145",
      icon: CheckCircle2,
      change: "+18 this month",
      changeType: "positive" as const,
    },
  ];

  return (
    <DashboardLayout>
      <div className="flex-1 overflow-auto">
        <div className="p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-semibold text-foreground mb-2">
              Welcome back
            </h1>
            <p className="text-muted-foreground">
              Here's what's happening with {organization?.name} today.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
            {stats.map((stat) => (
              <Card key={stat.name}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    {stat.name}
                  </CardTitle>
                  <stat.icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stat.value}</div>
                  <p className={cn(
                    "text-xs mt-1",
                    stat.changeType === "positive" ? "text-green-600" : "text-muted-foreground"
                  )}>
                    {stat.change}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>
                  Your latest updates and actions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-start gap-4">
                    <div className="bg-primary/10 p-2 rounded-lg">
                      <Users className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">New lead added</p>
                      <p className="text-sm text-muted-foreground">
                        Sarah Johnson from referral
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        2 hours ago
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="bg-primary/10 p-2 rounded-lg">
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">Job completed</p>
                      <p className="text-sm text-muted-foreground">
                        Q4 2024 VAT return filed
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        5 hours ago
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
                <CardDescription>Common tasks</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" className="w-full justify-start" asChild>
                  <a href="/crm">Add New Lead</a>
                </Button>
                <Button variant="outline" className="w-full justify-start" asChild>
                  <a href="/jobs">Create Job</a>
                </Button>
                <Button variant="outline" className="w-full justify-start" asChild>
                  <a href="/documents">Upload Document</a>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

function cn(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
}

export default Overview;
