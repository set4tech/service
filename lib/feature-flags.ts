/**
 * Feature flags for controlling features in production
 * Set environment variables in Vercel to enable/disable
 *
 * Test CI pipeline - this comment will be removed after testing
 */

export const featureFlags = {
  // New report UI (under development)
  newReportUI: process.env.NEXT_PUBLIC_ENABLE_NEW_REPORT === 'true',

  // Batch analysis V2 (testing)
  batchAnalysisV2: process.env.NEXT_PUBLIC_ENABLE_BATCH_V2 === 'true',

  // Element groups filtering
  elementGroupsFilter: process.env.NEXT_PUBLIC_ENABLE_ELEMENT_FILTER === 'true',

  // Debug logging
  debugMode: process.env.NEXT_PUBLIC_DEBUG === 'true',
} as const;

export type FeatureFlag = keyof typeof featureFlags;

/**
 * Check if a feature is enabled
 */
export function isFeatureEnabled(flag: FeatureFlag): boolean {
  return featureFlags[flag];
}
