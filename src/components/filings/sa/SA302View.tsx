/**
 * SA302 Tax Computation View
 * Renders the SA302 as a structured, print-ready computation sheet.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { SA302Result } from "@/lib/sa302-renderer";

interface Props {
  sa302: SA302Result;
}

function formatMoney(amount: number): string {
  return `£${Math.abs(amount).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function SA302View({ sa302 }: Props) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>SA302 — Tax Calculation</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">Tax Year {sa302.tax_year}</p>
          </div>
          <div className="text-right text-sm text-muted-foreground">
            <p>{sa302.taxpayer_name}</p>
            <p>UTR: {sa302.utr}</p>
            <p>NINO: {sa302.nino}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {sa302.sections.map((section, sIdx) => (
          <div key={sIdx}>
            <h3 className="font-semibold text-sm mb-3">{section.title}</h3>
            <div className="space-y-1">
              {section.lines.map((line, lIdx) => (
                <div key={lIdx}>
                  {line.separator && lIdx > 0 && <Separator className="my-2" />}
                  <div className={cn(
                    "flex items-center justify-between py-1 px-2 rounded text-sm",
                    line.bold && "font-semibold bg-muted",
                    line.indent && "pl-6",
                  )}>
                    <span>{line.label}</span>
                    <span className="font-mono tabular-nums">{formatMoney(line.amount)}</span>
                  </div>
                </div>
              ))}
            </div>
            {sIdx < sa302.sections.length - 1 && <Separator className="mt-4" />}
          </div>
        ))}

        {/* Final total */}
        <div className="bg-primary/10 rounded-lg p-4 mt-4">
          <div className="flex items-center justify-between">
            <span className="font-bold">Total Tax Due</span>
            <span className="font-bold text-lg font-mono tabular-nums">{formatMoney(sa302.total_tax_due)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
