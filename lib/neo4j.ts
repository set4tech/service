import neo4j, { QueryResult } from 'neo4j-driver';

const driver = neo4j.driver(
  process.env.NEO4J_URI!,
  neo4j.auth.basic(process.env.NEO4J_USERNAME!, process.env.NEO4J_PASSWORD!),
  {
    maxConnectionLifetime: 3 * 60 * 60 * 1000,
    maxConnectionPoolSize: 50,
    connectionAcquisitionTimeout: 2 * 60 * 1000
  }
);

export async function runQuery<T>(cypher: string, params: Record<string, any> = {}): Promise<T[]> {
  const session = driver.session();
  try {
    const result: QueryResult = await session.run(cypher, params);
    return result.records.map(r => r.toObject() as T);
  } finally {
    await session.close();
  }
}

const assemblyCache = new Map<string, any>();

export async function getCodeAssembly(codeId: string, useCache = true) {
  if (useCache && assemblyCache.has(codeId)) return assemblyCache.get(codeId);

  // First try to find sections that belong to this code
  const rows = await runQuery<any>(
    `MATCH (s:Section)
     WHERE s.key STARTS WITH $codePrefix
     RETURN s
     ORDER BY s.number`,
    { codePrefix: codeId.replace(/\+/g, ':') + ':' }
  );

  const sections = rows.map(row => {
    const s = row.s.properties;
    return { ...s, subsections: [] }; // TODO: Add subsections if needed
  });

  const assembly = { code_id: codeId, sections, total_sections: sections.length };
  assemblyCache.set(codeId, assembly);
  return assembly;
}