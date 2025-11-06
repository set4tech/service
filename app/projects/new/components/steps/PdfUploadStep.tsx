'use client';

import type { StepProps } from '../../types';

interface PdfUploadStepProps extends StepProps {
  pdfFile: File | null;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function PdfUploadStep({ pdfFile, onFileChange, onNext, onBack }: PdfUploadStepProps) {
  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Upload PDF Document</h2>

      <div className="space-y-4">
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
          <input
            type="file"
            accept=".pdf"
            onChange={onFileChange}
            className="hidden"
            id="pdf-upload"
          />
          <label htmlFor="pdf-upload" className="cursor-pointer">
            {pdfFile ? (
              <div>
                <p className="text-green-600 font-semibold">✓ {pdfFile.name}</p>
                <p className="text-sm text-gray-500 mt-2">Click to change file</p>
              </div>
            ) : (
              <div>
                <p className="text-gray-600">Click to upload PDF</p>
                <p className="text-sm text-gray-500 mt-2">or drag and drop</p>
              </div>
            )}
          </label>
        </div>
      </div>

      <div className="mt-6 flex justify-between">
        <button onClick={onBack} className="btn-secondary">
          ← Back
        </button>
        <button onClick={onNext} disabled={!pdfFile} className="btn-primary">
          Next →
        </button>
      </div>
    </div>
  );
}


