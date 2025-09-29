'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface Customer {
  id: string;
  name: string;
  contact_email: string;
}

export default function NewProjectPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);

  // Form state
  const [projectData, setProjectData] = useState({
    name: '',
    description: '',
    customer_id: '',
    pdf_url: '',
  });

  const [newCustomer, setNewCustomer] = useState({
    name: '',
  });

  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [createNewCustomer, setCreateNewCustomer] = useState(false);

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      const response = await fetch('/api/customers');
      if (response.ok) {
        const data = await response.json();
        setCustomers(data);
      }
    } catch (error) {
      console.error('Error fetching customers:', error);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const MAX_SIZE = 50 * 1024 * 1024; // 50MB for Vercel Pro plan

      if (file.size > MAX_SIZE) {
        alert(
          'File is too large. Maximum size is 50MB. Please compress your PDF or use a smaller file.'
        );
        e.target.value = ''; // Clear the input
        return;
      }

      setPdfFile(file);
    }
  };

  const uploadPdf = async () => {
    if (!pdfFile) return null;

    const formData = new FormData();
    formData.append('file', pdfFile);

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 413) {
          throw new Error('File is too large. Maximum size is 50MB.');
        }
        throw new Error(errorData.error || 'Failed to upload PDF');
      }

      const { url } = await response.json();
      return url;
    } catch (error) {
      console.error('Error uploading PDF:', error);
      throw error; // Re-throw to handle in handleSubmit
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      let customerId = projectData.customer_id;

      // Create new customer if needed
      if (createNewCustomer) {
        const customerResponse = await fetch('/api/customers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newCustomer),
        });

        if (customerResponse.ok) {
          const customer = await customerResponse.json();
          customerId = customer.id;
        }
      }

      // Upload PDF
      let pdfUrl;
      try {
        pdfUrl = await uploadPdf();
        if (!pdfUrl) {
          alert('Failed to upload PDF');
          setLoading(false);
          return;
        }
      } catch (uploadError: any) {
        alert(uploadError.message || 'Failed to upload PDF');
        setLoading(false);
        return;
      }

      // Create project
      const projectResponse = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...projectData,
          customer_id: customerId,
          pdf_url: pdfUrl,
          status: 'in_progress',
        }),
      });

      if (projectResponse.ok) {
        const project = await projectResponse.json();

        // Get or create assessment for the project
        const assessmentResponse = await fetch(`/api/projects/${project.id}/assessment`);
        if (assessmentResponse.ok) {
          const { assessmentId } = await assessmentResponse.json();
          router.push(`/assessments/${assessmentId}`);
        }
      }
    } catch (error) {
      console.error('Error creating project:', error);
      alert('Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Create New Project</h1>
          <div className="mt-4 flex space-x-2">
            {[1, 2, 3, 4].map(s => (
              <div
                key={s}
                className={`h-2 flex-1 rounded ${s <= step ? 'bg-blue-600' : 'bg-gray-300'}`}
              />
            ))}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          {step === 1 && (
            <div>
              <h2 className="text-xl font-semibold mb-4">Project Information</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Project Name *</label>
                  <input
                    type="text"
                    value={projectData.name}
                    onChange={e => setProjectData({ ...projectData, name: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    placeholder="e.g., 255 California Street Renovation"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Description</label>
                  <textarea
                    value={projectData.description}
                    onChange={e => setProjectData({ ...projectData, description: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    rows={3}
                    placeholder="Project description..."
                  />
                </div>
              </div>
              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setStep(2)}
                  disabled={!projectData.name}
                  className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                >
                  Next →
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 className="text-xl font-semibold mb-4">Upload PDF Document</h2>
              <div className="space-y-4">
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={handleFileChange}
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
                <button
                  onClick={() => setStep(1)}
                  className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                >
                  ← Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={!pdfFile}
                  className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                >
                  Next →
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <h2 className="text-xl font-semibold mb-4">Customer Information</h2>
              <div className="space-y-4">
                <div className="flex items-center space-x-4 mb-4">
                  <button
                    onClick={() => setCreateNewCustomer(false)}
                    className={`px-5 py-2.5 rounded-lg ${
                      !createNewCustomer ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'
                    }`}
                  >
                    Select Existing
                  </button>
                  <button
                    onClick={() => setCreateNewCustomer(true)}
                    className={`px-5 py-2.5 rounded-lg ${
                      createNewCustomer ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'
                    }`}
                  >
                    Create New
                  </button>
                </div>

                {!createNewCustomer ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Select Customer
                    </label>
                    <select
                      value={projectData.customer_id}
                      onChange={e =>
                        setProjectData({ ...projectData, customer_id: e.target.value })
                      }
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    >
                      <option value="">Select a customer...</option>
                      {customers.map(customer => (
                        <option key={customer.id} value={customer.id}>
                          {customer.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Customer Name *
                      </label>
                      <input
                        type="text"
                        value={newCustomer.name}
                        onChange={e => setNewCustomer({ ...newCustomer, name: e.target.value })}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        placeholder="Enter customer name"
                      />
                    </div>
                  </div>
                )}
              </div>
              <div className="mt-6 flex justify-between">
                <button
                  onClick={() => setStep(2)}
                  className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                >
                  ← Back
                </button>
                <button
                  onClick={() => setStep(4)}
                  disabled={
                    (!createNewCustomer && !projectData.customer_id) ||
                    (createNewCustomer && !newCustomer.name)
                  }
                  className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                >
                  Next →
                </button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div>
              <h2 className="text-xl font-semibold mb-4">Review & Create</h2>
              <div className="space-y-4">
                <div className="bg-gray-50 rounded-lg p-4">
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

                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-semibold text-sm text-gray-700 mb-2">PDF Document</h3>
                  <p className="text-sm">{pdfFile?.name}</p>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-semibold text-sm text-gray-700 mb-2">Customer</h3>
                  {createNewCustomer ? (
                    <p className="text-sm">{newCustomer.name} (New)</p>
                  ) : (
                    <p className="text-sm">
                      {customers.find(c => c.id === projectData.customer_id)?.name}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-6 flex justify-between">
                <button
                  onClick={() => setStep(3)}
                  className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                  disabled={loading}
                >
                  ← Back
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="bg-green-600 text-white px-8 py-3 rounded-lg hover:bg-green-700 transition disabled:opacity-50"
                >
                  {loading ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
