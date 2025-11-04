type ElementType = 'bathroom' | 'door' | 'kitchen';

const ELEMENT_GROUP_SLUGS: Record<ElementType, string> = {
  bathroom: 'bathrooms',
  door: 'doors',
  kitchen: 'kitchens',
};

/**
 * Create a new element instance check.
 * 
 * @param elementType - Type of element to create
 * @param assessmentId - Assessment ID to attach to
 * @returns Created check object or null if failed
 */
export async function createElementInstance(
  elementType: ElementType,
  assessmentId?: string
): Promise<any | null> {
  const slug = ELEMENT_GROUP_SLUGS[elementType];
  if (!slug || !assessmentId) {
    console.error('[createElementInstance] Missing slug or assessment ID');
    return null;
  }

  try {
    const response = await fetch(`/api/checks/create-element`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assessmentId,
        elementGroupSlug: slug,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('[createElementInstance] API error:', error);
      return null;
    }

    const { check } = await response.json();
    return check;
  } catch (error) {
    console.error('[createElementInstance] Request failed:', error);
    return null;
  }
}
