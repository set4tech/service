import { useEffect, useState } from 'react';

export interface PDFLayer {
  id: string;
  name: string;
  visible: boolean;
}

/**
 * Loads Optional Content Groups (layers) from a PDF document, restores visibility from localStorage,
 * and exposes the current config and a toggle function. Honors the disableLayers flag.
 */
export function usePdfLayers(
  pdfDoc: any,
  assessmentId: string | undefined,
  disableLayers: boolean
) {
  const [ocConfig, setOcConfig] = useState<any>(null);
  const [layers, setLayers] = useState<PDFLayer[]>([]);
  const [layersVersion, setLayersVersion] = useState(0);

  // Persist layer visibility
  useEffect(() => {
    if (!assessmentId || typeof window === 'undefined' || layers.length === 0) return;
    const map: Record<string, boolean> = {};
    for (const l of layers) map[l.id] = l.visible;
    localStorage.setItem(`pdf-layers-${assessmentId}`, JSON.stringify(map));
  }, [layers, assessmentId]);

  // Extract optional content config and layers, restore visibility before first paint
  useEffect(() => {
    if (!pdfDoc) return;

    // Skip loading layers entirely if disabled
    if (disableLayers) {
      setOcConfig(null);
      setLayers([]);
      setLayersVersion(v => v + 1);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const cfg = await pdfDoc.getOptionalContentConfig();
        if (cancelled) return;

        // No OCGs: still render through our canvas path
        if (!cfg) {
          setOcConfig(null);
          setLayers([]);
          setLayersVersion(v => v + 1);
          return;
        }

        // Build layer list
        const order = cfg.getOrder?.() || [];
        const initialLayers: PDFLayer[] = [];
        for (const id of order) {
          const group = cfg.getGroup?.(id);
          initialLayers.push({
            id: String(id),
            name: group?.name || `Layer ${id}`,
            visible: cfg.isVisible?.(id),
          });
        }

        // Restore saved visibility (if any)
        if (assessmentId && typeof window !== 'undefined') {
          const raw = localStorage.getItem(`pdf-layers-${assessmentId}`);
          if (raw) {
            try {
              const saved = JSON.parse(raw) as Record<string, boolean>;
              for (const layer of initialLayers) {
                if (Object.prototype.hasOwnProperty.call(saved, layer.id)) {
                  layer.visible = !!saved[layer.id];
                  try {
                    cfg.setVisibility?.(layer.id, layer.visible);
                  } catch {
                    // ignore per-id errors
                  }
                }
              }
            } catch {
              // ignore parse errors
            }
          }
        }

        setOcConfig(cfg);
        setLayers(initialLayers);
        setLayersVersion(v => v + 1);
      } catch {
        // No layers or error: fall back to default render via our canvas
        setOcConfig(null);
        setLayers([]);
        setLayersVersion(v => v + 1);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdfDoc, assessmentId, disableLayers]);

  const toggleLayer = async (layerId: string) => {
    setLayers(prev => {
      const next = prev.map(l => (l.id === layerId ? { ...l, visible: !l.visible } : l));
      return next;
    });
    setLayersVersion(v => v + 1);
    // Rendering will be triggered by layersVersion change in the viewer
  };

  return { ocConfig, layers, layersVersion, toggleLayer };
}