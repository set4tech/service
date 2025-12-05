'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Script from 'next/script';
import { Accordion } from '@/components/ui/Accordion';
import { DynamicField, type DynamicFieldConfig } from '@/components/ui/forms/DynamicField';

interface VariableInfo {
  type: 'text' | 'number' | 'date' | 'boolean' | 'select' | 'multiselect';
  description?: string;
  options?: string[];
}

interface VariableChecklist {
  [category: string]: {
    [variable: string]: VariableInfo;
  };
}

interface ProjectVariables {
  [category: string]: {
    [variable: string]:
      | {
          value: unknown;
          confidence?: string;
        }
      | unknown;
  };
}

interface PipelineOutput {
  metadata?: {
    project_info?: Record<string, unknown>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface Suggestion {
  category: string;
  variable: string;
  value: unknown;
}

interface ProjectPanelProps {
  projectId: string;
  projectName: string;
  initialVariables?: ProjectVariables | null;
  pipelineOutput?: PipelineOutput | null;
  assessmentId?: string;
  onChecksFiltered?: () => void;
}

export function ProjectPanel({
  projectId,
  projectName,
  initialVariables,
  pipelineOutput,
  assessmentId,
  onChecksFiltered,
}: ProjectPanelProps) {
  const [variableChecklist, setVariableChecklist] = useState<VariableChecklist | null>(null);
  const [projectVariables, setProjectVariables] = useState<Record<string, Record<string, unknown>>>(
    {}
  );
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [googleLoaded, setGoogleLoaded] = useState(false);
  const addressInputRef = useRef<HTMLInputElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Filtering state
  const [filteringStatus, setFilteringStatus] = useState<
    'pending' | 'in_progress' | 'completed' | 'failed'
  >('pending');
  const [filteringProgress, setFilteringProgress] = useState({
    processed: 0,
    total: 0,
    excluded: 0,
  });
  const [filteringError, setFilteringError] = useState<string | null>(null);
  const filteringPollRef = useRef<NodeJS.Timeout | null>(null);

  // Load variable checklist
  useEffect(() => {
    fetch('/variable_checklist.json')
      .then(res => res.json())
      .then(data => {
        setVariableChecklist(data);
        // Expand first 3 categories by default
        const categories = Object.keys(data).slice(0, 3);
        setExpandedCategories(new Set(categories));
      })
      .catch(err => console.error('Error loading variable checklist:', err));
  }, []);

  // Initialize project variables from initial data
  useEffect(() => {
    if (initialVariables) {
      const normalized: Record<string, Record<string, unknown>> = {};
      for (const [category, variables] of Object.entries(initialVariables)) {
        if (category === '_metadata') continue;
        normalized[category] = {};
        for (const [varName, varValue] of Object.entries(variables)) {
          // Handle both { value: x, confidence: y } and raw values
          if (varValue && typeof varValue === 'object' && 'value' in varValue) {
            normalized[category][varName] = (varValue as { value: unknown }).value;
          } else {
            normalized[category][varName] = varValue;
          }
        }
      }
      setProjectVariables(normalized);
    }
  }, [initialVariables]);

  // Extract suggestions from pipeline output (AI-extracted project info)
  // Field names in project_info match field names in variableChecklist directly
  useEffect(() => {
    const projectInfo = pipelineOutput?.metadata?.project_info;
    if (!projectInfo || !variableChecklist) {
      setSuggestions([]);
      return;
    }

    const newSuggestions: Suggestion[] = [];

    // Find which category each project_info field belongs to
    for (const [field, value] of Object.entries(projectInfo)) {
      // Skip metadata fields
      if (field === 'confidence' || field === 'source_pages' || field === 'is_cover_sheet')
        continue;
      if (value === null || value === undefined) continue;

      // Find the category that contains this field
      for (const [category, fields] of Object.entries(variableChecklist)) {
        if (field in fields) {
          newSuggestions.push({ category, variable: field, value });
          break;
        }
      }
    }

    setSuggestions(newSuggestions);
    console.log('[ProjectPanel] Extracted suggestions from pipeline:', newSuggestions);
  }, [pipelineOutput, variableChecklist]);

  // Google Maps autocomplete
  useEffect(() => {
    if (!googleLoaded || !addressInputRef.current || !(window as any).google?.maps?.places) {
      return;
    }

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
        updateVariable('project_identity', 'address', place.formatted_address);
      }
    });
  }, [googleLoaded, expandedCategories]);

  const updateVariable = useCallback((category: string, variable: string, value: unknown) => {
    setProjectVariables(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [variable]: value,
      },
    }));

    // Debounced auto-save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveVariables();
    }, 1500);
  }, []);

  const toggleMultiselect = useCallback((category: string, variable: string, option: string) => {
    setProjectVariables(prev => {
      const current = (prev[category]?.[variable] as string[]) || [];
      const newValue = current.includes(option)
        ? current.filter(o => o !== option)
        : [...current, option];
      return {
        ...prev,
        [category]: {
          ...prev[category],
          [variable]: newValue,
        },
      };
    });

    // Debounced auto-save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveVariables();
    }, 1500);
  }, []);

  // Get suggestion for a specific field (only if current value is empty)
  const getSuggestion = useCallback(
    (category: string, variable: string): Suggestion | undefined => {
      const currentValue = projectVariables[category]?.[variable];
      // Only show suggestion if field is empty
      if (currentValue !== null && currentValue !== undefined && currentValue !== '') {
        return undefined;
      }
      return suggestions.find(s => s.category === category && s.variable === variable);
    },
    [suggestions, projectVariables]
  );

  // Apply a single suggestion
  const applySuggestion = useCallback(
    (suggestion: Suggestion) => {
      updateVariable(suggestion.category, suggestion.variable, suggestion.value);
    },
    [updateVariable]
  );

  // Apply all pending suggestions
  const applyAllSuggestions = useCallback(() => {
    const pending = suggestions.filter(s => {
      const currentValue = projectVariables[s.category]?.[s.variable];
      return currentValue === null || currentValue === undefined || currentValue === '';
    });

    if (pending.length === 0) return;

    setProjectVariables(prev => {
      const updated = { ...prev };
      for (const s of pending) {
        if (!updated[s.category]) {
          updated[s.category] = {};
        }
        updated[s.category] = {
          ...updated[s.category],
          [s.variable]: s.value,
        };
      }
      return updated;
    });

    // Trigger save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveVariables();
    }, 500);
  }, [suggestions, projectVariables]);

  // Count pending suggestions
  const pendingSuggestions = suggestions.filter(s => {
    const currentValue = projectVariables[s.category]?.[s.variable];
    return currentValue === null || currentValue === undefined || currentValue === '';
  });

  const toggleCategory = useCallback((category: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }, []);

  const saveVariables = async () => {
    setSaving(true);
    try {
      // Format variables for storage
      const extractedVariables: Record<
        string,
        Record<string, { value: unknown; confidence: string }>
      > = {};
      for (const [category, variables] of Object.entries(projectVariables)) {
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

      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          extracted_variables: finalVariables,
          extraction_status: finalVariables ? 'completed' : null,
          extraction_completed_at: finalVariables ? new Date().toISOString() : null,
        }),
      });

      if (res.ok) {
        setLastSaved(new Date());
      }
    } catch (err) {
      console.error('Error saving variables:', err);
    } finally {
      setSaving(false);
    }
  };

  // Poll filtering status
  const pollFilteringStatus = useCallback(async () => {
    if (!assessmentId) return;

    try {
      const res = await fetch(`/api/assessments/${assessmentId}/status`);
      if (res.ok) {
        const data = await res.json();
        setFilteringStatus(data.filtering_status || 'pending');
        setFilteringProgress({
          processed: data.filtering_checks_processed || 0,
          total: data.filtering_checks_total || 0,
          excluded: data.filtering_excluded_count || 0,
        });

        // If completed or failed, stop polling
        if (data.filtering_status === 'completed' || data.filtering_status === 'failed') {
          if (filteringPollRef.current) {
            clearInterval(filteringPollRef.current);
            filteringPollRef.current = null;
          }
          // Notify parent to refetch checks
          if (data.filtering_status === 'completed' && onChecksFiltered) {
            onChecksFiltered();
          }
        }
      }
    } catch (err) {
      console.error('Error polling filtering status:', err);
    }
  }, [assessmentId, onChecksFiltered]);

  // Start filtering
  const startFiltering = async (reset: boolean = false) => {
    if (!assessmentId) return;

    // Cancel any pending debounced save and save immediately
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    await saveVariables();

    setFilteringStatus('in_progress');
    setFilteringError(null);
    setFilteringProgress({ processed: 0, total: 0, excluded: 0 });

    try {
      const res = await fetch(`/api/assessments/${assessmentId}/filter-checks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset }),
      });

      if (!res.ok) {
        const data = await res.json();
        setFilteringError(data.error || 'Filtering failed');
        setFilteringStatus('failed');
        return;
      }

      // Start polling for progress
      filteringPollRef.current = setInterval(pollFilteringStatus, 1000);
    } catch (err) {
      console.error('Error starting filtering:', err);
      setFilteringError(err instanceof Error ? err.message : 'Unknown error');
      setFilteringStatus('failed');
    }
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (filteringPollRef.current) {
        clearInterval(filteringPollRef.current);
      }
    };
  }, []);

  // Check initial filtering status on mount
  useEffect(() => {
    if (assessmentId) {
      pollFilteringStatus();
    }
  }, [assessmentId, pollFilteringStatus]);

  // Check if we have parameters filled in
  const hasParameters = Object.keys(projectVariables).some(cat =>
    Object.values(projectVariables[cat] || {}).some(v => v !== null && v !== undefined && v !== '')
  );

  const formatLabel = (str: string) =>
    str.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  if (!variableChecklist) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        Loading project settings...
      </div>
    );
  }

  return (
    <>
      <Script
        src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`}
        onLoad={() => setGoogleLoaded(true)}
        onError={e => console.error('Google Maps load error:', e)}
      />

      <div className="h-full flex flex-col">
        <div className="flex-shrink-0 px-4 py-3 border-b bg-white">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">{projectName}</h2>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              {saving && (
                <span className="flex items-center gap-1">
                  <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Saving...
                </span>
              )}
              {lastSaved && !saving && <span>Saved {lastSaved.toLocaleTimeString()}</span>}
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Project variables used for compliance analysis
          </p>

          {/* AI Suggestions Banner */}
          {pendingSuggestions.length > 0 && (
            <div className="mt-3 p-2 bg-blue-50 border border-blue-200 rounded-md flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg
                  className="w-4 h-4 text-blue-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
                <span className="text-sm text-blue-800">
                  {pendingSuggestions.length} AI-extracted value
                  {pendingSuggestions.length === 1 ? '' : 's'} from drawings
                </span>
              </div>
              <button
                onClick={applyAllSuggestions}
                className="px-2 py-1 text-xs font-medium text-blue-700 hover:text-blue-900 hover:bg-blue-100 rounded"
              >
                Apply All
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {Object.entries(variableChecklist).map(([category, items]) => (
            <Accordion
              key={category}
              title={formatLabel(category)}
              expanded={expandedCategories.has(category)}
              onToggle={() => toggleCategory(category)}
            >
              {Object.entries(items).map(([varName, varInfo]) => {
                const label = formatLabel(varName);
                const isAddressField = category === 'project_identity' && varName === 'address';
                const suggestion = getSuggestion(category, varName);

                const config: DynamicFieldConfig = {
                  type: varInfo.type || 'text',
                  label,
                  description: varInfo.description,
                  placeholder:
                    varInfo.type === 'text'
                      ? 'Enter value...'
                      : varInfo.type === 'number'
                        ? 'Enter number...'
                        : undefined,
                  options: varInfo.options,
                };

                return (
                  <div key={varName} className="relative">
                    <DynamicField
                      config={config}
                      value={projectVariables[category]?.[varName]}
                      onChange={newValue => updateVariable(category, varName, newValue)}
                      onToggleOption={option => toggleMultiselect(category, varName, option)}
                      inputRef={isAddressField ? addressInputRef : undefined}
                      name={`${category}_${varName}`}
                    />
                    {/* AI Suggestion Indicator */}
                    {suggestion && (
                      <button
                        type="button"
                        onClick={() => applySuggestion(suggestion)}
                        className="absolute right-0 top-0 mt-0.5 flex items-center gap-1 px-2 py-1 text-xs text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md transition-colors"
                        title={`AI suggestion: ${String(suggestion.value)}`}
                      >
                        <svg
                          className="w-3 h-3"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M13 10V3L4 14h7v7l9-11h-7z"
                          />
                        </svg>
                        <span className="max-w-[120px] truncate">{String(suggestion.value)}</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </Accordion>
          ))}

          {/* Filtering Section */}
          {assessmentId && (
            <div className="border-t pt-4 mt-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-700">Check Filtering</h3>
                {filteringStatus === 'completed' && filteringProgress.excluded > 0 && (
                  <span className="text-xs text-gray-500">
                    {filteringProgress.excluded} excluded
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 mb-3">
                Use AI to exclude checks that don&apos;t apply based on project parameters
              </p>

              {filteringStatus === 'in_progress' ? (
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-gray-600">
                    <span>Evaluating checks...</span>
                    <span>
                      {filteringProgress.processed}/{filteringProgress.total}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{
                        width:
                          filteringProgress.total > 0
                            ? `${(filteringProgress.processed / filteringProgress.total) * 100}%`
                            : '0%',
                      }}
                    />
                  </div>
                  <p className="text-xs text-gray-500">
                    {filteringProgress.excluded} checks excluded so far
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <button
                    onClick={() => startFiltering(filteringStatus === 'completed')}
                    disabled={!hasParameters}
                    className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {filteringStatus === 'completed'
                      ? 'Re-filter Checks'
                      : 'Filter Checks by Parameters'}
                  </button>
                  {!hasParameters && (
                    <p className="text-xs text-amber-600">Fill in project parameters above first</p>
                  )}
                </div>
              )}

              {filteringStatus === 'completed' && (
                <p className="text-xs text-green-600 mt-2">
                  Filtering complete: {filteringProgress.excluded} checks excluded
                </p>
              )}

              {filteringStatus === 'failed' && filteringError && (
                <p className="text-xs text-red-600 mt-2">Error: {filteringError}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
