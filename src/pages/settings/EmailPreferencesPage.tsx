import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";

export default function EmailPreferencesPage() {
  const { organization } = useOrganization();
  const [suppressions, setSuppressions] = useState<any[]>([]);
  const [preferences, setPreferences] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!organization?.id) return;
    (async () => {
      setLoading(true);
      const [{ data: s }, { data: p }] = await Promise.all([
        supabase.from("email_suppressions").select("*").eq("organization_id", organization.id).order("created_at", { ascending: false }).limit(200),
        supabase.from("email_preferences").select("*").eq("organization_id", organization.id).order("created_at", { ascending: false }).limit(200),
      ]);
      setSuppressions(s ?? []);
      setPreferences(p ?? []);
      setLoading(false);
    })();
  }, [organization?.id]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Email Preferences & Suppressions</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Recipients who have unsubscribed, bounced, or opted out of specific categories.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
        </div>
      ) : (
        <Tabs defaultValue="suppressions">
          <TabsList>
            <TabsTrigger value="suppressions">Suppressions ({suppressions.length})</TabsTrigger>
            <TabsTrigger value="preferences">Category Preferences ({preferences.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="suppressions">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Suppressed Addresses</CardTitle>
                <CardDescription>Sends to these addresses are blocked. Bulk unsubscribe applies to sales / prospecting; service-critical emails respect category preferences only.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Added</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {suppressions.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-mono text-xs">{s.email}</TableCell>
                        <TableCell>{s.category ?? <Badge variant="outline">All</Badge>}</TableCell>
                        <TableCell><Badge variant="secondary">{s.reason}</Badge></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{s.source ?? "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleDateString()}</TableCell>
                      </TableRow>
                    ))}
                    {suppressions.length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No suppressions yet.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="preferences">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Per-Contact Category Preferences</CardTitle>
                <CardDescription>Opt-outs scoped to a specific email category (e.g. marketing, reminders).</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead>Updated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preferences.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono text-xs">{p.email ?? "—"}</TableCell>
                        <TableCell>{p.category}</TableCell>
                        <TableCell>{p.opted_out_at ? <Badge variant="destructive">Opted Out</Badge> : <Badge>Opted In</Badge>}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{new Date(p.updated_at).toLocaleDateString()}</TableCell>
                      </TableRow>
                    ))}
                    {preferences.length === 0 && (
                      <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No category preferences yet.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}