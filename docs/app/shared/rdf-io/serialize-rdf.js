import { COMMON_NAMESPACE_IRIS } from '../namespace-registry/namespace-registry.js';
import { datasetToQuads, literal, namedNode, quad } from './rdf-model.js';
import { parseRdfTextWithN3, serializeRdfDatasetWithN3 } from './n3-adapter.js';
import { parseJsonLdTextToRdfDataset, serializeRdfDatasetWithJsonLd } from './jsonld-adapter.js';
import { parseRdfXmlTextToRdfDataset, serializeRdfDatasetWithRdflib } from './rdflib-adapter.js';
import {
  adapterForRdfFormat,
  createRdfIoRuntime,
  mimeTypeForRdfFormat,
  normalizeRdfFormat
} from './runtime.js';

const FORMAT_ALIASES = new Map([
  ['nt', 'ntriples'],
  ['ntriples', 'ntriples'],
  ['n-triples', 'ntriples'],
  ['application/n-triples', 'ntriples'],
  ['text/plain', 'ntriples'],
  ['nq', 'nquads'],
  ['nquads', 'nquads'],
  ['n-quads', 'nquads'],
  ['application/n-quads', 'nquads'],
  ['jsonld', 'jsonld'],
  ['json-ld', 'jsonld'],
  ['application/ld+json', 'jsonld']
]);

/**
 * Serializes an RDF/JS dataset-like object to one supported RDF syntax.
 *
 * This dependency-free core intentionally supports N-Triples, N-Quads, and a
 * deterministic simple JSON-LD projection. Turtle, TriG, and RDF/XML should be
 * provided by vendor adapters so the core remains testable without browser
 * globals or bundled parser libraries.
 *
 * @param {unknown} dataset - RDF/JS dataset-like object, N3 Store-like object, or iterable quads.
 * @param {object} [options] - Serialization options.
 * @param {string} [options.format='nquads'] - Output format or MIME alias.
 * @param {object} [options.context] - Optional JSON-LD context for JSON-LD output.
 * @param {boolean} [options.pretty=true] - Pretty-print JSON-LD output.
 * @returns {{text: string, format: string, mimeType: string, warnings: object[]}} Serialized RDF result.
 */
export function serializeRdfDataset(dataset, options = {}) {
  const format = normalizeRdfLineFormat(options.format || options.mimeType || 'nquads');
  const quads = datasetToQuads(dataset);
  const warnings = [];

  if (format === 'ntriples') {
    return {
      text: serializeRdfDatasetToNTriples(quads),
      format,
      mimeType: 'application/n-triples',
      warnings
    };
  }
  if (format === 'nquads') {
    return {
      text: serializeRdfDatasetToNQuads(quads),
      format,
      mimeType: 'application/n-quads',
      warnings
    };
  }
  if (format === 'jsonld') {
    return {
      text: serializeRdfDatasetToJsonLd(quads, options),
      format,
      mimeType: 'application/ld+json',
      warnings
    };
  }

  throw new TypeError(`Unsupported dependency-free RDF serialization format: ${format}`);
}

/**
 * Serializes quads to N-Triples, dropping graph names.
 *
 * @param {unknown} dataset - Dataset-like input.
 * @returns {string} N-Triples text.
 */
export function serializeRdfDatasetToNTriples(dataset) {
  return datasetToQuads(dataset)
    .map((item) => `${termToNTriples(item.subject)} ${termToNTriples(item.predicate)} ${termToNTriples(item.object)} .`)
    .join('\n')
    .concat(datasetToQuads(dataset).length ? '\n' : '');
}

/**
 * Serializes quads to N-Quads.
 *
 * @param {unknown} dataset - Dataset-like input.
 * @returns {string} N-Quads text.
 */
export function serializeRdfDatasetToNQuads(dataset) {
  return datasetToQuads(dataset)
    .map((item) => {
      const graph = item.graph?.termType && item.graph.termType !== 'DefaultGraph'
        ? ` ${termToNTriples(item.graph)}`
        : '';
      return `${termToNTriples(item.subject)} ${termToNTriples(item.predicate)} ${termToNTriples(item.object)}${graph} .`;
    })
    .join('\n')
    .concat(datasetToQuads(dataset).length ? '\n' : '');
}

/**
 * Projects RDF quads to deterministic simple JSON-LD.
 *
 * This function depends on the same normalized quad model as the line
 * serializers. It does not call jsonld.js; compacting/expansion can be added
 * later as an adapter while this projection remains a stable fallback for apps
 * that already hand-build JSON-LD-like graph objects.
 *
 * @param {unknown} dataset - Dataset-like input.
 * @param {object} [options] - JSON-LD options.
 * @param {object} [options.context] - Optional `@context` object.
 * @param {boolean} [options.pretty=true] - Pretty-print output.
 * @returns {string} JSON-LD text.
 */
export function serializeRdfDatasetToJsonLd(dataset, options = {}) {
  const context = options.context && typeof options.context === 'object' ? options.context : undefined;
  const graph = rdfDatasetToJsonLdGraph(dataset, { context });
  const doc = context ? { '@context': context, '@graph': graph } : { '@graph': graph };
  return JSON.stringify(doc, null, options.pretty === false ? 0 : 2);
}

/**
 * Converts RDF quads into a JSON-LD graph array.
 *
 * @param {unknown} dataset - Dataset-like input.
 * @param {object} [options] - Projection options.
 * @param {object} [options.context] - Optional context used for compact predicate keys.
 * @returns {object[]} JSON-LD node objects.
 */
export function rdfDatasetToJsonLdGraph(dataset, options = {}) {
  const nodes = new Map();
  for (const item of datasetToQuads(dataset)) {
    const id = termToJsonLdId(item.subject);
    if (!nodes.has(id)) nodes.set(id, { '@id': id });
    const node = nodes.get(id);
    const key = item.predicate.value === COMMON_NAMESPACE_IRIS.rdf.type
      ? '@type'
      : compactJsonLdPredicate(item.predicate.value, options.context);
    const value = item.predicate.value === COMMON_NAMESPACE_IRIS.rdf.type ? termToJsonLdId(item.object) : termToJsonLdValue(item.object);
    appendJsonLdValue(node, key, value);
  }
  return Array.from(nodes.values());
}

/**
 * Parses a small N-Triples/N-Quads subset into RDF/JS quads.
 *
 * This parser is intended for canonical tests, JSON-LD fallback round-trips,
 * and simple N-Triples/N-Quads imports. Full Turtle, TriG, JSON-LD, and RDF/XML
 * parsing should be implemented by vendor adapters.
 *
 * @param {string} text - N-Triples or N-Quads text.
 * @param {object} [options] - Parse options.
 * @param {string} [options.format='nquads'] - `ntriples` or `nquads`.
 * @returns {{dataset: object, quads: object[], sourceFormat: string, prefixes: object, baseIri: null, warnings: object[]}} Parsed result.
 */
export function parseRdfText(text, options = {}) {
  const format = normalizeRdfLineFormat(options.format || options.mimeType || 'nquads');
  if (format !== 'ntriples' && format !== 'nquads') {
    throw new TypeError(`Dependency-free parseRdfText supports only N-Triples and N-Quads. Received: ${format}`);
  }
  const quads = parseLineBasedRdf(text, format);
  return {
    dataset: {
      getQuads() {
        return quads.slice();
      },
      match() {
        return this;
      },
      size: quads.length,
      [Symbol.iterator]() {
        return quads[Symbol.iterator]();
      }
    },
    quads,
    sourceFormat: format,
    prefixes: {},
    baseIri: null,
    warnings: []
  };
}

/**
 * Parses RDF text with the full adapter layer when a runtime is available.
 *
 * Use this async function for Turtle, TriG, N3, JSON-LD, and RDF/XML. The
 * dependency-free `parseRdfText` remains available for synchronous N-Triples
 * and N-Quads fallback tests.
 *
 * @param {string} text - RDF text.
 * @param {object} [options] - Parse options.
 * @param {string} [options.format] - RDF format, MIME, extension, or alias.
 * @param {string} [options.mimeType] - RDF MIME type.
 * @param {string} [options.baseIri] - Base IRI.
 * @param {object} [options.runtime] - Runtime containing N3/jsonld/rdflib libraries.
 * @returns {Promise<{dataset: object, quads: object[], sourceFormat: string, prefixes: object, baseIri: string|null, warnings: object[]}>} Parsed RDF result.
 */
export async function parseRdfTextWithAdapters(text, options = {}) {
  const format = normalizeRdfFormat(options.format || options.mimeType || 'nquads');
  const runtime = createRdfIoRuntime(options.runtime || {});
  const adapter = adapterForRdfFormat(format);

  let parsed;
  if (adapter === 'n3') {
    if (runtime.N3?.Parser) parsed = parseRdfTextWithN3(text, { ...options, format, runtime });
    else if (format === 'ntriples' || format === 'nquads') parsed = parseRdfText(text, { ...options, format });
    else parsed = parseRdfTextWithN3(text, { ...options, format, runtime });
  } else if (adapter === 'jsonld') {
    parsed = await parseJsonLdTextToRdfDataset(text, { ...options, format, runtime });
  } else if (adapter === 'rdflib') {
    parsed = await parseRdfXmlTextToRdfDataset(text, { ...options, format, runtime });
  } else {
    throw new TypeError(`Unsupported RDF parse format: ${format}`);
  }

  return {
    dataset: parsed.dataset,
    quads: parsed.quads,
    prefixes: parsed.prefixes || {},
    sourceFormat: format,
    baseIri: options.baseIri || null,
    warnings: parsed.warnings || []
  };
}

/**
 * Serializes RDF/JS dataset-like input with the full adapter layer.
 *
 * Use this async function for Turtle, TriG, N3, JSON-LD through jsonld.js, and
 * RDF/XML. The synchronous `serializeRdfDataset` remains available for
 * dependency-free N-Triples, N-Quads, and simple JSON-LD projection.
 *
 * @param {unknown} dataset - RDF/JS dataset-like input.
 * @param {object} [options] - Serialization options.
 * @param {string} [options.format='nquads'] - RDF format, MIME, extension, or alias.
 * @param {object} [options.runtime] - Runtime containing N3/jsonld/rdflib libraries.
 * @returns {Promise<{text: string, format: string, mimeType: string, warnings: object[]}>} Serialized RDF result.
 */
export async function serializeRdfDatasetWithAdapters(dataset, options = {}) {
  const format = normalizeRdfFormat(options.format || options.mimeType || 'nquads');
  const runtime = createRdfIoRuntime(options.runtime || {});
  const adapter = adapterForRdfFormat(format);
  const warnings = [];

  if ((format === 'ntriples' || format === 'nquads' || format === 'jsonld') && !runtime.N3 && !runtime.jsonld) {
    return serializeRdfDataset(dataset, { ...options, format });
  }

  let text;
  if (adapter === 'n3') {
    text = await serializeRdfDatasetWithN3(dataset, { ...options, format, runtime });
  } else if (adapter === 'jsonld') {
    text = runtime.jsonld
      ? await serializeRdfDatasetWithJsonLd(dataset, { ...options, format, runtime })
      : serializeRdfDatasetToJsonLd(dataset, options);
  } else if (adapter === 'rdflib') {
    text = await serializeRdfDatasetWithRdflib(dataset, { ...options, format, runtime });
  } else {
    throw new TypeError(`Unsupported RDF serialization format: ${format}`);
  }

  return {
    text,
    format,
    mimeType: mimeTypeForRdfFormat(format),
    warnings
  };
}

export function normalizeRdfLineFormat(value) {
  const key = String(value ?? '').trim().toLowerCase();
  return FORMAT_ALIASES.get(key) || key;
}

function parseLineBasedRdf(text, format) {
  return String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line, index) => parseNQuadLine(line, format, index + 1));
}

function parseNQuadLine(line, format, lineNumber) {
  const tokens = tokenizeNQuadLine(line, lineNumber);
  if (tokens.at(-1) !== '.') throw new SyntaxError(`RDF line ${lineNumber} must end with ".".`);
  const body = tokens.slice(0, -1);
  if (format === 'ntriples' && body.length !== 3) throw new SyntaxError(`N-Triples line ${lineNumber} must contain 3 terms.`);
  if (format === 'nquads' && body.length !== 3 && body.length !== 4) throw new SyntaxError(`N-Quads line ${lineNumber} must contain 3 or 4 terms.`);
  return quad(parseResourceToken(body[0]), parseResourceToken(body[1]), parseObjectToken(body[2]), body[3] ? parseResourceToken(body[3]) : undefined);
}

function tokenizeNQuadLine(line, lineNumber) {
  const tokens = [];
  let i = 0;
  while (i < line.length) {
    while (/\s/.test(line[i])) i += 1;
    if (i >= line.length) break;
    if (line[i] === '<') {
      const end = line.indexOf('>', i + 1);
      if (end < 0) throw new SyntaxError(`Unterminated IRI on RDF line ${lineNumber}.`);
      tokens.push(line.slice(i, end + 1));
      i = end + 1;
    } else if (line[i] === '"') {
      const { token, nextIndex } = readLiteralToken(line, i, lineNumber);
      tokens.push(token);
      i = nextIndex;
    } else {
      const match = /^\S+/.exec(line.slice(i));
      tokens.push(match[0]);
      i += match[0].length;
    }
  }
  return tokens;
}

function readLiteralToken(line, start, lineNumber) {
  let i = start + 1;
  let escaped = false;
  while (i < line.length) {
    const ch = line[i];
    if (escaped) {
      escaped = false;
    } else if (ch === '\\') {
      escaped = true;
    } else if (ch === '"') {
      i += 1;
      while (i < line.length && !/\s/.test(line[i])) i += 1;
      return { token: line.slice(start, i), nextIndex: i };
    }
    i += 1;
  }
  throw new SyntaxError(`Unterminated literal on RDF line ${lineNumber}.`);
}

function parseResourceToken(token) {
  if (token.startsWith('<') && token.endsWith('>')) return namedNode(token.slice(1, -1));
  if (token.startsWith('_:')) return { termType: 'BlankNode', value: token.slice(2) };
  throw new SyntaxError(`Expected RDF resource token, received "${token}".`);
}

function parseObjectToken(token) {
  if (token.startsWith('"')) {
    const literalMatch = /^"((?:\\.|[^"])*)"(?:@([a-zA-Z0-9-]+)|\^\^<([^>]+)>)?$/.exec(token);
    if (!literalMatch) throw new SyntaxError(`Invalid RDF literal token: ${token}`);
    return literal(unescapeLiteral(literalMatch[1]), {
      language: literalMatch[2] || '',
      datatype: literalMatch[3] || COMMON_NAMESPACE_IRIS.xsd.string
    });
  }
  return parseResourceToken(token);
}

function termToNTriples(term) {
  if (term.termType === 'NamedNode') return `<${term.value}>`;
  if (term.termType === 'BlankNode') return `_:${term.value}`;
  if (term.termType === 'Literal') {
    const escaped = escapeLiteral(term.value);
    if (term.language) return `"${escaped}"@${term.language}`;
    const datatype = term.datatype?.value || COMMON_NAMESPACE_IRIS.xsd.string;
    return datatype === COMMON_NAMESPACE_IRIS.xsd.string ? `"${escaped}"` : `"${escaped}"^^<${datatype}>`;
  }
  throw new TypeError(`Cannot serialize RDF term type: ${term.termType}`);
}

function termToJsonLdId(term) {
  if (term.termType === 'NamedNode') return term.value;
  if (term.termType === 'BlankNode') return `_:${term.value}`;
  return term.value;
}

function termToJsonLdValue(term) {
  if (term.termType === 'NamedNode' || term.termType === 'BlankNode') return { '@id': termToJsonLdId(term) };
  if (term.termType === 'Literal') {
    const out = { '@value': term.value };
    if (term.language) out['@language'] = term.language;
    else if ((term.datatype?.value || COMMON_NAMESPACE_IRIS.xsd.string) !== COMMON_NAMESPACE_IRIS.xsd.string) out['@type'] = term.datatype.value;
    return out;
  }
  return String(term.value ?? '');
}

function compactJsonLdPredicate(iri, context) {
  if (!context) return iri;
  for (const [term, value] of Object.entries(context)) {
    const id = typeof value === 'string' ? value : value?.['@id'];
    if (id === iri) return term;
  }
  return iri;
}

function appendJsonLdValue(node, key, value) {
  if (node[key] === undefined) {
    node[key] = key === '@type' ? [value] : value;
  } else if (Array.isArray(node[key])) {
    node[key].push(value);
  } else {
    node[key] = [node[key], value];
  }
}

function escapeLiteral(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

function unescapeLiteral(value) {
  return String(value)
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}
