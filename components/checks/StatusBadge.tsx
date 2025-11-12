interface StatusBadgeProps {
  status: string;
  size?: 'xs' | 'sm';
}

export function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
  const colors: Record<string, string> = {
    compliant: 'bg-green-100 border-green-400 text-green-800',
    non_compliant: 'bg-red-100 border-red-400 text-red-800',
    needs_more_info: 'bg-yellow-100 border-yellow-400 text-yellow-800',
    not_applicable: 'bg-gray-100 border-gray-400 text-gray-600',
    insufficient_information: 'bg-orange-100 border-orange-400 text-orange-800',
    pending: 'bg-blue-50 border-blue-300 text-blue-700',
    completed: 'bg-green-50 border-green-300 text-green-700',
    failed: 'bg-red-50 border-red-300 text-red-700',
  };

  const sizeClasses = {
    xs: 'text-xs',
    sm: 'text-sm',
  };

  return (
    <span
      className={`px-2 py-0.5 rounded border font-medium ${sizeClasses[size]} ${colors[status] || 'bg-gray-100 border-gray-400 text-gray-600'}`}
    >
      {status.replace('_', ' ')}
    </span>
  );
}
