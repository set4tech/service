/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useManualOverride } from '../../hooks/useManualOverride';

describe('useManualOverride', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  describe('Initial state', () => {
    it('should initialize with default values', () => {
      const { result } = renderHook(() => useManualOverride());

      expect(result.current.state.override).toBeNull();
      expect(result.current.state.note).toBe('');
      expect(result.current.state.saving).toBe(false);
      expect(result.current.state.error).toBeNull();
      expect(result.current.state.showNoteInput).toBe(false);
    });

    it('should initialize with provided values', () => {
      const { result } = renderHook(() =>
        useManualOverride({
          initialOverride: 'compliant',
          initialNote: 'Test note',
        })
      );

      expect(result.current.state.override).toBe('compliant');
      expect(result.current.state.note).toBe('Test note');
    });
  });

  describe('State updates', () => {
    it('should update override value', () => {
      const { result } = renderHook(() => useManualOverride());

      act(() => {
        result.current.actions.setOverride('non_compliant');
      });

      expect(result.current.state.override).toBe('non_compliant');
    });

    it('should update note value', () => {
      const { result } = renderHook(() => useManualOverride());

      act(() => {
        result.current.actions.setNote('My note');
      });

      expect(result.current.state.note).toBe('My note');
    });

    it('should toggle note input visibility', () => {
      const { result } = renderHook(() => useManualOverride());

      expect(result.current.state.showNoteInput).toBe(false);

      act(() => {
        result.current.actions.setShowNoteInput(true);
      });

      expect(result.current.state.showNoteInput).toBe(true);

      act(() => {
        result.current.actions.setShowNoteInput(false);
      });

      expect(result.current.state.showNoteInput).toBe(false);
    });

    it('should clear error', async () => {
      const { result } = renderHook(() => useManualOverride());

      // Trigger an error
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Test error' }),
      });

      act(() => {
        result.current.actions.setOverride('compliant');
      });

      // Attempt save to trigger error
      await act(async () => {
        try {
          await result.current.actions.saveOverride('check-1');
        } catch (err) {
          // Expected error
        }
      });

      // Error should be set
      expect(result.current.state.error).toBe('Test error');

      // Clear error
      act(() => {
        result.current.actions.clearError();
      });

      expect(result.current.state.error).toBeNull();
    });
  });

  describe('Save override', () => {
    it('should successfully save override', async () => {
      const onSaveSuccess = vi.fn();
      const { result } = renderHook(() =>
        useManualOverride({
          onSaveSuccess,
        })
      );

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ check: { id: 'check-1', manual_status: 'compliant' } }),
      });

      act(() => {
        result.current.actions.setOverride('compliant');
        result.current.actions.setNote('Test note');
      });

      await act(async () => {
        await result.current.actions.saveOverride('check-1');
      });

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/checks/check-1/manual-override',
        expect.objectContaining({
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            override: 'compliant',
            note: 'Test note',
          }),
        })
      );

      expect(onSaveSuccess).toHaveBeenCalledTimes(1);
      expect(result.current.state.saving).toBe(false);
      expect(result.current.state.error).toBeNull();
    });

    it('should trim empty notes', async () => {
      const { result } = renderHook(() => useManualOverride());

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ check: {} }),
      });

      act(() => {
        result.current.actions.setOverride('compliant');
        result.current.actions.setNote('   ');
      });

      await act(async () => {
        await result.current.actions.saveOverride('check-1');
      });

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/checks/check-1/manual-override',
        expect.objectContaining({
          body: JSON.stringify({
            override: 'compliant',
            note: undefined,
          }),
        })
      );
    });

    it('should handle 404 error (deleted check)', async () => {
      const onCheckDeleted = vi.fn();
      const { result } = renderHook(() =>
        useManualOverride({
          onCheckDeleted,
        })
      );

      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Check not found' }),
      });

      act(() => {
        result.current.actions.setOverride('compliant');
      });

      await act(async () => {
        try {
          await result.current.actions.saveOverride('check-1');
        } catch (err: any) {
          expect(err.message).toContain('deleted or excluded');
        }
      });

      expect(onCheckDeleted).toHaveBeenCalledTimes(1);
      expect(result.current.state.error).toContain('deleted or excluded');
    });

    it('should handle API errors', async () => {
      const { result } = renderHook(() => useManualOverride());

      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Validation error' }),
      });

      act(() => {
        result.current.actions.setOverride('compliant');
      });

      await act(async () => {
        try {
          await result.current.actions.saveOverride('check-1');
        } catch (err: any) {
          expect(err.message).toBe('Validation error');
        }
      });

      expect(result.current.state.error).toBe('Validation error');
      expect(result.current.state.saving).toBe(false);
    });

    it('should handle network errors', async () => {
      const { result } = renderHook(() => useManualOverride());

      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      act(() => {
        result.current.actions.setOverride('compliant');
      });

      await act(async () => {
        try {
          await result.current.actions.saveOverride('check-1');
        } catch (err: any) {
          expect(err.message).toBe('Network error');
        }
      });

      expect(result.current.state.error).toBe('Network error');
      expect(result.current.state.saving).toBe(false);
    });

    it('should reset saving state after save completes', async () => {
      const { result } = renderHook(() => useManualOverride());

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      act(() => {
        result.current.actions.setOverride('compliant');
      });

      expect(result.current.state.saving).toBe(false);

      await act(async () => {
        await result.current.actions.saveOverride('check-1');
      });

      // After save completes, saving should be false
      expect(result.current.state.saving).toBe(false);
    });

    it('should throw error if checkId is missing', async () => {
      const { result } = renderHook(() => useManualOverride());

      act(() => {
        result.current.actions.setOverride('compliant');
      });

      await act(async () => {
        try {
          await result.current.actions.saveOverride('');
        } catch (err: any) {
          expect(err.message).toBe('Check ID is required');
        }
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle null override', async () => {
      const { result } = renderHook(() => useManualOverride());

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      act(() => {
        result.current.actions.setOverride(null);
      });

      await act(async () => {
        await result.current.actions.saveOverride('check-1');
      });

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/checks/check-1/manual-override',
        expect.objectContaining({
          body: JSON.stringify({
            override: null,
            note: undefined,
          }),
        })
      );
    });

    it('should preserve override state across saves', async () => {
      const { result } = renderHook(() => useManualOverride());

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      // First save
      act(() => {
        result.current.actions.setOverride('compliant');
      });

      await act(async () => {
        await result.current.actions.saveOverride('check-1');
      });

      expect(result.current.state.override).toBe('compliant');

      // Second save with different value
      act(() => {
        result.current.actions.setOverride('non_compliant');
      });

      await act(async () => {
        await result.current.actions.saveOverride('check-1');
      });

      expect(result.current.state.override).toBe('non_compliant');
    });

    it('should handle multiple rapid saves', async () => {
      const { result } = renderHook(() => useManualOverride());

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      act(() => {
        result.current.actions.setOverride('compliant');
      });

      // Trigger multiple saves
      await act(async () => {
        await Promise.all([
          result.current.actions.saveOverride('check-1'),
          result.current.actions.saveOverride('check-1'),
          result.current.actions.saveOverride('check-1'),
        ]);
      });

      // All saves should complete
      expect(global.fetch).toHaveBeenCalledTimes(3);
      expect(result.current.state.saving).toBe(false);
    });
  });
});
