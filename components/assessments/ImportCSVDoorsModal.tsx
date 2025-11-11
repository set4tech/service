'use client';

import { useState } from 'react';
import { Upload, FileText, CheckCircle, XCircle, X } from 'lucide-react';

interface ImportCSVDoorsModalProps {
  assessmentId: string;
  onSuccess?: (data: { doorsCreated: number; doors: any[] }) => void;
}

export function ImportCSVDoorsModal({ assessmentId, onSuccess }: ImportCSVDoorsModalProps) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ doorsCreated: number; doors: any[] } | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.name.endsWith('.csv')) {
        setError('Please select a CSV file');
        return;
      }
      setFile(selectedFile);
      setError(null);
      setSuccess(null);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a file');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      console.log(`Uploading CSV for assessment ${assessmentId}`);

      const response = await fetch(`/api/assessments/${assessmentId}/import-csv-doors`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to import doors');
      }

      console.log(`Successfully imported ${data.doorsCreated} doors`);
      setSuccess(data);

      if (onSuccess) {
        onSuccess(data);
      }

      // Close modal after success
      setTimeout(() => {
        setOpen(false);
        setFile(null);
        setSuccess(null);
      }, 2000);
    } catch (err) {
      console.error('Error importing CSV:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setOpen(false);
      setFile(null);
      setError(null);
      setSuccess(null);
    }
  };

  return (
    <>
      {/* Trigger Button */}
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
      >
        <Upload className="h-4 w-4" />
        Import CSV
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black/50" onClick={handleClose} />

          {/* Modal Content */}
          <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6 z-10">
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Import Door Elements from CSV
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  Upload a CSV file with door annotations (GroupID=5) to create door element
                  instances.
                </p>
              </div>
              <button
                onClick={handleClose}
                disabled={loading}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* File Input */}
            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="csv-file" className="block text-sm font-medium text-gray-700">
                  Select CSV File
                </label>
                <input
                  id="csv-file"
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  disabled={loading}
                  className="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 focus:outline-none file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                {file && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <FileText className="h-4 w-4" />
                    <span>{file.name}</span>
                    <span className="text-gray-400">({(file.size / 1024).toFixed(1)} KB)</span>
                  </div>
                )}
              </div>

              {/* Error Message */}
              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <XCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red-800">Error</p>
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                </div>
              )}

              {/* Success Message */}
              {success && (
                <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-green-800">Success!</p>
                    <p className="text-sm text-green-700">
                      Created {success.doorsCreated} door{success.doorsCreated !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
              )}

              {/* Instructions */}
              <div className="text-sm text-gray-600 space-y-1">
                <p className="font-medium">CSV Requirements:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Must contain door annotations with GroupID=5</li>
                  <li>Should include Rectangle elements for bounding boxes</li>
                  <li>
                    Measurements: &quot;Front, pull&quot;, &quot;Front, push&quot;, &quot;Pull,
                    latch&quot;, &quot;Push, latch&quot;, &quot;Hinge, push&quot;
                  </li>
                </ul>
              </div>

              {/* Buttons */}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={handleClose}
                  disabled={loading}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpload}
                  disabled={!file || loading}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Importing...' : 'Import Doors'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
