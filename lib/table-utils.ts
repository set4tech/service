/**
 * Convert CSV string to Markdown table format
 * Handles quoted fields and newlines within cells
 */
export function csvToMarkdown(csv: string): string {
  if (!csv || csv.trim() === '') {
    return '';
  }

  const lines = csv.trim().split('\n');
  if (lines.length === 0) {
    return '';
  }

  // Parse CSV rows - handles quoted fields with commas
  const rows = lines.map(line => {
    const cells: string[] = [];
    let currentCell = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Escaped quote
          currentCell += '"';
          i++; // Skip next quote
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        // End of cell
        cells.push(currentCell.trim());
        currentCell = '';
      } else {
        currentCell += char;
      }
    }

    // Push last cell
    cells.push(currentCell.trim());
    return cells;
  });

  if (rows.length === 0) {
    return '';
  }

  // Build markdown table
  const header = rows[0];
  const dataRows = rows.slice(1);

  // Header row
  let markdown = '| ' + header.join(' | ') + ' |\n';

  // Separator row
  markdown += '| ' + header.map(() => '---').join(' | ') + ' |\n';

  // Data rows
  for (const row of dataRows) {
    // Pad row if it has fewer columns than header
    while (row.length < header.length) {
      row.push('');
    }
    markdown += '| ' + row.join(' | ') + ' |\n';
  }

  return markdown;
}

/**
 * Check if text contains markdown table syntax
 */
export function hasMarkdownTable(text: string): boolean {
  if (!text) return false;
  // Look for markdown table pattern (lines with pipes)
  const lines = text.split('\n');
  return lines.some(line => line.trim().includes('|') && line.trim().startsWith('|'));
}
