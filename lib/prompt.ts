import { z } from 'zod';

export const PromptVariablesSchema = z.object({
  code_section: z.object({
    number: z.string(),
    title: z.string(),
    text: z.string().optional().default(''),
    jurisdiction: z.string().optional(),
    code_type: z.string().optional()
  }),
  check_name: z.string(),
  check_location: z.string().optional().default(''),
  screenshots: z.array(
    z.object({
      url: z.string(),
      description: z.string().optional().default('')
    })
  ),
  building_context: z.record(z.any()).optional().default({})
});

export type PromptVariables = z.infer<typeof PromptVariablesSchema>;

export function renderTemplate(template: string, vars: PromptVariables): string {
  // very simple {{var}} replacement, with three known top-level keys
  return template
    .replace(/\{\{code_section\}\}/g, () => JSON.stringify(vars.code_section, null, 2))
    .replace(/\{\{check_name\}\}/g, () => vars.check_name)
    .replace(/\{\{location\}\}/g, () => vars.check_location || '')
    .replace(/\{\{screenshots\}\}/g, () => JSON.stringify(vars.screenshots, null, 2))
    .replace(/\{\{building_context\}\}/g, () => JSON.stringify(vars.building_context || {}, null, 2));
}