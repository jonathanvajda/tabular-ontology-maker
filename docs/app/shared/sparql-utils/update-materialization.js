import { buildSparqlUpdatePreviewConstructs, describeSparqlUpdateShape } from './update-patterns.js';

/**
 * Applies a supported SPARQL UPDATE to a quad store by materializing its
 * DELETE/INSERT templates as read-only CONSTRUCT queries.
 *
 * This function deliberately does not own Comunica, IndexedDB, or RDF parser
 * dependencies. Callers inject those adapters so the promoted logic stays
 * reusable across apps and testable in Node.
 *
 * Supported UPDATE shapes are the same as `buildSparqlUpdatePreviewConstructs`:
 * INSERT DATA, DELETE WHERE, INSERT WHERE, DELETE WHERE, and DELETE/INSERT
 * WHERE. Unsupported administrative forms such as CLEAR, DROP, LOAD, COPY,
 * MOVE, ADD, and CREATE should be handled by app-specific safety flows.
 *
 * @param {string} updateText - SPARQL UPDATE text to apply.
 * @param {object} adapters - Execution and persistence adapters.
 * @param {(query: string, options: {format: string, label: string, operation: 'insert'|'delete'}) => Promise<string>} adapters.runConstructQuery
 * Runs one generated CONSTRUCT query and returns serialized RDF text.
 * @param {(rdfText: string, options: {format: string, operation: 'insert'|'delete'}) => Promise<{quads: object[]}>} adapters.parseConstructResult
 * Parses serialized CONSTRUCT output to RDF/JS quads.
 * @param {(quadRows: object[], context: object) => Promise<number>} adapters.deleteQuadRows
 * Deletes exact quad rows from the target store.
 * @param {(quadRows: object[], context: object) => Promise<number|void>} adapters.insertQuadRows
 * Inserts quad rows into the target store.
 * @param {object} [options]
 * @param {'default'|'named'} [options.targetMode='default'] Where inserted quads should be placed.
 * @param {string|null} [options.graphIri=null] Explicit target graph IRI for named insertions.
 * @param {(base?: string) => string} [options.createGraphIri] Factory used when `targetMode` is `named` and no graph IRI is supplied.
 * @param {string} [options.autoGraphBase='urn:graph:update'] Base passed to `createGraphIri`.
 * @param {string} [options.insertFormat='text/turtle'] Serialization format requested for insert previews.
 * @param {string} [options.deleteFormat='application/n-triples'] Serialization format requested for delete previews.
 * @returns {Promise<{deleted: number, inserted: number, graphIri: string, operations: object[]}>}
 */
export async function applySparqlUpdateToQuadStore(updateText, adapters = {}, options = {}) {
  const text = String(updateText || '');
  const previews = buildSparqlUpdatePreviewConstructs(text);
  if (!previews.length) {
    const detail = describeSparqlUpdateShape(text);
    throw new Error(`Unsupported UPDATE shape for quad-store materialization. Parsed first keyword: ${detail.firstKeyword || '(none)'}. Body preview: ${detail.bodyPreview || detail.textPreview || '(empty)'}`);
  }

  requireAdapter(adapters.runConstructQuery, 'runConstructQuery');
  requireAdapter(adapters.parseConstructResult, 'parseConstructResult');
  requireAdapter(adapters.deleteQuadRows, 'deleteQuadRows');
  requireAdapter(adapters.insertQuadRows, 'insertQuadRows');

  const targetMode = options.targetMode === 'named' ? 'named' : 'default';
  const graphIri = targetMode === 'named'
    ? String(options.graphIri || options.createGraphIri?.(options.autoGraphBase || 'urn:graph:update') || '').trim()
    : '';
  if (targetMode === 'named' && !graphIri) {
    throw new TypeError('applySparqlUpdateToQuadStore() requires graphIri or createGraphIri when targetMode is named.');
  }

  let deleted = 0;
  let inserted = 0;
  const operations = [];

  for (const preview of previews) {
    const operation = /deleted/i.test(preview.label) ? 'delete' : 'insert';
    const format = operation === 'delete'
      ? (options.deleteFormat || 'application/n-triples')
      : (options.insertFormat || 'text/turtle');
    const serialized = await adapters.runConstructQuery(preview.query, {
      format,
      label: preview.label,
      operation
    });
    const parsed = await adapters.parseConstructResult(String(serialized || ''), {
      format,
      operation
    });
    const quadRows = rdfJsQuadsToQuadRows(parsed?.quads || [], {
      graphOverride: operation === 'insert' && targetMode === 'named' ? graphIri : null
    });

    if (operation === 'delete') {
      const removed = await adapters.deleteQuadRows(quadRows, { operation, preview, graphIri });
      deleted += Number(removed || 0);
      operations.push({ operation, label: preview.label, count: Number(removed || 0) });
    } else {
      const stored = await adapters.insertQuadRows(quadRows, { operation, preview, graphIri, targetMode });
      const count = Number(stored || quadRows.length || 0);
      inserted += count;
      operations.push({ operation, label: preview.label, count });
    }
  }

  return {
    deleted,
    inserted,
    graphIri: graphIri || '(default graph)',
    operations
  };
}

/**
 * Converts RDF/JS quads to the shared quad-row-like shape used by project
 * portfolio stores and Axiolotl's compatibility storage adapter.
 *
 * @param {object[]} quads RDF/JS quads.
 * @param {{graphOverride?: string|null}} [options]
 * @returns {object[]} Quad row records.
 */
export function rdfJsQuadsToQuadRows(quads, options = {}) {
  return (quads || []).map((q) => {
    const graph = options.graphOverride != null
      ? options.graphOverride
      : (q.graph?.termType === 'DefaultGraph' ? '' : q.graph?.value || '');
    return {
      subject: q.subject?.value || '',
      subjectType: q.subject?.termType || '',
      predicate: q.predicate?.value || '',
      predicateType: q.predicate?.termType || '',
      object: q.object?.value || '',
      objectType: q.object?.termType || '',
      objectLang: q.object?.language || '',
      objectDatatype: q.object?.datatype?.value || '',
      graph
    };
  });
}

function requireAdapter(value, name) {
  if (typeof value !== 'function') {
    throw new TypeError(`applySparqlUpdateToQuadStore() requires adapters.${name}.`);
  }
}
