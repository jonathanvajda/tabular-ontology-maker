import { createStatusPresentation, normalizeFeedbackSeverity } from './status.js';
import { createUiFeedbackValidationError } from './feedback-error.js';

/**
 * Infers a toast severity from common status words.
 *
 * @param {string} title Title or status text.
 * @returns {'success'|'warning'|'error'|'info'}
 */
export function inferToastSeverity(title) {
  const text = String(title || '').toLowerCase();
  if (text.includes('fail') || text.includes('error')) return 'error';
  if (text.includes('warn') || text.includes('removed') || text.includes('deleted') || text.includes('cleared')) return 'warning';
  if (text.includes('success') || text.includes('saved') || text.includes('created') || text.includes('loaded')) return 'success';
  return 'info';
}

/**
 * Creates or reuses a toast container.
 *
 * @param {{container?: Element|null, containerId?: string, documentRef?: Document}} [options]
 * @returns {Element|null}
 */
export function resolveToastContainer(options = {}) {
  if (options.container) return options.container;
  const doc = options.documentRef || globalThis.document;
  if (!doc) return null;
  const id = options.containerId || 'toast-container';
  let container = doc.getElementById?.(id) || null;
  if (!container && doc.createElement && doc.body) {
    container = doc.createElement('div');
    container.id = id;
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-atomic', 'true');
    doc.body.appendChild(container);
  }
  return container;
}

/**
 * Renders a dismissible toast notification.
 *
 * @param {{message?: any, title?: any, severity?: string, container?: Element|null, containerId?: string, documentRef?: Document, windowRef?: Window, timeoutMs?: number, maxToasts?: number, classPrefix?: string}} options
 * @returns {{ok: true, value: {element: Element, severity: string}|null}|{ok: false, error: UiFeedbackError}}
 */
export function renderToastNotification(options = {}) {
  const container = resolveToastContainer(options);
  if (!container) return { ok: true, value: null };

  const doc = options.documentRef || container.ownerDocument || globalThis.document;
  const win = options.windowRef || globalThis.window;
  if (!doc?.createElement) {
    return { ok: false, error: createUiFeedbackValidationError('A DOM document is required to render a toast.', 'TOAST_DOCUMENT_REQUIRED') };
  }

  try {
    const title = String(options.title ?? '');
    const message = String(options.message ?? title);
    const severity = normalizeFeedbackSeverity(options.severity || inferToastSeverity(title || message), 'info');
    const presentation = createStatusPresentation({ message, severity });
    const classPrefix = options.classPrefix || 'toast';
    const maxToasts = Number.isFinite(options.maxToasts) ? Number(options.maxToasts) : 8;

    while (container.children && container.children.length >= maxToasts) {
      container.firstElementChild?.remove?.();
    }

    const toast = doc.createElement('div');
    toast.className = `${classPrefix} ${classPrefix}--${severity}`;
    toast.setAttribute('role', presentation.role);
    toast.setAttribute('aria-live', presentation.ariaLive);
    toast.setAttribute('data-toast-severity', severity);
    toast.tabIndex = 0;

    const text = doc.createElement('span');
    text.textContent = title && message && title !== message ? `${title}: ${message}` : message;
    toast.appendChild(text);
    container.appendChild(toast);

    const removeToast = () => toast.remove?.();
    const timeoutMs = Number.isFinite(options.timeoutMs) ? Number(options.timeoutMs) : 2600;
    if (win?.setTimeout && timeoutMs > 0) {
      win.setTimeout(removeToast, timeoutMs);
    }
    toast.addEventListener?.('click', removeToast);
    return { ok: true, value: { element: toast, severity } };
  } catch (error) {
    return {
      ok: false,
      error: createUiFeedbackValidationError('Unable to render toast notification.', 'TOAST_RENDER_FAILED', { error })
    };
  }
}
