const { parseFileExtension } = require('../path/to/your/module');

describe('parseFileExtension', () => {
  test('returns correct extension for standard filename', () => {
    expect(parseFileExtension('myfile.csv')).toBe('csv');
    expect(parseFileExtension('document.TSV')).toBe('tsv');
    expect(parseFileExtension('archive.XLSX')).toBe('xlsx');
  });

  test('handles filenames with multiple dots', () => {
    expect(parseFileExtension('2025.07.21.data.xlsx')).toBe('xlsx');
  });

  test('returns empty string for no extension', () => {
    expect(parseFileExtension('myfile')).toBe('');
  });

  test('returns empty string for trailing dot', () => {
    expect(parseFileExtension('weirdname.')).toBe('');
  });

  test('returns empty string for invalid input types', () => {
    expect(parseFileExtension(null)).toBe('');
    expect(parseFileExtension(undefined)).toBe('');
    expect(parseFileExtension(123)).toBe('');
    expect(parseFileExtension({})).toBe('');
  });
});
