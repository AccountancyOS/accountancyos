interface PortalPageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

export function PortalPageHeader({ title, description, actions }: PortalPageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex gap-2">{actions}</div> : null}
    </div>
  );
}