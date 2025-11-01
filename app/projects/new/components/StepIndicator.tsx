// Re-export shared component with default styling for project wizard
import { StepIndicator as BaseStepIndicator } from '@/components/ui/StepIndicator';

interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
}

export function StepIndicator({ currentStep, totalSteps }: StepIndicatorProps) {
  return <BaseStepIndicator currentStep={currentStep} totalSteps={totalSteps} className="mt-4" />;
}
