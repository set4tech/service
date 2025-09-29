'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

interface Section {
  key: string;
  number: string;
  title: string;
  type: string;
  requirements: string[];
  references: Array<{
    number: string;
    title: string;
    requirements: string[];
    key: string;
  }>;
  hasContent: boolean;
}

interface SectionCheck {
  sectionKey: string;
  status: 'pending' | 'screenshots_captured' | 'analyzing' | 'complete' | 'skipped';
  screenshots: string[];
  isCloneable: boolean;
  instances?: Array<{
    id: string;
    name: string;
    screenshot?: string;
    analysisResult?: {
      compliance: 'pass' | 'fail' | 'review_needed';
      reasoning: string;
    };
  }>;
  analysisResult?: {
    compliance: 'pass' | 'fail' | 'review_needed';
    reasoning: string;
    suggestions?: string[];
  };
}

export default function ComplianceChecker() {
  const params = useParams();
  const projectId = params.projectId as string;

  const [loading, setLoading] = useState(true);
  const [sections, setSections] = useState<Section[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sectionChecks, setSectionChecks] = useState<Map<string, SectionCheck>>(new Map());
  const [_sessionId, setSessionId] = useState<string | null>(null);

  // Initialize compliance session
  useEffect(() => {
    const init = async () => {
      try {
        const response = await fetch('/api/compliance/initialize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId,
            codeId: 'ICC+CBC_Chapter11A_11B+2025+CA',
          }),
        });

        const data = await response.json();
        setSessionId(data.session.id);
        setSections(data.sections);

        const checksMap = new Map<string, SectionCheck>();
        data.sections.forEach((section: Section) => {
          checksMap.set(section.key, {
            sectionKey: section.key,
            status: 'pending',
            screenshots: [],
            isCloneable: false,
          });
        });
        setSectionChecks(checksMap);
        setLoading(false);
      } catch (error) {
        console.error('Failed to initialize session:', error);
        setLoading(false);
      }
    };

    init();
  }, [projectId]);


  const currentSection = sections[currentIndex];
  const currentCheck = sectionChecks.get(currentSection?.key);

  const navigateNext = () => {
    if (currentIndex < sections.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const navigatePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const toggleCloneable = () => {
    if (!currentSection) return;

    const updatedCheck = {
      ...currentCheck!,
      isCloneable: !currentCheck?.isCloneable,
      instances: !currentCheck?.isCloneable ? [{ id: '1', name: 'Instance 1' }] : undefined,
    };

    setSectionChecks(new Map(sectionChecks.set(currentSection.key, updatedCheck)));
  };

  const addInstance = () => {
    if (!currentSection || !currentCheck?.isCloneable) return;

    const instances = currentCheck.instances || [];
    const newInstance = {
      id: String(instances.length + 1),
      name: `Instance ${instances.length + 1}`,
    };

    const updatedCheck = {
      ...currentCheck,
      instances: [...instances, newInstance],
    };

    setSectionChecks(new Map(sectionChecks.set(currentSection.key, updatedCheck)));
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'complete':
        return currentCheck?.analysisResult?.compliance === 'pass' ? 'bg-green-100' : 'bg-red-100';
      case 'screenshots_captured':
        return 'bg-blue-100';
      case 'analyzing':
        return 'bg-yellow-100';
      case 'skipped':
        return 'bg-gray-100';
      default:
        return '';
    }
  };

  const getStatusIcon = (check?: SectionCheck) => {
    if (!check) return '○';
    if (check.status === 'complete') {
      return check.analysisResult?.compliance === 'pass' ? '✓' : '✗';
    }
    if (check.status === 'screenshots_captured') return '📷';
    if (check.status === 'analyzing') return '⏳';
    if (check.status === 'skipped') return '⌀';
    return '○';
  };

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Loading sections...</div>;
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <h1 className="text-2xl font-bold">Compliance Check</h1>
        <p className="text-gray-600">California Building Code - Accessibility</p>
        <div className="mt-2 text-sm text-gray-500">
          Section {currentIndex + 1} of {sections.length}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Section List - Left Sidebar */}
        <div className="w-80 bg-gray-50 border-r overflow-y-auto">
          <div className="p-4">
            <h2 className="font-semibold mb-3">Sections</h2>
            <div className="space-y-1">
              {sections.map((section, index) => {
                const check = sectionChecks.get(section.key);
                return (
                  <button
                    key={section.key}
                    onClick={() => setCurrentIndex(index)}
                    className={`w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 hover:bg-white ${
                      index === currentIndex ? 'bg-white shadow' : ''
                    } ${getStatusColor(check?.status)}`}
                  >
                    <span className="text-lg">{getStatusIcon(check)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{section.number}</div>
                      <div className="text-xs text-gray-500 truncate">{section.title}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {currentSection && (
            <>
              <h2 className="text-xl font-bold mb-2">
                Section {currentSection.number}: {currentSection.title}
              </h2>

              {/* Requirements */}
              <div className="bg-white rounded-lg shadow p-6 mb-6">
                <h3 className="font-semibold mb-3">Requirements</h3>
                <div className="space-y-2">
                  {currentSection.requirements.map((req, index) => (
                    <p key={index} className="text-gray-700">{req}</p>
                  ))}
                </div>
              </div>

              {/* Referenced Sections */}
              {currentSection.references.length > 0 && (
                <div className="bg-blue-50 rounded-lg p-6 mb-6">
                  <h3 className="font-semibold mb-3">Referenced Requirements</h3>
                  {currentSection.references.map((ref) => (
                    <div key={ref.key} className="mb-4">
                      <h4 className="font-medium text-blue-900">
                        Section {ref.number}: {ref.title}
                      </h4>
                      <div className="mt-2 space-y-1">
                        {ref.requirements.map((req, index) => (
                          <p key={index} className="text-sm text-blue-800">{req}</p>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Clone Control */}
              <div className="bg-yellow-50 rounded-lg p-6 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold">Multiple Items Check</h3>
                  <button
                    onClick={toggleCloneable}
                    className={`px-4 py-2 rounded ${
                      currentCheck?.isCloneable
                        ? 'bg-yellow-600 text-white'
                        : 'bg-white border border-yellow-600 text-yellow-600'
                    }`}
                  >
                    {currentCheck?.isCloneable ? 'Enabled' : 'Enable'}
                  </button>
                </div>

                {currentCheck?.isCloneable && (
                  <>
                    <p className="text-sm text-gray-600 mb-4">
                      Check multiple instances separately (e.g., each door, window, etc.)
                    </p>
                    <div className="space-y-2">
                      {currentCheck.instances?.map((instance, index) => (
                        <div key={instance.id} className="flex items-center gap-3 bg-white p-3 rounded">
                          <input
                            type="text"
                            value={instance.name}
                            onChange={(e) => {
                              const updatedInstances = [...(currentCheck.instances || [])];
                              updatedInstances[index] = { ...instance, name: e.target.value };
                              setSectionChecks(
                                new Map(
                                  sectionChecks.set(currentSection.key, {
                                    ...currentCheck,
                                    instances: updatedInstances,
                                  })
                                )
                              );
                            }}
                            className="flex-1 px-3 py-1 border rounded"
                            placeholder="e.g., Main Entry Door"
                          />
                          <button className="px-3 py-1 bg-blue-600 text-white rounded text-sm">
                            📷 Capture
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={addInstance}
                      className="mt-3 px-4 py-2 bg-yellow-600 text-white rounded"
                    >
                      + Add Another Instance
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* Right Panel - Actions & Results */}
        <div className="w-80 bg-gray-50 border-l p-6">
          <h3 className="font-semibold mb-4">Actions</h3>

          <div className="space-y-3">
            {!currentCheck?.isCloneable && (
              <button className="w-full px-4 py-3 bg-blue-600 text-white rounded hover:bg-blue-700">
                📷 Capture Screenshot
              </button>
            )}

            <button className="w-full px-4 py-3 bg-green-600 text-white rounded hover:bg-green-700">
              ✓ Analyze Compliance
            </button>

            <button className="w-full px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300">
              Skip Section
            </button>

            <button className="w-full px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300">
              Not Applicable
            </button>
          </div>

          {/* Navigation */}
          <div className="flex gap-2 mt-6">
            <button
              onClick={navigatePrevious}
              disabled={currentIndex === 0}
              className="flex-1 px-4 py-2 bg-white border rounded disabled:opacity-50"
            >
              ← Previous
            </button>
            <button
              onClick={navigateNext}
              disabled={currentIndex === sections.length - 1}
              className="flex-1 px-4 py-2 bg-white border rounded disabled:opacity-50"
            >
              Next →
            </button>
          </div>

          {/* Results */}
          {currentCheck?.analysisResult && (
            <div
              className={`mt-6 p-4 rounded ${
                currentCheck.analysisResult.compliance === 'pass'
                  ? 'bg-green-100'
                  : currentCheck.analysisResult.compliance === 'fail'
                  ? 'bg-red-100'
                  : 'bg-yellow-100'
              }`}
            >
              <h4 className="font-semibold mb-2">
                {currentCheck.analysisResult.compliance === 'pass'
                  ? '✓ Compliant'
                  : currentCheck.analysisResult.compliance === 'fail'
                  ? '✗ Non-Compliant'
                  : '⚠ Review Needed'}
              </h4>
              <p className="text-sm">{currentCheck.analysisResult.reasoning}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}