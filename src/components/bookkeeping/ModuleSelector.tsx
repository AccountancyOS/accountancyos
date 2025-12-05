import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { BookOpen, Wallet, HardHat, Lock } from "lucide-react";

export type BookkeepingModule = 'books' | 'payroll' | 'cis';

interface ModuleSelectorProps {
  activeModule: BookkeepingModule;
  onModuleChange: (module: BookkeepingModule) => void;
  hasPayroll: boolean;
  hasCIS: boolean;
  isLoading?: boolean;
}

export function ModuleSelector({
  activeModule,
  onModuleChange,
  hasPayroll,
  hasCIS,
  isLoading,
}: ModuleSelectorProps) {
  const modules: { id: BookkeepingModule; label: string; icon: React.ElementType; enabled: boolean; tooltip?: string }[] = [
    { id: 'books', label: 'Books', icon: BookOpen, enabled: true },
    { 
      id: 'payroll', 
      label: 'Payroll', 
      icon: Wallet, 
      enabled: hasPayroll,
      tooltip: !hasPayroll ? 'Payroll not enabled for this entity' : undefined
    },
    { 
      id: 'cis', 
      label: 'CIS', 
      icon: HardHat, 
      enabled: hasCIS,
      tooltip: !hasCIS ? 'CIS not enabled for this entity' : undefined
    },
  ];

  return (
    <TooltipProvider>
      <div className="inline-flex items-center rounded-lg bg-muted p-1 gap-1">
        {modules.map((module) => {
          const Icon = module.icon;
          const isActive = activeModule === module.id;
          const isDisabled = !module.enabled && !isLoading;

          const button = (
            <Button
              key={module.id}
              variant={isActive ? "default" : "ghost"}
              size="sm"
              disabled={isDisabled}
              onClick={() => module.enabled && onModuleChange(module.id)}
              className={cn(
                "gap-2 transition-all",
                isActive 
                  ? "bg-background shadow-sm hover:bg-background" 
                  : "hover:bg-background/50",
                isDisabled && "opacity-50 cursor-not-allowed"
              )}
            >
              <Icon className="h-4 w-4" />
              {module.label}
              {isDisabled && <Lock className="h-3 w-3 ml-1" />}
            </Button>
          );

          if (module.tooltip && isDisabled) {
            return (
              <Tooltip key={module.id}>
                <TooltipTrigger asChild>
                  <span>{button}</span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{module.tooltip}</p>
                </TooltipContent>
              </Tooltip>
            );
          }

          return button;
        })}
      </div>
    </TooltipProvider>
  );
}
