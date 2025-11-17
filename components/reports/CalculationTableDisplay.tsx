'use client';

interface CalculationTable {
  title: string;
  headers: string[];
  rows: string[][];
}

interface CalculationTableDisplayProps {
  table: CalculationTable;
}

export function CalculationTableDisplay({ table }: CalculationTableDisplayProps) {
  return (
    <div className="mt-6 border-t border-gray-200 pt-6">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">📊 {table.title}</h3>

      <div className="overflow-x-auto border border-gray-300 rounded-lg">
        <table className="min-w-full divide-y divide-gray-300">
          <thead className="bg-gray-50">
            <tr>
              {table.headers.map((header, idx) => (
                <th
                  key={idx}
                  className="px-4 py-3 text-left text-xs font-semibold text-gray-900 uppercase tracking-wider border-r border-gray-300 last:border-r-0"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {table.rows.map((row, rowIdx) => (
              <tr key={rowIdx} className="hover:bg-gray-50 transition-colors">
                {row.map((cell, cellIdx) => (
                  <td
                    key={cellIdx}
                    className="px-4 py-3 text-sm text-gray-700 border-r border-gray-200 last:border-r-0 whitespace-nowrap"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
