/**
 * @file Browser File/Blob ArrayBuffer reading adapter.
 */

/**
 * @typedef {Object} ReadFileAsArrayBufferOptions
 * @property {AbortSignal} [signal] - Optional signal used to abort a FileReader read.
 * @property {typeof FileReader} [FileReaderConstructor] - Browser FileReader constructor, mainly supplied by tests.
 * @property {boolean} [preferNativeArrayBuffer=true] - Use `file.arrayBuffer()` when available and no signal is needed.
 */

/**
 * Reads a browser File or Blob as an ArrayBuffer.
 *
 * The modern `Blob.arrayBuffer()` path is preferred when available. FileReader
 * is used when abort support is requested or when the native method is absent.
 *
 * @param {{arrayBuffer?: Function} | Blob | File} file - Browser File/Blob-like object.
 * @param {ReadFileAsArrayBufferOptions} [options] - Read options and test seams.
 * @returns {Promise<ArrayBuffer>} Binary file content.
 */
export function readFileAsArrayBuffer(file, options = {}) {
  assertReadableFile(file, 'readFileAsArrayBuffer');
  if (shouldUseNativeArrayBuffer(file, options)) {
    return file.arrayBuffer().then(assertArrayBufferResult);
  }

  return readWithFileReader(file, options);
}

function shouldUseNativeArrayBuffer(file, options) {
  return options.preferNativeArrayBuffer !== false
    && typeof file.arrayBuffer === 'function'
    && !options.signal;
}

/**
 * @param {Blob | File | any} file
 * @param {ReadFileAsArrayBufferOptions} options
 * @returns {Promise<ArrayBuffer>}
 */
function readWithFileReader(file, options) {
  const FileReaderConstructor = options.FileReaderConstructor || globalThis.FileReader;
  if (typeof FileReaderConstructor !== 'function') {
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
      reader = new FileReaderConstructor();
      reader.onerror = () => {
        finish(reject, reader.error || new Error('Failed to read file as ArrayBuffer.'));
      };
      reader.onabort = () => {
        finish(reject, createAbortError(options.signal?.reason));
      };
      reader.onload = () => {
        try {
          finish(resolve, assertArrayBufferResult(reader.result));
        } catch (err) {
          finish(reject, err);
        }
      };
      options.signal?.addEventListener?.('abort', abortRead, { once: true });
      reader.readAsArrayBuffer(file);
    } catch (err) {
      finish(reject, err);
    }
  });
}

function assertArrayBufferResult(value) {
  if (value instanceof ArrayBuffer) return value;
  throw new TypeError('File read did not produce an ArrayBuffer.');
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
