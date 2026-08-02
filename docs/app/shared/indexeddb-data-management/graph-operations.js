import { normalizeGraphRecord, normalizeQuadRow } from './records.js';
import { StorageError } from './storage-error.js';

/**
 * Creates a read plan for the active workspace graph from enabled inclusions
 * and known graph metadata.
 *
 * @param {object} input Workspace records.
 * @param {string} input.projectId Active project id.
 * @param {object[]} [input.inclusions=[]] WorkspaceInclusionRecords.
 * @param {object[]} [input.graphs=[]] GraphRecords.
 * @param {object[]} [input.artifacts=[]] ArtifactRecords.
 * @returns {object} Active workspace graph plan.
 */
export function createActiveWorkspaceGraphPlan({ projectId, inclusions = [], graphs = [], artifacts = [] }) {
  const activeInclusions = (inclusions || [])
    .filter((inclusion) => inclusion?.projectId === projectId && inclusion.enabled !== false);
  const graphsByArtifactId = groupBy(graphs, 'artifactId');
  const graphsByGraphIri = groupBy(graphs, 'graphIri');
  const artifactsById = new Map((artifacts || []).map((artifact) => [artifact.artifactId, artifact]));

  const entries = activeInclusions.map((inclusion) => {
    const candidateGraphs = [
      ...(graphsByArtifactId.get(inclusion.targetId) || []),
      ...(graphsByGraphIri.get(inclusion.graphIri || null) || [])
    ];
    const uniqueGraphs = [...new Map(candidateGraphs.map((graph) => [graph.graphId, graph])).values()];
    return {
      inclusion,
      targetArtifact: artifactsById.get(inclusion.targetId) || null,
      graphs: uniqueGraphs,
      materialized: uniqueGraphs.some((graph) => graph.materialization?.status === 'ready')
    };
  });

  return {
    projectId,
    entries,
    graphIds: [...new Set(entries.flatMap((entry) => entry.graphs.map((graph) => graph.graphId)))],
    graphIris: [...new Set(entries.flatMap((entry) => entry.graphs.map((graph) => graph.graphIri)).filter((graphIri) => graphIri !== undefined))],
    missingMaterialization: entries.filter((entry) => !entry.materialized).map((entry) => entry.inclusion)
  };
}

/**
 * Lists active workspace graphs by reading portfolio stores.
 *
 * @param {object} stores Project portfolio stores.
 * @param {string} projectId Project id.
 * @returns {Promise<object>} Active workspace graph plan.
 */
export async function readActiveWorkspaceGraphPlan(stores, projectId) {
  if (!stores?.inclusions || !stores?.graphs || !stores?.artifacts) {
    throw new StorageError('readActiveWorkspaceGraphPlan expected portfolio stores with inclusions, graphs, and artifacts.', { code: 'INVALID_PROJECT_PORTFOLIO_STORES' });
  }
  const [inclusions, graphs, artifacts] = await Promise.all([
    stores.inclusions.listWorkspaceInclusions(projectId, { enabledOnly: true }),
    stores.graphs.listGraphRecords(projectId),
    stores.artifacts.listProjectArtifacts(projectId, { includePayload: false })
  ]);
  return createActiveWorkspaceGraphPlan({ projectId, inclusions, graphs, artifacts });
}

/**
 * Stores graph metadata and rows together, updating materialization counts.
 *
 * @param {object} stores Project portfolio stores.
 * @param {object} graphRecord Graph metadata.
 * @param {object[]} rows Quad rows.
 * @param {object} [options]
 * @param {() => string} [options.now] Clock function.
 * @returns {Promise<{graph: object, count: number}>} Stored graph and row count.
 */
export async function storeGraphQuadRows(stores, graphRecord, rows, { now = () => new Date().toISOString() } = {}) {
  requireGraphStores(stores);
  const graph = await stores.graphs.storeGraphRecord(graphRecord);
  const preparedRows = prepareGraphRows(graph, rows);
  const count = await stores.quadRows.upsertQuadRows(preparedRows);
  const updated = await stores.graphs.updateGraphMaterialization(graph.graphId, {
    status: 'ready',
    quadCount: await stores.quadRows.countQuadRows({ graphId: graph.graphId }),
    indexedAt: now()
  });
  return { graph: updated, count };
}

/**
 * Replaces all quad rows for a graph with a new materialized row set.
 *
 * @param {object} stores Project portfolio stores.
 * @param {object} graphRecord Graph metadata.
 * @param {object[]} rows Replacement quad rows.
 * @param {object} [options]
 * @param {() => string} [options.now] Clock function.
 * @returns {Promise<{graph: object, count: number}>} Stored graph and row count.
 */
export async function replaceGraphQuadRows(stores, graphRecord, rows, options = {}) {
  requireGraphStores(stores);
  const graph = normalizeGraphRecord(graphRecord, options);
  await stores.quadRows.clearQuadRows({ graphId: graph.graphId });
  return storeGraphQuadRows(stores, graph, rows, options);
}

/**
 * Clears materialized rows for a graph and marks graph metadata as empty.
 *
 * @param {object} stores Project portfolio stores.
 * @param {string} graphId Graph id.
 * @param {object} [options]
 * @param {() => string} [options.now] Clock function.
 * @returns {Promise<number>} Number of rows removed.
 */
export async function clearGraphQuadRows(stores, graphId, { now = () => new Date().toISOString() } = {}) {
  requireGraphStores(stores);
  const removed = await stores.quadRows.clearQuadRows({ graphId });
  await stores.graphs.updateGraphMaterialization(graphId, {
    status: 'empty',
    quadCount: 0,
    indexedAt: now()
  });
  return removed;
}

/**
 * Deletes graph metadata and all rows for that graph.
 *
 * @param {object} stores Project portfolio stores.
 * @param {string} graphId Graph id.
 * @returns {Promise<{deletedGraph: boolean, deletedRows: number}>} Deletion report.
 */
export async function deleteGraphRecordWithQuadRows(stores, graphId) {
  requireGraphStores(stores);
  const deletedRows = await stores.quadRows.clearQuadRows({ graphId });
  const deletedGraph = await stores.graphs.deleteGraphRecord(graphId);
  return { deletedGraph, deletedRows };
}

function requireGraphStores(stores) {
  if (!stores?.graphs || !stores?.quadRows) {
    throw new StorageError('Graph operations expected portfolio graph and quadRows stores.', { code: 'INVALID_GRAPH_STORES' });
  }
}

function prepareGraphRows(graph, rows) {
  return (rows || []).map((row) => normalizeQuadRow({
    ...row,
    projectId: row.projectId || graph.projectId,
    graphId: row.graphId || graph.graphId,
    artifactId: row.artifactId || graph.artifactId,
    graph: row.graph ?? graph.graphIri
  }));
}

function groupBy(records, field) {
  const map = new Map();
  for (const record of records || []) {
    const key = record?.[field] ?? null;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(record);
  }
  return map;
}
