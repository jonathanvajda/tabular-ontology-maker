/**
 * @file Browser File/Blob text reading adapter.
 *
 * This module owns only the browser file-read boundary. It does not parse RDF,
 * CSV, JSON, spreadsheets, or any app-specific data model.
 */

/**
 * @typedef {Object} ReadFileAsTextOptions
 * @property {string} [encoding] - Optional text encoding passed to FileReader.
 * @property {AbortSignal} [signal] - Optional signal used to abort a FileReader read.
 * @property {typeof FileReader} [FileReaderCtor] - Test seam or browser FileReader constructor.
 * @property {boolean} [preferNativeText=true] - Use `file.text()` when available and no encoding/signal is needed.
 */

/**
 * Reads a browser File or Blob as text.
 *
 * The function prefers the modern `Blob.text()` API when it is sufficient and
 * falls back to FileReader when an encoding, abort signal, or older browser
 * requires it. Rejections preserve the native FileReader error when available
 * and otherwise use a stable fallback Error message.
 *
 * @param {{text?: Function} | Blob | File} file - Browser File/Blob-like object.
 * @param {ReadFileAsTextOptions} [options] - Read options and test seams.
 * @returns {Promise<string>} Text content.
 */
export function readFileAsText(file, options = {}) {
  assertReadableFile(file, 'readFileAsText');
  if (shouldUseNativeText(file, options)) {
    return file.text().then((value) => String(value ?? ''));
  }

  return readWithFileReader(file, 'text', options);
}

function shouldUseNativeText(file, options) {
  return options.preferNativeText !== false
    && typeof file.text === 'function'
    && !options.encoding
    && !options.signal;
}

/**
 * Reads a file through FileReader with consistent error and abort behavior.
 *
 * @param {Blob | File | any} file
 * @param {'text'} mode
 * @param {ReadFileAsTextOptions} options
 * @returns {Promise<string>}
 */
function readWithFileReader(file, mode, options) {
  const FileReaderCtor = options.FileReaderCtor || globalThis.FileReader;
  if (typeof FileReaderCtor !== 'function') {
    return Promise.reject(new Error('FileReader is not available in this environment.'));
  }

  if (options.signal?.aborted) {
    return Promise.reject(createAbortError(options.signal.reason));
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let reader;

    const cleanup = () => {
      options.signal?.removeEventListener?.('abort', abortRead);
    };
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn(value);
    };
    const abortRead = () => {
      try {
        reader?.abort?.();
      } catch (_) {
        // Ignore abort cleanup failures; the returned promise reports abort.
      }
      finish(reject, createAbortError(options.signal?.reason));
    };

    try {
      reader = new FileReaderCtor();
      reader.onerror = () => {
        finish(reject, reader.error || new Error('Failed to read file as text.'));
      };
      reader.onabort = () => {
        finish(reject, createAbortError(options.signal?.reason));
      };
      reader.onload = () => {
        finish(resolve, String(reader.result ?? ''));
      };
      options.signal?.addEventListener?.('abort', abortRead, { once: true });
      reader.readAsText(file, options.encoding);
    } catch (err) {
      finish(reject, err);
    }
  });
}

function assertReadableFile(file, functionName) {
  if (!file || (typeof file !== 'object' && typeof file !== 'function')) {
    throw new TypeError(`${functionName} expected a File or Blob-like object.`);
  }
}

function createAbortError(reason) {
  if (reason instanceof Error) return reason;
  const error = new Error(reason ? String(reason) : 'File read aborted.');
  error.name = 'AbortError';
  return error;
}

