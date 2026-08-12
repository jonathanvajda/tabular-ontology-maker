import { createUiFeedbackValidationError } from './feedback-error.js';

const STATUS_SEVERITIES = Object.freeze(['info', 'success', 'warning', 'error', 'idle', 'busy']);

/**
 * Normalizes a user-feedback severity token.
 *
 * @param {string} value Candidate severity.
 * @param {string} [fallback='info'] Fallback severity.
 * @returns {'info'|'success'|'warning'|'error'|'idle'|'busy'}
 */
export function normalizeFeedbackSeverity(value, fallback = 'info') {
  const normalized = String(value || '').trim().toLowerCase();
  return STATUS_SEVERITIES.includes(normalized) ? /** @type {any} */ (normalized) : /** @type {any} */ (fallback);
}

/**
 * Builds a normalized status presentation object without touching the DOM.
 *
 * @param {{message?: any, severity?: string, busy?: boolean, metadata?: any}} input
 * @returns {{message: string, severity: 'info'|'success'|'warning'|'error'|'idle'|'busy', ariaLive: 'polite'|'assertive', role: 'status'|'alert', busy: boolean, metadata: any}}
 */
export function createStatusPresentation(input = {}) {
  const busy = input.busy === true;
  const severity = busy ? 'busy' : normalizeFeedbackSeverity(input.severity, 'info');
  const message = String(input.message ?? '');
  return Object.freeze({
    message,
    severity,
    ariaLive: severity === 'error' ? 'assertive' : 'polite',
    role: severity === 'error' ? 'alert' : 'status',
    busy,
    metadata: input.metadata ?? null
  });
}

/**
 * Renders a status presentation into an existing DOM element.
 *
 * @param {Element|null|undefined} target Existing status element.
 * @param {{message?: any, severity?: string, busy?: boolean, metadata?: any}|string} presentation Status input or message.
 * @param {{classPrefix?: string}} [options]
 * @returns {{ok: true, value: Element|null}|{ok: false, error: UiFeedbackError}}
 */
export function renderStatusMessage(target, presentation, options = {}) {
  if (!target) return { ok: true, value: null };
  const normalized = typeof presentation === 'string'
    ? createStatusPresentation({ message: presentation })
    : createStatusPresentation(presentation);
  const classPrefix = options.classPrefix || 'status';

  try {
    target.textContent = normalized.message;
    target.setAttribute?.('role', normalized.role);
    target.setAttribute?.('aria-live', normalized.ariaLive);
    target.setAttribute?.('aria-busy', normalized.busy ? 'true' : 'false');
    target.setAttribute?.('data-status-severity', normalized.severity);
    target.classList?.remove?.(
      `${classPrefix}--info`,
      `${classPrefix}--success`,
      `${classPrefix}--warning`,
      `${classPrefix}--error`,
      `${classPrefix}--idle`,
      `${classPrefix}--busy`
    );
    target.classList?.add?.(`${classPrefix}--${normalized.severity}`);
    return { ok: true, value: target };
  } catch (error) {
    return {
      ok: false,
      error: createUiFeedbackValidationError('Unable to render status message.', 'STATUS_RENDER_FAILED', { error })
    };
  }
}

/**
 * Clears a status element and restores an idle presentation.
 *
 * @param {Element|null|undefined} target Existing status element.
 * @param {{message?: string, classPrefix?: string}} [options]
 * @returns {{ok: true, value: Element|null}|{ok: false, error: UiFeedbackError}}
 */
export function clearStatusMessage(target, options = {}) {
  return renderStatusMessage(target, {
    message: options.message || '',
    severity: 'idle',
    busy: false
  }, { classPrefix: options.classPrefix });
}
