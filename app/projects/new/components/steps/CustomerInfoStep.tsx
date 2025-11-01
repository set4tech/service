'use client';

import type { Customer, NewCustomer, StepProps } from '../../types';

interface CustomerInfoStepProps extends StepProps {
  customers: Customer[];
  selectedCustomerId: string;
  createNewCustomer: boolean;
  newCustomer: NewCustomer;
  onSelectCustomer: (id: string) => void;
  onToggleCreateNew: (value: boolean) => void;
  onUpdateNewCustomer: (customer: NewCustomer) => void;
}

export function CustomerInfoStep({
  customers,
  selectedCustomerId,
  createNewCustomer,
  newCustomer,
  onSelectCustomer,
  onToggleCreateNew,
  onUpdateNewCustomer,
  onNext,
  onBack,
}: CustomerInfoStepProps) {
  const isValid =
    (!createNewCustomer && selectedCustomerId) || (createNewCustomer && newCustomer.name);

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Customer Information</h2>

      <div className="space-y-4">
        <div className="flex items-center space-x-4 mb-4">
          <button
            onClick={() => onToggleCreateNew(false)}
            className={`px-5 py-2.5 rounded-lg ${
              !createNewCustomer ? 'bg-brand-600 text-white' : 'bg-gray-200 text-gray-700'
            }`}
          >
            Select Existing
          </button>
          <button
            onClick={() => onToggleCreateNew(true)}
            className={`px-5 py-2.5 rounded-lg ${
              createNewCustomer ? 'bg-brand-600 text-white' : 'bg-gray-200 text-gray-700'
            }`}
          >
            Create New
          </button>
        </div>

        {!createNewCustomer ? (
          <div>
            <label className="block text-sm font-medium text-gray-700">Select Customer</label>
            <select
              value={selectedCustomerId}
              onChange={e => onSelectCustomer(e.target.value)}
              className="select mt-1"
            >
              <option value="">Select a customer...</option>
              {customers.map(customer => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-gray-700">Customer Name *</label>
            <input
              type="text"
              value={newCustomer.name}
              onChange={e => onUpdateNewCustomer({ ...newCustomer, name: e.target.value })}
              className="input mt-1"
              placeholder="Enter customer name"
            />
          </div>
        )}
      </div>

      <div className="mt-6 flex justify-between">
        <button onClick={onBack} className="btn-secondary">
          ← Back
        </button>
        <button onClick={onNext} disabled={!isValid} className="btn-primary">
          Next →
        </button>
      </div>
    </div>
  );
}
