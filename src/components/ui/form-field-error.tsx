import { cn } from "@/lib/utils";

interface FormFieldErrorProps {
  error?: string;
  className?: string;
}

export function FormFieldError({ error, className }: FormFieldErrorProps) {
  if (!error) return null;

  return (
    <p className={cn("text-sm text-destructive mt-1", className)}>
      {error}
    </p>
  );
}

interface FormFieldProps {
  children: React.ReactNode;
  error?: string;
  className?: string;
}

export function FormField({ children, error, className }: FormFieldProps) {
  return (
    <div className={cn("space-y-1", className)}>
      {children}
      <FormFieldError error={error} />
    </div>
  );
}
