import { useState, useEffect, useCallback } from 'react';
import { usePersisted } from '@/lib/hooks/usePersisted';
import type { HookReturn } from '@/lib/hooks/types';

export interface PdfLayer {
  id: string;
  name: string;
  visible: boolean;
}

interface LayersState {
  layers: PdfLayer[];
  ocConfig: any | null;
  loading: boolean;
}

interface LayersActions {
  toggleLayer: (layerId: string) => void;
  setAllVisible: (visible: boolean) => void;
}

/**
 * Hook for managing PDF optional content layers (OCG).
 * 
 * Features:
 * - Loads layers from PDF document
 * - Persists layer visibility to localStorage
 * - Provides toggle functionality
 * - Can disable layers entirely
 * 
 * @example
 * ```typescript
 * const layers = usePdfLayers(pdfDoc, assessmentId, false);
 * 
 * // Toggle a layer
 * layers.actions.toggleLayer('layer-id-1');
 * 
 * // Hide all layers
 * layers.actions.setAllVisible(false);
 * 
 * // Render with layer config
 * await page.render({
 *   canvasContext: ctx,
 *   viewport,
 *   optionalContentConfigPromise: Promise.resolve(layers.state.ocConfig)
 * });
 * ```
 */
export function usePdfLayers(
  doc: any | null,
  assessmentId: string | undefined,
  disabled: boolean = false
): HookReturn<LayersState, LayersActions> {
  const [ocConfig, setOcConfig] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Persist layer visibility (stored as Record<layerId, visible>)
  const [persistedVisibility, setPersistedVisibility] = usePersisted<Record<string, boolean>>(
    assessmentId ? `pdf-layers-${assessmentId}` : undefined,
    {}
  );

  const [layers, setLayers] = useState<PdfLayer[]>([]);

  // Load layers from document
  useEffect(() => {
    if (!doc || disabled) {
      setOcConfig(null);
      setLayers([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const cfg = await doc.getOptionalContentConfig();
        if (cancelled) return;

        if (!cfg) {
          setOcConfig(null);
          setLayers([]);
          setLoading(false);
          return;
        }

        // Build layer list
        const order = cfg.getOrder?.() || [];
        const initialLayers: PdfLayer[] = [];

        for (const id of order) {
          const group = cfg.getGroup?.(id);
          const layerId = String(id);
          
          // Check if we have saved visibility for this layer
          const savedVisibility = persistedVisibility[layerId];
          const visible = savedVisibility !== undefined ? savedVisibility : cfg.isVisible?.(id);

          // Apply saved visibility to config
          if (savedVisibility !== undefined) {
            try {
              cfg.setVisibility?.(id, visible);
            } catch (err) {
              console.warn('[usePdfLayers] Error setting layer visibility:', err);
            }
          }

          initialLayers.push({
            id: layerId,
            name: group?.name || `Layer ${id}`,
            visible,
          });
        }

        setOcConfig(cfg);
        setLayers(initialLayers);
        setLoading(false);
      } catch (err) {
        console.error('[usePdfLayers] Error loading layers:', err);
        if (!cancelled) {
          setOcConfig(null);
          setLayers([]);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [doc, disabled, persistedVisibility]);

  const toggleLayer = useCallback(
    (layerId: string) => {
      setLayers((current) => {
        const updated = current.map((layer) =>
          layer.id === layerId ? { ...layer, visible: !layer.visible } : layer
        );

        // Update OC config
        const layer = updated.find((l) => l.id === layerId);
        if (layer && ocConfig) {
          try {
            ocConfig.setVisibility?.(layerId, layer.visible);
          } catch (err) {
            console.warn('[usePdfLayers] Error toggling layer:', err);
          }
        }

        // Persist visibility
        const visibility: Record<string, boolean> = {};
        for (const l of updated) {
          visibility[l.id] = l.visible;
        }
        setPersistedVisibility(visibility);

        return updated;
      });
    },
    [ocConfig, setPersistedVisibility]
  );

  const setAllVisible = useCallback(
    (visible: boolean) => {
      setLayers((current) => {
        const updated = current.map((layer) => ({ ...layer, visible }));

        // Update all layers in OC config
        if (ocConfig) {
          for (const layer of updated) {
            try {
              ocConfig.setVisibility?.(layer.id, visible);
            } catch (err) {
              console.warn('[usePdfLayers] Error setting layer visibility:', err);
            }
          }
        }

        // Persist visibility
        const visibility: Record<string, boolean> = {};
        for (const l of updated) {
          visibility[l.id] = visible;
        }
        setPersistedVisibility(visibility);

        return updated;
      });
    },
    [ocConfig, setPersistedVisibility]
  );

  return {
    state: {
      layers,
      ocConfig,
      loading,
    },
    actions: {
      toggleLayer,
      setAllVisible,
    },
  };
}
