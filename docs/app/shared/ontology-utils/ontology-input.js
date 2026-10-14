import {
  detectRdfMimeTypeFromText,
  getSupportedMimeTypeForFilename,
  normalizeSupportedMimeType
} from '../format-registry/index.js';

/**
 * @typedef {Readonly<{
 *   ok: true,
 *   isRdfCandidate: boolean,
 *   isOntologyCandidate: boolean,
 *   confidence: 'none' | 'low' | 'medium' | 'high',
 *   mimeType: string,
 *   evidence: ReadonlyArray<string>,
 *   warnings: ReadonlyArray<string>
 * }>} OntologyInputClassification
 */

const ONTOLOGY_TEXT_PATTERNS = Object.freeze([
  /\bowl:Ontology\b/,
  /<[^>]*\bOntology\b[^>]*>/,
  /@type["']?\s*:\s*["'][^"']*Ontology["']/,
  /http:\/\/www\.w3\.org\/2002\/07\/owl#Ontology/
]);

/**
 * Classify whether supplied file metadata/content looks like RDF and whether
 * it specifically looks like an ontology input.
 *
 * This function is a preflight classifier, not a parser. RDF parsing remains
 * the source of truth for syntactic validity. The structured result preserves
 * why a value was accepted instead of hiding that decision behind a boolean.
 *
 * @param {object} input - Input metadata and optional content.
 * @param {string} [input.filename] - Source filename.
 * @param {string} [input.mimeType] - Browser- or caller-provided MIME type.
 * @param {string} [input.text] - Optional text snippet or whole file content.
 * @returns {OntologyInputClassification} Structured classification result.
 */
export function classifyOntologyInput(input = {}) {
  const filename = String(input.filename || '');
  const mimeType = String(input.mimeType || '').trim();
  const text = typeof input.text === 'string' ? input.text : '';
  const evidence = [];
  const warnings = [];
  let detectedMimeType = '';
  let isRdfCandidate = false;
  let isOntologyCandidate = false;

  const byMime = mimeType ? normalizeSupportedMimeType(mimeType) : null;
  if (byMime?.ok) {
    detectedMimeType = byMime.value.mimeType;
    if (byMime.value.category === 'rdf') {
      isRdfCandidate = true;
      evidence.push('mime:rdf');
    }
  } else if (mimeType) {
    warnings.push(`Unrecognized MIME type: ${mimeType}`);
  }

  const byFilename = filename ? getSupportedMimeTypeForFilename(filename) : null;
  if (byFilename?.ok && byFilename.value.category === 'rdf') {
    detectedMimeType ||= byFilename.value.mimeType;
    isRdfCandidate = true;
    evidence.push('filename:rdf');
  } else if (filename && byFilename && !byFilename.ok) {
    warnings.push(`Unrecognized filename extension: ${filename}`);
  }

  if (text) {
    const detected = detectRdfMimeTypeFromText(text);
    if (detected.ok && detected.value.category === 'rdf') {
      detectedMimeType ||= detected.value.mimeType;
      isRdfCandidate = true;
      evidence.push('content:rdf-syntax');
    }
    if (ONTOLOGY_TEXT_PATTERNS.some((pattern) => pattern.test(text))) {
      isOntologyCandidate = true;
      evidence.push('content:ontology-marker');
    }
  }

  if (!isOntologyCandidate && isRdfCandidate) {
    isOntologyCandidate = true;
    evidence.push('rdf:possible-ontology');
  }

  const confidence = selectConfidence({
    isRdfCandidate,
    hasOntologyMarker: evidence.includes('content:ontology-marker'),
    evidenceCount: evidence.length
  });

  return Object.freeze({
    ok: true,
    isRdfCandidate,
    isOntologyCandidate,
    confidence,
    mimeType: detectedMimeType,
    evidence: Object.freeze(evidence),
    warnings: Object.freeze(warnings)
  });
}

function selectConfidence({ isRdfCandidate, hasOntologyMarker, evidenceCount }) {
  if (!isRdfCandidate) return 'none';
  if (hasOntologyMarker && evidenceCount > 1) return 'high';
  if (hasOntologyMarker) return 'medium';
  return 'low';
}
