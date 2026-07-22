import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * MCP catalog-introspection contract.
 *
 * Guards that:
 *   1. The seven catalog RPCs are wired into the MCP tool list.
 *   2. Each tool forwards to the matching `mcp_list_*` RPC with the intended
 *      server-side filter argument (no client-side filtering).
 *   3. The generated MCP manifest exposes them with the right annotations.
 *
 * Live grant-boundary / shape verification is done via `supabase--read_query`
 * post-migration (Phase A) and recorded on the release receipt at
 * docs/releases/pending/<date>-mcp-catalog-introspection.json — this test
 * mirrors the project's static-contract pattern (see rls-cross-org.test.ts).
 */

const ROOT = resolve(__dirname, "../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const EXPECTED = [
  { tool: "catalog_functions",  file: "src/lib/mcp/tools/catalog-functions.ts",  rpc: "mcp_list_functions",  args: ["name_like", "include_source"] },
  { tool: "catalog_triggers",   file: "src/lib/mcp/tools/catalog-triggers.ts",   rpc: "mcp_list_triggers",   args: ["table_name"] },
  { tool: "catalog_policies",   file: "src/lib/mcp/tools/catalog-policies.ts",   rpc: "mcp_list_policies",   args: ["table_name"] },
  { tool: "catalog_grants",     file: "src/lib/mcp/tools/catalog-grants.ts",     rpc: "mcp_list_grants",     args: ["table_name"] },
  { tool: "catalog_rls_status", file: "src/lib/mcp/tools/catalog-rls-status.ts", rpc: "mcp_list_rls_status", args: ["table_name"] },
  { tool: "catalog_indexes",    file: "src/lib/mcp/tools/catalog-indexes.ts",    rpc: "mcp_list_indexes",    args: ["table_name"] },
  { tool: "catalog_cron",       file: "src/lib/mcp/tools/catalog-cron.ts",       rpc: "mcp_list_cron_jobs",  args: [] },
] as const;

describe("MCP catalog introspection — tool wiring contract", () => {
  const entry = read("src/lib/mcp/index.ts");

  for (const { tool, file, rpc, args } of EXPECTED) {
    describe(tool, () => {
      const src = read(file);

      it("declares the correct tool name and read-only hint", () => {
        expect(src).toMatch(new RegExp(`name:\\s*"${tool}"`));
        expect(src).toMatch(/readOnlyHint:\s*true/);
        expect(src).toMatch(/openWorldHint:\s*false/);
      });

      it(`forwards to RPC ${rpc}`, () => {
        expect(src).toMatch(new RegExp(`\\.rpc\\("${rpc}"`));
      });

      it("passes filter arguments server-side (no client-side filtering)", () => {
        for (const a of args) {
          expect(src, `${tool} must forward ${a} to the RPC`).toMatch(new RegExp(a));
        }
        // Guard against the anti-pattern of pulling everything and filtering in JS.
        expect(src).not.toMatch(/\.filter\(/);
      });

      it("is registered in defineMcp's tools array", () => {
        expect(entry).toMatch(new RegExp(`from\\s+"\\./tools/${file.split("/").pop()!.replace(/\.ts$/, "")}"`));
      });
    });
  }

  it("regenerated manifest exposes all seven catalog tools with correct hints", () => {
    const manifest = JSON.parse(read(".lovable/mcp/manifest.json"));
    const names = new Set<string>(manifest.mcp.tools.map((t: { name: string }) => t.name));
    for (const { tool } of EXPECTED) {
      expect(names.has(tool), `manifest missing ${tool}`).toBe(true);
    }
    for (const { tool } of EXPECTED) {
      const t = manifest.mcp.tools.find((x: { name: string }) => x.name === tool);
      expect(t.annotations.readOnlyHint).toBe(true);
      expect(t.annotations.openWorldHint).toBe(false);
    }
  });

  it("existing db_* tools are untouched", () => {
    for (const legacy of ["list_clients", "list_jobs", "list_upcoming_deadlines",
                          "db_schema", "db_select", "db_insert", "db_update", "db_delete", "db_rpc"]) {
      expect(entry).toMatch(new RegExp(`\\b${legacy.replace(/_/g, "[_]?")}\\b|${legacy}`));
    }
  });
});