export {
  extractSparqlPrologueDeclarations,
  formatSparqlPrefixDeclarations,
  prependSparqlPrologue,
  splitSparqlPrologueFromBody
} from './prologue.js';

export {
  readBalancedSparqlBraceBlock,
  scanSparqlLexicalTokens,
  stripSparqlLineComments
} from './lexical-scan.js';

export {
  classifySparqlOperationFamily,
  isSparqlUpdateOperation
} from './query-kind.js';

export {
  buildSparqlRewritePreviewRows,
  countAppliedSparqlIriRewrites,
  extractSparqlRewriteTokens,
  formatSparqlIriToken,
  rewriteSparqlIris
} from './iri-rewrite.js';

export {
  applySparqlTypeHeuristicsToGraphNodes,
  buildSparqlGraphModelFromAst,
  classifySparqlTriplePatternEdge,
  compactSparqlAstIriForDisplay,
  createSparqlAstTermKey,
  extractSelectedVariableKeysFromSparqlAst,
  extractWhereTriplesFromSparqlAst,
  formatSparqlAstTermLabel,
  parseSparqlQueryToAst,
  selectBestSparqlAstPrefixForIri
} from './query-patterns.js';

export {
  buildSparqlUpdatePreviewConstructs,
  describeSparqlUpdateShape,
  parseSparqlDeleteInsertWhereUpdate,
  parseSparqlDeleteWhereUpdate,
  parseSparqlInsertWhereUpdate
} from './update-patterns.js';

export {
  applySparqlUpdateToQuadStore,
  rdfJsQuadsToQuadRows
} from './update-materialization.js';
