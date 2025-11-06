// Shared types for the project creation form

export interface Customer {
  id: string;
  name: string;
  contact_email: string;
}

export interface Chapter {
  id: string;
  name: string;
  number: string;
}

export interface CodeBook {
  id: string;
  name: string;
  publisher?: string;
  jurisdiction?: string;
  year?: string;
  chapters: Chapter[];
}

export interface ProjectData {
  name: string;
  description: string;
  customer_id: string;
  pdf_url: string;
  report_password: string;
}

export interface NewCustomer {
  name: string;
}

export interface ProjectVariables {
  [category: string]: {
    [variable: string]: any;
  };
}

export interface VariableInfo {
  type: 'text' | 'number' | 'date' | 'boolean' | 'select' | 'multiselect';
  description?: string;
  options?: string[];
}

export interface VariableChecklist {
  [category: string]: {
    [variable: string]: VariableInfo;
  };
}

export interface StepProps {
  onNext: () => void;
  onBack: () => void;
}


