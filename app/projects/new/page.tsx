'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { useMultiStepForm } from '@/hooks/useMultiStepForm';
import { useProjectForm } from './hooks/useProjectForm';
import { StepIndicator } from '@/components/ui/StepIndicator';
import { TOTAL_STEPS } from './hooks/useMultiStepForm';
import { ProjectInfoStep } from './components/steps/ProjectInfoStep';
import { PdfUploadStep } from './components/steps/PdfUploadStep';
import { CodeBookSelectionStep } from './components/steps/CodeBookSelectionStep';
import { CustomerInfoStep } from './components/steps/CustomerInfoStep';
import { ReviewStep } from './components/steps/ReviewStep';

import type { Customer, CodeBook } from './types';

export default function NewProjectPage() {
  const router = useRouter();
  const { step, next, back } = useMultiStepForm(1, TOTAL_STEPS);
  const formState = useProjectForm();

  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [codeBooks, setCodeBooks] = useState<CodeBook[]>([]);

  useEffect(() => {
    fetchCustomers();
    fetchCodeBooks();
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

      // Create project (variables will be added later in the assessment view)
      const projectResponse = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formState.projectData,
          customer_id: customerId,
          pdf_url: pdfUrl,
          status: 'in_progress',
        }),
      });

      if (projectResponse.ok) {
        const project = await projectResponse.json();

        // Trigger PDF chunking in background (fire-and-forget)
        fetch(`/api/projects/${project.id}/chunk`, { method: 'POST' }).catch(err => {
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
      case 5:
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
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Create New Project</h1>
          <StepIndicator currentStep={step} totalSteps={TOTAL_STEPS} />
        </div>

        <div className="card">{renderStep()}</div>
      </div>
    </main>
  );
}
