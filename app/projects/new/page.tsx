'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Script from 'next/script';

interface Customer {
  id: string;
  name: string;
  contact_email: string;
}

interface CodeBook {
  id: string;
  name: string;
  publisher?: string;
  jurisdiction?: string;
  year?: string;
}

export default function NewProjectPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [codeBooks, setCodeBooks] = useState<CodeBook[]>([]);
  const [selectedCodeIds, setSelectedCodeIds] = useState<string[]>([]);
  const [variableChecklist, setVariableChecklist] = useState<any>(null);
  const [projectVariables, setProjectVariables] = useState<Record<string, Record<string, any>>>({});
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [googleLoaded, setGoogleLoaded] = useState(false);
  const addressInputRef = useRef<HTMLInputElement>(null);

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
    fetchCodeBooks();
    fetchVariableChecklist();
  }, []);

  useEffect(() => {
    console.log('Autocomplete effect:', { googleLoaded, step, hasRef: !!addressInputRef.current });
    if (!googleLoaded || step !== 4) return;

    const timer = setTimeout(() => {
      if (addressInputRef.current && (window as any).google?.maps?.places) {
        console.log('Initializing autocomplete');
        const autocomplete = new (window as any).google.maps.places.Autocomplete(
          addressInputRef.current,
          {
            types: ['address'],
            componentRestrictions: { country: 'us' }
          }
        );

        autocomplete.addListener('place_changed', () => {
          const place = autocomplete.getPlace();
          console.log('Place selected:', place);
          if (place.formatted_address) {
            updateVariable('project_identity', 'full_address', place.formatted_address);
          }
        });
      } else {
        console.log('Missing requirements:', {
          hasInput: !!addressInputRef.current,
          hasGoogle: !!(window as any).google,
          hasPlaces: !!(window as any).google?.maps?.places
        });
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [googleLoaded, step]);

  const fetchVariableChecklist = async () => {
    try {
      const response = await fetch('/variable_checklist.json');
      if (response.ok) {
        const data = await response.json();
        setVariableChecklist(data);
      }
    } catch (error) {
      console.error('Error fetching variable checklist:', error);
    }
  };

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

  const fetchCodeBooks = async () => {
    try {
      const response = await fetch('/api/codes');
      if (response.ok) {
        const data = await response.json();
        setCodeBooks(data);
      }
    } catch (error) {
      console.error('Error fetching code books:', error);
    }
  };

  const toggleCodeSelection = (codeId: string) => {
    setSelectedCodeIds(prev =>
      prev.includes(codeId)
        ? prev.filter(id => id !== codeId)
        : [...prev, codeId]
    );
  };

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);

        // Initialize autocomplete for address field when project_identity is expanded
        if (category === 'project_identity' && googleLoaded) {
          setTimeout(() => {
            if (addressInputRef.current && (window as any).google?.maps?.places) {
              console.log('Initializing autocomplete on expand');
              const autocomplete = new (window as any).google.maps.places.Autocomplete(
                addressInputRef.current,
                {
                  types: ['address'],
                  componentRestrictions: { country: 'us' }
                }
              );

              autocomplete.addListener('place_changed', () => {
                const place = autocomplete.getPlace();
                console.log('Place selected:', place);
                if (place.formatted_address) {
                  updateVariable('project_identity', 'full_address', place.formatted_address);
                }
              });
            }
          }, 100);
        }
      }
      return next;
    });
  };

  const updateVariable = (category: string, variable: string, value: any) => {
    setProjectVariables(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [variable]: value
      }
    }));
  };

  const toggleMultiselect = (category: string, variable: string, option: string) => {
    setProjectVariables(prev => {
      const currentValues = prev[category]?.[variable] || [];
      const newValues = currentValues.includes(option)
        ? currentValues.filter((v: string) => v !== option)
        : [...currentValues, option];

      return {
        ...prev,
        [category]: {
          ...prev[category],
          [variable]: newValues
        }
      };
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const MAX_SIZE = 500 * 1024 * 1024; // 500MB reasonable limit for S3 direct upload

      if (file.size > MAX_SIZE) {
        alert(
          'File is too large. Maximum size is 500MB. Please use a smaller file.'
        );
        e.target.value = ''; // Clear the input
        return;
      }

      setPdfFile(file);
    }
  };

  const uploadPdf = async () => {
    if (!pdfFile) return null;

    try {
      // Step 1: Get pre-signed URL from our API
      const presignResponse = await fetch('/api/upload/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: pdfFile.name,
          contentType: pdfFile.type || 'application/pdf',
        }),
      });

      if (!presignResponse.ok) {
        throw new Error('Failed to get upload URL');
      }

      const { uploadUrl, fileUrl } = await presignResponse.json();

      // Step 2: Upload directly to S3 using the pre-signed URL
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: pdfFile,
        headers: {
          'Content-Type': pdfFile.type || 'application/pdf',
        },
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file to S3');
      }

      // Return the final file URL
      return fileUrl;
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

      // Format manually entered variables to match extraction structure
      const extractedVariables: Record<string, any> = {};
      for (const [category, variables] of Object.entries(projectVariables)) {
        if (Object.keys(variables).length > 0) {
          extractedVariables[category] = {};
          for (const [varName, value] of Object.entries(variables)) {
            // Skip empty/null/undefined values
            if (value === null || value === undefined) continue;
            if (typeof value === 'string' && value.trim() === '') continue;
            if (Array.isArray(value) && value.length === 0) continue;

            extractedVariables[category][varName] = {
              value: value,
              confidence: 'high' // Manual entry is always high confidence
            };
          }
        }
      }

      // Add metadata
      const finalVariables = Object.keys(extractedVariables).length > 0 ? {
        ...extractedVariables,
        _metadata: {
          entry_method: 'manual',
          entry_date: new Date().toISOString()
        }
      } : null;

      // Create project
      const projectResponse = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...projectData,
          customer_id: customerId,
          pdf_url: pdfUrl,
          status: 'in_progress',
          selected_code_ids: selectedCodeIds,
          extracted_variables: finalVariables,
          extraction_status: finalVariables ? 'completed' : null,
          extraction_completed_at: finalVariables ? new Date().toISOString() : null
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
    <>
      <Script
        src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`}
        onLoad={() => {
          console.log('Google Maps loaded');
          setGoogleLoaded(true);
        }}
        onError={(e) => console.error('Google Maps load error:', e)}
      />
      <main className="min-h-screen bg-gray-50">
        <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Create New Project</h1>
          <div className="mt-4 flex space-x-2">
            {[1, 2, 3, 4, 5, 6].map(s => (
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
              <h2 className="text-xl font-semibold mb-4">Select Code Books</h2>
              <p className="text-sm text-gray-600 mb-4">
                Choose which building codes are relevant for this project. Sections displayed in the assessment will be descendants of the selected codes.
              </p>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {codeBooks.map(code => (
                  <label
                    key={code.id}
                    className="flex items-start p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedCodeIds.includes(code.id)}
                      onChange={() => toggleCodeSelection(code.id)}
                      className="mt-1 mr-3"
                    />
                    <div className="flex-1">
                      <div className="font-medium">{code.name}</div>
                      <div className="text-sm text-gray-500">
                        {[code.publisher, code.jurisdiction, code.year]
                          .filter(Boolean)
                          .join(' • ')}
                      </div>
                    </div>
                  </label>
                ))}
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
                  disabled={selectedCodeIds.length === 0}
                  className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                >
                  Next →
                </button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div>
              <h2 className="text-xl font-semibold mb-4">Project Variables</h2>
              <p className="text-sm text-gray-600 mb-4">
                Enter project details. These will be used for compliance analysis. Fields are optional.
              </p>

              {!variableChecklist ? (
                <div className="text-center py-8 text-gray-500">Loading...</div>
              ) : (
                <div className="space-y-3 max-h-[500px] overflow-y-auto">
                  {Object.entries(variableChecklist).map(([category, items]: [string, any]) => (
                    <div key={category} className="border rounded-lg">
                      <button
                        type="button"
                        onClick={() => toggleCategory(category)}
                        className="w-full flex items-center justify-between p-3 hover:bg-gray-50 text-left"
                      >
                        <span className="font-medium text-gray-900">
                          {category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </span>
                        <span className="text-gray-400">
                          {expandedCategories.has(category) ? '−' : '+'}
                        </span>
                      </button>

                      {expandedCategories.has(category) && (
                        <div className="p-3 pt-0 space-y-3 border-t">
                          {Object.entries(items).map(([varName, varInfo]: [string, any]) => {
                            const fieldType = varInfo.type || 'text';
                            const label = varName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

                            return (
                              <div key={varName}>
                                <label className="block text-sm text-gray-700 mb-1">
                                  {label}
                                  {varInfo.description && (
                                    <span className="block text-xs text-gray-500 mt-0.5 font-normal">
                                      {varInfo.description}
                                    </span>
                                  )}
                                </label>

                                {fieldType === 'text' && (
                                  <input
                                    type="text"
                                    ref={category === 'project_identity' && varName === 'full_address' ? addressInputRef : null}
                                    value={projectVariables[category]?.[varName] || ''}
                                    onChange={(e) => updateVariable(category, varName, e.target.value)}
                                    className="w-full text-sm rounded border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                                    placeholder="Enter value..."
                                  />
                                )}

                                {fieldType === 'number' && (
                                  <input
                                    type="number"
                                    value={projectVariables[category]?.[varName] || ''}
                                    onChange={(e) => updateVariable(category, varName, e.target.value)}
                                    className="w-full text-sm rounded border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                                    placeholder="Enter number..."
                                  />
                                )}

                                {fieldType === 'date' && (
                                  <input
                                    type="date"
                                    value={projectVariables[category]?.[varName] || ''}
                                    onChange={(e) => updateVariable(category, varName, e.target.value)}
                                    className="w-full text-sm rounded border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                                  />
                                )}

                                {fieldType === 'boolean' && (
                                  <div className="flex items-center space-x-4">
                                    <label className="flex items-center">
                                      <input
                                        type="radio"
                                        name={`${category}_${varName}`}
                                        checked={projectVariables[category]?.[varName] === true}
                                        onChange={() => updateVariable(category, varName, true)}
                                        className="mr-2"
                                      />
                                      Yes
                                    </label>
                                    <label className="flex items-center">
                                      <input
                                        type="radio"
                                        name={`${category}_${varName}`}
                                        checked={projectVariables[category]?.[varName] === false}
                                        onChange={() => updateVariable(category, varName, false)}
                                        className="mr-2"
                                      />
                                      No
                                    </label>
                                  </div>
                                )}

                                {fieldType === 'select' && varInfo.options && (
                                  <select
                                    value={projectVariables[category]?.[varName] || ''}
                                    onChange={(e) => updateVariable(category, varName, e.target.value)}
                                    className="w-full text-sm rounded border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                                  >
                                    <option value="">Select an option...</option>
                                    {varInfo.options.map((option: string) => (
                                      <option key={option} value={option}>{option}</option>
                                    ))}
                                  </select>
                                )}

                                {fieldType === 'multiselect' && varInfo.options && (
                                  <div className="space-y-2">
                                    {varInfo.options.map((option: string) => (
                                      <label key={option} className="flex items-center">
                                        <input
                                          type="checkbox"
                                          checked={(projectVariables[category]?.[varName] || []).includes(option)}
                                          onChange={() => toggleMultiselect(category, varName, option)}
                                          className="mr-2"
                                        />
                                        <span className="text-sm">{option}</span>
                                      </label>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-6 flex justify-between">
                <button
                  onClick={() => setStep(3)}
                  className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                >
                  ← Back
                </button>
                <button
                  onClick={() => setStep(5)}
                  className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition"
                >
                  Next →
                </button>
              </div>
            </div>
          )}

          {step === 5 && (
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
                  onClick={() => setStep(4)}
                  className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                >
                  ← Back
                </button>
                <button
                  onClick={() => setStep(6)}
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

          {step === 6 && (
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
                  <h3 className="font-semibold text-sm text-gray-700 mb-2">Selected Code Books</h3>
                  <div className="text-sm space-y-1">
                    {selectedCodeIds.map(id => {
                      const code = codeBooks.find(c => c.id === id);
                      return (
                        <div key={id}>
                          • {code?.name}
                        </div>
                      );
                    })}
                  </div>
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
                  onClick={() => setStep(5)}
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
    </>
  );
}
