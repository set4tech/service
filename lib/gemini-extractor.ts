import { GoogleGenerativeAI } from '@google/generative-ai';
import yaml from 'js-yaml';

export interface VariableResult {
  value: string;
  confidence: 'high' | 'medium' | 'low';
}

export type ExtractionResult = VariableResult | 'not_applicable' | null;

export interface VariableChecklist {
  [category: string]: {
    [variable: string]:
      | {
          description: string;
        }
      | {
          [nestedVariable: string]: {
            description: string;
          };
        };
  };
}

export interface ExtractedVariables {
  [category: string]: {
    [variable: string]:
      | VariableResult
      | 'not_applicable'
      | {
          [nestedVariable: string]: VariableResult | 'not_applicable';
        };
  };
}

const MAX_CHARS_PER_CHUNK = 40000; // ~10k tokens

/**
 * Extract a single variable from a chunk of text
 */
async function extractFromChunk(
  variableName: string,
  description: string,
  chunkText: string,
  categoryContext: string,
  chunkNum: number,
  totalChunks: number,
  model: any
): Promise<ExtractionResult> {
  const chunkInfo = totalChunks > 1 ? ` (Chunk ${chunkNum}/${totalChunks})` : '';

  const prompt = `You are a building code compliance expert extracting ONE SPECIFIC piece of information from construction documents${chunkInfo}.

CATEGORY: ${categoryContext}
VARIABLE NAME: ${variableName}
WHAT YOU NEED TO FIND: ${description}

DOCUMENT TEXT (with page markers [PAGE X START] and [PAGE X END]):
${chunkText}

YOUR TASK:
Read the ENTIRE document and find information that DIRECTLY ANSWERS the question in the description.
Extract ONLY the essential facts needed for code applicability analysis.

IMPORTANT RULES:
1. ONLY extract the CORE ANSWER - no explanations, no quotes, no page references
2. Be concise and factual - extract just the essential information
3. If the description asks for a specific value (year, number, classification), extract ONLY that value
4. If information is truly not in the document, return "not_found"
5. If the variable does not apply to this project type, return "not_applicable"

EXAMPLES:

Example 1:
Description: "Street address including state, city/town, and county"
GOOD: "255 California Street, San Francisco, San Francisco County, CA 94111"
BAD: "The building is located at 255 California Street which is in downtown San Francisco..."

Example 2:
Description: "IBC occupancy group(s) and mixed-use status"
GOOD: "Group B, not mixed-use"
BAD: "*PER TABLE 1006.2.1, OCCUPANCY GROUP B SPACES WITH ONE EXIT..."

Example 3:
Description: "Define if work is new construction, addition, alteration/renovation..."
GOOD: "alteration/renovation"
BAD: "The work of this project includes alterations of the existing building to achieve the arrangement indicated on the drawings"

ANALYZE THE DOCUMENT AND RETURN:

If NOT APPLICABLE to this project type:
status: not_applicable

If APPLICABLE but NOT FOUND:
status: not_found

If FOUND:
status: found
value: [ONLY the essential fact - be concise]
confidence: [high/medium/low]

Return as YAML. Do NOT include page numbers, quotes, or descriptions.`;

  try {
    const response = await model.generateContent(prompt);
    let yamlText = response.response.text();

    // Extract YAML from code blocks if present
    if (yamlText.includes('```yaml')) {
      yamlText = yamlText.split('```yaml')[1].split('```')[0];
    } else if (yamlText.includes('```')) {
      yamlText = yamlText.split('```')[1].split('```')[0];
    }

    // Clean up YAML
    yamlText = yamlText.replace(/\t/g, '  ');

    let result: any;
    try {
      result = yaml.load(yamlText);
    } catch {
      // Try to fix common YAML errors
      const lines = yamlText.split('\n');
      const fixedLines: string[] = [];

      for (const line of lines) {
        if (line.trim().startsWith('quote:') && !line.trim().startsWith('quote: |')) {
          const quoteContent = line.split('quote:', 2)[1]?.trim();
          if (
            quoteContent &&
            (quoteContent.length > 80 || quoteContent.includes(':') || quoteContent.includes('\n'))
          ) {
            const indent = line.length - line.trimStart().length;
            fixedLines.push(' '.repeat(indent) + 'quote: |');
            fixedLines.push(' '.repeat(indent + 2) + quoteContent);
          } else {
            fixedLines.push(line);
          }
        } else {
          fixedLines.push(line);
        }
      }

      yamlText = fixedLines.join('\n');

      try {
        result = yaml.load(yamlText);
      } catch {
        console.error(`YAML parse error for ${variableName}, skipping`);
        return null;
      }
    }

    // Process the result based on status
    if (result && typeof result === 'object') {
      const status = result.status;

      if (status === 'not_applicable') {
        return 'not_applicable';
      } else if (status === 'not_found') {
        return null;
      } else if (status === 'found') {
        return {
          value: result.value,
          confidence: result.confidence || 'medium',
        };
      }
    }

    return null;
  } catch (error: any) {
    const errorStr = error.toString();

    // Check for rate limit errors
    if (
      errorStr.includes('429') ||
      errorStr.toLowerCase().includes('quota') ||
      errorStr.toLowerCase().includes('rate')
    ) {
      throw new Error('RATE_LIMITED');
    }

    console.error(`Error extracting ${variableName}:`, errorStr.substring(0, 100));
    return null;
  }
}

/**
 * Extract a single variable with chunking support
 */
async function extractSingleVariable(
  variableName: string,
  description: string,
  formattedPdfText: string,
  categoryContext: string,
  model: any
): Promise<ExtractionResult> {
  // If document is too large, chunk it
  if (formattedPdfText.length > MAX_CHARS_PER_CHUNK) {
    const chunks: string[] = [];
    const lines = formattedPdfText.split('\n');
    let currentChunk: string[] = [];
    let currentSize = 0;

    for (const line of lines) {
      const lineSize = line.length + 1;
      if (currentSize + lineSize > MAX_CHARS_PER_CHUNK && currentChunk.length > 0) {
        chunks.push(currentChunk.join('\n'));
        currentChunk = [line];
        currentSize = lineSize;
      } else {
        currentChunk.push(line);
        currentSize += lineSize;
      }
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk.join('\n'));
    }

    // Search each chunk
    const allResults: ExtractionResult[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const result = await extractFromChunk(
        variableName,
        description,
        chunks[i],
        categoryContext,
        i + 1,
        chunks.length,
        model
      );

      if (result && result !== 'not_applicable') {
        allResults.push(result);
      } else if (result === 'not_applicable') {
        return 'not_applicable';
      }
    }

    // Merge results from chunks
    if (allResults.length > 0) {
      // Prefer high confidence results
      let bestResult: VariableResult | null = null;
      for (const r of allResults) {
        if (r && typeof r === 'object' && 'value' in r) {
          if (!bestResult || r.confidence === 'high') {
            bestResult = r;
          }
        }
      }
      return bestResult;
    }

    return null;
  } else {
    // Single chunk - process normally
    return extractFromChunk(
      variableName,
      description,
      formattedPdfText,
      categoryContext,
      1,
      1,
      model
    );
  }
}

/**
 * Extract all variables from PDF text
 */
export async function extractAllVariables(
  checklist: VariableChecklist,
  formattedPdfText: string,
  onProgress?: (current: number, total: number, category: string, variable: string) => void
): Promise<ExtractedVariables> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not set');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro-preview-03-25' });

  const extractedVars: ExtractedVariables = {};

  // Count total variables
  let totalVars = 0;
  for (const items of Object.values(checklist)) {
    if (typeof items === 'object') {
      for (const varInfo of Object.values(items)) {
        if (varInfo && typeof varInfo === 'object') {
          if ('description' in varInfo) {
            totalVars++;
          } else {
            // Nested structure
            totalVars += Object.keys(varInfo).length;
          }
        }
      }
    }
  }

  let currentVar = 0;

  for (const [category, items] of Object.entries(checklist)) {
    console.log(`\nProcessing category: ${category}`);

    if (typeof items === 'object') {
      const extractedCategory: any = {};

      for (const [varName, varInfo] of Object.entries(items)) {
        if (varInfo && typeof varInfo === 'object') {
          // Check if it has a description (leaf node)
          if ('description' in varInfo) {
            currentVar++;
            const description =
              typeof varInfo.description === 'string'
                ? varInfo.description
                : varInfo.description.description;

            if (onProgress) {
              onProgress(currentVar, totalVars, category, varName);
            }

            try {
              const result = await extractSingleVariable(
                varName,
                description,
                formattedPdfText,
                category,
                model
              );

              if (result === 'not_applicable') {
                extractedCategory[varName] = 'not_applicable';
              } else if (result && typeof result === 'object') {
                extractedCategory[varName] = result;
              }
              // null means not found, we skip it
            } catch (error: any) {
              if (error.message === 'RATE_LIMITED') {
                throw error; // Propagate rate limit errors
              }
              console.error(`Error extracting ${varName}:`, error);
            }
          } else {
            // Handle nested categories
            const nestedExtracted: any = {};

            for (const [nestedName, nestedInfo] of Object.entries(varInfo)) {
              if (nestedInfo && typeof nestedInfo === 'object' && 'description' in nestedInfo) {
                currentVar++;
                const description =
                  typeof nestedInfo.description === 'string' ? nestedInfo.description : '';

                if (onProgress) {
                  onProgress(currentVar, totalVars, category, `${varName}.${nestedName}`);
                }

                try {
                  const result = await extractSingleVariable(
                    `${varName}.${nestedName}`,
                    description,
                    formattedPdfText,
                    `${category}.${varName}`,
                    model
                  );

                  if (result === 'not_applicable') {
                    nestedExtracted[nestedName] = 'not_applicable';
                  } else if (result && typeof result === 'object') {
                    nestedExtracted[nestedName] = result;
                  }
                } catch (error: any) {
                  if (error.message === 'RATE_LIMITED') {
                    throw error;
                  }
                  console.error(`Error extracting ${varName}.${nestedName}:`, error);
                }
              }
            }

            if (Object.keys(nestedExtracted).length > 0) {
              extractedCategory[varName] = nestedExtracted;
            }
          }
        }
      }

      if (Object.keys(extractedCategory).length > 0) {
        extractedVars[category] = extractedCategory;
      }
    }
  }

  return extractedVars;
}

/**
 * Clean extracted variables - remove not_applicable entries and simplify structure
 */
export function cleanExtractedVariables(variables: ExtractedVariables): Record<string, any> {
  const cleaned: Record<string, any> = {};

  for (const [category, items] of Object.entries(variables)) {
    if (typeof items === 'object') {
      const cleanedItems: Record<string, any> = {};

      for (const [key, value] of Object.entries(items)) {
        if (value === 'not_applicable') {
          continue; // Skip not applicable
        } else if (value && typeof value === 'object' && 'value' in value) {
          // Extract just the value
          cleanedItems[key] = value.value;
        } else if (value && typeof value === 'object') {
          // Handle nested structures
          const nestedCleaned: Record<string, any> = {};

          for (const [nestedKey, nestedValue] of Object.entries(value)) {
            if (nestedValue === 'not_applicable') {
              continue;
            } else if (nestedValue && typeof nestedValue === 'object' && 'value' in nestedValue) {
              nestedCleaned[nestedKey] = nestedValue.value;
            }
          }

          if (Object.keys(nestedCleaned).length > 0) {
            cleanedItems[key] = nestedCleaned;
          }
        }
      }

      if (Object.keys(cleanedItems).length > 0) {
        cleaned[category] = cleanedItems;
      }
    }
  }

  return cleaned;
}
