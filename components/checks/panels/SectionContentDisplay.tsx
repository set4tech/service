import type { CodeSection } from '@/types/analysis';
import { TableRenderer } from '@/components/ui/TableRenderer';

interface Check {
  element_groups?: {
    name?: string;
  };
}

interface SectionContentDisplayProps {
  section: CodeSection | null;
  loading: boolean;
  error: string | null;
  isElementCheck: boolean;
  sections: CodeSection[];
  check: Check | null;
}

export function SectionContentDisplay({
  section,
  loading,
  error,
  isElementCheck,
  sections,
  check,
}: SectionContentDisplayProps) {
  if (loading) {
    return <div className="text-sm text-gray-500">Loading section details...</div>;
  }

  if (error) {
    return (
      <div className="text-sm text-red-600">
        <p className="font-medium">Error loading section</p>
        <p className="text-xs mt-1">{error}</p>
      </div>
    );
  }

  if (!section) {
    return null;
  }

  return (
    <>
      {/* Element Check Info Banner */}
      {isElementCheck && (
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <svg
              width="20"
              height="20"
              className="text-blue-600 flex-shrink-0 mt-0.5"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
            </svg>
            <div>
              <div className="text-sm font-semibold text-blue-900 mb-1">Element-Based Check</div>
              <div className="text-xs text-blue-800 leading-relaxed">
                This {check?.element_groups?.name?.toLowerCase().replace(/s$/, '')} check evaluates{' '}
                <span className="font-semibold">{sections.length} code sections</span> together in a
                single assessment. All requirements from these sections apply to this specific{' '}
                {check?.element_groups?.name?.toLowerCase().replace(/s$/, '')}.
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {/* Intro Section - Section Group Overview */}
        {section.intro_section && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">
              Section Group Overview
            </div>
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-sm font-mono font-medium text-blue-900">
                {section.intro_section.number}
              </span>
              <span className="text-sm text-blue-800">{section.intro_section.title}</span>
            </div>
            {section.intro_section.text && (
              <div className="text-sm text-blue-900 leading-relaxed italic mt-2">
                {section.intro_section.text}
              </div>
            )}
          </div>
        )}

        {/* Section Header */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Section
            </div>
            {section.source_url && (
              <a
                href={section.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1 transition-colors"
              >
                See Original Code
                <svg
                  width="12"
                  height="12"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  className="flex-shrink-0"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </a>
            )}
          </div>
          <div className="text-lg font-bold text-gray-900">{section.number}</div>
          <div className="text-base text-gray-700 mt-1">{section.title}</div>
        </div>

        {/* Section Text */}
        {section.text && (
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Section Summary
            </div>
            <div className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap bg-gray-50 p-3 rounded border border-gray-200">
              {section.text}
            </div>
          </div>
        )}

        {/* Explanation (Paragraphs) */}
        {section.requirements && section.requirements.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Explanation
            </div>
            <div className="space-y-3">
              {section.requirements.map((req, idx) => {
                const text = typeof req === 'string' ? req : req.text || '';
                return (
                  <div key={idx} className="text-sm text-gray-800 leading-relaxed">
                    <div className="text-xs text-gray-500 font-mono mb-1">Paragraph {idx + 1}</div>
                    <div className="pl-3 border-l-2 border-gray-300">{text}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tables */}
        {section.tables && section.tables.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Tables
            </div>
            <TableRenderer tables={section.tables} />
          </div>
        )}

        {/* References */}
        {section.references && section.references.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Referenced Sections
            </div>
            <div className="space-y-3">
              {section.references.map(ref => (
                <div key={ref.key} className="border border-gray-200 rounded p-3 bg-blue-50">
                  <div className="font-medium text-sm text-blue-900">{ref.number}</div>
                  <div className="text-sm text-gray-700 mt-1">{ref.title}</div>
                  {ref.text && (
                    <div className="text-xs text-gray-600 mt-2 leading-relaxed whitespace-pre-wrap">
                      {ref.text}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!section.text && (!section.requirements || section.requirements.length === 0) && (
          <div className="text-sm text-gray-500 italic">
            No detailed content available for this section.
          </div>
        )}
      </div>
    </>
  );
}
