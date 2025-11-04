'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Script from 'next/script';

import { useMultiStepForm } from '@/hooks/useMultiStepForm';
import { useProjectForm } from './hooks/useProjectForm';
import { StepIndicator } from '@/components/ui/StepIndicator';
import { TOTAL_STEPS } from './hooks/useMultiStepForm';
import { ProjectInfoStep } from './components/steps/ProjectInfoStep';
import { PdfUploadStep } from './components/steps/PdfUploadStep';
import { CodeBookSelectionStep } from './components/steps/CodeBookSelectionStep';
import { ProjectVariablesStep } from './components/steps/ProjectVariablesStep';
import { CustomerInfoStep } from './components/steps/CustomerInfoStep';
import { ReviewStep } from './components/steps/ReviewStep';

import type { Customer, CodeBook, VariableChecklist } from './types';

export default function NewProjectPage() {
  const router = useRouter();
  const { step, next, back } = useMultiStepForm(1, TOTAL_STEPS);
  const formState = useProjectForm();

  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [codeBooks, setCodeBooks] = useState<CodeBook[]>([]);
  const [variableChecklist, setVariableChecklist] = useState<VariableChecklist | null>(null);
  const [googleLoaded, setGoogleLoaded] = useState(false);
  const addressInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchCustomers();
    fetchCodeBooks();
    fetchVariableChecklist();
  }, []);

  // Google Maps autocomplete initialization
  useEffect(() => {
    if (!googleLoaded || step !== 4) return;

    const timer = setTimeout(() => {
      if (addressInputRef.current && (window as any).google?.maps?.places) {
        const autocomplete = new (window as any).google.maps.places.Autocomplete(
          addressInputRef.current,
          {
            types: ['address'],
            componentRestrictions: { country: 'us' },
          }
        );

        autocomplete.addListener('place_changed', () => {
          const place = autocomplete.getPlace();
          if (place.formatted_address) {
            formState.updateVariable('project_identity', 'full_address', place.formatted_address);
          }
        });
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [googleLoaded, step, formState]);

  // Initialize autocomplete when project_identity category is expanded
  useEffect(() => {
    if (
      formState.expandedCategories.has('project_identity') &&
      googleLoaded &&
      addressInputRef.current &&
      (window as any).google?.maps?.places
    ) {
      setTimeout(() => {
        if (addressInputRef.current && (window as any).google?.maps?.places) {
          const autocomplete = new (window as any).google.maps.places.Autocomplete(
            addressInputRef.current,
            {
              types: ['address'],
              componentRestrictions: { country: 'us' },
            }
          );

          autocomplete.addListener('place_changed', () => {
            const place = autocomplete.getPlace();
            if (place.formatted_address) {
              formState.updateVariable('project_identity', 'full_address', place.formatted_address);
            }
          });
        }
      }, 100);
    }
  }, [formState.expandedCategories, googleLoaded, formState]);

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const MAX_SIZE = 500 * 1024 * 1024; // 500MB

      if (file.size > MAX_SIZE) {
        alert('File is too large. Maximum size is 500MB. Please use a smaller file.');
        e.target.value = '';
        return;
      }

      formState.setPdfFile(file);
    }
  };

  const uploadPdf = async () => {
    if (!formState.pdfFile) return null;

    try {
      const presignResponse = await fetch('/api/upload/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: formState.pdfFile.name,
          contentType: formState.pdfFile.type || 'application/pdf',
        }),
      });

      if (!presignResponse.ok) {
        throw new Error('Failed to get upload URL');
      }

      const { uploadUrl, fileUrl } = await presignResponse.json();

      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: formState.pdfFile,
        headers: {
          'Content-Type': formState.pdfFile.type || 'application/pdf',
        },
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file to S3');
      }

      return fileUrl;
    } catch (error) {
      console.error('Error uploading PDF:', error);
      throw error;
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      let customerId = formState.projectData.customer_id;

      // Create new customer if needed
      if (formState.createNewCustomer) {
        const customerResponse = await fetch('/api/customers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formState.newCustomer),
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

      // Format manually entered variables
      const extractedVariables: Record<string, any> = {};
      for (const [category, variables] of Object.entries(formState.projectVariables)) {
        if (Object.keys(variables).length > 0) {
          extractedVariables[category] = {};
          for (const [varName, value] of Object.entries(variables)) {
            if (value === null || value === undefined) continue;
            if (typeof value === 'string' && value.trim() === '') continue;
            if (Array.isArray(value) && value.length === 0) continue;

            extractedVariables[category][varName] = {
              value: value,
              confidence: 'high',
            };
          }
        }
      }

      const finalVariables =
        Object.keys(extractedVariables).length > 0
          ? {
              ...extractedVariables,
              _metadata: {
                entry_method: 'manual',
                entry_date: new Date().toISOString(),
              },
            }
          : null;

      // Create project
      const projectResponse = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formState.projectData,
          customer_id: customerId,
          pdf_url: pdfUrl,
          status: 'in_progress',
          extracted_variables: finalVariables,
          extraction_status: finalVariables ? 'completed' : null,
          extraction_completed_at: finalVariables ? new Date().toISOString() : null,
        }),
      });

      if (projectResponse.ok) {
        const project = await projectResponse.json();

        // Trigger PDF chunking in background (fire-and-forget)
        fetch(`/api/project/${project.id}/chunk`, { method: 'POST' }).catch(err => {
          console.error('[Project Creation] PDF chunking failed:', err);
          // Don't block project creation on chunking failure
        });

        // Create assessment with selected chapters
        const assessmentResponse = await fetch(`/api/projects/${project.id}/assessment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            selected_chapter_ids: formState.selectedChapterIds,
          }),
        });

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

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <ProjectInfoStep
            projectData={formState.projectData}
            onChange={formState.updateProjectData}
            onNext={next}
            onBack={back}
          />
        );
      case 2:
        return (
          <PdfUploadStep
            pdfFile={formState.pdfFile}
            onFileChange={handleFileChange}
            onNext={next}
            onBack={back}
          />
        );
      case 3:
        return (
          <CodeBookSelectionStep
            codeBooks={codeBooks}
            selectedChapterIds={formState.selectedChapterIds}
            onToggleChapter={formState.toggleChapterSelection}
            onNext={next}
            onBack={back}
          />
        );
      case 4:
        return (
          <ProjectVariablesStep
            variableChecklist={variableChecklist}
            projectVariables={formState.projectVariables}
            expandedCategories={formState.expandedCategories}
            onUpdateVariable={formState.updateVariable}
            onToggleMultiselect={formState.toggleMultiselect}
            onToggleCategory={formState.toggleCategory}
            addressInputRef={addressInputRef}
            onNext={next}
            onBack={back}
          />
        );
      case 5:
        return (
          <CustomerInfoStep
            customers={customers}
            selectedCustomerId={formState.projectData.customer_id}
            createNewCustomer={formState.createNewCustomer}
            newCustomer={formState.newCustomer}
            onSelectCustomer={id => formState.updateProjectData({ customer_id: id })}
            onToggleCreateNew={formState.setCreateNewCustomer}
            onUpdateNewCustomer={formState.setNewCustomer}
            onNext={next}
            onBack={back}
          />
        );
      case 6:
        return (
          <ReviewStep
            projectData={formState.projectData}
            pdfFile={formState.pdfFile}
            selectedChapterIds={formState.selectedChapterIds}
            codeBooks={codeBooks}
            customers={customers}
            createNewCustomer={formState.createNewCustomer}
            newCustomer={formState.newCustomer}
            loading={loading}
            onSubmit={handleSubmit}
            onBack={back}
          />
        );
      default:
        return null;
    }
  };

  return (
    <>
      <Script
        src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`}
        onLoad={() => setGoogleLoaded(true)}
        onError={e => console.error('Google Maps load error:', e)}
      />

      <main className="min-h-screen bg-gray-50">
        <div className="max-w-3xl mx-auto px-4 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Create New Project</h1>
            <StepIndicator currentStep={step} totalSteps={TOTAL_STEPS} />
          </div>

          <div className="card">{renderStep()}</div>
        </div>
      </main>
    </>
  );
}
