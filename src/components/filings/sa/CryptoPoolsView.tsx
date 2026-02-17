/**
 * CryptoPoolsView — displays Section 104 token pools after computation.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Coins } from "lucide-react";
import type { TokenPool } from "@/lib/cgt-crypto-engine";

interface Props {
  pools: TokenPool[];
}

export function CryptoPoolsView({ pools }: Props) {
  if (pools.length === 0) {
    return null;
  }

  const formatMoney = (v: number) =>
    `£${Math.abs(v).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Coins className="h-4 w-4" />
          Section 104 Token Pools
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Token</TableHead>
              <TableHead className="text-right">Quantity Held</TableHead>
              <TableHead className="text-right">Total Cost</TableHead>
              <TableHead className="text-right">Avg Cost / Unit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pools.map((pool) => (
              <TableRow key={pool.token_symbol}>
                <TableCell>
                  <Badge variant="secondary" className="font-mono">
                    {pool.token_symbol}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {pool.total_quantity.toLocaleString('en-GB', { maximumFractionDigits: 8 })}
                </TableCell>
                <TableCell className="text-right text-sm">
                  {formatMoney(pool.total_cost_gbp)}
                </TableCell>
                <TableCell className="text-right text-sm">
                  £{pool.average_cost_per_unit.toFixed(4)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
