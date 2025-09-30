import neo4j, { QueryResult } from 'neo4j-driver';

const driver = neo4j.driver(
  process.env.NEO4J_URI!,
  neo4j.auth.basic(process.env.NEO4J_USERNAME!, process.env.NEO4J_PASSWORD!),
  {
    maxConnectionLifetime: 3 * 60 * 60 * 1000,
    maxConnectionPoolSize: 50,
    connectionAcquisitionTimeout: 2 * 60 * 1000,
  }
);

export async function runQuery<T>(cypher: string, params: Record<string, any> = {}): Promise<T[]> {
  const session = driver.session();
  try {
    const result: QueryResult = await session.run(cypher, params);
    return result.records.map(r => {
      const obj = r.toObject();
      // Convert Neo4j Integer types to JavaScript numbers
      Object.keys(obj).forEach(key => {
        if (obj[key] && typeof obj[key] === 'object' && 'low' in obj[key] && 'high' in obj[key]) {
          obj[key] = neo4j.int(obj[key].low, obj[key].high).toNumber();
        }
      });
      return obj as T;
    });
  } finally {
    await session.close();
  }
}

const assemblyCache = new Map<string, any>();

export async function getCodeAssembly(codeId: string, useCache = true) {
  if (useCache && assemblyCache.has(codeId)) return assemblyCache.get(codeId);

  try {
    // Get sections that belong to this code
    const rows = await runQuery<any>(
      `MATCH (s:Section)
       WHERE s.key STARTS WITH $codePrefix
       RETURN s
       ORDER BY s.number`,
      { codePrefix: codeId.replace(/\+/g, ':') + ':' }
    );

    const sections = rows.map(row => {
      const s = row.s.properties;
      // Use paragraphs property directly from Section node
      const paragraphs = s.paragraphs || [];
      const fullText = Array.isArray(paragraphs)
        ? paragraphs.map((p: any) => (typeof p === 'string' ? p : p.text || '')).join('\n\n')
        : '';

      return {
        ...s,
        paragraphs,
        fullText,
        subsections: [],
      };
    });

    const assembly = { code_id: codeId, sections, total_sections: sections.length };
    assemblyCache.set(codeId, assembly);
    return assembly;
  } catch (error) {
    console.error('Failed to fetch from Neo4j, using fallback data:', error);

    // Return empty assembly as fallback
    // In production, you might want to return some default sections or cached data
    const fallbackAssembly = {
      code_id: codeId,
      sections: [],
      total_sections: 0,
      error: 'Neo4j connection failed - no sections available',
    };

    // Don't cache error states
    return fallbackAssembly;
  }
}
