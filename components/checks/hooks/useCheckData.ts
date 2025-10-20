import { useState, useEffect } from 'react';
import type { CodeSection } from '@/types/analysis';

interface Check {
  id: string;
  check_type?: string;
  element_sections?: string[];
  element_group_name?: string;
  instance_number?: number;
}

export function useCheckData(checkId: string | null, sectionKey: string | null) {
  const [check, setCheck] = useState<Check | null>(null);
  const [sections, setSections] = useState<CodeSection[]>([]);
  const [activeSectionIndex, setActiveSectionIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // For element checks: child section checks
  const [childChecks, setChildChecks] = useState<any[]>([]);
  const [activeChildCheckId, setActiveChildCheckId] = useState<string | null>(null);

  // Computed: current section to display
  const section = sections[activeSectionIndex] || null;

  // Load check data and determine if it's an element check
  useEffect(() => {
    if (!checkId) {
      setCheck(null);
      setChildChecks([]);
      setActiveChildCheckId(null);
      return;
    }

    // Reset child check state when loading a new check to prevent stale data
    setActiveChildCheckId(null);
    setChildChecks([]);

    fetch(`/api/checks/${checkId}`)
      .then(res => res.json())
      .then(data => {
        if (data.check) {
          console.log('useCheckData: Loaded check', {
            id: data.check.id,
            type: data.check.check_type,
            instance_number: data.check.instance_number,
            element_sections: data.check.element_sections,
          });
          setCheck(data.check);

          // If this is an element check, fetch child section checks
          if (data.check.check_type === 'element') {
            console.log('useCheckData: Fetching child checks for element check', checkId);
            return fetch(`/api/checks?parent_check_id=${checkId}`).then(res => res.json());
          }
        }
        return null;
      })
      .then(childData => {
        if (childData && Array.isArray(childData)) {
          console.log('useCheckData: Loaded child checks', {
            count: childData.length,
            sections: childData.map((c: any) => c.code_section_number),
          });
          // Sort by section number
          const sorted = childData.sort((a: any, b: any) =>
            (a.code_section_number || '').localeCompare(b.code_section_number || '')
          );
          setChildChecks(sorted);
          // Set first child as active
          if (sorted.length > 0) {
            setActiveChildCheckId(sorted[0].id);
          } else {
            setActiveChildCheckId(null);
          }
        } else {
          console.log('useCheckData: No child checks found');
          setActiveChildCheckId(null);
        }
      })
      .catch(err => {
        console.error('Failed to load check:', err);
      });
  }, [checkId]);

  // Load code sections
  useEffect(() => {
    // For element checks with child checks, load section based on active child check
    if (childChecks.length > 0 && activeChildCheckId) {
      const activeChild = childChecks.find((c: any) => c.id === activeChildCheckId);
      if (!activeChild?.code_section_key) {
        setSections([]);
        return;
      }

      setLoading(true);
      setError(null);

      fetch(`/api/code-sections/${activeChild.code_section_key}`)
        .then(res => res.json())
        .then(data => {
          if (data.error) {
            setError(data.error);
            setSections([]);
          } else {
            setSections([data]);
            setActiveSectionIndex(0);
          }
          setLoading(false);
        })
        .catch(err => {
          console.error('Failed to load section:', err);
          setError(err.message);
          setLoading(false);
        });

      return;
    }

    // Original logic for non-element checks
    if (!sectionKey && !check?.element_sections) {
      setSections([]);
      setActiveSectionIndex(0);
      return;
    }

    setLoading(true);
    setError(null);

    // Determine which sections to load
    const sectionKeys = check?.element_sections || (sectionKey ? [sectionKey] : []);

    if (sectionKeys.length === 0) {
      setSections([]);
      setLoading(false);
      return;
    }

    // Load all sections using batch endpoint
    fetch('/api/sections/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keys: sectionKeys }),
    })
      .then(res => res.json())
      .then(sections => {
        setSections(sections || []);
        setActiveSectionIndex(0);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load sections:', err);
        setError(err.message);
        setLoading(false);
      });
  }, [sectionKey, check, childChecks, activeChildCheckId]);

  // Function to refresh child checks (used after marking never relevant or excluding)
  const refreshChildChecks = async () => {
    if (!checkId || check?.check_type !== 'element') return;

    console.log('Refreshing child checks');
    try {
      const res = await fetch(`/api/checks?parent_check_id=${checkId}`);
      const childData = await res.json();

      if (Array.isArray(childData)) {
        const sorted = childData.sort((a: any, b: any) =>
          (a.code_section_number || '').localeCompare(b.code_section_number || '')
        );
        setChildChecks(sorted);
        // If current child was removed, switch to first available
        if (sorted.length > 0 && !sorted.find((c: any) => c.id === activeChildCheckId)) {
          setActiveChildCheckId(sorted[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to reload child checks:', err);
    }
  };

  return {
    check,
    sections,
    section,
    activeSectionIndex,
    loading,
    error,
    childChecks,
    activeChildCheckId,
    setActiveChildCheckId,
    setChildChecks,
    refreshChildChecks,
  };
}
