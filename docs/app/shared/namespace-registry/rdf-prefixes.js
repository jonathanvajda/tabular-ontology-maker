import { okPrefixResult } from './prefix-map.js';

/**
 * @file RDF prefix extraction helpers.
 *
 * RDF prefix extraction is intentionally distinct from SPARQL prefix
 * extraction. Turtle/TriG, RDF/XML, JSON-LD, and parser-captured prefixes all
 * have different syntax and different failure modes.
 */

/**
 * Extracts `@prefix` and SPARQL-style `PREFIX` declarations from Turtle-like
 * RDF text.
 *
 * @param {string} text - Turtle, TriG, or Notation3-like text.
 * @returns {Readonly<Record<string, string>>} Prefix-to-namespace map.
 */
export function extractTurtlePrefixDeclarations(text) {
  const out = {};
  const source = String(text || '');
  const pattern = /(?:@prefix\s+([A-Za-z_][\w.-]*|):\s*<([^>]+)>\s*\.|PREFIX\s+([A-Za-z_][\w.-]*|):\s*<([^>]+)>)/gi;
  for (let match; (match = pattern.exec(source)); ) {
    const prefix = match[1] ?? match[3] ?? '';
    const namespaceIri = match[2] ?? match[4] ?? '';
    out[prefix] = namespaceIri;
  }
  return Object.freeze(out);
}

/**
 * Extracts XML namespace declarations from an RDF/XML or XML root element.
 *
 * This implementation uses text scanning rather than `DOMParser` so it remains
 * usable in Jest, workers, and optional Node contexts.
 *
 * @param {string} xmlText - RDF/XML or XML text.
 * @returns {Readonly<Record<string, string>>} Prefix-to-namespace map. The
 * default XML namespace is stored under the empty-string prefix.
 */
export function extractXmlNamespacePrefixes(xmlText) {
  const out = {};
  const source = String(xmlText || '');
  const rootMatch = source.match(/<rdf:RDF\b[^>]*>/i) || source.match(/<[^!?][^>]*>/);
  const root = rootMatch ? rootMatch[0] : '';
  const attrPattern = /\sxmlns(?::([A-Za-z_][\w.-]*))?=(["'])(.*?)\2/g;

  for (let match; (match = attrPattern.exec(root)); ) {
    const prefix = match[1] || '';
    const namespaceIri = match[3] || '';
    out[prefix] = namespaceIri;
  }
  return Object.freeze(out);
}

/**
 * Extracts simple prefix-like string entries from a JSON-LD context.
 *
 * This MVP supports JSON-LD documents whose `@context` is a plain object with
 * string values. Array contexts and object term definitions are intentionally
 * reported as warnings until the apps need that broader contract.
 *
 * @param {string | Record<string, unknown>} jsonTextOrObject - JSON-LD text or
 * parsed object.
 * @returns {Readonly<{ok: true, prefixes: Record<string, string>, jsonObject: unknown, warnings: ReadonlyArray<string>} | {ok: false, error: 'invalid jsonld', message: string, warnings: ReadonlyArray<string>}>}
 */
export function extractJsonLdContextPrefixes(jsonTextOrObject) {
  const warnings = [];
  let jsonObject;
  try {
    jsonObject = typeof jsonTextOrObject === 'string'
      ? JSON.parse(jsonTextOrObject)
      : jsonTextOrObject;
  } catch (error) {
    return Object.freeze({
      ok: false,
      error: 'invalid jsonld',
      message: error instanceof Error ? error.message : String(error),
      warnings: Object.freeze(warnings)
    });
  }

  const context = jsonObject?.['@context'];
  const out = {};
  if (context && typeof context === 'object' && !Array.isArray(context)) {
    for (const [key, value] of Object.entries(context)) {
      if (key.startsWith('@')) continue;
      if (typeof value === 'string') out[key] = value;
      else warnings.push(`Ignored JSON-LD context term "${key}" because only string term values are supported.`);
    }
  } else if (Array.isArray(context)) {
    warnings.push('Ignored JSON-LD array @context because only plain object contexts are supported.');
  }

  return okPrefixResult(out, { jsonObject, warnings, source: 'jsonld-context' });
}

/**
 * Extracts RDF prefixes according to the declared RDF MIME type or explicit
 * parser callback.
 *
 * Parser-based extraction is adapter-oriented and optional. When `n3Parser` is
 * supplied, it should expose a `parse(text, callback)` method compatible with
 * N3's callback prefix reporting.
 *
 * @param {string} text - RDF source text.
 * @param {{mimeType?: string, n3Parser?: {parse: Function}}} [options]
 * Extraction options.
 * @returns {Readonly<{ok: true, prefixes: Record<string, string>, warnings: ReadonlyArray<string>, source?: string}> | Readonly<{ok: false, error: string, message?: string, warnings: ReadonlyArray<string>}>}
 */
export function extractRdfPrefixesFromText(text, options = {}) {
  const source = String(text || '');
  const mimeType = String(options.mimeType || '').toLowerCase();

  if (isTurtleLikeMime(mimeType)) {
    return okPrefixResult(extractTurtlePrefixDeclarations(source), { source: 'turtle-text' });
  }
  if (isRdfXmlLikeMime(mimeType)) {
    return okPrefixResult(extractXmlNamespacePrefixes(source), { source: 'xml-namespace' });
  }
  if (isJsonLdLikeMime(mimeType)) {
    return extractJsonLdContextPrefixes(source);
  }
  if (options.n3Parser) {
    return extractPrefixesWithN3Parser(source, options.n3Parser);
  }
  return okPrefixResult({}, {
    warnings: ['No RDF prefix extractor matched the provided MIME type.'],
    source: 'none'
  });
}

function extractPrefixesWithN3Parser(text, n3Parser) {
  const prefixes = {};
  let parseError = null;
  try {
    n3Parser.parse(text, (error, quad, parsedPrefixes) => {
      if (error) {
        parseError = error;
        return;
      }
      if (!quad && parsedPrefixes && typeof parsedPrefixes === 'object') {
        Object.assign(prefixes, parsedPrefixes);
      }
    });
  } catch (error) {
    parseError = error;
  }
  if (parseError) {
    return Object.freeze({
      ok: false,
      error: 'rdf prefix parser error',
      message: parseError instanceof Error ? parseError.message : String(parseError),
      warnings: Object.freeze([])
    });
  }
  return okPrefixResult(prefixes, { source: 'n3-parser' });
}

function isTurtleLikeMime(mimeType) {
  return ['text/turtle', 'application/trig', 'text/n3'].includes(mimeType);
}

function isRdfXmlLikeMime(mimeType) {
  return mimeType === 'application/rdf+xml';
}

function isJsonLdLikeMime(mimeType) {
  return mimeType === 'application/ld+json';
}
