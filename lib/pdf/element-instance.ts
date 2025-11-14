type ElementType = 'bathroom' | 'door' | 'kitchen' | 'wall';

const ELEMENT_GROUP_SLUGS: Record<ElementType, string> = {
  bathroom: 'bathrooms',
  door: 'doors',
  kitchen: 'kitchens',
  wall: 'walls',
};

export interface ElementInstance {
  id: string;
  label: string;
  element_group_id: string;
  element_group_name: string;
  assessment_id: string;
}

export interface CreateElementInstanceResponse {
  instance: ElementInstance;
  checks_created: number;
  first_check_id: string;
}

/**
 * Create a new element instance with all its associated checks.
 *
 * @param elementType - Type of element to create
 * @param assessmentId - Assessment ID to attach to
 * @returns Created element instance data (instance, checks_created, first_check_id) or null if failed
 */
export async function createElementInstance(
  elementType: ElementType,
  assessmentId?: string
): Promise<CreateElementInstanceResponse | null> {
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

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('[createElementInstance] Request failed:', error);
    return null;
  }
}
