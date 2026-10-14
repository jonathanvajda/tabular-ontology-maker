/**
 * @file YAML serialization helpers for report exports.
 *
 * The serializer intentionally accepts ordinary JavaScript values and preserves
 * the caller's keys. It does not invent durable data-property names.
 */

/**
 * Serializes a JavaScript value to a conservative YAML document.
 *
 * @param {unknown} value Value to serialize.
 * @param {object} [options]
 * @param {boolean} [options.trailingNewline=true] Append a final newline.
 * @returns {string} YAML text.
 */
export function serializeReportValueToYaml(value, { trailingNewline = true } = {}) {
  const text = serializeYamlNode(value, 0);
  return trailingNewline ? `${text}\n` : text;
}

function serializeYamlNode(value, indent) {
  if (Array.isArray(value)) return serializeYamlArray(value, indent);
  if (isPlainObject(value)) return serializeYamlObject(value, indent);
  return serializeYamlScalar(value);
}

function serializeYamlArray(values, indent) {
  if (!values.length) return '[]';
  const spaces = ' '.repeat(indent);
  const childIndent = indent + 2;
  return values.map((item) => {
    if (Array.isArray(item) || isPlainObject(item)) {
      const nested = serializeYamlNode(item, childIndent);
      return `${spaces}- ${indentNestedYaml(nested, childIndent).trimStart()}`;
    }
    return `${spaces}- ${serializeYamlScalar(item)}`;
  }).join('\n');
}

function serializeYamlObject(value, indent) {
  const entries = Object.entries(value);
  if (!entries.length) return '{}';
  const spaces = ' '.repeat(indent);
  const childIndent = indent + 2;
  return entries.map(([key, item]) => {
    const safeKey = serializeYamlKey(key);
    if (Array.isArray(item) || isPlainObject(item)) {
      return `${spaces}${safeKey}:\n${indentNestedYaml(serializeYamlNode(item, childIndent), childIndent)}`;
    }
    return `${spaces}${safeKey}: ${serializeYamlScalar(item)}`;
  }).join('\n');
}

function serializeYamlScalar(value) {
  if (value == null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return JSON.stringify(String(value));
}

function serializeYamlKey(key) {
  return /^[A-Za-z_][A-Za-z0-9_-]*$/.test(key) ? key : JSON.stringify(key);
}

function indentNestedYaml(text, indent) {
  const spaces = ' '.repeat(indent);
  return text.split('\n').map((line) => `${spaces}${line}`).join('\n');
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
