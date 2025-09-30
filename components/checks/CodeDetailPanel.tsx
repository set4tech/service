'use client';

import { useEffect, useState } from 'react';

interface CodeSection {
  key: string;
  number: string;
  title: string;
  text?: string;
  requirements?: Array<string | { text: string; [key: string]: any }>;
  references?: Array<{
    key: string;
    number: string;
    title: string;
    text?: string;
  }>;
}

interface AnalysisRun {
  id: string;
  run_number: number;
  compliance_status: string;
  confidence: string;
  ai_provider: string;
  ai_model: string;
  ai_reasoning?: string;
  violations?: any[];
  recommendations?: string[];
  executed_at: string;
  execution_time_ms?: number;
}

interface CodeDetailPanelProps {
  checkId: string | null;
  sectionKey: string | null;
  onClose: () => void;
}

export function CodeDetailPanel({ checkId, sectionKey, onClose }: CodeDetailPanelProps) {
  const [section, setSection] = useState<CodeSection | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Assessment state
  const [selectedModel, setSelectedModel] = useState<string>('gemini-2.5-pro');
  const [extraContext, setExtraContext] = useState('');
  const [showExtraContext, setShowExtraContext] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [assessmentError, setAssessmentError] = useState<string | null>(null);

  // Prompt editing state
  const [showPrompt, setShowPrompt] = useState(false);
  const [defaultPrompt, setDefaultPrompt] = useState<string>('');
  const [customPrompt, setCustomPrompt] = useState<string>('');
  const [isPromptEditing, setIsPromptEditing] = useState(false);
  const [loadingPrompt, setLoadingPrompt] = useState(false);

  // Analysis history state
  const [analysisRuns, setAnalysisRuns] = useState<AnalysisRun[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set());

  // Load last selected model from localStorage
  useEffect(() => {
    const lastModel = localStorage.getItem('lastSelectedAIModel');
    if (lastModel) {
      setSelectedModel(lastModel);
    }
  }, []);

  // Load code section
  useEffect(() => {
    if (!sectionKey) {
      setSection(null);
      return;
    }

    setLoading(true);
    setError(null);

    fetch('/api/compliance/sections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sectionKey }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          setError(data.error);
        } else {
          setSection(data);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load section:', err);
        setError(err.message);
        setLoading(false);
      });
  }, [sectionKey]);

  // Load analysis runs
  useEffect(() => {
    if (!checkId) {
      setAnalysisRuns([]);
      return;
    }

    setLoadingRuns(true);
    fetch(`/api/checks/${checkId}/analysis-runs`)
      .then(res => res.json())
      .then(data => {
        if (data.runs) {
          setAnalysisRuns(data.runs);
        }
        setLoadingRuns(false);
      })
      .catch(err => {
        console.error('Failed to load analysis runs:', err);
        setLoadingRuns(false);
      });
  }, [checkId]);

  // Load prompt when user clicks to view it
  const handleViewPrompt = async () => {
    if (!checkId) return;

    setShowPrompt(true);

    // If we already loaded the prompt, don't fetch again
    if (defaultPrompt) return;

    setLoadingPrompt(true);
    try {
      const response = await fetch(`/api/checks/${checkId}/prompt`);
      const data = await response.json();

      if (response.ok && data.prompt) {
        setDefaultPrompt(data.prompt);
      }
    } catch (err) {
      console.error('Failed to load prompt:', err);
    } finally {
      setLoadingPrompt(false);
    }
  };

  const handleEditPrompt = () => {
    setIsPromptEditing(true);
    setCustomPrompt(defaultPrompt);
  };

  const handleResetPrompt = () => {
    setCustomPrompt('');
    setIsPromptEditing(false);
  };

  const handleAssess = async () => {
    if (!checkId) return;

    setAssessing(true);
    setAssessmentError(null);

    // Save selected model to localStorage
    localStorage.setItem('lastSelectedAIModel', selectedModel);

    try {
      const response = await fetch(`/api/checks/${checkId}/assess`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aiProvider: selectedModel,
          customPrompt: customPrompt.trim() || undefined,
          extraContext: extraContext.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Assessment failed');
      }

      // Reload analysis runs
      const runsResponse = await fetch(`/api/checks/${checkId}/analysis-runs`);
      const runsData = await runsResponse.json();
      if (runsData.runs) {
        setAnalysisRuns(runsData.runs);
        // Auto-expand the latest run
        if (runsData.runs[0]) {
          setExpandedRuns(new Set([runsData.runs[0].id]));
        }
      }

      // Clear extra context after successful assessment
      setExtraContext('');
      setShowExtraContext(false);
    } catch (err: any) {
      console.error('Assessment error:', err);
      setAssessmentError(err.message);
    } finally {
      setAssessing(false);
    }
  };

  const toggleRunExpanded = (runId: string) => {
    const newExpanded = new Set(expandedRuns);
    if (newExpanded.has(runId)) {
      newExpanded.delete(runId);
    } else {
      newExpanded.add(runId);
    }
    setExpandedRuns(newExpanded);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'compliant':
        return 'text-green-700 bg-green-50 border-green-200';
      case 'violation':
      case 'non_compliant':
        return 'text-red-700 bg-red-50 border-red-200';
      case 'needs_more_info':
        return 'text-yellow-700 bg-yellow-50 border-yellow-200';
      default:
        return 'text-gray-700 bg-gray-50 border-gray-200';
    }
  };

  const getConfidenceBadge = (confidence: string) => {
    const colors = {
      high: 'bg-green-100 text-green-800',
      medium: 'bg-yellow-100 text-yellow-800',
      low: 'bg-red-100 text-red-800',
    };
    return colors[confidence as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  if (!sectionKey) return null;

  return (
    <div className="h-full flex flex-col bg-white border-r border-gray-200">
      {/* Header */}
      <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between flex-shrink-0">
        <h3 className="text-base font-semibold text-gray-900">Code Section Details</h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Close panel"
        >
          <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading && <div className="text-sm text-gray-500">Loading section details...</div>}

        {error && (
          <div className="text-sm text-red-600">
            <p className="font-medium">Error loading section</p>
            <p className="text-xs mt-1">{error}</p>
          </div>
        )}

        {section && !loading && (
          <div className="space-y-6">
            {/* Section Header */}
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Section
              </div>
              <div className="text-lg font-bold text-gray-900">{section.number}</div>
              <div className="text-base text-gray-700 mt-1">{section.title}</div>
            </div>

            {/* Section Text */}
            {section.text && (
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Section Summary
                </div>
                <div className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap bg-gray-50 p-3 rounded border border-gray-200">
                  {section.text}
                </div>
              </div>
            )}

            {/* Explanation (Paragraphs) */}
            {section.requirements && section.requirements.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Explanation
                </div>
                <div className="space-y-3">
                  {section.requirements.map((req, idx) => {
                    const text = typeof req === 'string' ? req : req.text || '';
                    return (
                      <div key={idx} className="text-sm text-gray-800 leading-relaxed">
                        <div className="text-xs text-gray-500 font-mono mb-1">
                          Paragraph {idx + 1}
                        </div>
                        <div className="pl-3 border-l-2 border-gray-300">{text}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* References */}
            {section.references && section.references.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Referenced Sections
                </div>
                <div className="space-y-3">
                  {section.references.map(ref => (
                    <div key={ref.key} className="border border-gray-200 rounded p-3 bg-blue-50">
                      <div className="font-medium text-sm text-blue-900">{ref.number}</div>
                      <div className="text-sm text-gray-700 mt-1">{ref.title}</div>
                      {ref.text && (
                        <div className="text-xs text-gray-600 mt-2 leading-relaxed whitespace-pre-wrap">
                          {ref.text}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {!section.text && (!section.requirements || section.requirements.length === 0) && (
              <div className="text-sm text-gray-500 italic">
                No detailed content available for this section.
              </div>
            )}

            {/* Assessment Section */}
            {checkId && (
              <div className="border-t pt-6 mt-6">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  AI Assessment
                </div>

                <div className="space-y-3">
                  {/* Model Selector */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">AI Model</label>
                    <select
                      value={selectedModel}
                      onChange={e => setSelectedModel(e.target.value)}
                      disabled={assessing}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                    >
                      <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                      <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                      <option value="claude-opus-4">Claude Opus 4</option>
                      <option value="gpt-4o">GPT-4o</option>
                    </select>
                  </div>

                  {/* View/Edit Prompt Section */}
                  <div>
                    <button
                      onClick={handleViewPrompt}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                    >
                      {showPrompt ? '− Hide' : '📝 View/Edit'} Prompt
                    </button>
                  </div>

                  {/* Prompt Display/Editor */}
                  {showPrompt && (
                    <div className="space-y-2">
                      {loadingPrompt ? (
                        <div className="text-xs text-gray-500">Loading prompt...</div>
                      ) : (
                        <>
                          <div className="flex items-center justify-between">
                            <label className="block text-xs font-medium text-gray-700">
                              AI Prompt {customPrompt && '(Custom)'}
                            </label>
                            <div className="flex gap-2">
                              {!isPromptEditing ? (
                                <button
                                  onClick={handleEditPrompt}
                                  disabled={assessing}
                                  className="text-xs text-blue-600 hover:text-blue-700 font-medium disabled:text-gray-400"
                                >
                                  ✏️ Edit
                                </button>
                              ) : (
                                <button
                                  onClick={handleResetPrompt}
                                  disabled={assessing}
                                  className="text-xs text-gray-600 hover:text-gray-700 font-medium disabled:text-gray-400"
                                >
                                  ↺ Reset
                                </button>
                              )}
                            </div>
                          </div>
                          <textarea
                            value={isPromptEditing ? customPrompt : defaultPrompt}
                            onChange={e => isPromptEditing && setCustomPrompt(e.target.value)}
                            readOnly={!isPromptEditing}
                            disabled={assessing}
                            rows={12}
                            className={`w-full px-3 py-2 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 font-mono ${
                              isPromptEditing ? 'bg-yellow-50' : 'bg-gray-50'
                            }`}
                          />
                          {isPromptEditing && (
                            <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                              ⚠️ Editing prompt - your changes will be used for the next assessment
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {/* Extra Context Toggle */}
                  <div>
                    <button
                      onClick={() => setShowExtraContext(!showExtraContext)}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                    >
                      {showExtraContext ? '− Hide' : '+ Add'} Extra Context
                    </button>
                  </div>

                  {/* Extra Context Textarea */}
                  {showExtraContext && (
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Additional Context (Optional)
                      </label>
                      <textarea
                        value={extraContext}
                        onChange={e => setExtraContext(e.target.value)}
                        disabled={assessing}
                        placeholder="Add any additional context or specific questions..."
                        rows={3}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      />
                    </div>
                  )}

                  {/* Assess Button */}
                  <button
                    onClick={handleAssess}
                    disabled={assessing}
                    className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-blue-300 disabled:cursor-not-allowed"
                  >
                    {assessing ? 'Analyzing...' : 'Assess Compliance'}
                  </button>

                  {/* Assessment Error */}
                  {assessmentError && (
                    <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
                      {assessmentError}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Assessment History */}
            {checkId && (
              <div className="border-t pt-6 mt-6">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Assessment History
                </div>

                {loadingRuns && <div className="text-sm text-gray-500">Loading history...</div>}

                {!loadingRuns && analysisRuns.length === 0 && (
                  <div className="text-sm text-gray-500 italic">
                    No assessments yet. Click &ldquo;Assess Compliance&rdquo; to run your first
                    analysis.
                  </div>
                )}

                {!loadingRuns && analysisRuns.length > 0 && (
                  <div className="space-y-3">
                    {analysisRuns.map(run => {
                      const isExpanded = expandedRuns.has(run.id);
                      const statusColors = getStatusColor(run.compliance_status);

                      return (
                        <div
                          key={run.id}
                          className="border border-gray-200 rounded overflow-hidden"
                        >
                          {/* Run Header */}
                          <button
                            onClick={() => toggleRunExpanded(run.id)}
                            className="w-full px-3 py-2 bg-gray-50 hover:bg-gray-100 flex items-center justify-between text-left"
                          >
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className="text-xs font-mono text-gray-500">
                                #{run.run_number}
                              </span>
                              <span
                                className={`text-xs px-2 py-0.5 rounded border font-medium ${statusColors}`}
                              >
                                {run.compliance_status.replace('_', ' ')}
                              </span>
                              <span
                                className={`text-xs px-2 py-0.5 rounded font-medium ${getConfidenceBadge(run.confidence)}`}
                              >
                                {run.confidence}
                              </span>
                              <span className="text-xs text-gray-500 truncate">{run.ai_model}</span>
                            </div>
                            <svg
                              className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 9l-7 7-7-7"
                              />
                            </svg>
                          </button>

                          {/* Run Details */}
                          {isExpanded && (
                            <div className="px-3 py-3 space-y-3 bg-white">
                              {/* Timestamp */}
                              <div className="text-xs text-gray-500">
                                {new Date(run.executed_at).toLocaleString()}
                                {run.execution_time_ms && (
                                  <span className="ml-2">
                                    ({(run.execution_time_ms / 1000).toFixed(1)}s)
                                  </span>
                                )}
                              </div>

                              {/* Reasoning */}
                              {run.ai_reasoning && (
                                <div>
                                  <div className="text-xs font-semibold text-gray-700 mb-1">
                                    Reasoning
                                  </div>
                                  <div className="text-sm text-gray-800 leading-relaxed bg-gray-50 p-2 rounded border border-gray-200">
                                    {run.ai_reasoning}
                                  </div>
                                </div>
                              )}

                              {/* Violations */}
                              {run.violations && run.violations.length > 0 && (
                                <div>
                                  <div className="text-xs font-semibold text-red-700 mb-1">
                                    Violations
                                  </div>
                                  <ul className="space-y-1">
                                    {run.violations.map((v: any, idx: number) => (
                                      <li
                                        key={idx}
                                        className="text-sm text-gray-800 pl-3 border-l-2 border-red-300"
                                      >
                                        <span className="font-medium text-red-700">
                                          [{v.severity}]
                                        </span>{' '}
                                        {v.description}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {/* Recommendations */}
                              {run.recommendations && run.recommendations.length > 0 && (
                                <div>
                                  <div className="text-xs font-semibold text-blue-700 mb-1">
                                    Recommendations
                                  </div>
                                  <ul className="space-y-1">
                                    {run.recommendations.map((rec: string, idx: number) => (
                                      <li
                                        key={idx}
                                        className="text-sm text-gray-800 pl-3 border-l-2 border-blue-300"
                                      >
                                        {rec}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
