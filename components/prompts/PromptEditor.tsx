'use client';

import { useEffect, useState } from 'react';
import { renderTemplate } from '@/lib/prompt';
import type { Check, PromptTemplate } from '@/types/database';

export function PromptEditor({ check }: { check: Check }) {
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [selected, setSelected] = useState<PromptTemplate | null>(null);
  const [preview, setPreview] = useState<string>('');
  const [custom, setCustom] = useState<string>('');

  useEffect(() => {
    (async () => {
      const r = await fetch('/api/prompts/templates');
      const { templates } = await r.json();
      setTemplates(templates || []);
      if (templates?.length) setSelected(templates[0]);
    })();
  }, []);

  useEffect(() => {
    if (!selected) return;
    const vars = {
      code_section: {
        number: check.code_section_number,
        title: check.code_section_title,
        text: '',
        jurisdiction: '',
        code_type: '',
      },
      check_name: check.check_name,
      check_location: check.check_location || '',
      screenshots: [],
      building_context: {},
    };
    const rendered = [
      selected.system_prompt || '',
      renderTemplate(selected.user_prompt_template || '', vars),
      selected.instruction_template || '',
    ]
      .filter(Boolean)
      .join('\n\n');
    setPreview(rendered);
    setCustom(rendered);
  }, [selected, check]);

  return (
    <div>
      <div className="text-sm font-medium mb-1">AI Prompt</div>
      <div className="flex items-center gap-2 mb-2">
        <select
          className="border rounded px-2 py-1 text-sm"
          value={selected?.id || ''}
          onChange={e => setSelected(templates.find(t => t.id === e.target.value) || null)}
        >
          {templates.map(t => (
            <option key={t.id} value={t.id}>
              {t.name} v{t.version}
            </option>
          ))}
        </select>
        <button
          className="px-2 py-1 text-sm border rounded"
          onClick={async () => {
            await fetch(`/api/checks/${check.id}`, {
              method: 'PUT',
              body: JSON.stringify({
                prompt_template_id: selected?.id,
                actual_prompt_used: custom,
              }),
              headers: { 'Content-Type': 'application/json' },
            });
          }}
        >
          Save to Check
        </button>
      </div>
      <textarea
        className="w-full h-40 border rounded p-2 text-sm font-mono"
        value={custom}
        onChange={e => setCustom(e.target.value)}
      />
      <div className="text-xs text-gray-500 mt-1">Template baseline:</div>
      <pre className="text-xs bg-gray-50 border rounded p-2 overflow-auto max-h-40">{preview}</pre>
    </div>
  );
}
