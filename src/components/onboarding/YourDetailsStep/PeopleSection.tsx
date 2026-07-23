import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Plus, Trash2, User, Building2, RefreshCw, Loader2 } from "lucide-react";
import { type PersonDetail, isPersonComplete } from "./types";

interface PeopleSectionProps {
  people: PersonDetail[];
  onChange: (people: PersonDetail[]) => void;
  allowAddRemove: boolean;
  addLabel?: string;
  /** True while directors are being fetched from Companies House. */
  chLoading?: boolean;
  /** Re-fetch directors from Companies House (company applications only). */
  onRefreshFromCH?: () => void;
}

function updatePerson(
  people: PersonDetail[],
  key: string,
  patch: Partial<PersonDetail> | ((p: PersonDetail) => PersonDetail),
): PersonDetail[] {
  return people.map((p) =>
    p._key === key ? (typeof patch === "function" ? patch(p) : { ...p, ...patch }) : p,
  );
}

export default function PeopleSection({
  people,
  onChange,
  allowAddRemove,
  addLabel,
  chLoading,
  onRefreshFromCH,
}: PeopleSectionProps) {
  const addPerson = () => {
    onChange([
      ...people,
      {
        _key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: "",
        role: "",
        date_of_birth: "",
        nino: "",
        utr: "",
        home_address: { line1: "", line2: "", city: "", county: "", postcode: "", country: "United Kingdom" },
        person_id: null,
        ch_officer_id: null,
      },
    ]);
  };

  const removePerson = (key: string) => {
    onChange(people.filter((p) => p._key !== key));
  };

  const refreshButton =
    onRefreshFromCH != null ? (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onRefreshFromCH}
        disabled={chLoading}
      >
        {chLoading ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <RefreshCw className="h-4 w-4 mr-2" />
        )}
        Refresh from Companies House
      </Button>
    ) : null;

  if (people.length === 0) {
    return (
      <div className="border border-dashed rounded-md p-4 text-center space-y-2">
        {chLoading ? (
          <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Looking up directors at Companies House…
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">No individuals added yet.</p>
        )}
        {allowAddRemove && !chLoading && (
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={addPerson}>
              <Plus className="h-4 w-4 mr-2" />
              {addLabel ?? "Add a director or shareholder"}
            </Button>
            {refreshButton}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Accordion type="multiple" defaultValue={people.map((p) => p._key)} className="border rounded-md divide-y">
        {people.map((person, idx) => (
          <AccordionItem key={person._key} value={person._key} className="border-0 px-3">
            <AccordionTrigger className="py-3 hover:no-underline">
              <div className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">
                  {person.name?.trim() || `Person ${idx + 1}`}
                </span>
                {person.role && <span className="text-muted-foreground">— {person.role}</span>}
                {person.ch_officer_id && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground font-normal">
                    <Building2 className="h-3 w-3" />
                    from Companies House
                  </span>
                )}
                {isPersonComplete(person) && (
                  <span className="text-[10px] text-emerald-700 font-normal">complete</span>
                )}
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`name-${person._key}`}>Full name</Label>
                  <Input
                    id={`name-${person._key}`}
                    value={person.name}
                    onChange={(e) => onChange(updatePerson(people, person._key, { name: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`role-${person._key}`}>Role</Label>
                  <Input
                    id={`role-${person._key}`}
                    value={person.role}
                    onChange={(e) => onChange(updatePerson(people, person._key, { role: e.target.value }))}
                    placeholder="e.g. Director, Shareholder"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`dob-${person._key}`}>Date of birth</Label>
                  <Input
                    id={`dob-${person._key}`}
                    type="date"
                    value={person.date_of_birth}
                    onChange={(e) => onChange(updatePerson(people, person._key, { date_of_birth: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">Required for AML identity checks.</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`nino-${person._key}`}>National Insurance number</Label>
                  <Input
                    id={`nino-${person._key}`}
                    value={person.nino}
                    onChange={(e) => onChange(updatePerson(people, person._key, { nino: e.target.value.toUpperCase() }))}
                    placeholder="e.g. QQ123456A"
                  />
                  <p className="text-xs text-muted-foreground">
                    Needed for Self Assessment / PAYE registration.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`utr-${person._key}`}>Personal UTR (if you have one)</Label>
                  <Input
                    id={`utr-${person._key}`}
                    value={person.utr}
                    onChange={(e) => onChange(updatePerson(people, person._key, { utr: e.target.value }))}
                    maxLength={10}
                  />
                  <p className="text-xs text-muted-foreground">
                    Your own Self Assessment UTR — separate from any company UTR.
                  </p>
                </div>
                <div className="sm:col-span-2 space-y-1.5">
                  <Label>Home address</Label>
                  <p className="text-xs text-muted-foreground -mt-1">
                    Kept private for AML records — never published.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Input
                      value={person.home_address.line1}
                      onChange={(e) =>
                        onChange(
                          updatePerson(people, person._key, (p) => ({
                            ...p,
                            home_address: { ...p.home_address, line1: e.target.value },
                          })),
                        )
                      }
                      placeholder="Address line 1"
                    />
                    <Input
                      value={person.home_address.line2}
                      onChange={(e) =>
                        onChange(
                          updatePerson(people, person._key, (p) => ({
                            ...p,
                            home_address: { ...p.home_address, line2: e.target.value },
                          })),
                        )
                      }
                      placeholder="Address line 2 (optional)"
                    />
                    <Input
                      value={person.home_address.city}
                      onChange={(e) =>
                        onChange(
                          updatePerson(people, person._key, (p) => ({
                            ...p,
                            home_address: { ...p.home_address, city: e.target.value },
                          })),
                        )
                      }
                      placeholder="City"
                    />
                    <Input
                      value={person.home_address.county}
                      onChange={(e) =>
                        onChange(
                          updatePerson(people, person._key, (p) => ({
                            ...p,
                            home_address: { ...p.home_address, county: e.target.value },
                          })),
                        )
                      }
                      placeholder="County (optional)"
                    />
                    <Input
                      value={person.home_address.postcode}
                      onChange={(e) =>
                        onChange(
                          updatePerson(people, person._key, (p) => ({
                            ...p,
                            home_address: { ...p.home_address, postcode: e.target.value.toUpperCase() },
                          })),
                        )
                      }
                      placeholder="Postcode"
                    />
                    <Input
                      value={person.home_address.country}
                      onChange={(e) =>
                        onChange(
                          updatePerson(people, person._key, (p) => ({
                            ...p,
                            home_address: { ...p.home_address, country: e.target.value },
                          })),
                        )
                      }
                      placeholder="Country"
                    />
                  </div>
                </div>
                {allowAddRemove && (
                  <div className="sm:col-span-2 flex justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => removePerson(person._key)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Remove this person
                    </Button>
                  </div>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
      {allowAddRemove && (
        <div className="flex flex-col sm:flex-row gap-2">
          <Button type="button" variant="outline" size="sm" onClick={addPerson}>
            <Plus className="h-4 w-4 mr-2" />
            {addLabel ?? "Add another person"}
          </Button>
          {refreshButton}
        </div>
      )}
    </div>
  );
}
