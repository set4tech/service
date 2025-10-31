/**
 * Dynamic form field component that renders different input types
 * based on the field configuration
 */

export interface DynamicFieldConfig {
  type: 'text' | 'number' | 'date' | 'boolean' | 'select' | 'multiselect' | 'textarea';
  label: string;
  description?: string;
  placeholder?: string;
  options?: string[]; // For select and multiselect
  required?: boolean;
  disabled?: boolean;
}

interface DynamicFieldProps {
  config: DynamicFieldConfig;
  value: any;
  onChange: (value: any) => void;
  onToggleOption?: (option: string) => void; // For multiselect
  inputRef?: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  name?: string; // For radio groups
  className?: string;
}

export function DynamicField({
  config,
  value,
  onChange,
  onToggleOption,
  inputRef,
  name,
  className = '',
}: DynamicFieldProps) {
  const { type, label, description, placeholder, options, required, disabled } = config;

  return (
    <div className={className}>
      <label className="block text-sm text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-600 ml-1">*</span>}
        {description && (
          <span className="block text-xs text-gray-500 mt-0.5 font-normal">{description}</span>
        )}
      </label>

      {type === 'text' && (
        <input
          type="text"
          ref={inputRef as React.RefObject<HTMLInputElement>}
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          className="input"
          placeholder={placeholder}
          required={required}
          disabled={disabled}
        />
      )}

      {type === 'number' && (
        <input
          type="number"
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          className="input"
          placeholder={placeholder}
          required={required}
          disabled={disabled}
        />
      )}

      {type === 'date' && (
        <input
          type="date"
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          className="input"
          required={required}
          disabled={disabled}
        />
      )}

      {type === 'textarea' && (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          className="input"
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          rows={3}
        />
      )}

      {type === 'boolean' && (
        <div className="flex items-center space-x-4">
          <label className="flex items-center">
            <input
              type="radio"
              name={name}
              checked={value === true}
              onChange={() => onChange(true)}
              className="mr-2"
              disabled={disabled}
            />
            Yes
          </label>
          <label className="flex items-center">
            <input
              type="radio"
              name={name}
              checked={value === false}
              onChange={() => onChange(false)}
              className="mr-2"
              disabled={disabled}
            />
            No
          </label>
        </div>
      )}

      {type === 'select' && options && (
        <select
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          className="select"
          required={required}
          disabled={disabled}
        >
          <option value="">Select an option...</option>
          {options.map((option: string) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      )}

      {type === 'multiselect' && options && onToggleOption && (
        <div className="space-y-2">
          {options.map((option: string) => (
            <label key={option} className="flex items-center">
              <input
                type="checkbox"
                checked={(value || []).includes(option)}
                onChange={() => onToggleOption(option)}
                className="mr-2"
                disabled={disabled}
              />
              <span className="text-sm">{option}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
