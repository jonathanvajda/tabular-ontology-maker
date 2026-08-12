import { createUiFeedbackValidationError } from './feedback-error.js';

const THEME_VALUES = Object.freeze(['light', 'dark']);

/**
 * Normalizes a UI theme preference.
 *
 * @param {string} value Candidate value.
 * @param {'light'|'dark'} [fallback='light'] Fallback value.
 * @returns {'light'|'dark'}
 */
export function normalizeThemePreference(value, fallback = 'light') {
  const normalized = String(value || '').trim().toLowerCase();
  return THEME_VALUES.includes(normalized) ? /** @type {any} */ (normalized) : fallback;
}

/**
 * Applies a theme preference to a root element and optional toggle control.
 *
 * @param {{theme: string, rootElement?: Element|null, toggleElement?: Element|null, attribute?: string}} input
 * @returns {{ok: true, value: 'light'|'dark'}|{ok: false, error: UiFeedbackError}}
 */
export function applyThemePreference(input) {
  const theme = normalizeThemePreference(input?.theme, 'light');
  const root = input?.rootElement || globalThis.document?.documentElement || null;
  const toggle = input?.toggleElement || null;
  const attribute = input?.attribute || 'data-theme';

  try {
    root?.setAttribute?.(attribute, theme);
    toggle?.setAttribute?.('aria-pressed', theme === 'dark' ? 'true' : 'false');
    if (toggle) {
      toggle.title = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    }
    return { ok: true, value: theme };
  } catch (error) {
    return {
      ok: false,
      error: createUiFeedbackValidationError('Unable to apply theme preference.', 'THEME_APPLY_FAILED', { error })
    };
  }
}

/**
 * Reads a theme preference from an injected settings store.
 *
 * @param {{readSettingValue: (key: string, fallbackValue?: any) => Promise<any>}} settingsStore Shared settings store.
 * @param {{settingKey: string, fallback?: 'light'|'dark'|null}} options
 * @returns {Promise<'light'|'dark'|null>}
 */
export async function readThemePreference(settingsStore, options) {
  const key = String(options?.settingKey || '').trim();
  if (!key) throw createUiFeedbackValidationError('Theme setting key is required.', 'THEME_SETTING_KEY_REQUIRED');
  const fallback = options?.fallback ?? null;
  const value = await settingsStore.readSettingValue(key, fallback);
  return value === 'light' || value === 'dark' ? value : fallback;
}

/**
 * Writes a theme preference to an injected settings store.
 *
 * @param {{writeSettingValue: (key: string, value: any) => Promise<any>}} settingsStore Shared settings store.
 * @param {'light'|'dark'} theme Preference value.
 * @param {{settingKey: string}} options
 * @returns {Promise<'light'|'dark'>}
 */
export async function writeThemePreference(settingsStore, theme, options) {
  const key = String(options?.settingKey || '').trim();
  if (!key) throw createUiFeedbackValidationError('Theme setting key is required.', 'THEME_SETTING_KEY_REQUIRED');
  const normalized = normalizeThemePreference(theme, 'light');
  await settingsStore.writeSettingValue(key, normalized);
  return normalized;
}

/**
 * Toggles, applies, and optionally persists the next theme preference.
 *
 * @param {{currentTheme?: string, rootElement?: Element|null, toggleElement?: Element|null, settingsStore?: {writeSettingValue: (key: string, value: any) => Promise<any>}, settingKey?: string}} input
 * @returns {Promise<'light'|'dark'>}
 */
export async function toggleThemePreference(input = {}) {
  const current = normalizeThemePreference(input.currentTheme || input.rootElement?.getAttribute?.('data-theme'), 'light');
  const next = current === 'dark' ? 'light' : 'dark';
  const applied = applyThemePreference({
    theme: next,
    rootElement: input.rootElement,
    toggleElement: input.toggleElement
  });
  if (!applied.ok) throw applied.error;
  if (input.settingsStore && input.settingKey) {
    await writeThemePreference(input.settingsStore, next, { settingKey: input.settingKey });
  }
  return next;
}
