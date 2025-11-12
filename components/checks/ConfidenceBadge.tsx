interface ConfidenceBadgeProps {
  confidence: string;
}

export function ConfidenceBadge({ confidence }: ConfidenceBadgeProps) {
  const colors: Record<string, string> = {
    high: 'bg-green-50 text-green-700',
    medium: 'bg-yellow-50 text-yellow-700',
    low: 'bg-red-50 text-red-700',
    'n/a': 'bg-gray-50 text-gray-500',
  };

  return (
    <span
      className={`text-xs px-2 py-0.5 rounded font-medium ${colors[confidence] || 'bg-gray-50 text-gray-500'}`}
    >
      {confidence}
    </span>
  );
}
