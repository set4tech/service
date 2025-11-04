import { useState } from 'react';
import type { ProjectData, NewCustomer, ProjectVariables } from '../types';

export function useProjectForm() {
  const [projectData, setProjectData] = useState<ProjectData>({
    name: '',
    description: '',
    customer_id: '',
    pdf_url: '',
    report_password: '',
  });

  const [newCustomer, setNewCustomer] = useState<NewCustomer>({
    name: '',
  });

  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [createNewCustomer, setCreateNewCustomer] = useState(false);
  const [selectedChapterIds, setSelectedChapterIds] = useState<string[]>([]);
  const [projectVariables, setProjectVariables] = useState<ProjectVariables>({});
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const updateProjectData = (updates: Partial<ProjectData>) => {
    setProjectData(prev => ({ ...prev, ...updates }));
  };

  const toggleChapterSelection = (chapterId: string) => {
    setSelectedChapterIds(prev =>
      prev.includes(chapterId) ? prev.filter(id => id !== chapterId) : [...prev, chapterId]
    );
  };

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const updateVariable = (category: string, variable: string, value: any) => {
    setProjectVariables(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [variable]: value,
      },
    }));
  };

  const toggleMultiselect = (category: string, variable: string, option: string) => {
    setProjectVariables(prev => {
      const currentValues = prev[category]?.[variable] || [];
      const newValues = currentValues.includes(option)
        ? currentValues.filter((v: string) => v !== option)
        : [...currentValues, option];

      return {
        ...prev,
        [category]: {
          ...prev[category],
          [variable]: newValues,
        },
      };
    });
  };

  return {
    projectData,
    setProjectData,
    updateProjectData,
    newCustomer,
    setNewCustomer,
    pdfFile,
    setPdfFile,
    createNewCustomer,
    setCreateNewCustomer,
    selectedChapterIds,
    toggleChapterSelection,
    projectVariables,
    updateVariable,
    toggleMultiselect,
    expandedCategories,
    toggleCategory,
  };
}

