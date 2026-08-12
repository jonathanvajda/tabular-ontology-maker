const LOG_LEVELS = Object.freeze(['debug', 'info', 'warn', 'error']);

/**
 * Normalizes a log level.
 *
 * @param {string} value Candidate level.
 * @param {'debug'|'info'|'warn'|'error'} [fallback='info'] Fallback.
 * @returns {'debug'|'info'|'warn'|'error'}
 */
export function normalizeLogLevel(value, fallback = 'info') {
  const normalized = String(value || '').trim().toLowerCase();
  return LOG_LEVELS.includes(normalized) ? /** @type {any} */ (normalized) : fallback;
}

/**
 * Creates a scoped console logger with a single enabled flag.
 *
 * @param {{scope?: string, enabled?: boolean, consoleRef?: Console}} [options]
 * @returns {{debug: (event: string, data?: any) => void, info: (event: string, data?: any) => void, warn: (event: string, data?: any) => void, error: (event: string, data?: any) => void, emit: (level: string, event: string, data?: any) => void}}
 */
export function createScopedConsoleLogger(options = {}) {
  const scope = String(options.scope || 'app').trim() || 'app';
  const enabled = options.enabled !== false;
  const consoleRef = options.consoleRef || globalThis.console;

  function emit(level, event, data = undefined) {
    if (!enabled || !consoleRef) return;
    const normalized = normalizeLogLevel(level);
    const method = typeof consoleRef[normalized] === 'function' ? normalized : 'log';
    const label = `[${scope}] ${String(event || '').trim() || 'event'}`;
    consoleRef[method](label, data ?? '');
  }

  return Object.freeze({
    debug: (event, data) => emit('debug', event, data),
    info: (event, data) => emit('info', event, data),
    warn: (event, data) => emit('warn', event, data),
    error: (event, data) => emit('error', event, data),
    emit
  });
}

/**
 * Runs an async action and logs failures without swallowing them.
 *
 * @template T
 * @param {{error?: (event: string, data?: any) => void}} logger Logger-like object.
 * @param {string} eventName Event name for failures.
 * @param {() => Promise<T>} action Async action.
 * @returns {Promise<T>}
 */
export async function runLoggedAsyncAction(logger, eventName, action) {
  try {
    return await action();
  } catch (error) {
    logger?.error?.(`${eventName}.failed`, { error });
    throw error;
  }
}
