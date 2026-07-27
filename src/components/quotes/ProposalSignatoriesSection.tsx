import { useEffect, useMemo } from "react";
import { Plus, X, ShieldCheck, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { isCompanyBasedType, type ClientType } from "@/lib/client-types";
import {
  DEFAULT_SIGNING_RULE,
  emptySnapshot,
  extractActiveDirectors,
  directorToSignatory,
  individualSignatory,
  validateSignatorySnapshot,
  type SignatorySnapshot,
  type ProposalSignatory,
  type SigningRule,
} from "@/lib/proposal/signatories";

/**
 * Proposal Phase 2, Task 2e — the Signatories step of the proposal flow.
 *
 * Limited company: the accountant selects who signs from the ACTIVE Companies-
 * House directors already loaded on the lead (`ch_company_profile`; this
 * component never fetches CH itself — resigned directors are never offered),
 * marks one primary, gives each an email, may add a manual signatory, and picks
 * the signing rule (default All must sign / alternative Any one may sign).
 *
 * SA / individual: the linked individual is defaulted as the sole signatory.
 *
 * The result is written to the caller as a `SignatorySnapshot`, which the
 * proposal persists in `quotes.signatory_snapshot`. Manually entered emails are
 * preserved across director refreshes because the snapshot (not the CH list) is
 * the source of truth; the director list is merged onto it, never over it.
 *
 * NB acceptance-time creation of `engagement_letter_signatories` from this
 * snapshot is Task 2d — nothing here signs or gates.
 */

interface ProposalCHSource {
  ch_company_profile?: unknown;
}

interface ProposalSignatoriesSectionProps {
  /** The proposal entity type (lead.lead_type); undefined until a lead is chosen. */
  leadType: ClientType | undefined;
  /** The selected lead/company row carrying the already-loaded CH snapshot. */
  chSource: ProposalCHSource | null;
  /** For SA/individual: the linked person to default as the sole signatory. */
  individual: { name: string; email: string } | null;
  /** Controlled snapshot value (null until first edited). */
  value: SignatorySnapshot | null;
  onChange: (snap: SignatorySnapshot) => void;
}

/** A stable identity for a signatory row, used to merge/select without indices. */
function signatoryKey(s: ProposalSignatory): string {
  return s.ch_officer_id ?? s.person_id ?? s.contact_id ?? `manual:${s.name}:${s.email}`;
}

export function ProposalSignatoriesSection({
  leadType,
  chSource,
  individual,
  value,
  onChange,
}: ProposalSignatoriesSectionProps) {
  const isCompany = !!leadType && isCompanyBasedType(leadType);
  const snapshot: SignatorySnapshot = value ?? emptySnapshot();

  const directors = useMemo(() => extractActiveDirectors(chSource), [chSource]);

  // Seed the individual default once, when SA/individual and nothing selected yet.
  useEffect(() => {
    if (value) return;
    if (isCompany) return;
    if (!individual) return;
    onChange({ rule: DEFAULT_SIGNING_RULE, signatories: [individualSignatory(individual)] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCompany, individual, value]);

  const setSnapshot = (next: SignatorySnapshot) => onChange(next);

  const setRule = (rule: SigningRule) => setSnapshot({ ...snapshot, rule });

  const isSelected = (key: string) => snapshot.signatories.some((s) => signatoryKey(s) === key);

  /** Toggle a CH director in/out of the signatory list, preserving edited emails. */
  const toggleDirector = (dirKey: string) => {
    const dir = directors.find((d) => (d.ch_officer_id ?? `manual::${d.name}`) === dirKey);
    if (!dir) return;
    const existing = snapshot.signatories.find((s) => s.ch_officer_id === dir.ch_officer_id && dir.ch_officer_id !== null);
    if (existing) {
      setSnapshot({ ...snapshot, signatories: snapshot.signatories.filter((s) => s !== existing) });
    } else {
      setSnapshot({ ...snapshot, signatories: [...snapshot.signatories, directorToSignatory(dir)] });
    }
  };

  const updateSignatory = (key: string, patch: Partial<ProposalSignatory>) => {
    setSnapshot({
      ...snapshot,
      signatories: snapshot.signatories.map((s) => (signatoryKey(s) === key ? { ...s, ...patch } : s)),
    });
  };

  const setPrimary = (key: string) => {
    setSnapshot({
      ...snapshot,
      signatories: snapshot.signatories.map((s) => ({ ...s, is_primary: signatoryKey(s) === key })),
    });
  };

  const removeSignatory = (key: string) => {
    setSnapshot({ ...snapshot, signatories: snapshot.signatories.filter((s) => signatoryKey(s) !== key) });
  };

  const addManualSignatory = () => {
    const manual: ProposalSignatory = {
      person_id: null,
      contact_id: null,
      ch_officer_id: null,
      name: "",
      email: "",
      is_primary: snapshot.signatories.length === 0,
      required: true,
    };
    setSnapshot({ ...snapshot, signatories: [...snapshot.signatories, manual] });
  };

  const validation = validateSignatorySnapshot(snapshot);
  // Only surface errors once the accountant has begun choosing signatories.
  const showErrors = snapshot.signatories.length > 0 || value !== null;

  return (
    <div className="rounded-md border bg-muted/40 p-3 space-y-4">
      <div>
        <div className="text-sm font-medium flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" />
          Signatories
        </div>
        <p className="text-xs text-muted-foreground">
          {isCompany
            ? "Choose who must sign the engagement letter. Active Companies House directors are listed below — add an email for each, mark the primary contact, and pick the signing rule."
            : "The individual named on this proposal signs the engagement letter. Confirm their email below."}
        </p>
      </div>

      {isCompany && (
        <div className="space-y-2">
          <Label className="text-xs">Companies House directors</Label>
          {directors.length === 0 ? (
            <p className="text-xs text-amber-600">
              No active Companies House directors are loaded for this company. Add signatories manually below.
            </p>
          ) : (
            <div className="space-y-1">
              {directors.map((dir) => {
                const dirKey = dir.ch_officer_id ?? `manual::${dir.name}`;
                const selected = dir.ch_officer_id !== null && isSelected(dir.ch_officer_id);
                return (
                  <label
                    key={dirKey}
                    className="flex items-center gap-2 text-sm cursor-pointer rounded px-2 py-1 hover:bg-background/60"
                  >
                    <Checkbox
                      checked={selected}
                      onCheckedChange={() => toggleDirector(dirKey)}
                      aria-label={`Select ${dir.name} as a signatory`}
                    />
                    <UserRound className="h-4 w-4 text-muted-foreground" />
                    <span>{dir.name}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      Director
                    </Badge>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}

      {snapshot.signatories.length > 0 && (
        <RadioGroup
          value={snapshot.signatories.find((s) => s.is_primary) ? primaryKeyOf(snapshot) : undefined}
          onValueChange={setPrimary}
          className="space-y-2"
        >
          <div className="grid grid-cols-[auto_1fr_1fr_auto] items-center gap-2 text-[11px] font-medium text-muted-foreground px-1">
            <span>Primary</span>
            <span>Name</span>
            <span>Email</span>
            <span />
          </div>
          {snapshot.signatories.map((s) => {
            const key = signatoryKey(s);
            return (
              <div key={key} className="grid grid-cols-[auto_1fr_1fr_auto] items-center gap-2">
                <RadioGroupItem value={key} aria-label={`Set ${s.name || "signatory"} as primary contact`} />
                <Input
                  value={s.name}
                  placeholder="Signatory name"
                  onChange={(e) => updateSignatory(key, { name: e.target.value })}
                  aria-label="Signatory name"
                />
                <Input
                  type="email"
                  value={s.email}
                  placeholder="name@example.com"
                  onChange={(e) => updateSignatory(key, { email: e.target.value })}
                  aria-label={`Email for ${s.name || "signatory"}`}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeSignatory(key)}
                  aria-label={`Remove ${s.name || "signatory"}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </RadioGroup>
      )}

      <Button type="button" variant="outline" size="sm" onClick={addManualSignatory}>
        <Plus className="h-4 w-4 mr-1" />
        Add signatory
      </Button>

      {isCompany && (
        <div className="space-y-1">
          <Label className="text-xs">Signing rule</Label>
          <Select value={snapshot.rule} onValueChange={(v) => setRule(v as SigningRule)}>
            <SelectTrigger className="w-64" aria-label="Signing rule">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All must sign</SelectItem>
              <SelectItem value="any">Any one may sign</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {showErrors && !validation.ok && (
        <ul className="text-xs text-amber-600 space-y-0.5">
          {validation.errors.map((err, i) => (
            <li key={`${err.code}-${i}`}>{err.message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The stable key of the current primary signatory (for the RadioGroup value). */
function primaryKeyOf(snap: SignatorySnapshot): string | undefined {
  const primary = snap.signatories.find((s) => s.is_primary);
  return primary ? signatoryKey(primary) : undefined;
}
