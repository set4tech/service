'use client';

import { VariableCategory } from '../variables/VariableCategory';
import type { VariableChecklist, ProjectVariables, StepProps } from '../../types';

interface ProjectVariablesStepProps extends StepProps {
  variableChecklist: VariableChecklist | null;
  projectVariables: ProjectVariables;
  expandedCategories: Set<string>;
  onUpdateVariable: (category: string, variable: string, value: any) => void;
  onToggleMultiselect: (category: string, variable: string, option: string) => void;
  onToggleCategory: (category: string) => void;
  addressInputRef: React.RefObject<HTMLInputElement | null>;
}

export function ProjectVariablesStep({
  variableChecklist,
  projectVariables,
  expandedCategories,
  onUpdateVariable,
  onToggleMultiselect,
  onToggleCategory,
  addressInputRef,
  onNext,
  onBack,
}: ProjectVariablesStepProps) {
  return (
    <div className="flex flex-col h-[600px]">
      <div className="flex-shrink-0">
        <h2 className="text-xl font-semibold mb-4">Project Variables</h2>
        <p className="text-sm text-gray-600 mb-4">
          Enter project details. These will be used for compliance analysis. Fields are optional.
        </p>
      </div>

      {!variableChecklist ? (
        <div className="text-center py-8 text-gray-500">Loading...</div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-3 mb-6">
          {Object.entries(variableChecklist).map(([category, items]) => (
            <VariableCategory
              key={category}
              category={category}
              items={items}
              expanded={expandedCategories.has(category)}
              onToggle={onToggleCategory}
              projectVariables={projectVariables}
              updateVariable={onUpdateVariable}
              toggleMultiselect={onToggleMultiselect}
              addressInputRef={addressInputRef}
            />
          ))}
        </div>
      )}

      <div className="flex-shrink-0 flex justify-between pt-4 border-t bg-white">
        <button onClick={onBack} className="btn-secondary">
          ← Back
        </button>
        <button onClick={onNext} className="btn-primary">
          Next →
        </button>
      </div>
    </div>
  );
}
