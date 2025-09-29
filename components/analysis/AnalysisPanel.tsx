'use client';

import { useEffect, useState } from 'react';

export function AnalysisPanel({ check, onRefresh }: { check: any; onRefresh: () => void }) {
  const [latest, setLatest] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState<'gemini' | 'openai'>((process.env.NEXT_PUBLIC_DEFAULT_PROVIDER as any) || 'gemini');

  const load = async () => {
    try {
      const r = await fetch(`/api/analysis/${check.id}/latest`);
      if (r.ok) {
        const { latest } = await r.json();
        setLatest(latest || null);
      } else setLatest(null);
    } catch {
      setLatest(null);
    }
  };

  useEffect(() => { load(); }, [check.id]);

  const run = async () => {
    setLoading(true);
    try {
      const prompt = check.actual_prompt_used || 'You are a building code compliance expert...';
      await fetch('/api/analysis/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkId: check.id, prompt, screenshots: [], provider })
      });
      await load();
      onRefresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <select className="border rounded px-3 py-2 text-sm" value={provider} onChange={(e) => setProvider(e.target.value as any)}>
          <option value="gemini">Gemini</option>
          <option value="openai">OpenAI</option>
        </select>
        <button className="px-4 py-2 text-sm border rounded" onClick={run} disabled={loading}>{loading ? 'Analyzing…' : 'Analyze'}</button>
      </div>
      {latest ? (
        <div className="text-sm border rounded p-2">
          <div>Latest: <span className="font-medium">{latest.compliance_status}</span> ({latest.confidence})</div>
          <div className="text-xs text-gray-600">Model: {latest.ai_model} at {new Date(latest.executed_at).toLocaleString()}</div>
          {latest.ai_reasoning && <pre className="mt-2 text-xs bg-gray-50 p-2 rounded overflow-auto max-h-48">{latest.ai_reasoning}</pre>}
        </div>
      ) : (
        <div className="text-sm text-gray-600">No analysis yet.</div>
      )}
    </div>
  );
}