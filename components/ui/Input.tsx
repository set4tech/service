'use client';
import { useId } from 'react';

export default function Input({
  label,
  required,
  error,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  const id = useId();
  return (
    <div className="stack-sm">
      <label htmlFor={id} className="text-sm font-medium text-gray-700">
        {label}
        {required && ' *'}
      </label>
      <input id={id} required={required} aria-invalid={!!error} className="input" {...props} />
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
