import {
  readBalancedSparqlBraceBlock,
  stripSparqlLineComments
} from './lexical-scan.js';
import { splitSparqlPrologueFromBody } from './prologue.js';

/**
 * Builds read-only CONSTRUCT previews for supported SPARQL UPDATE patterns.
 *
 * Supported shapes:
 * - `INSERT DATA { ... }`
 * - `DELETE WHERE { ... }`
 * - `INSERT { T } WHERE { P }`
 * - `DELETE { T } WHERE { P }`
 * - `DELETE { T } INSERT { U } WHERE { P }`
 *
 * @param {string} updateText - SPARQL UPDATE text.
 * @returns {Array<{label: string, query: string}>} Preview CONSTRUCT queries.
 */
export function buildSparqlUpdatePreviewConstructs(updateText) {
  const split = splitSparqlPrologueFromBody(stripSparqlLineComments(updateText));
  const prologue = split.prologueText;
  const bodyText = split.bodyText.trim();
  const previews = [];

  const insertData = bodyText.match(/^INSERT\s+DATA\s*\{([\s\S]+)\}\s*;?\s*$/i);
  if (insertData) {
    previews.push({
      label: 'Triples that would be inserted',
      query: `${prologue}\nCONSTRUCT { ${insertData[1]} } WHERE {}`
    });
    return previews;
  }

  const deleteWhereMatch = bodyText.match(/^DELETE\s+WHERE\s*\{([\s\S]+)\}\s*;?\s*$/i);
  if (deleteWhereMatch) {
    const pattern = deleteWhereMatch[1];
    previews.push({
      label: 'Triples that would be deleted',
      query: `${prologue}\nCONSTRUCT { ${pattern} } WHERE { ${pattern} }`
    });
    return previews;
  }

  const deleteInsert = parseSparqlDeleteInsertWhereUpdate(bodyText);
  if (deleteInsert.ok) {
    previews.push({
      label: 'Triples that would be deleted',
      query: `${prologue}\nCONSTRUCT { ${deleteInsert.deleteTemplate} } WHERE { ${deleteInsert.wherePattern} }`
    });
    previews.push({
      label: 'Triples that would be inserted',
      query: `${prologue}\nCONSTRUCT { ${deleteInsert.insertTemplate} } WHERE { ${deleteInsert.wherePattern} }`
    });
    return previews;
  }

  const insertWhere = parseSparqlInsertWhereUpdate(bodyText);
  if (insertWhere.ok) {
    previews.push({
      label: 'Triples that would be inserted',
      query: `${prologue}\nCONSTRUCT { ${insertWhere.insertTemplate} } WHERE { ${insertWhere.wherePattern} }`
    });
    return previews;
  }

  const deleteWhere = parseSparqlDeleteWhereUpdate(bodyText);
  if (deleteWhere.ok) {
    previews.push({
      label: 'Triples that would be deleted',
      query: `${prologue}\nCONSTRUCT { ${deleteWhere.deleteTemplate} } WHERE { ${deleteWhere.wherePattern} }`
    });
  }

  return previews;
}

/**
 * Describes the broad UPDATE shape for diagnostics/logging.
 *
 * @param {string} updateText - SPARQL UPDATE text.
 * @returns {{prologueLength: number, firstKeyword: string, bodyPreview: string, textPreview: string}} Shape summary.
 */
export function describeSparqlUpdateShape(updateText) {
  const split = splitSparqlPrologueFromBody(stripSparqlLineComments(updateText));
  const bodyText = split.bodyText.trim();
  return {
    prologueLength: split.prologueText.length,
    firstKeyword: bodyText.match(/^([A-Za-z]+)/)?.[1] || '',
    bodyPreview: bodyText.slice(0, 160),
    textPreview: String(updateText ?? '').slice(0, 160)
  };
}

/**
 * Parses `INSERT { T } WHERE { P }`.
 *
 * @param {string} updateBody - SPARQL UPDATE body with prologue removed.
 * @returns {{ok: true, insertTemplate: string, wherePattern: string}|{ok: false, error: string}}
 */
export function parseSparqlInsertWhereUpdate(updateBody) {
  const cursor = consumeSparqlKeyword(updateBody, 0, 'INSERT');
  if (cursor < 0) return { ok: false, error: 'missing INSERT keyword' };
  const insertBlock = readNextBraceBlock(updateBody, cursor);
  if (!insertBlock.ok) return insertBlock;
  const whereCursor = consumeSparqlKeyword(updateBody, insertBlock.endOffset, 'WHERE');
  if (whereCursor < 0) return { ok: false, error: 'missing WHERE keyword' };
  const whereBlock = readNextBraceBlock(updateBody, whereCursor);
  if (!whereBlock.ok) return whereBlock;
  if (hasTrailingUpdateText(updateBody, whereBlock.endOffset)) return { ok: false, error: 'unexpected trailing update text' };
  return { ok: true, insertTemplate: insertBlock.content, wherePattern: whereBlock.content };
}

/**
 * Parses `DELETE { T } WHERE { P }`.
 *
 * @param {string} updateBody - SPARQL UPDATE body with prologue removed.
 * @returns {{ok: true, deleteTemplate: string, wherePattern: string}|{ok: false, error: string}}
 */
export function parseSparqlDeleteWhereUpdate(updateBody) {
  const cursor = consumeSparqlKeyword(updateBody, 0, 'DELETE');
  if (cursor < 0) return { ok: false, error: 'missing DELETE keyword' };
  const deleteBlock = readNextBraceBlock(updateBody, cursor);
  if (!deleteBlock.ok) return deleteBlock;
  const whereCursor = consumeSparqlKeyword(updateBody, deleteBlock.endOffset, 'WHERE');
  if (whereCursor < 0) return { ok: false, error: 'missing WHERE keyword' };
  const whereBlock = readNextBraceBlock(updateBody, whereCursor);
  if (!whereBlock.ok) return whereBlock;
  if (hasTrailingUpdateText(updateBody, whereBlock.endOffset)) return { ok: false, error: 'unexpected trailing update text' };
  return { ok: true, deleteTemplate: deleteBlock.content, wherePattern: whereBlock.content };
}

/**
 * Parses `DELETE { T } INSERT { U } WHERE { P }`.
 *
 * @param {string} updateBody - SPARQL UPDATE body with prologue removed.
 * @returns {{ok: true, deleteTemplate: string, insertTemplate: string, wherePattern: string}|{ok: false, error: string}}
 */
export function parseSparqlDeleteInsertWhereUpdate(updateBody) {
  const deleteCursor = consumeSparqlKeyword(updateBody, 0, 'DELETE');
  if (deleteCursor < 0) return { ok: false, error: 'missing DELETE keyword' };
  const deleteBlock = readNextBraceBlock(updateBody, deleteCursor);
  if (!deleteBlock.ok) return deleteBlock;
  const insertCursor = consumeSparqlKeyword(updateBody, deleteBlock.endOffset, 'INSERT');
  if (insertCursor < 0) return { ok: false, error: 'missing INSERT keyword' };
  const insertBlock = readNextBraceBlock(updateBody, insertCursor);
  if (!insertBlock.ok) return insertBlock;
  const whereCursor = consumeSparqlKeyword(updateBody, insertBlock.endOffset, 'WHERE');
  if (whereCursor < 0) return { ok: false, error: 'missing WHERE keyword' };
  const whereBlock = readNextBraceBlock(updateBody, whereCursor);
  if (!whereBlock.ok) return whereBlock;
  if (hasTrailingUpdateText(updateBody, whereBlock.endOffset)) return { ok: false, error: 'unexpected trailing update text' };
  return {
    ok: true,
    deleteTemplate: deleteBlock.content,
    insertTemplate: insertBlock.content,
    wherePattern: whereBlock.content
  };
}

function consumeSparqlKeyword(text, start, keyword) {
  const rest = String(text || '').slice(start).trimStart();
  const skipped = String(text || '').length - start - rest.length;
  const match = rest.match(new RegExp(`^${keyword}\\b`, 'i'));
  return match ? start + skipped + match[0].length : -1;
}

function readNextBraceBlock(text, start) {
  const open = String(text || '').indexOf('{', start);
  if (open < 0) return { ok: false, error: 'No SPARQL brace block found.' };
  return readBalancedSparqlBraceBlock(text, open);
}

function hasTrailingUpdateText(text, start) {
  return !/^;?\s*$/u.test(String(text || '').slice(start));
}
