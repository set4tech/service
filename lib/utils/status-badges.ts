/**
 * Utility functions for status and confidence badge styling
 */

export function getConfidenceBadge(confidence: string): string {
  const colors: Record<string, string> = {
    high: 'bg-green-100 text-green-800',
    medium: 'bg-yellow-100 text-yellow-800',
    low: 'bg-red-100 text-red-800',
  };
  return colors[confidence] || 'bg-gray-100 text-gray-800';
}

export function getComplianceStatusColor(status: string): string {
  switch (status) {
    case 'compliant':
      return 'text-green-700 bg-green-50 border-green-200';
    case 'violation':
    case 'non_compliant':
      return 'text-red-700 bg-red-50 border-red-200';
    case 'needs_more_info':
      return 'text-yellow-700 bg-yellow-50 border-yellow-200';
    default:
      return 'text-gray-700 bg-gray-50 border-gray-200';
  }
}

export function getComplianceStatusBadgeColor(status: string): string {
  switch (status) {
    case 'compliant':
      return 'bg-green-100 text-green-800';
    case 'violation':
    case 'non_compliant':
      return 'bg-red-100 text-red-800';
    case 'needs_more_info':
      return 'bg-yellow-100 text-yellow-800';
    case 'not_applicable':
      return 'bg-gray-100 text-gray-600';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}
