import { DynamicField, type DynamicFieldConfig } from '@/components/ui/forms/DynamicField';
import type { VariableInfo } from '../../types';

interface VariableFieldProps {
  category: string;
  varName: string;
  varInfo: VariableInfo;
  value: any;
  onChange: (category: string, variable: string, value: any) => void;
  onToggleMultiselect: (category: string, variable: string, option: string) => void;
  addressInputRef?: React.RefObject<HTMLInputElement | null>;
}

/**
 * Project-specific wrapper around DynamicField
 * Handles the variable naming and category-based onChange pattern
 */
export function VariableField({
  category,
  varName,
  varInfo,
  value,
  onChange,
  onToggleMultiselect,
  addressInputRef,
}: VariableFieldProps) {
  const label = varName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  const isAddressField = category === 'project_identity' && varName === 'full_address';

  const config: DynamicFieldConfig = {
    type: varInfo.type || 'text',
    label,
    description: varInfo.description,
    placeholder:
      varInfo.type === 'text'
        ? 'Enter value...'
        : varInfo.type === 'number'
          ? 'Enter number...'
          : undefined,
    options: varInfo.options,
  };

  return (
    <DynamicField
      config={config}
      value={value}
      onChange={newValue => onChange(category, varName, newValue)}
      onToggleOption={option => onToggleMultiselect(category, varName, option)}
      inputRef={isAddressField ? addressInputRef : undefined}
      name={`${category}_${varName}`}
    />
  );
}
