import { usePersisted } from '@/lib/hooks/usePersisted';

export interface Transform {
  tx: number;
  ty: number;
  scale: number;
}

interface PdfPersistenceState {
  page: number;
  transform: Transform;
  showIndicators: boolean;
}

interface PdfPersistenceActions {
  setPage: (page: number) => void;
  setTransform: (transform: Transform) => void;
  setShowIndicators: (show: boolean) => void;
}

/**
 * Validate transform to ensure reasonable values.
 * Resets to default if scale is out of reasonable bounds (viewport changed).
 */
function validateTransform(t: Transform): Transform {
  // Valid scale should be 0.5-2.0 for reasonable zoom levels
  // Old saved transforms from when viewport scaled to 6-10x are invalid
  if (t.scale < 0.5 || t.scale > 2.0) {
    return { tx: 0, ty: 0, scale: 1 };
  }
  return t;
}

/**
 * Hook that consolidates all PDF viewer persistence.
 * 
 * Persists:
 * - Current page number
 * - View transform (pan/zoom)
 * - Screenshot indicators visibility
 * 
 * All values are stored in localStorage with debouncing.
 * 
 * @example
 * ```typescript
 * const persistence = usePdfPersistence(assessmentId);
 * 
 * // Read state
 * const { page, transform, showIndicators } = persistence.state;
 * 
 * // Update state (automatically persisted)
 * persistence.actions.setPage(2);
 * persistence.actions.setTransform({ tx: 100, ty: 50, scale: 1.5 });
 * ```
 */
export function usePdfPersistence(
  assessmentId: string | undefined
): {
  state: PdfPersistenceState;
  actions: PdfPersistenceActions;
} {
  const [page, setPage] = usePersisted<number>(
    assessmentId ? `pdf-page-${assessmentId}` : undefined,
    1
  );

  const [transform, setTransform] = usePersisted<Transform>(
    assessmentId ? `pdf-transform-${assessmentId}` : undefined,
    { tx: 0, ty: 0, scale: 1 },
    {
      validate: validateTransform,
      debounce: 500, // Debounce transform saves
    }
  );

  const [showIndicators, setShowIndicators] = usePersisted<boolean>(
    assessmentId ? `pdf-show-indicators-${assessmentId}` : undefined,
    true
  );

  return {
    state: {
      page,
      transform,
      showIndicators,
    },
    actions: {
      setPage,
      setTransform,
      setShowIndicators,
    },
  };
}
