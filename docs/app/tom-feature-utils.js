(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  root.TOMFeatureUtils = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function defaultPredicateObjectMode(predicateType, iri) {
    const type = String(predicateType || "").trim();

    if (type === "ObjectProperty") return "iri";
    if (type === "DatatypeProperty" || type === "AnnotationProperty") return "literal";
    if (/ObjectProperty$/i.test(type)) return "iri";
    if (/DatatypeProperty$/i.test(type) || /AnnotationProperty$/i.test(type)) return "literal";
    if (/#.+Property$/.test(String(iri || "")) || /sameAs$/i.test(String(iri || ""))) return "iri";
    return "literal";
  }

  function normalizePredicateMode(mode, iri, defaultModeForPredicate) {
    if (mode === "iri") return "iri";
    if (mode === "literal") return "literal";
    if (typeof defaultModeForPredicate === "function") {
      return defaultModeForPredicate(iri);
    }
    return defaultPredicateObjectMode("", iri);
  }

  function normalizePredicateRecord(record, fallback, options) {
    const entry = record || {};
    const previous = fallback || {};
    const settings = options || {};
    const normalizeMode = settings.normalizePredicateMode || normalizePredicateMode;
    const iri = String(entry.iri ?? previous.iri ?? "").trim();

    if (!iri) return null;

    return {
      iri,
      objectMode: normalizeMode(
        entry.objectMode ?? previous.objectMode ?? settings.defaultObjectMode,
        iri
      ),
      showInOntology: entry.showInOntology ?? previous.showInOntology ?? true,
      showInRelata: entry.showInRelata ?? previous.showInRelata ?? true,
    };
  }

  function cloneRowsForWorkspace(rows, expectedColumnCount) {
    return (Array.isArray(rows) ? rows : []).map(function (row) {
      const nextRow = Array.isArray(row) ? row.slice() : [];
      if (expectedColumnCount == null) return nextRow;
      if (nextRow.length < expectedColumnCount) {
        nextRow.push.apply(
          nextRow,
          Array.from({ length: expectedColumnCount - nextRow.length }, function () {
            return "";
          })
        );
      }
      return nextRow.slice(0, expectedColumnCount);
    });
  }

  function normalizeWorkspaceSnapshot(snapshot, options) {
    if (!snapshot || typeof snapshot !== "object") return null;

    const settings = options || {};
    const baseCols = Number.isInteger(settings.baseCols) ? settings.baseCols : 6;
    const defaultView = settings.defaultView || "ontology";
    const isValidViewKey =
      typeof settings.isValidViewKey === "function"
        ? settings.isValidViewKey
        : function () {
            return true;
          };
    const normalizeRecord = settings.normalizePredicateRecord || normalizePredicateRecord;
    const normalizeMode = settings.normalizePredicateMode || normalizePredicateMode;
    const seen = new Set();

    const predicates = (Array.isArray(snapshot.predicates) ? snapshot.predicates : [])
      .map(function (entry) {
        const record = normalizeRecord(entry, null, {
          normalizePredicateMode: normalizeMode,
        });
        if (!record || seen.has(record.iri)) return null;
        seen.add(record.iri);
        return {
          iri: record.iri,
          objectMode: normalizeMode(record.objectMode, record.iri),
        };
      })
      .filter(Boolean);

    const expectedColumnCount = baseCols + predicates.length;
    return {
      version: Number(snapshot.version) || 1,
      timestamp: snapshot.timestamp || new Date().toISOString(),
      activeView: isValidViewKey(snapshot.activeView) ? snapshot.activeView : defaultView,
      predicates,
      rows: cloneRowsForWorkspace(snapshot.rows, expectedColumnCount),
    };
  }

  function getRecordOrderValue(record) {
    const parsedTimestamp = Date.parse(record && record.timestamp ? record.timestamp : "");
    if (Number.isFinite(parsedTimestamp)) return parsedTimestamp;
    return record && typeof record.id === "number" ? record.id : -1;
  }

  function selectLatestRecord(records) {
    const values = Array.isArray(records) ? records : [];
    if (!values.length) return null;
    return values.reduce(function (latest, current) {
      if (!latest) return current;
      return getRecordOrderValue(current) >= getRecordOrderValue(latest) ? current : latest;
    }, null);
  }

  function getPredicateViewPlacement(record) {
    if (!record) return "hidden";
    const inOntology = record.showInOntology !== false;
    const inRelata = record.showInRelata !== false;
    if (inOntology && inRelata) return "both";
    if (inOntology) return "ontology";
    if (inRelata) return "relata";
    return "hidden";
  }

  function applyPredicateViewPlacement(record, placement) {
    if (!record) return null;
    const normalized = String(placement || "both").trim().toLowerCase();
    record.showInOntology = normalized === "both" || normalized === "ontology";
    record.showInRelata = normalized === "both" || normalized === "relata";
    return record;
  }

  return {
    applyPredicateViewPlacement,
    cloneRowsForWorkspace,
    defaultPredicateObjectMode,
    getPredicateViewPlacement,
    getRecordOrderValue,
    normalizePredicateMode,
    normalizePredicateRecord,
    normalizeWorkspaceSnapshot,
    selectLatestRecord,
  };
});
