'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { csvToMarkdown } from '@/lib/table-utils';

interface TableBlock {
  number: string;
  title: string;
  csv: string;
}

interface TableRendererProps {
  tables: TableBlock[];
}

export function TableRenderer({ tables }: TableRendererProps) {
  if (!tables || tables.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      {tables.map((table, idx) => {
        const markdown = csvToMarkdown(table.csv);

        return (
          <div key={idx} className="border border-gray-300 rounded-lg overflow-hidden">
            {/* Table title */}
            {table.title && (
              <div className="bg-gray-100 px-4 py-2 border-b border-gray-300">
                <div className="text-sm font-semibold text-gray-900">{table.title}</div>
              </div>
            )}

            {/* Table content */}
            <div className="overflow-x-auto">
              <div className="prose prose-sm max-w-none p-4">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    table: ({ children }) => (
                      <table className="min-w-full divide-y divide-gray-300 border-collapse">
                        {children}
                      </table>
                    ),
                    thead: ({ children }) => <thead className="bg-gray-50">{children}</thead>,
                    tbody: ({ children }) => (
                      <tbody className="divide-y divide-gray-200 bg-white">{children}</tbody>
                    ),
                    tr: ({ children }) => <tr>{children}</tr>,
                    th: ({ children }) => (
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-900 border border-gray-300">
                        {children}
                      </th>
                    ),
                    td: ({ children }) => (
                      <td className="px-3 py-2 text-xs text-gray-700 border border-gray-300">
                        {children}
                      </td>
                    ),
                  }}
                >
                  {markdown}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
