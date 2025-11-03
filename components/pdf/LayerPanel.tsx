'use client';

import type { PDFLayer } from '@/hooks/usePdfLayers';

interface LayerPanelProps {
  layers: PDFLayer[];
  onToggle: (layerId: string) => void;
  onClose: () => void;
}

export function LayerPanel({ layers, onToggle, onClose }: LayerPanelProps) {
  if (layers.length === 0) return null;

  return (
    <div className="absolute top-16 right-3 z-50 bg-white border rounded shadow-lg p-3 w-64 pointer-events-auto">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">PDF Layers</h3>
        <button className="text-xs text-gray-500 hover:text-gray-700" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {layers.map(layer => (
          <label
            key={layer.id}
            className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded"
          >
            <input type="checkbox" checked={layer.visible} onChange={() => onToggle(layer.id)} className="w-4 h-4" />
            <span className="text-sm">{layer.name}</span>
          </label>
        ))}
      </div>
    </div>
  );
}