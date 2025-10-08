'use client';

import { useState, useEffect, useRef } from 'react';
import type { ElementGroup } from '@/types/database';

interface ElevationCapturePromptProps {
  onSave: (elementGroupId: string, caption: string) => void;
  onCancel: () => void;
}

const ELEMENT_TYPE_COLORS: Record<string, string> = {
  doors: 'bg-blue-600',
  bathrooms: 'bg-purple-600',
  kitchens: 'bg-orange-600',
  'exit-signage': 'bg-red-600',
  'assisted-listening': 'bg-indigo-600',
  elevators: 'bg-cyan-600',
  'elevator-signage': 'bg-teal-600',
  'parking-signage': 'bg-yellow-600',
  ramps: 'bg-green-600',
  'changes-in-level': 'bg-pink-600',
  'turning-spaces': 'bg-violet-600',
};

export function ElevationCapturePrompt({ onSave, onCancel }: ElevationCapturePromptProps) {
  const [step, setStep] = useState<'element-type' | 'caption'>('element-type');
  const [elementGroups, setElementGroups] = useState<ElementGroup[]>([]);
  const [selectedElementGroup, setSelectedElementGroup] = useState<ElementGroup | null>(null);
  const [caption, setCaption] = useState('');
  const [loading, setLoading] = useState(true);

  // Use refs to avoid re-registering keyboard listener when callbacks change
  const onSaveRef = useRef(onSave);
  const onCancelRef = useRef(onCancel);
  onSaveRef.current = onSave;
  onCancelRef.current = onCancel;

  useEffect(() => {
    // Fetch element groups from API
    (async () => {
      try {
        const res = await fetch('/api/element-groups');
        const data = await res.json();
        setElementGroups(data.element_groups || []);
      } catch (error) {
        console.error('Failed to fetch element groups:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Global keyboard handler for modal
  useEffect(() => {
    console.log(
      '[ElevationCapturePrompt] Mounting - adding global keyboard listener (capture phase)'
    );
    const handleKeyDown = (e: KeyboardEvent) => {
      console.log('[ElevationCapturePrompt] Key pressed:', {
        key: e.key,
        step,
        selectedElementGroup: selectedElementGroup?.name,
        caption,
      });

      // Ignore keyboard events from input/textarea elements (except Escape and Enter)
      const target = e.target as HTMLElement;
      const isInputField = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

      // Handle Escape globally
      if (e.key === 'Escape') {
        console.log('[ElevationCapturePrompt] Escape pressed, canceling');
        e.preventDefault();
        e.stopPropagation();
        onCancelRef.current();
        return;
      }

      // Handle Enter globally - if we have a selected element, save it
      // This handles both keyboard flow AND click+Enter race condition
      if (e.key === 'Enter') {
        console.log(
          '[ElevationCapturePrompt] Enter pressed, selectedElementGroup:',
          selectedElementGroup
        );
        if (selectedElementGroup) {
          console.log(
            '[ElevationCapturePrompt] Saving elevation with element:',
            selectedElementGroup.name
          );
          e.preventDefault();
          e.stopPropagation();
          onSaveRef.current(selectedElementGroup.id, caption);
          return;
        }
        // If no element selected yet, just prevent bubbling to PDFViewer
        console.log('[ElevationCapturePrompt] No element selected, preventing default');
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      if (step === 'element-type') {
        // Support numeric keys 1-9 for first 9 element types
        const keyNum = parseInt(e.key);
        if (keyNum >= 1 && keyNum <= elementGroups.length && keyNum <= 9) {
          console.log(
            '[ElevationCapturePrompt] Number key pressed:',
            keyNum,
            'selecting:',
            elementGroups[keyNum - 1]?.name
          );
          e.preventDefault();
          e.stopPropagation();
          const group = elementGroups[keyNum - 1];
          setSelectedElementGroup(group);
          setStep('caption');
          return;
        }
      }

      // Prevent most other keys from reaching PDFViewer (but allow typing in input)
      if (!isInputField) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    // Use capture phase to intercept events before they reach PDFViewer
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      console.log('[ElevationCapturePrompt] Unmounting - removing global keyboard listener');
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [step, elementGroups, selectedElementGroup, caption]);

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center">
      <div
        className="bg-white rounded-lg shadow-2xl p-6 w-96 max-h-[80vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {step === 'element-type' && (
          <>
            <h3 className="text-lg font-semibold mb-4">What element type?</h3>
            {loading ? (
              <div className="text-center text-gray-500 py-8">Loading element types...</div>
            ) : (
              <div className="space-y-2">
                {elementGroups.map((group, index) => (
                  <button
                    key={group.id}
                    className={`w-full ${
                      ELEMENT_TYPE_COLORS[group.slug] || 'bg-gray-600'
                    } text-white px-4 py-3 rounded hover:opacity-90 flex items-center justify-between`}
                    onClick={() => {
                      setSelectedElementGroup(group);
                      setStep('caption');
                    }}
                  >
                    <span className="font-medium">{group.name}</span>
                    {index < 9 && (
                      <kbd className="bg-white/20 px-2 py-1 rounded text-sm">{index + 1}</kbd>
                    )}
                  </button>
                ))}
              </div>
            )}
            <button
              className="mt-4 w-full text-gray-600 hover:text-gray-900"
              onClick={() => onCancelRef.current()}
            >
              Cancel (Esc)
            </button>
          </>
        )}

        {step === 'caption' && selectedElementGroup && (
          <>
            <h3 className="text-lg font-semibold mb-2">Add caption (optional)</h3>
            <p className="text-sm text-gray-600 mb-4">
              Element type: <span className="font-medium">{selectedElementGroup.name}</span>
            </p>
            <input
              type="text"
              className="w-full border rounded px-3 py-2 mb-4"
              placeholder={`e.g., Type A 3068, Main Entry ${selectedElementGroup.name}`}
              value={caption}
              onChange={e => setCaption(e.target.value)}
              autoFocus
            />
            <div className="flex gap-2">
              <button
                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                onClick={() => {
                  console.log(
                    '[ElevationCapturePrompt] Save button clicked, calling onSave with:',
                    {
                      elementGroupId: selectedElementGroup.id,
                      caption,
                    }
                  );
                  onSaveRef.current(selectedElementGroup.id, caption);
                }}
              >
                Save (Enter)
              </button>
              <button
                className="flex-1 border border-gray-300 px-4 py-2 rounded hover:bg-gray-50"
                onClick={() => onCancelRef.current()}
              >
                Cancel (Esc)
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
