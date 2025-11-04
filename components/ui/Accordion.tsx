import { ReactNode } from 'react';

interface AccordionProps {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
  className?: string;
}

/**
 * Reusable accordion/collapsible component
 * Shows title bar that expands/collapses content
 */
export function Accordion({ title, expanded, onToggle, children, className = '' }: AccordionProps) {
  return (
    <div className={`border rounded-lg ${className}`}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3 hover:bg-gray-50 text-left"
        aria-expanded={expanded}
      >
        <span className="font-medium text-gray-900">{title}</span>
        <span className="text-gray-400" aria-hidden="true">
          {expanded ? '−' : '+'}
        </span>
      </button>

      {expanded && <div className="p-3 pt-0 space-y-3 border-t">{children}</div>}
    </div>
  );
}

