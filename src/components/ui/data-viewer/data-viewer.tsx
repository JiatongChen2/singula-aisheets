import { component$, useSignal } from '@builder.io/qwik';
import { server$ } from '@builder.io/qwik-city';

interface DataViewerProps {
  data: string[][];
  headers: string[];
  fileName: string;
}

const parseCSV = server$(async (csvContent: string) => {
  const lines = csvContent.trim().split('\n');
  const headers = lines[0].split(',').map((h) => h.trim().replace(/"/g, ''));

  const data = lines.slice(1).map((line) => {
    const values = line.split(',').map((v) => v.trim().replace(/"/g, ''));
    return values;
  });

  return { headers, data };
});

export const DataViewer = component$<DataViewerProps>(
  ({ data, headers, fileName }) => {
    const isExpanded = useSignal(false);

    return (
      <div class="w-full bg-white border border-neutral-200 rounded-lg shadow-sm">
        {/* Header */}
        <div class="flex items-center justify-between p-4 border-b border-neutral-200">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
              <svg
                class="w-4 h-4 text-blue-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                role="img"
                aria-label="Data icon"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
            </div>
            <div>
              <h3 class="font-semibold text-neutral-900">{fileName}</h3>
              <p class="text-sm text-neutral-500">
                {data.length} rows × {headers.length} columns
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick$={() => (isExpanded.value = !isExpanded.value)}
            class="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            {isExpanded.value ? 'Show Less' : 'Show More'}
          </button>
        </div>

        {/* Table */}
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead class="bg-neutral-50">
              <tr>
                {headers.map((header, index) => (
                  <th
                    key={index}
                    class="px-4 py-3 text-left text-xs font-medium text-neutral-700 uppercase tracking-wider"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-neutral-200">
              {data
                .slice(0, isExpanded.value ? data.length : 5)
                .map((row, rowIndex) => (
                  <tr key={rowIndex} class="hover:bg-neutral-50">
                    {row.map((cell, cellIndex) => (
                      <td
                        key={cellIndex}
                        class="px-4 py-3 text-sm text-neutral-900"
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>

          {!isExpanded.value && data.length > 5 && (
            <div class="p-4 text-center text-sm text-neutral-500 border-t border-neutral-200">
              Showing 5 of {data.length} rows. Click "Show More" to see all
              data.
            </div>
          )}
        </div>
      </div>
    );
  },
);
