'use client';

import { useState } from 'react';
import { DoorParameters } from '@/types/compliance';

interface DoorParametersFormProps {
  instanceId: string;
  currentParameters?: DoorParameters;
  onSave: (parameters: DoorParameters) => Promise<void>;
  onCancel: () => void;
}

export function DoorParametersForm({
  instanceId: _instanceId,
  currentParameters,
  onSave,
  onCancel,
}: DoorParametersFormProps) {
  const [parameters, setParameters] = useState<DoorParameters>(
    currentParameters || {
      is_on_accessible_route: true,
      is_hinged_door: true,
      is_interior_doorway: true,
    }
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      await onSave(parameters);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save parameters');
    } finally {
      setSaving(false);
    }
  };

  const updateParameter = <K extends keyof DoorParameters>(key: K, value: DoorParameters[K]) => {
    setParameters(prev => ({ ...prev, [key]: value }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm">
        <p className="font-medium text-blue-900 mb-1">📏 Rule-Based Compliance</p>
        <p className="text-blue-700 text-xs">
          These parameters enable automatic compliance checking for CBC 11B-404 sections without
          requiring AI analysis.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Basic Properties */}
      <div className="space-y-3">
        <h4 className="font-medium text-gray-900">Basic Properties</h4>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={parameters.is_on_accessible_route}
            onChange={e => updateParameter('is_on_accessible_route', e.target.checked)}
            className="rounded"
          />
          <span className="text-sm">On accessible route</span>
        </label>
      </div>

      {/* Door Types */}
      <div className="space-y-3">
        <h4 className="font-medium text-gray-900">Door Type</h4>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={parameters.is_hinged_door}
              onChange={e => updateParameter('is_hinged_door', e.target.checked)}
              className="rounded"
            />
            <span className="text-sm">Hinged</span>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={parameters.is_sliding_door}
              onChange={e => updateParameter('is_sliding_door', e.target.checked)}
              className="rounded"
            />
            <span className="text-sm">Sliding</span>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={parameters.is_automatic_door}
              onChange={e => updateParameter('is_automatic_door', e.target.checked)}
              className="rounded"
            />
            <span className="text-sm">Automatic</span>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={parameters.is_double_leaf}
              onChange={e => updateParameter('is_double_leaf', e.target.checked)}
              className="rounded"
            />
            <span className="text-sm">Double Leaf</span>
          </label>
        </div>
      </div>

      {/* Dimensions */}
      <div className="space-y-3">
        <h4 className="font-medium text-gray-900">Dimensions (inches)</h4>

        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="text-sm text-gray-700">Clear Width</span>
            <input
              type="number"
              step="0.25"
              value={parameters.clear_width_inches || ''}
              onChange={e =>
                updateParameter('clear_width_inches', parseFloat(e.target.value) || null)
              }
              className="w-full px-3 py-2 border rounded text-sm"
              placeholder="32.0"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm text-gray-700">Doorway Width</span>
            <input
              type="number"
              step="0.25"
              value={parameters.doorway_width_inches || ''}
              onChange={e =>
                updateParameter('doorway_width_inches', parseFloat(e.target.value) || null)
              }
              className="w-full px-3 py-2 border rounded text-sm"
              placeholder="36.0"
            />
          </label>
        </div>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={parameters.is_opening_depth_greater_than_24_inches}
            onChange={e =>
              updateParameter('is_opening_depth_greater_than_24_inches', e.target.checked)
            }
            className="rounded"
          />
          <span className="text-sm">Opening depth greater than 24&quot;</span>
        </label>
      </div>

      {/* Maneuvering Clearances */}
      <div className="space-y-3">
        <h4 className="font-medium text-gray-900">Maneuvering Clearances (inches)</h4>

        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="text-sm text-gray-700">Pull Side Perpendicular</span>
            <input
              type="number"
              step="0.25"
              value={parameters.pull_side_perpendicular_clearance_inches || ''}
              onChange={e =>
                updateParameter(
                  'pull_side_perpendicular_clearance_inches',
                  parseFloat(e.target.value) || null
                )
              }
              className="w-full px-3 py-2 border rounded text-sm"
              placeholder="60.0"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm text-gray-700">Push Side Perpendicular</span>
            <input
              type="number"
              step="0.25"
              value={parameters.push_side_perpendicular_clearance_inches || ''}
              onChange={e =>
                updateParameter(
                  'push_side_perpendicular_clearance_inches',
                  parseFloat(e.target.value) || null
                )
              }
              className="w-full px-3 py-2 border rounded text-sm"
              placeholder="48.0"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm text-gray-700">Latch Side</span>
            <input
              type="number"
              step="0.25"
              value={parameters.latch_side_clearance_inches || ''}
              onChange={e =>
                updateParameter('latch_side_clearance_inches', parseFloat(e.target.value) || null)
              }
              className="w-full px-3 py-2 border rounded text-sm"
              placeholder="18.0"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm text-gray-700">Hinge Side</span>
            <input
              type="number"
              step="0.25"
              value={parameters.hinge_side_clearance_inches || ''}
              onChange={e =>
                updateParameter('hinge_side_clearance_inches', parseFloat(e.target.value) || null)
              }
              className="w-full px-3 py-2 border rounded text-sm"
              placeholder="36.0"
            />
          </label>
        </div>
      </div>

      {/* Hardware & Features */}
      <div className="space-y-3">
        <h4 className="font-medium text-gray-900">Hardware & Features</h4>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={parameters.has_door_closer}
              onChange={e => updateParameter('has_door_closer', e.target.checked)}
              className="rounded"
            />
            <span className="text-sm">Door Closer</span>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={parameters.has_latch}
              onChange={e => updateParameter('has_latch', e.target.checked)}
              className="rounded"
            />
            <span className="text-sm">Latch</span>
          </label>
        </div>
      </div>

      {/* Location */}
      <div className="space-y-3">
        <h4 className="font-medium text-gray-900">Location</h4>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={parameters.is_exterior_door}
              onChange={e => updateParameter('is_exterior_door', e.target.checked)}
              className="rounded"
            />
            <span className="text-sm">Exterior Door</span>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={parameters.is_interior_doorway}
              onChange={e => updateParameter('is_interior_doorway', e.target.checked)}
              className="rounded"
            />
            <span className="text-sm">Interior Doorway</span>
          </label>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-4 border-t">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm font-medium"
        >
          {saving ? 'Saving...' : 'Save & Run Rule Checks'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:bg-gray-100 disabled:cursor-not-allowed text-sm font-medium"
        >
          Cancel
        </button>
      </div>

      <p className="text-xs text-gray-500 text-center">
        Saving parameters will automatically check compliance for 11B-404 sections
      </p>
    </form>
  );
}
