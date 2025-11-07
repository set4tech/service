'use client';

import type { ProjectData, StepProps } from '../../types';

interface ProjectInfoStepProps extends StepProps {
  projectData: ProjectData;
  onChange: (updates: Partial<ProjectData>) => void;
}

export function ProjectInfoStep({ projectData, onChange, onNext }: ProjectInfoStepProps) {
  const isValid = projectData.name.trim().length > 0;

  return (
    <div className="stack-md">
      <h2 className="text-xl font-semibold mb-4">Project Information</h2>

      <div className="stack-md">
        <div>
          <label className="block text-sm font-medium text-gray-700">Project Name *</label>
          <input
            type="text"
            value={projectData.name}
            onChange={e => onChange({ name: e.target.value })}
            className="input mt-1"
            placeholder="e.g., 255 California Street Renovation"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Description</label>
          <textarea
            value={projectData.description}
            onChange={e => onChange({ description: e.target.value })}
            className="input mt-1"
            rows={3}
            placeholder="Project description..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Customer Report Password (Optional)
          </label>
          <input
            type="text"
            value={projectData.report_password}
            onChange={e => onChange({ report_password: e.target.value })}
            className="input mt-1"
            placeholder="Leave blank for no password protection"
          />
          <p className="mt-1 text-sm text-gray-500">
            Set a password for customer access to the project report. This password will be publicly
            shared with your customers.
          </p>
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <button onClick={onNext} disabled={!isValid} className="btn-primary">
          Next →
        </button>
      </div>
    </div>
  );
}
