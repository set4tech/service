import { Accordion } from '@/components/ui/Accordion';
import { VariableField } from './VariableField';
import type { VariableInfo, ProjectVariables } from '../../types';

interface VariableCategoryProps {
  category: string;
  items: { [key: string]: VariableInfo };
  expanded: boolean;
  onToggle: (category: string) => void;
  projectVariables: ProjectVariables;
  updateVariable: (category: string, variable: string, value: any) => void;
  toggleMultiselect: (category: string, variable: string, option: string) => void;
  addressInputRef?: React.RefObject<HTMLInputElement | null>;
}

/**
 * Project-specific wrapper around Accordion for variable categories
 */
export function VariableCategory({
  category,
  items,
  expanded,
  onToggle,
  projectVariables,
  updateVariable,
  toggleMultiselect,
  addressInputRef,
}: VariableCategoryProps) {
  const title = category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  return (
    <Accordion title={title} expanded={expanded} onToggle={() => onToggle(category)}>
      {Object.entries(items).map(([varName, varInfo]) => (
        <VariableField
          key={varName}
          category={category}
          varName={varName}
          varInfo={varInfo}
          value={projectVariables[category]?.[varName]}
          onChange={updateVariable}
          onToggleMultiselect={toggleMultiselect}
          addressInputRef={addressInputRef}
        />
      ))}
    </Accordion>
  );
}
