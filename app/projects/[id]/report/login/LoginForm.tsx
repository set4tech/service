'use client';

import { useActionState } from 'react';
import { handleLogin } from './actions';

export function LoginForm({ projectId }: { projectId: string }) {
  const [state, formAction, isPending] = useActionState(handleLogin, { error: '' });

  return (
    <form action={formAction}>
      <input type="hidden" name="projectId" value={projectId} />

      <div className="space-y-4">
        {/* Error Message */}
        {state?.error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {state.error}
          </div>
        )}

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
            Password
          </label>
          <input
            type="password"
            id="password"
            name="password"
            required
            autoFocus
            disabled={isPending}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder="Enter password"
          />
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? 'Checking...' : 'Access Report'}
        </button>
      </div>
    </form>
  );
}
