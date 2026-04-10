import { iriPrefixes } from "@/lib/constants";
import type { VocabRecord } from "@/types";

export class VocabularyIndex {
  private readonly records: VocabRecord[] = [];
  private readonly byIri = new Map<string, VocabRecord>();
  private readonly byCurie = new Map<string, VocabRecord>();
  private readonly byLabel = new Map<string, VocabRecord>();

  addEntries(entries: Partial<VocabRecord>[], source = "External") {
    for (const entry of entries) {
      if (!entry.iri || this.byIri.has(entry.iri)) continue;

      const record: VocabRecord = {
        iri: entry.iri,
        curie: entry.curie || this.iriToCurie(entry.iri),
        label: entry.label || "",
        type: entry.type || "Class",
        altLabels: Array.isArray(entry.altLabels) ? [...entry.altLabels] : [],
        source: entry.source || source,
        deprecated: Boolean(entry.deprecated),
      };

      this.records.push(record);
      this.byIri.set(record.iri, record);
      if (record.curie) this.byCurie.set(record.curie, record);
      if (record.label) this.byLabel.set(record.label.toLowerCase(), record);
      record.altLabels.forEach((alt) => {
        if (alt) this.byLabel.set(String(alt).toLowerCase(), record);
      });
    }
  }

  async loadFrom(url: string, source = "External") {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (!Array.isArray(payload)) throw new Error("Vocabulary payload must be an array");
    this.addEntries(payload, source);
  }

  iriToCurie(iri: string) {
    for (const [prefix, base] of Object.entries(iriPrefixes)) {
      if (iri.startsWith(base)) return `${prefix}:${iri.slice(base.length)}`;
    }
    return null;
  }

  search(query: string, options: { max?: number; typeHint?: string | null } = {}) {
    const term = (query || "").trim().toLowerCase();
    if (!term) return [];

    const pool = options.typeHint ? this.records.filter((item) => item.type === options.typeHint) : this.records;
    const score = (record: VocabRecord) => {
      const fields = [record.label, record.curie || "", record.iri, ...record.altLabels].map((field) => field.toLowerCase());
      if (fields.some((field) => field === term)) return 0;
      if (fields.some((field) => field.startsWith(term))) return 1;
      if (fields.some((field) => field.includes(term))) return 2;
      return 9;
    };

    return pool
      .map((record) => [score(record), record] as const)
      .filter(([scoreValue]) => scoreValue < 9)
      .sort((a, b) => a[0] - b[0] || a[1].label.localeCompare(b[1].label))
      .slice(0, options.max || 50)
      .map(([, record]) => record);
  }

  getByIri(iri: string) {
    return this.byIri.get(iri);
  }

  getByCurie(curie: string) {
    return this.byCurie.get(curie);
  }

  resolveToIri(value: string) {
    const text = String(value || "").trim();
    const maybeCode = text.includes("—") ? text.split("—").pop()?.trim() || text : text;
    if (/^https?:\/\/\S+$/i.test(maybeCode) || /^urn:[^:\s]+:.+/i.test(maybeCode)) return maybeCode;
    if (/^<[^>\s]+>$/.test(maybeCode)) return maybeCode.slice(1, -1);
    if (maybeCode.includes(":")) {
      const [prefix, local] = maybeCode.split(":");
      const base = iriPrefixes[prefix];
      if (base) return `${base}${local}`;
      const byCurie = this.byCurie.get(maybeCode);
      if (byCurie) return byCurie.iri;
    }
    return null;
  }
}
