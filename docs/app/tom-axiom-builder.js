// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Jonathan Vajda
import { COMMON_NAMESPACE_IRIS } from './shared/namespace-registry/namespace-registry.js';
import { createUuid } from './shared/ontology-utils/index.js';

  const AXIOM_PREDICATES = {
    SubClassOf: COMMON_NAMESPACE_IRIS.rdfs.subClassOf,
    EquivalentTo: COMMON_NAMESPACE_IRIS.owl.equivalentClass,
    DisjointWith: COMMON_NAMESPACE_IRIS.owl.disjointWith,
  };

  const CARDINALITY_PREDICATES = {
    min: COMMON_NAMESPACE_IRIS.owl.minCardinality,
    max: COMMON_NAMESPACE_IRIS.owl.maxCardinality,
    exactly: COMMON_NAMESPACE_IRIS.owl.cardinality,
  };

  const QUALIFIED_CARDINALITY_PREDICATES = {
    min: COMMON_NAMESPACE_IRIS.owl.minQualifiedCardinality,
    max: COMMON_NAMESPACE_IRIS.owl.maxQualifiedCardinality,
    exactly: COMMON_NAMESPACE_IRIS.owl.qualifiedCardinality,
  };

  function cloneTerm(term) {
    if (!term) return null;
    return {
      termType: term.termType,
      value: term.value,
      language: term.language || "",
      datatype: term.datatype ? cloneTerm(term.datatype) : null,
    };
  }

  function termKey(term) {
    if (!term) return "";
    return `${term.termType}:${term.value}`;
  }

  function termToTurtle(term, prefixes) {
    if (!term) return "";
    if (term.termType === "NamedNode") return iriToDisplay(term.value, prefixes);
    if (term.termType === "BlankNode") return `_:${term.value}`;
    if (term.termType === "Literal") {
      const escaped = String(term.value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      if (term.language) return `"${escaped}"@${term.language}`;
      const dt = term.datatype?.value;
      if (dt && dt !== COMMON_NAMESPACE_IRIS.xsd.string) {
        return `"${escaped}"^^${iriToDisplay(dt, prefixes)}`;
      }
      return `"${escaped}"`;
    }
    return String(term.value || "");
  }

  function iriToDisplay(iri, prefixes) {
    const value = String(iri || "");
    const prefixMap = prefixes || {};
    for (const [prefix, base] of Object.entries(prefixMap)) {
      if (value.startsWith(base)) return `${prefix}:${value.slice(base.length)}`;
    }
    return `<${value}>`;
  }

  function serializeTripleTerms(triples, prefixes) {
    return (triples || [])
      .map((triple) => {
        const s = termToTurtle(triple.subject, prefixes);
        const p = termToTurtle(triple.predicate, prefixes);
        const o = termToTurtle(triple.object, prefixes);
        return s && p && o ? `${s} ${p} ${o} .` : "";
      })
      .filter(Boolean)
      .join("\n");
  }

  function normalizeAxiomRecord(record) {
    const out = {
      subjectIri: String(record?.subjectIri || "").trim(),
      axioms: [],
      rawRdf: String(record?.rawRdf || ""),
      preservedTriples: [],
    };

    out.axioms = (Array.isArray(record?.axioms) ? record.axioms : [])
      .map((axiom) => ({
        id: axiom.id || createAxiomRecordId(),
        kind: AXIOM_PREDICATES[axiom.kind] ? axiom.kind : "SubClassOf",
        expressionText: String(axiom.expressionText || "").trim(),
        expressionAst: axiom.expressionAst || null,
        source: axiom.source === "import" ? "import" : "builder",
      }))
      .filter((axiom) => axiom.expressionText);

    out.preservedTriples = (Array.isArray(record?.preservedTriples) ? record.preservedTriples : [])
      .map((triple) => ({
        subject: cloneTerm(triple.subject),
        predicate: cloneTerm(triple.predicate),
        object: cloneTerm(triple.object),
      }))
      .filter((triple) => triple.subject && triple.predicate && triple.object);

    return out;
  }

  function tokenizeExpression(input) {
    const text = String(input || "");
    const tokens = [];
    let i = 0;

    while (i < text.length) {
      const chr = text[i];
      if (/\s/.test(chr)) {
        i += 1;
        continue;
      }
      if (chr === "(" || chr === ")") {
        tokens.push({ type: chr, value: chr, start: i, end: i + 1 });
        i += 1;
        continue;
      }
      if (chr === "<") {
        const end = text.indexOf(">", i + 1);
        if (end === -1) throw new Error("Full IRI is missing a closing >.");
        tokens.push({ type: "term", value: text.slice(i, end + 1), start: i, end: end + 1 });
        i = end + 1;
        continue;
      }
      const numberMatch = /^[0-9]+/.exec(text.slice(i));
      if (numberMatch) {
        tokens.push({ type: "number", value: numberMatch[0], start: i, end: i + numberMatch[0].length });
        i += numberMatch[0].length;
        continue;
      }
      const wordMatch = /^[^\s()]+/.exec(text.slice(i));
      if (!wordMatch) throw new Error(`Unexpected character "${chr}".`);
      const value = wordMatch[0];
      const keyword = /^(and|or|not|some|only|value|min|max|exactly)$/i.test(value);
      tokens.push({ type: keyword ? "keyword" : "term", value, start: i, end: i + value.length });
      i += value.length;
    }

    return tokens;
  }

  function createParser(tokens, resolver) {
    let pos = 0;

    function peek() {
      return tokens[pos] || null;
    }

    function consume() {
      const token = tokens[pos] || null;
      pos += 1;
      return token;
    }

    function matchKeyword(value) {
      const token = peek();
      if (token?.type === "keyword" && token.value.toLowerCase() === value) {
        consume();
        return true;
      }
      return false;
    }

    function expectTerm(kind) {
      const token = consume();
      if (!token || token.type !== "term") {
        throw new Error(`Expected ${kind || "term"}.`);
      }
      const resolved = resolver ? resolver(token.value, kind) : null;
      if (!resolved) {
        throw new Error(`Could not resolve "${token.value}" as ${kind || "an IRI"}.`);
      }
      return { text: token.value, iri: resolved };
    }

    function parseExpression() {
      return parseOr();
    }

    function parseOr() {
      let left = parseAnd();
      while (matchKeyword("or")) {
        left = { type: "or", items: flatten(left, "or").concat([parseAnd()]) };
      }
      return left;
    }

    function parseAnd() {
      let left = parseUnary();
      while (matchKeyword("and")) {
        left = { type: "and", items: flatten(left, "and").concat([parseUnary()]) };
      }
      return left;
    }

    function parseUnary() {
      if (matchKeyword("not")) return { type: "not", value: parseUnary() };
      return parsePrimary();
    }

    function parsePrimary() {
      const token = peek();
      if (!token) throw new Error("Expected class expression.");
      if (token.type === "(") {
        consume();
        const nested = parseExpression();
        if (!peek() || peek().type !== ")") throw new Error("Missing closing parenthesis.");
        consume();
        return nested;
      }

      const first = expectTerm("term");
      const next = peek();
      if (next?.type === "keyword") {
        const op = next.value.toLowerCase();
        if (op === "some" || op === "only") {
          consume();
          return {
            type: "restriction",
            propertyIri: first.iri,
            propertyText: first.text,
            operator: op,
            filler: parseUnary(),
          };
        }
        if (op === "value") {
          consume();
          const value = expectTerm("individual");
          return {
            type: "restriction",
            propertyIri: first.iri,
            propertyText: first.text,
            operator: op,
            valueIri: value.iri,
            valueText: value.text,
          };
        }
        if (op === "min" || op === "max" || op === "exactly") {
          consume();
          const numberToken = consume();
          if (!numberToken || numberToken.type !== "number") {
            throw new Error(`Expected a non-negative integer after ${op}.`);
          }
          const ast = {
            type: "restriction",
            propertyIri: first.iri,
            propertyText: first.text,
            operator: op,
            cardinality: Number(numberToken.value),
          };
          if (peek() && peek().type !== ")" && !(peek().type === "keyword" && /^(and|or)$/i.test(peek().value))) {
            ast.filler = parseUnary();
          }
          return ast;
        }
      }

      return { type: "class", iri: first.iri, text: first.text };
    }

    return {
      parse() {
        const ast = parseExpression();
        if (pos < tokens.length) throw new Error(`Unexpected token "${tokens[pos].value}".`);
        return ast;
      },
    };
  }

  function flatten(ast, type) {
    return ast?.type === type ? ast.items || [] : [ast];
  }

  function parseExpression(input, resolver) {
    const tokens = tokenizeExpression(input);
    if (!tokens.length) throw new Error("Expression is empty.");
    return createParser(tokens, resolver).parse();
  }

  function astToExpression(ast, prefixes) {
    if (!ast) return "";
    if (ast.type === "class") return ast.text || iriToDisplay(ast.iri, prefixes);
    if (ast.type === "and" || ast.type === "or") {
      return (ast.items || [])
        .map((item) => {
          const text = astToExpression(item, prefixes);
          return item.type === "or" || item.type === "and" ? `(${text})` : text;
        })
        .join(` ${ast.type} `);
    }
    if (ast.type === "not") return `not ${astToExpression(ast.value, prefixes)}`;
    if (ast.type === "restriction") {
      const prop = ast.propertyText || iriToDisplay(ast.propertyIri, prefixes);
      if (ast.operator === "value") return `${prop} value ${ast.valueText || iriToDisplay(ast.valueIri, prefixes)}`;
      if (CARDINALITY_PREDICATES[ast.operator]) {
        const filler = ast.filler ? ` ${astToExpression(ast.filler, prefixes)}` : "";
        return `${prop} ${ast.operator} ${ast.cardinality}${filler}`;
      }
      return `${prop} ${ast.operator} ${astToExpression(ast.filler, prefixes)}`;
    }
    return "";
  }

  function makeBlankNode(factory, seed) {
    if (factory?.blankNode) return factory.blankNode(seed);
    return { termType: "BlankNode", value: seed || `b${createUuid({ removeHyphens: true })}` };
  }

  function makeNamedNode(factory, iri) {
    return factory?.namedNode ? factory.namedNode(iri) : { termType: "NamedNode", value: iri };
  }

  function makeLiteral(factory, value, datatypeIri) {
    if (factory?.literal) {
      return datatypeIri ? factory.literal(String(value), makeNamedNode(factory, datatypeIri)) : factory.literal(String(value));
    }
    return {
      termType: "Literal",
      value: String(value),
      language: "",
      datatype: datatypeIri ? makeNamedNode(factory, datatypeIri) : makeNamedNode(factory, COMMON_NAMESPACE_IRIS.xsd.string),
    };
  }

  function addQuad(out, factory, subject, predicateIri, object) {
    const pred = makeNamedNode(factory, predicateIri);
    if (factory?.quad) out.push(factory.quad(subject, pred, object));
    else out.push({ subject, predicate: pred, object });
  }

  function astToNode(ast, out, factory, state) {
    if (!ast) throw new Error("Missing axiom expression.");
    if (ast.type === "class") return makeNamedNode(factory, ast.iri);
    if (ast.type === "and" || ast.type === "or") {
      const node = makeBlankNode(factory, `${state.prefix || "axiom"}${state.nextBlank++}`);
      const list = makeRdfList((ast.items || []).map((item) => astToNode(item, out, factory, state)), out, factory, state);
      addQuad(out, factory, node, ast.type === "and" ? COMMON_NAMESPACE_IRIS.owl.intersectionOf : COMMON_NAMESPACE_IRIS.owl.unionOf, list);
      return node;
    }
    if (ast.type === "not") {
      const node = makeBlankNode(factory, `${state.prefix || "axiom"}${state.nextBlank++}`);
      addQuad(out, factory, node, COMMON_NAMESPACE_IRIS.owl.complementOf, astToNode(ast.value, out, factory, state));
      return node;
    }
    if (ast.type === "restriction") {
      const node = makeBlankNode(factory, `${state.prefix || "axiom"}${state.nextBlank++}`);
      addQuad(out, factory, node, COMMON_NAMESPACE_IRIS.rdf.type, makeNamedNode(factory, COMMON_NAMESPACE_IRIS.owl.Restriction));
      addQuad(out, factory, node, COMMON_NAMESPACE_IRIS.owl.onProperty, makeNamedNode(factory, ast.propertyIri));
      if (ast.operator === "some") {
        addQuad(out, factory, node, COMMON_NAMESPACE_IRIS.owl.someValuesFrom, astToNode(ast.filler, out, factory, state));
      } else if (ast.operator === "only") {
        addQuad(out, factory, node, COMMON_NAMESPACE_IRIS.owl.allValuesFrom, astToNode(ast.filler, out, factory, state));
      } else if (ast.operator === "value") {
        addQuad(out, factory, node, COMMON_NAMESPACE_IRIS.owl.hasValue, makeNamedNode(factory, ast.valueIri));
      } else if (CARDINALITY_PREDICATES[ast.operator]) {
        const predicate = ast.filler
          ? QUALIFIED_CARDINALITY_PREDICATES[ast.operator]
          : CARDINALITY_PREDICATES[ast.operator];
        addQuad(out, factory, node, predicate, makeLiteral(factory, ast.cardinality, COMMON_NAMESPACE_IRIS.xsd.nonNegativeInteger));
        if (ast.filler) {
          addQuad(out, factory, node, COMMON_NAMESPACE_IRIS.owl.onClass, astToNode(ast.filler, out, factory, state));
        }
      } else {
        throw new Error(`Unsupported restriction operator "${ast.operator}".`);
      }
      return node;
    }
    throw new Error(`Unsupported expression shape "${ast.type}".`);
  }

  function makeRdfList(items, out, factory, state) {
    if (!items.length) return makeNamedNode(factory, COMMON_NAMESPACE_IRIS.rdf.nil);
    const head = makeBlankNode(factory, `${state.prefix || "axiom"}list${state.nextBlank++}`);
    let current = head;
    items.forEach((item, index) => {
      addQuad(out, factory, current, COMMON_NAMESPACE_IRIS.rdf.first, item);
      const next = index === items.length - 1
        ? makeNamedNode(factory, COMMON_NAMESPACE_IRIS.rdf.nil)
        : makeBlankNode(factory, `${state.prefix || "axiom"}list${state.nextBlank++}`);
      addQuad(out, factory, current, COMMON_NAMESPACE_IRIS.rdf.rest, next);
      current = next;
    });
    return head;
  }

  function axiomToQuads(axiom, subjectIri, factory) {
    const out = [];
    const pred = AXIOM_PREDICATES[axiom?.kind];
    if (!pred) return out;
    const subject = makeNamedNode(factory, subjectIri);
    const ast = axiom.expressionAst || axiom.ast;
    const prefix = `axiom_${String(subjectIri).replace(/[^a-zA-Z0-9]/g, "_").slice(-32)}_`;
    const object = astToNode(ast, out, factory, { nextBlank: 1, prefix });
    addQuad(out, factory, subject, pred, object);
    return out;
  }

  function detectRestrictionAst(blankNode, bySubject, prefixes) {
    const pMap = bySubject.get(termKey(blankNode));
    if (!pMap) return null;
    const types = pMap.get(COMMON_NAMESPACE_IRIS.rdf.type) || [];
    if (!types.some((term) => term.termType === "NamedNode" && term.value === COMMON_NAMESPACE_IRIS.owl.Restriction)) return null;
    const prop = (pMap.get(COMMON_NAMESPACE_IRIS.owl.onProperty) || [])[0];
    if (!prop || prop.termType !== "NamedNode") return null;

    const some = (pMap.get(COMMON_NAMESPACE_IRIS.owl.someValuesFrom) || [])[0];
    const only = (pMap.get(COMMON_NAMESPACE_IRIS.owl.allValuesFrom) || [])[0];
    const value = (pMap.get(COMMON_NAMESPACE_IRIS.owl.hasValue) || [])[0];
    const min = (pMap.get(COMMON_NAMESPACE_IRIS.owl.minCardinality) || [])[0];
    const max = (pMap.get(COMMON_NAMESPACE_IRIS.owl.maxCardinality) || [])[0];
    const exact = (pMap.get(COMMON_NAMESPACE_IRIS.owl.cardinality) || [])[0];

    if (some?.termType === "NamedNode") {
      return {
        type: "restriction",
        propertyIri: prop.value,
        propertyText: iriToDisplay(prop.value, prefixes),
        operator: "some",
        filler: { type: "class", iri: some.value, text: iriToDisplay(some.value, prefixes) },
      };
    }
    if (only?.termType === "NamedNode") {
      return {
        type: "restriction",
        propertyIri: prop.value,
        propertyText: iriToDisplay(prop.value, prefixes),
        operator: "only",
        filler: { type: "class", iri: only.value, text: iriToDisplay(only.value, prefixes) },
      };
    }
    if (value?.termType === "NamedNode") {
      return {
        type: "restriction",
        propertyIri: prop.value,
        propertyText: iriToDisplay(prop.value, prefixes),
        operator: "value",
        valueIri: value.value,
        valueText: iriToDisplay(value.value, prefixes),
      };
    }

    const card = min || max || exact;
    if (card?.termType === "Literal") {
      return {
        type: "restriction",
        propertyIri: prop.value,
        propertyText: iriToDisplay(prop.value, prefixes),
        operator: min ? "min" : max ? "max" : "exactly",
        cardinality: Number(card.value),
      };
    }
    return null;
  }

  function groupQuadsBySubject(quads) {
    const bySubject = new Map();
    (quads || []).forEach((quad) => {
      const sKey = termKey(quad.subject);
      if (!bySubject.has(sKey)) bySubject.set(sKey, new Map());
      const pMap = bySubject.get(sKey);
      const pred = quad.predicate?.value;
      if (!pMap.has(pred)) pMap.set(pred, []);
      pMap.get(pred).push(quad.object);
    });
    return bySubject;
  }

  function extractClassAxioms(quads, options) {
    const subjectIri = String(options?.subjectIri || "");
    const primaryIsA = String(options?.primaryIsA || "");
    const prefixes = options?.prefixes || {};
    const bySubject = groupQuadsBySubject(quads);
    const pMap = bySubject.get(`NamedNode:${subjectIri}`);
    const record = normalizeAxiomRecord({ subjectIri });
    if (!pMap) return record;

    const subclassObjects = pMap.get(COMMON_NAMESPACE_IRIS.rdfs.subClassOf) || [];
    let namedSeen = primaryIsA ? new Set([primaryIsA]) : new Set();
    subclassObjects.forEach((object) => {
      if (object.termType === "NamedNode") {
        if (namedSeen.has(object.value)) return;
        namedSeen.add(object.value);
        const ast = { type: "class", iri: object.value, text: iriToDisplay(object.value, prefixes) };
        record.axioms.push({
          id: `ax_import_${record.axioms.length + 1}`,
          kind: "SubClassOf",
          expressionText: astToExpression(ast, prefixes),
          expressionAst: ast,
          source: "import",
        });
        return;
      }

      if (object.termType === "BlankNode") {
        const ast = detectRestrictionAst(object, bySubject, prefixes);
        if (ast) {
          record.axioms.push({
            id: `ax_import_${record.axioms.length + 1}`,
            kind: "SubClassOf",
            expressionText: astToExpression(ast, prefixes),
            expressionAst: ast,
            source: "import",
          });
        } else {
          record.preservedTriples.push({
            subject: { termType: "NamedNode", value: subjectIri },
            predicate: { termType: "NamedNode", value: COMMON_NAMESPACE_IRIS.rdfs.subClassOf },
            object: cloneTerm(object),
          });
          collectBlankNodeComponent(object, quads).forEach((triple) => record.preservedTriples.push(triple));
        }
      }
    });
    return record;
  }

  function collectBlankNodeComponent(blankNode, quads, visited) {
    const seen = visited || new Set();
    if (!blankNode || blankNode.termType !== "BlankNode") return [];
    const key = termKey(blankNode);
    if (seen.has(key)) return [];
    seen.add(key);

    const out = [];
    (quads || []).forEach((quad) => {
      if (termKey(quad.subject) !== key) return;
      const triple = {
        subject: cloneTerm(quad.subject),
        predicate: cloneTerm(quad.predicate),
        object: cloneTerm(quad.object),
      };
      out.push(triple);
      if (quad.object?.termType === "BlankNode") {
        out.push(...collectBlankNodeComponent(quad.object, quads, seen));
      }
    });
    return out;
  }

  function mount(container, options) {
    if (!container) return { destroy() {} };
    const opts = options || {};
    let currentRecord = normalizeAxiomRecord(opts.record || { subjectIri: opts.subjectIri });
    const resolver = typeof opts.resolveTerm === "function" ? opts.resolveTerm : (value) => value;
    let selectedTab = "builder";

    function emit() {
      if (typeof opts.onChange === "function") opts.onChange(normalizeAxiomRecord(currentRecord));
    }

    function render() {
      container.innerHTML = "";
      const root = document.createElement("div");
      root.className = "tom-axiom-widget";

      const title = document.createElement("div");
      title.className = "tom-axiom-widget-context";
      title.textContent = `${opts.subjectLabel || "Selected row"} ${opts.subjectIri ? `(${opts.subjectIri})` : ""}`;
      root.appendChild(title);

      const tabs = document.createElement("div");
      tabs.className = "tom-axiom-tabs";
      ["builder", "raw"].forEach((tab) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = selectedTab === tab ? "is-active" : "";
        btn.textContent = tab === "builder" ? "Builder" : "Raw RDF";
        btn.addEventListener("click", () => {
          selectedTab = tab;
          render();
        });
        tabs.appendChild(btn);
      });
      root.appendChild(tabs);

      if (selectedTab === "raw") renderRaw(root);
      else renderBuilder(root);

      container.appendChild(root);
    }

    function renderBuilder(root) {
      const form = document.createElement("form");
      form.className = "tom-axiom-form";

      const kind = document.createElement("select");
      ["SubClassOf", "EquivalentTo", "DisjointWith"].forEach((value) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        kind.appendChild(option);
      });

      const textarea = document.createElement("textarea");
      textarea.placeholder = "has_part some Wheel";
      textarea.rows = 4;

      const tools = document.createElement("div");
      tools.className = "tom-axiom-tools";
      ["and", "or", "not", "some", "only", "value", "min", "max", "exactly", "(", ")"].forEach((token) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = token;
        btn.addEventListener("click", () => {
          insertAtCursor(textarea, token);
          validate();
        });
        tools.appendChild(btn);
      });

      const lookup = document.createElement("div");
      lookup.className = "tom-axiom-lookup";
      const lookupInput = document.createElement("input");
      lookupInput.type = "text";
      lookupInput.placeholder = "Find class, property, or individual";
      const lookupList = document.createElement("div");
      lookupList.className = "tom-axiom-lookup-results";
      let lookupRequest = 0;

      function renderLookupResults(results) {
        lookupList.innerHTML = "";
        if (!results.length) {
          const empty = document.createElement("div");
          empty.className = "tom-axiom-lookup-empty";
          empty.textContent = lookupInput.value.trim() ? "No matches found." : "Type to search terms.";
          lookupList.appendChild(empty);
          return;
        }
        results.forEach((result) => {
          const option = document.createElement("button");
          option.type = "button";
          option.className = "tom-axiom-lookup-option";
          option.innerHTML = [
            `<span>${escapeHtml(result.label || result.curie || result.iri)}</span>`,
            `<small>${escapeHtml([result.type, result.curie || result.iri].filter(Boolean).join(" - "))}</small>`,
          ].join("");
          option.addEventListener("click", () => {
            insertAtCursor(textarea, result.curie || `<${result.iri}>`);
            lookupInput.value = "";
            lookupList.innerHTML = "";
            validate();
          });
          lookupList.appendChild(option);
        });
      }

      function updateLookup() {
        const query = lookupInput.value.trim();
        const currentRequest = ++lookupRequest;
        if (!query || typeof opts.lookup !== "function") {
          renderLookupResults([]);
          return;
        }
        Promise.resolve(opts.lookup(query, { max: 8 }))
          .then((results) => {
            if (currentRequest !== lookupRequest) return;
            renderLookupResults(Array.isArray(results) ? results : []);
          })
          .catch(() => {
            if (currentRequest !== lookupRequest) return;
            renderLookupResults([]);
          });
      }
      lookupInput.addEventListener("input", updateLookup);
      lookup.appendChild(lookupInput);
      lookup.appendChild(lookupList);

      const status = document.createElement("div");
      status.className = "tom-axiom-status";

      const add = document.createElement("button");
      add.type = "submit";
      add.textContent = "Add Axiom";
      add.disabled = true;

      function validate() {
        try {
          parseExpression(textarea.value, resolver);
          status.textContent = "Expression is valid.";
          status.className = "tom-axiom-status is-valid";
          add.disabled = false;
        } catch (error) {
          status.textContent = error.message;
          status.className = "tom-axiom-status is-error";
          add.disabled = true;
        }
      }
      textarea.addEventListener("input", validate);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const ast = parseExpression(textarea.value, resolver);
        currentRecord.axioms.push({
          id: createAxiomRecordId(),
          kind: kind.value,
          expressionText: textarea.value.trim(),
          expressionAst: ast,
          source: "builder",
        });
        emit();
        render();
      });

      form.appendChild(kind);
      form.appendChild(tools);
      form.appendChild(lookup);
      form.appendChild(textarea);
      form.appendChild(status);
      form.appendChild(add);
      root.appendChild(form);

      const list = document.createElement("div");
      list.className = "tom-axiom-list";
      if (!currentRecord.axioms.length) {
        const empty = document.createElement("p");
        empty.textContent = "No structured axioms for this row yet.";
        list.appendChild(empty);
      }
      currentRecord.axioms.forEach((axiom, index) => {
        const item = document.createElement("div");
        item.className = "tom-axiom-item";
        const text = document.createElement("div");
        text.innerHTML = `<strong>${axiom.kind}</strong>: ${escapeHtml(axiom.expressionText)}`;
        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "Remove";
        remove.addEventListener("click", () => {
          currentRecord.axioms.splice(index, 1);
          emit();
          render();
        });
        item.appendChild(text);
        item.appendChild(remove);
        list.appendChild(item);
      });
      root.appendChild(list);
    }

    function renderRaw(root) {
      const textarea = document.createElement("textarea");
      textarea.className = "tom-axiom-raw";
      textarea.rows = 12;
      textarea.value = currentRecord.rawRdf || "";
      textarea.placeholder = "@prefix ex: <http://example.org/> .\nex:Thing rdfs:subClassOf ex:OtherThing .";

      const status = document.createElement("div");
      status.className = "tom-axiom-status";
      status.textContent = "Turtle fragments are preserved and exported with this row.";

      function validateRaw() {
        if (typeof opts.validateRaw !== "function" || !textarea.value.trim()) {
          status.textContent = "Turtle fragments are preserved and exported with this row.";
          status.className = "tom-axiom-status";
          return;
        }
        const result = opts.validateRaw(textarea.value, opts.subjectIri);
        status.textContent = result?.message || "";
        status.className = result?.valid === false ? "tom-axiom-status is-error" : "tom-axiom-status is-valid";
      }

      textarea.addEventListener("input", () => {
        currentRecord.rawRdf = textarea.value;
        emit();
        validateRaw();
      });
      root.appendChild(textarea);
      root.appendChild(status);
      validateRaw();

      if (currentRecord.preservedTriples.length) {
        const preserved = document.createElement("pre");
        preserved.className = "tom-axiom-preserved";
        preserved.textContent = serializeTripleTerms(currentRecord.preservedTriples, opts.prefixes);
        root.appendChild(preserved);
      }
    }

    render();
    return {
      destroy() {
        container.innerHTML = "";
      },
    };
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function createAxiomRecordId() {
    return `ax_${createUuid({ removeHyphens: true })}`;
  }

  function insertAtCursor(textarea, token) {
    const start = textarea.selectionStart || 0;
    const end = textarea.selectionEnd || 0;
    const current = textarea.value;
    const needsBefore = start > 0 && !/\s|\($/.test(current.slice(0, start));
    const needsAfter = end < current.length && !/^\s|\)/.test(current.slice(end));
    const insertion = `${needsBefore ? " " : ""}${token}${needsAfter ? " " : ""}`;
    textarea.value = `${current.slice(0, start)}${insertion}${current.slice(end)}`;
    const next = start + insertion.length;
    textarea.focus();
    textarea.setSelectionRange(next, next);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }

const api = {
    AXIOM_PREDICATES,
    normalizeAxiomRecord,
    parseExpression,
    astToExpression,
    axiomToQuads,
    extractClassAxioms,
    serializeTripleTerms,
    mount,
  };

export {
  AXIOM_PREDICATES,
  normalizeAxiomRecord,
  parseExpression,
  astToExpression,
  axiomToQuads,
  extractClassAxioms,
  serializeTripleTerms,
  mount,
};

export default api;
