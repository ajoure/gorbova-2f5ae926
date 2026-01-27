import { Check, ChevronRight } from "lucide-react";
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
    <div className={cn("flex items-center gap-1 mb-6", className)}>
      {steps.map((step, i) => {
        const isCompleted = i < currentStep;
        const isCurrent = i === currentStep;
        const isPending = i > currentStep;

        return (
          <div key={i} className="flex items-center gap-1">
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
                  "w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center text-xs md:text-sm font-medium transition-all",
                  isCompleted && "bg-primary text-primary-foreground",
                  isCurrent && "bg-primary/20 text-primary ring-2 ring-primary/30",
                  isPending && "bg-muted text-muted-foreground"
                )}
              >
                {isCompleted ? (
                  <Check className="h-3.5 w-3.5 md:h-4 md:w-4" />
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={cn(
                  "text-xs font-medium hidden md:block",
                  isCompleted && "text-primary",
                  isCurrent && "text-foreground",
                  isPending && "text-muted-foreground"
                )}
              >
                {step.label}
              </span>
              {/* Short label for mobile */}
              <span
                className={cn(
                  "text-[10px] font-medium md:hidden",
                  isCompleted && "text-primary",
                  isCurrent && "text-foreground",
                  isPending && "text-muted-foreground"
                )}
              >
                {step.shortLabel || step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <ChevronRight
                className={cn(
                  "h-3 w-3 md:h-4 md:w-4 mx-0.5",
                  i < currentStep
                    ? "text-primary"
                    : "text-muted-foreground/50"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
