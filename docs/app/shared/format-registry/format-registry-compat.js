/**
 * @file Transitional browser surface for Tabular Ontology Maker UMD helpers.
 *
 * The main app core imports the promoted ESM modules directly. This bridge is
 * only for legacy non-module utility scripts that still resolve helpers through
 * `globalThis.FormatRegistry` at runtime.
 */
import {
  createFormatExtensionMap,
  createFormatMimeTypeMap,
  getFilenameExtension,
  getInputKindForExtension,
  getMimeTypeForFormatKey,
  getOutputMimeTypeForExtension,
  getPreferredExtensionForMimeType,
  getSupportedMimeTypeForFilename,
  normalizeSupportedMimeType
} from './mime-registry.js';
import { getN3ParserFormatForMimeType } from './rdf-parser-formats.js';
import {
  downloadTextFile,
  getAcceptExtensions,
  guessRdfMimeTypeFromText
} from './browser-file-actions.js';

globalThis.FormatRegistry = {
  ...(globalThis.FormatRegistry || {}),
  createFormatExtensionMap,
  createFormatMimeTypeMap,
  downloadTextFile,
  getAcceptExtensions,
  getFilenameExtension,
  getInputKindForExtension,
  getMimeTypeForFormatKey,
  getN3ParserFormatForMimeType,
  getOutputMimeTypeForExtension,
  getPreferredExtensionForMimeType,
  getSupportedMimeTypeForFilename,
  guessRdfMimeTypeFromText,
  normalizeSupportedMimeType
};
