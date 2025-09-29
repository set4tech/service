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
    // First try to find sections that belong to this code with their paragraphs
    const rows = await runQuery<any>(
      `MATCH (s:Section)
       WHERE s.key STARTS WITH $codePrefix
       OPTIONAL MATCH (s)-[:HAS_PARAGRAPH]->(p:Paragraph)
       RETURN s, collect(p) as paragraphs
       ORDER BY s.number`,
      { codePrefix: codeId.replace(/\+/g, ':') + ':' }
    );

    const sections = rows.map(row => {
      const s = row.s.properties;
      const paragraphs = (row.paragraphs || []).map((p: any) => p.properties || {});
      return {
        ...s,
        paragraphs,
        fullText: paragraphs.map((p: any) => p.text || '').join('\n\n'),
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
