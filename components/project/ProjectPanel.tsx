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

interface ProjectPanelProps {
  projectId: string;
  projectName: string;
  initialVariables?: ProjectVariables | null;
}

export function ProjectPanel({ projectId, projectName, initialVariables }: ProjectPanelProps) {
  const [variableChecklist, setVariableChecklist] = useState<VariableChecklist | null>(null);
  const [projectVariables, setProjectVariables] = useState<Record<string, Record<string, unknown>>>(
    {}
  );
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [googleLoaded, setGoogleLoaded] = useState(false);
  const addressInputRef = useRef<HTMLInputElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load variable checklist
  useEffect(() => {
    fetch('/variable_checklist.json')
      .then(res => res.json())
      .then(data => setVariableChecklist(data))
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
        updateVariable('project_identity', 'full_address', place.formatted_address);
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
                const isAddressField =
                  category === 'project_identity' && varName === 'full_address';

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
                  <DynamicField
                    key={varName}
                    config={config}
                    value={projectVariables[category]?.[varName]}
                    onChange={newValue => updateVariable(category, varName, newValue)}
                    onToggleOption={option => toggleMultiselect(category, varName, option)}
                    inputRef={isAddressField ? addressInputRef : undefined}
                    name={`${category}_${varName}`}
                  />
                );
              })}
            </Accordion>
          ))}
        </div>
      </div>
    </>
  );
}
