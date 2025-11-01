'use client';

import type { ProjectData, CodeBook, Customer, NewCustomer } from '../../types';

interface ReviewStepProps {
  projectData: ProjectData;
  pdfFile: File | null;
  selectedChapterIds: string[];
  codeBooks: CodeBook[];
  customers: Customer[];
  createNewCustomer: boolean;
  newCustomer: NewCustomer;
  loading: boolean;
  onSubmit: () => void;
  onBack: () => void;
}

export function ReviewStep({
  projectData,
  pdfFile,
  selectedChapterIds,
  codeBooks,
  customers,
  createNewCustomer,
  newCustomer,
  loading,
  onSubmit,
  onBack,
}: ReviewStepProps) {
  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Review & Create</h2>

      <div className="space-y-4">
        <div className="card-muted">
          <h3 className="font-semibold text-sm text-gray-700 mb-2">Project Details</h3>
          <p className="text-sm">
            <strong>Name:</strong> {projectData.name}
          </p>
          {projectData.description && (
            <p className="text-sm">
              <strong>Description:</strong> {projectData.description}
            </p>
          )}
        </div>

        <div className="card-muted">
          <h3 className="font-semibold text-sm text-gray-700 mb-2">PDF Document</h3>
          <p className="text-sm">{pdfFile?.name}</p>
        </div>

        <div className="card-muted">
          <h3 className="font-semibold text-sm text-gray-700 mb-2">Selected Chapters</h3>
          <div className="text-sm space-y-1">
            {selectedChapterIds.map(chapterId => {
              const code = codeBooks.find(c => c.chapters.some(ch => ch.id === chapterId));
              const chapter = code?.chapters.find(ch => ch.id === chapterId);
              return (
                <div key={chapterId}>
                  • {code?.name} - {chapter?.number} {chapter?.name}
                </div>
              );
            })}
          </div>
        </div>

        <div className="card-muted">
          <h3 className="font-semibold text-sm text-gray-700 mb-2">Customer</h3>
          {createNewCustomer ? (
            <p className="text-sm">{newCustomer.name} (New)</p>
          ) : (
            <p className="text-sm">{customers.find(c => c.id === projectData.customer_id)?.name}</p>
          )}
        </div>
      </div>

      <div className="mt-6 flex justify-between">
        <button onClick={onBack} disabled={loading} className="btn-secondary">
          ← Back
        </button>
        <button
          onClick={onSubmit}
          disabled={loading}
          className="bg-green-600 text-white px-8 py-3 rounded-lg hover:bg-green-700 transition disabled:opacity-50"
        >
          {loading ? 'Creating...' : 'Create Project'}
        </button>
      </div>
    </div>
  );
}
