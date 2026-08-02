import {
  createArtifactStore,
  createDatasetStore,
  createGraphStore,
  createIndexedDbRecordAdapter,
  createProjectStore,
  createRunRecordStore,
  createSettingsStore,
  createWorkspaceInclusionStore,
  createQuadRowStore
} from './record-store.js';
import { openIndexedDbStore } from './indexeddb-adapter.js';

export const DEFAULT_PROJECT_PORTFOLIO_DB_NAME = 'OntologyWorkbenchProjects';
export const DEFAULT_PROJECT_PORTFOLIO_DB_VERSION = 4;
export const DEFAULT_PROJECT_PORTFOLIO_PROJECT_ID = 'project:default-workspace';

const PROJECTS_STORE = 'projects';
const ARTIFACTS_STORE = 'artifacts';
const DATASETS_STORE = 'datasets';
const RUNS_STORE = 'runs';
const SETTINGS_STORE = 'settings';
const INCLUSIONS_STORE = 'workspaceInclusions';
const GRAPHS_STORE = 'graphs';
const QUAD_ROWS_STORE = 'quadRows';

/**
 * Creates the shared project-portfolio IndexedDB schema used across apps.
 *
 * App-local caches can remain in app-local databases. Cross-app project
 * records, artifacts, run history, and project-scoped settings belong in this
 * portfolio database so TOM, Axiolotl, OntoEagle, Mermaid, and related apps can
 * contribute to the same project.
 *
 * @param {object} [options]
 * @param {string} [options.name='OntologyWorkbenchProjects'] Database name.
 * @param {number} [options.version=1] Database version.
 * @returns {object} IndexedDB schema descriptor.
 */
export function createProjectPortfolioSchema({
  name = DEFAULT_PROJECT_PORTFOLIO_DB_NAME,
  version = DEFAULT_PROJECT_PORTFOLIO_DB_VERSION
} = {}) {
  return {
    name,
    version,
    stores: [
      { name: PROJECTS_STORE, options: { keyPath: 'projectId' } },
      { name: ARTIFACTS_STORE, options: { keyPath: 'artifactId' } },
      { name: DATASETS_STORE, options: { keyPath: 'datasetId' } },
      { name: RUNS_STORE, options: { keyPath: 'runId' } },
      { name: INCLUSIONS_STORE, options: { keyPath: 'inclusionId' } },
      {
        name: GRAPHS_STORE,
        options: { keyPath: 'graphId' },
        indexes: [
          { name: 'projectId', keyPath: 'projectId' },
          { name: 'graphIri', keyPath: 'graphIri' },
          { name: 'artifactId', keyPath: 'artifactId' },
          { name: 'role', keyPath: 'role' }
        ]
      },
      {
        name: QUAD_ROWS_STORE,
        indexes: [
          { name: 'projectId', keyPath: 'projectId' },
          { name: 'graphId', keyPath: 'graphId' },
          { name: 'graphIri', keyPath: 'graphIri' },
          { name: 'artifactId', keyPath: 'artifactId' },
          { name: 'subject', keyPath: 'subject' },
          { name: 'predicate', keyPath: 'predicate' },
          { name: 'object', keyPath: 'object' }
        ]
      },
      { name: SETTINGS_STORE }
    ]
  };
}

/**
 * Opens the shared cross-app project portfolio database.
 *
 * @param {object} [options]
 * @param {IDBFactory} [options.indexedDBRef=globalThis.indexedDB] IndexedDB factory.
 * @param {string} [options.name='OntologyWorkbenchProjects'] Database name.
 * @param {number} [options.version=1] Database version.
 * @returns {Promise<IDBDatabase>} Open project portfolio database.
 */
export function openProjectPortfolioDatabase({
  indexedDBRef = globalThis.indexedDB,
  name = DEFAULT_PROJECT_PORTFOLIO_DB_NAME,
  version = DEFAULT_PROJECT_PORTFOLIO_DB_VERSION
} = {}) {
  return openIndexedDbStore(createProjectPortfolioSchema({ name, version }), { indexedDBRef });
}

/**
 * Creates project, artifact, run, and settings stores over the shared portfolio
 * database.
 *
 * @param {IDBDatabase} db Open project portfolio database.
 * @param {object} [options]
 * @param {string} [options.projectId='project:default-workspace'] Active project scope.
 * @returns {object} Project portfolio store set.
 */
export function createProjectPortfolioStores(db, {
  projectId = DEFAULT_PROJECT_PORTFOLIO_PROJECT_ID
} = {}) {
  return {
    projectId,
    projects: createProjectStore(createIndexedDbRecordAdapter(db, PROJECTS_STORE, { keyPath: 'projectId' })),
    artifacts: createArtifactStore(createIndexedDbRecordAdapter(db, ARTIFACTS_STORE, { keyPath: 'artifactId' })),
    datasets: createDatasetStore(createIndexedDbRecordAdapter(db, DATASETS_STORE, { keyPath: 'datasetId' })),
    runs: createRunRecordStore(createIndexedDbRecordAdapter(db, RUNS_STORE, { keyPath: 'runId' })),
    inclusions: createWorkspaceInclusionStore(createIndexedDbRecordAdapter(db, INCLUSIONS_STORE, { keyPath: 'inclusionId' })),
    graphs: createGraphStore(createIndexedDbRecordAdapter(db, GRAPHS_STORE, { keyPath: 'graphId' })),
    quadRows: createQuadRowStore(createIndexedDbRecordAdapter(db, QUAD_ROWS_STORE)),
    settings: createSettingsStore(createIndexedDbRecordAdapter(db, SETTINGS_STORE), { scope: projectId })
  };
}

/**
 * Ensures a cross-app project exists before an app contributes artifacts or
 * runs to it.
 *
 * @param {object} stores Store set returned by `createProjectPortfolioStores`.
 * @param {object} [record] Project record patch.
 * @returns {Promise<object>} Existing or created project record.
 */
export async function ensureProjectPortfolioProject(stores, record = {}) {
  const projectId = record.projectId || stores.projectId || DEFAULT_PROJECT_PORTFOLIO_PROJECT_ID;
  const existing = await stores.projects.getProject(projectId);
  if (existing) return existing;
  return stores.projects.createProject({
    projectId,
    label: 'Default Workspace',
    tags: ['cross-app'],
    ...record
  });
}
