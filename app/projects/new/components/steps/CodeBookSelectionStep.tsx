'use client';

import type { CodeBook, StepProps } from '../../types';

interface CodeBookSelectionStepProps extends StepProps {
  codeBooks: CodeBook[];
  selectedChapterIds: string[];
  onToggleChapter: (chapterId: string) => void;
}

export function CodeBookSelectionStep({
  codeBooks,
  selectedChapterIds,
  onToggleChapter,
  onNext,
  onBack,
}: CodeBookSelectionStepProps) {
  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Select Code Books</h2>
      <p className="text-sm text-gray-600 mb-4">
        Choose which building codes are relevant for this project. Sections displayed in the
        assessment will be descendants of the selected codes.
      </p>

      <div className="space-y-4 max-h-96 overflow-y-auto">
        {codeBooks.map(code => (
          <div key={code.id} className="border rounded-lg p-3">
            <div className="font-medium text-gray-900 mb-2">{code.name}</div>
            <div className="text-sm text-gray-500 mb-3">
              {[code.publisher, code.jurisdiction, code.year].filter(Boolean).join(' • ')}
            </div>
            {code.chapters && code.chapters.length > 0 && (
              <div className="space-y-2 pl-2">
                {code.chapters.map(chapter => (
                  <label
                    key={chapter.id}
                    className="flex items-center p-2 rounded hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedChapterIds.includes(chapter.id)}
                      onChange={() => onToggleChapter(chapter.id)}
                      className="mr-3"
                    />
                    <div className="flex-1">
                      <span className="text-sm font-medium">{chapter.number}</span>
                      <span className="text-sm text-gray-600 ml-2">{chapter.name}</span>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-6 flex justify-between">
        <button onClick={onBack} className="btn-secondary">
          ← Back
        </button>
        <button onClick={onNext} disabled={selectedChapterIds.length === 0} className="btn-primary">
          Next →
        </button>
      </div>
    </div>
  );
}

