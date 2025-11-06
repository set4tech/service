interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
  className?: string;
}

/**
 * Visual progress indicator for multi-step forms/wizards
 * Displays a horizontal bar showing progress through steps
 */
export function StepIndicator({ currentStep, totalSteps, className = '' }: StepIndicatorProps) {
  return (
    <div
      className={`flex space-x-2 ${className}`}
      role="progressbar"
      aria-valuenow={currentStep}
      aria-valuemin={1}
      aria-valuemax={totalSteps}
      aria-label={`Step ${currentStep} of ${totalSteps}`}
    >
      {Array.from({ length: totalSteps }, (_, i) => i + 1).map(s => (
        <div
          key={s}
          className={`h-2 flex-1 rounded transition-colors ${
            s <= currentStep ? 'bg-brand-600' : 'bg-gray-300'
          }`}
          aria-label={`Step ${s}${s === currentStep ? ' (current)' : s < currentStep ? ' (completed)' : ''}`}
        />
      ))}
    </div>
  );
}


