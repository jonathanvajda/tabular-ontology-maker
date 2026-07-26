import { isAbsoluteIri } from './prefix-map.js';

/**
 * @file Base IRI and namespace-stem discovery helpers.
 */

/**
 * Derives the namespace stem for one absolute IRI.
 *
 * Hash namespaces preserve the trailing `#`; slash namespaces preserve the
 * trailing `/`. Invalid or unsplittable values return structured errors.
 *
 * @param {string} iri - Absolute IRI.
 * @returns {Readonly<{ok: true, value: string, source: 'hash'|'slash'}> | Readonly<{ok: false, error: 'invalid iri'|'namespace stem not found', input: string}>}
 */
export function deriveNamespaceStemFromIri(iri) {
  const value = String(iri || '').trim();
  if (!isAbsoluteIri(value)) {
    return Object.freeze({ ok: false, error: 'invalid iri', input: String(iri || '') });
  }

  const hashIndex = value.lastIndexOf('#');
  if (hashIndex >= 0) {
    return Object.freeze({ ok: true, value: value.slice(0, hashIndex + 1), source: 'hash' });
  }

  const slashIndex = value.lastIndexOf('/');
  if (slashIndex >= 0) {
    return Object.freeze({ ok: true, value: value.slice(0, slashIndex + 1), source: 'slash' });
  }

  return Object.freeze({ ok: false, error: 'namespace stem not found', input: value });
}

/**
 * Lists namespace stems found in RDF/JS named-node terms in a store.
 *
 * @param {{getQuads?: Function}} store - RDF/JS-compatible store.
 * @returns {Readonly<{ok: true, value: ReadonlyArray<string>}>}
 */
export function listNamespaceStemsInStore(store) {
  const namespaces = new Set();
  const quads = store?.getQuads ? store.getQuads(null, null, null, null) : [];

  for (const quad of quads) {
    for (const term of [quad.subject, quad.predicate, quad.object, quad.graph]) {
      if (term?.termType !== 'NamedNode') continue;
      const result = deriveNamespaceStemFromIri(term.value);
      if (result.ok) namespaces.add(result.value);
    }
  }

  return Object.freeze({ ok: true, value: Object.freeze([...namespaces].sort()) });
}

/**
 * Discovers a base IRI or namespace stem from several common input shapes.
 *
 * @param {string | {baseIri?: string, ontologyIri?: string, iri?: string, store?: unknown}} input
 * IRI string or parsed summary-like object.
 * @returns {Readonly<{ok: true, value: string, source: string}> | Readonly<{ok: false, error: 'base iri not found', input: string}>}
 */
export function discoverBaseIriOrNamespaceStem(input) {
  if (typeof input === 'string') {
    const stem = deriveNamespaceStemFromIri(input);
    return stem.ok
      ? Object.freeze({ ok: true, value: stem.value, source: `iri-${stem.source}` })
      : Object.freeze({ ok: false, error: 'base iri not found', input });
  }

  const baseIri = String(input?.baseIri || '').trim();
  if (baseIri && isAbsoluteIri(baseIri)) {
    return Object.freeze({ ok: true, value: baseIri, source: 'baseIri' });
  }

  for (const key of ['ontologyIri', 'iri']) {
    const stem = deriveNamespaceStemFromIri(input?.[key]);
    if (stem.ok) return Object.freeze({ ok: true, value: stem.value, source: key });
  }

  if (input?.store) {
    const stems = listNamespaceStemsInStore(input.store).value;
    if (stems.length) return Object.freeze({ ok: true, value: stems[0], source: 'store' });
  }

  return Object.freeze({ ok: false, error: 'base iri not found', input: '' });
}
