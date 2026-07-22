import { CheckCircle2, Circle } from "lucide-react";
import type { PersonDetail, ServiceFlags } from "./types";
import { isAddressComplete } from "./types";

interface ChecklistItem {
  label: string;
  done: boolean;
}

function ItemRow({ item }: { item: ChecklistItem }) {
  return (
    <div className="flex items-center gap-2 text-sm py-0.5">
      {item.done ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
      ) : (
        <Circle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      )}
      <span className={item.done ? "text-muted-foreground line-through" : ""}>{item.label}</span>
    </div>
  );
}

interface OutstandingItemsProps {
  isCompany: boolean;
  utr: string;
  vatNumber: string;
  payeReference: string;
  services: ServiceFlags;
  people: PersonDetail[];
}

export default function OutstandingItems({
  isCompany,
  utr,
  vatNumber,
  payeReference,
  services,
  people,
}: OutstandingItemsProps) {
  const businessItems: ChecklistItem[] = [];
  if (isCompany) businessItems.push({ label: "Company UTR", done: !!utr.trim() });
  if (services.vat) businessItems.push({ label: "VAT number", done: !!vatNumber.trim() });
  if (services.payroll) businessItems.push({ label: "PAYE reference", done: !!payeReference.trim() });

  const businessDone = businessItems.filter((i) => i.done).length;
  const totalOutstanding =
    businessItems.filter((i) => !i.done).length +
    people.reduce((sum, p) => {
      const items = personItems(p);
      return sum + items.filter((i) => !i.done).length;
    }, 0);

  return (
    <div className="border rounded-md p-4 space-y-4 bg-muted/20">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Outstanding items</h4>
        <span className="text-xs text-muted-foreground">
          {totalOutstanding === 0 ? "All done" : `${totalOutstanding} still needed`}
        </span>
      </div>

      {businessItems.length > 0 ? (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">
            Business ({businessDone}/{businessItems.length})
          </p>
          {businessItems.map((item) => (
            <ItemRow key={item.label} item={item} />
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No business-level items needed.</p>
      )}

      {people.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No individuals added yet — add at least one person above.
        </p>
      ) : (
        people.map((p, idx) => {
          const items = personItems(p);
          const done = items.filter((i) => i.done).length;
          return (
            <div key={p._key}>
              <p className="text-xs font-medium text-muted-foreground mb-1">
                {p.name?.trim() || `Person ${idx + 1}`} ({done}/{items.length})
              </p>
              {items.map((item) => (
                <ItemRow key={item.label} item={item} />
              ))}
            </div>
          );
        })
      )}
    </div>
  );
}

function personItems(p: PersonDetail): ChecklistItem[] {
  return [
    { label: "Date of birth", done: !!p.date_of_birth?.trim() },
    { label: "National Insurance number", done: !!p.nino?.trim() },
    { label: "Personal UTR", done: !!p.utr?.trim() },
    { label: "Home address", done: isAddressComplete(p.home_address) },
  ];
}
