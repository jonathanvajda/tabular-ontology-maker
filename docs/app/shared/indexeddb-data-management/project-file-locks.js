const lockQueues = new Map();

/**
 * Runs a function under a browser Web Lock when available, with a deterministic
 * in-process Promise queue fallback for tests and browsers without Web Locks.
 *
 * @template T
 * @param {string} lockName Stable lock name.
 * @param {() => Promise<T>|T} operation Work to serialize.
 * @param {object} [options]
 * @param {LockManager|null} [options.lockManager=globalThis.navigator?.locks] Optional Web Locks implementation.
 * @returns {Promise<T>} Operation result.
 */
export async function runWithProjectFileLock(lockName, operation, { lockManager = globalThis.navigator?.locks } = {}) {
  if (lockManager && typeof lockManager.request === 'function') {
    return lockManager.request(lockName, () => operation());
  }
  const previous = lockQueues.get(lockName) || Promise.resolve();
  const next = previous.then(() => operation(), () => operation());
  lockQueues.set(lockName, next.catch(() => {}));
  return next;
}

/**
 * Clears fallback lock queues. Intended for tests only.
 *
 * @returns {void}
 */
export function resetProjectFileLockQueuesForTests() {
  lockQueues.clear();
}
