import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Step {
  label: string;
  shortLabel?: string;
}

interface WizardStepIndicatorProps {
  steps: Step[];
  currentStep: number; // 0-indexed
  className?: string;
}

export function WizardStepIndicator({
  steps,
  currentStep,
  className,
}: WizardStepIndicatorProps) {
  return (
    <div className={cn("flex items-center justify-between gap-1 mb-4", className)}>
      {steps.map((step, i) => {
        const isCompleted = i < currentStep;
        const isCurrent = i === currentStep;
        const isPending = i > currentStep;

        return (
          <div key={i} className="flex items-center flex-1 last:flex-initial">
            <div
              className={cn(
                "flex items-center gap-1.5",
                isCompleted && "text-primary",
                isCurrent && "text-primary",
                isPending && "text-muted-foreground"
              )}
            >
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all shrink-0",
                  isCompleted && "bg-primary text-primary-foreground",
                  isCurrent && "bg-primary/20 text-primary ring-2 ring-primary/30",
                  isPending && "bg-muted text-muted-foreground"
                )}
              >
                {isCompleted ? (
                  <Check className="h-4 w-4" />
                ) : (
                  step.shortLabel || (i + 1)
                )}
              </div>
              <span
                className={cn(
                  "text-xs font-medium hidden lg:block whitespace-nowrap",
                  isCompleted && "text-primary",
                  isCurrent && "text-foreground",
                  isPending && "text-muted-foreground"
                )}
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  "flex-1 h-0.5 mx-2 min-w-4",
                  i < currentStep ? "bg-primary" : "bg-muted"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
