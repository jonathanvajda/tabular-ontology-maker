import { splitSparqlPrologueFromBody } from './prologue.js';
import { stripSparqlLineComments } from './lexical-scan.js';

const UPDATE_KEYWORDS = new Set([
  'LOAD',
  'CLEAR',
  'DROP',
  'ADD',
  'MOVE',
  'COPY',
  'CREATE',
  'INSERT',
  'DELETE',
  'WITH'
]);

const READ_KEYWORDS = new Set([
  'SELECT',
  'CONSTRUCT',
  'ASK',
  'DESCRIBE'
]);

/**
 * Classifies a SPARQL operation family from text after removing comments and
 * leading prologue declarations.
 *
 * @param {string} queryText - SPARQL query or update text.
 * @returns {'UPDATE'|'READ'|'UNKNOWN'} Operation family.
 */
export function classifySparqlOperationFamily(queryText) {
  const split = splitSparqlPrologueFromBody(stripSparqlLineComments(queryText));
  const firstKeyword = String(split.bodyText || '').trim().match(/^([A-Za-z]+)/)?.[1]?.toUpperCase() || '';
  if (UPDATE_KEYWORDS.has(firstKeyword)) return 'UPDATE';
  if (READ_KEYWORDS.has(firstKeyword)) return 'READ';
  return 'UNKNOWN';
}

/**
 * Checks whether SPARQL text begins with an update operation.
 *
 * @param {string} queryText - SPARQL query or update text.
 * @returns {boolean} True when the text is classified as SPARQL Update.
 */
export function isSparqlUpdateOperation(queryText) {
  return classifySparqlOperationFamily(queryText) === 'UPDATE';
}
