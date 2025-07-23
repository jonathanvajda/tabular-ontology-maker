const { detectFormatByExtension } = require('../path/to/your/module');

describe('detectFormatByExtension', () => {
  test("recognizes 'csv' as spreadsheet", () => {
    expect(detectFormatByExtension('csv')).toBe('spreadsheet');
  });

  test("recognizes 'XLSX' extension in lowercase", () => {
    expect(detectFormatByExtension('XLSX'.toLowerCase())).toBe('spreadsheet');
  });

  test("recognizes 'ttl' as ontology", () => {
    expect(detectFormatByExtension('ttl')).toBe('ontology');
  });

  test("recognizes 'JSONLD' as ontology", () => {
    expect(detectFormatByExtension('JSONLD'.toLowerCase())).toBe('ontology');
  });

  test("returns 'unsupported' for unknown extension", () => {
    expect(detectFormatByExtension('exe')).toBe('unsupported');
    expect(detectFormatByExtension('')).toBe('unsupported');
  });

  test("handles invalid input types", () => {
    expect(detectFormatByExtension(null)).toBe('unsupported');
    expect(detectFormatByExtension(123)).toBe('unsupported');
    expect(detectFormatByExtension({ })).toBe('unsupported');
  });
});
