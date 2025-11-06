import { useState } from 'react';

/**
 * Hook for managing multi-step form/wizard navigation
 * @param initialStep - Starting step (default: 1)
 * @param totalSteps - Total number of steps (optional, for validation)
 */
export function useMultiStepForm(initialStep = 1, totalSteps?: number) {
  const [step, setStep] = useState(initialStep);

  const next = () => {
    if (totalSteps) {
      setStep(prev => Math.min(prev + 1, totalSteps));
    } else {
      setStep(prev => prev + 1);
    }
  };

  const back = () => setStep(prev => Math.max(prev - 1, 1));

  const goTo = (targetStep: number) => {
    if (totalSteps && (targetStep < 1 || targetStep > totalSteps)) {
      console.warn(`Step ${targetStep} is out of bounds (1-${totalSteps})`);
      return;
    }
    setStep(targetStep);
  };

  const reset = () => setStep(initialStep);

  return {
    step,
    next,
    back,
    goTo,
    reset,
    setStep,
    isFirstStep: step === 1,
    isLastStep: totalSteps ? step === totalSteps : false,
    progress: totalSteps ? (step / totalSteps) * 100 : 0,
  };
}

