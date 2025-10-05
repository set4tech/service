'use client';

import { useState, useEffect } from 'react';
import Modal from '@/components/ui/Modal';

interface Check {
  id: string;
  code_section_number: string;
  check_name: string;
  instance_label?: string;
  parent_check_id?: string;
  instances?: Check[];
  instance_count?: number;
}

type AssignMode = 'specific' | 'instances';

interface Props {
  open: boolean;
  onClose: () => void;
  screenshotId: string;
  currentCheckId: string;
  assessmentId: string;
  onAssigned: () => void;
}

export function AssignScreenshotModal({
  open,
  onClose,
  screenshotId,
  currentCheckId,
  assessmentId,
  onAssigned,
}: Props) {
  const [allChecks, setAllChecks] = useState<Check[]>([]);
  const [selectedCheckIds, setSelectedCheckIds] = useState<Set<string>>(new Set());
  const [existingAssignments, setExistingAssignments] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<AssignMode>('specific');

  useEffect(() => {
    if (!open) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch all checks for this assessment (includes instances nested)
        const checksRes = await fetch(`/api/assessments/${assessmentId}/checks`);
        const checksData = await checksRes.json();
        setAllChecks(checksData);

        // Fetch existing assignments for this screenshot
        const assignmentsRes = await fetch(`/api/screenshots/${screenshotId}/assignments`);
        const assignmentsData = await assignmentsRes.json();
        const assignedCheckIds = new Set<string>(assignmentsData.map((a: any) => a.check_id));
        setExistingAssignments(assignedCheckIds);
        setSelectedCheckIds(new Set<string>(assignedCheckIds));
      } catch (error) {
        console.error('Failed to load checks:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [open, assessmentId, screenshotId]);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      // Find new assignments (selected but not existing)
      const newAssignments = Array.from(selectedCheckIds).filter(
        id => !existingAssignments.has(id)
      );

      if (newAssignments.length > 0) {
        const res = await fetch(`/api/screenshots/${screenshotId}/assign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ checkIds: newAssignments }),
        });

        if (!res.ok) throw new Error('Failed to assign screenshots');
      }

      onAssigned();
      onClose();
    } catch (error) {
      console.error('Failed to assign screenshot:', error);
      alert('Failed to assign screenshot');
    } finally {
      setSubmitting(false);
    }
  };

  // Flatten all checks for "specific" mode
  const flattenedChecks = allChecks.flatMap(check => [check, ...(check.instances || [])]);

  // For instance groups mode, only show parent checks that have instances
  const checksWithInstances = allChecks.filter(check => (check.instances?.length || 0) > 0);

  // Determine which checks to display based on mode
  const checksToDisplay = mode === 'specific' ? flattenedChecks : checksWithInstances;

  const filteredChecks = checksToDisplay.filter(
    check =>
      check.code_section_number.toLowerCase().includes(search.toLowerCase()) ||
      check.check_name.toLowerCase().includes(search.toLowerCase()) ||
      check.instance_label?.toLowerCase().includes(search.toLowerCase())
  );

  // Handle instance group selection - select parent + all instances
  const handleInstanceGroupToggle = (parentCheck: Check, isChecked: boolean) => {
    const newSelected = new Set(selectedCheckIds);
    const allCheckIds = [parentCheck.id, ...(parentCheck.instances || []).map(i => i.id)];

    if (isChecked) {
      allCheckIds.forEach(id => newSelected.add(id));
    } else {
      allCheckIds.forEach(id => newSelected.delete(id));
    }

    setSelectedCheckIds(newSelected);
  };

  // Check if an instance group is fully selected
  const isInstanceGroupSelected = (parentCheck: Check) => {
    const allCheckIds = [parentCheck.id, ...(parentCheck.instances || []).map(i => i.id)];
    return allCheckIds.every(id => selectedCheckIds.has(id));
  };

  // Check if an instance group is partially selected
  const isInstanceGroupPartial = (parentCheck: Check) => {
    const allCheckIds = [parentCheck.id, ...(parentCheck.instances || []).map(i => i.id)];
    const selectedCount = allCheckIds.filter(id => selectedCheckIds.has(id)).length;
    return selectedCount > 0 && selectedCount < allCheckIds.length;
  };

  return (
    <Modal open={open} onClose={onClose} title="Assign Screenshot to Checks">
      <div className="space-y-4">
        {/* Mode Toggle */}
        <div className="flex gap-2 p-1 bg-gray-100 rounded">
          <button
            onClick={() => setMode('specific')}
            className={`flex-1 px-3 py-2 text-sm font-medium rounded transition-colors ${
              mode === 'specific'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Specific Checks
          </button>
          <button
            onClick={() => setMode('instances')}
            className={`flex-1 px-3 py-2 text-sm font-medium rounded transition-colors ${
              mode === 'instances'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Instance Groups
          </button>
        </div>

        <input
          type="text"
          placeholder="Search checks..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full px-3 py-2 border rounded"
        />

        {loading ? (
          <div className="text-center py-8">Loading checks...</div>
        ) : (
          <div className="max-h-96 overflow-y-auto space-y-2">
            {mode === 'specific'
              ? // Specific mode: show individual checks
                filteredChecks.map(check => {
                  const isOriginal = check.id === currentCheckId;
                  const isExisting = existingAssignments.has(check.id);
                  const isSelected = selectedCheckIds.has(check.id);

                  return (
                    <label
                      key={check.id}
                      className={`flex items-center gap-3 p-3 border rounded cursor-pointer hover:bg-gray-50 ${
                        isOriginal ? 'bg-blue-50 border-blue-300' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={isOriginal}
                        onChange={e => {
                          const newSelected = new Set(selectedCheckIds);
                          if (e.target.checked) {
                            newSelected.add(check.id);
                          } else {
                            newSelected.delete(check.id);
                          }
                          setSelectedCheckIds(newSelected);
                        }}
                        className="w-4 h-4"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-sm">
                          {check.code_section_number}
                          {check.instance_label && ` - ${check.instance_label}`}
                        </div>
                        <div className="text-xs text-gray-600">{check.check_name}</div>
                      </div>
                      {isOriginal && <span className="text-xs text-blue-600">Original</span>}
                      {isExisting && !isOriginal && (
                        <span className="text-xs text-gray-500">Assigned</span>
                      )}
                    </label>
                  );
                })
              : // Instance mode: show parent checks with expandable instances
                filteredChecks.map(check => {
                  const instanceCount = (check.instances || []).length;
                  const isGroupSelected = isInstanceGroupSelected(check);
                  const isPartial = isInstanceGroupPartial(check);

                  return (
                    <div key={check.id} className="border rounded overflow-hidden">
                      {/* Parent check with "select all" checkbox */}
                      <div className="flex items-center gap-3 p-3 bg-gray-50 border-b">
                        <input
                          type="checkbox"
                          checked={isGroupSelected}
                          ref={input => {
                            if (input) {
                              input.indeterminate = isPartial;
                            }
                          }}
                          onChange={e => handleInstanceGroupToggle(check, e.target.checked)}
                          className="w-4 h-4"
                          title="Select all"
                        />
                        <div className="flex-1">
                          <div className="font-medium text-sm">
                            {check.code_section_number}
                            {check.instance_label && ` - ${check.instance_label}`}
                          </div>
                          <div className="text-xs text-gray-600">{check.check_name}</div>
                        </div>
                        <span className="text-xs text-gray-500">
                          {instanceCount} instance{instanceCount !== 1 ? 's' : ''}
                        </span>
                      </div>

                      {/* Individual instances */}
                      <div className="bg-white">
                        {/* Parent as first item */}
                        <label className="flex items-center gap-3 p-3 pl-8 hover:bg-gray-50 cursor-pointer border-b border-gray-100">
                          <input
                            type="checkbox"
                            checked={selectedCheckIds.has(check.id)}
                            onChange={e => {
                              const newSelected = new Set(selectedCheckIds);
                              if (e.target.checked) {
                                newSelected.add(check.id);
                              } else {
                                newSelected.delete(check.id);
                              }
                              setSelectedCheckIds(newSelected);
                            }}
                            className="w-4 h-4"
                          />
                          <div className="flex-1 text-sm">{check.instance_label || 'Original'}</div>
                        </label>

                        {/* Instance children */}
                        {(check.instances || []).map(instance => {
                          const isSelected = selectedCheckIds.has(instance.id);
                          return (
                            <label
                              key={instance.id}
                              className="flex items-center gap-3 p-3 pl-8 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={e => {
                                  const newSelected = new Set(selectedCheckIds);
                                  if (e.target.checked) {
                                    newSelected.add(instance.id);
                                  } else {
                                    newSelected.delete(instance.id);
                                  }
                                  setSelectedCheckIds(newSelected);
                                }}
                                className="w-4 h-4"
                              />
                              <div className="flex-1 text-sm">
                                {instance.instance_label || 'Unnamed'}
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
          </div>
        )}

        <div className="flex gap-2 justify-end pt-4 border-t">
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || selectedCheckIds.size === 0}
            className="btn-primary"
          >
            {submitting ? 'Assigning...' : 'Assign to Selected'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
