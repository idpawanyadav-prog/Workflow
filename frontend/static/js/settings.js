// User preferences store, persisted to localStorage.
const KEY = 'ws-settings';

const DEFAULTS = {
  ai: { provider: 'auto', baseUrl: '', apiKey: '', model: '' },
  play: { showSummary: true },
  properties: { collapsible: true },
};

let cache = null;

function deepMerge(base, patch) {
  const out = { ...base };
  for (const k of Object.keys(patch || {})) {
    const pv = patch[k];
    const bv = base[k];
    if (
      pv && typeof pv === 'object' && !Array.isArray(pv) &&
      bv && typeof bv === 'object' && !Array.isArray(bv)
    ) {
      out[k] = deepMerge(bv, pv);
    } else {
      out[k] = pv;
    }
  }
  return out;
}

export function getSettings() {
  if (cache) return cache;
  try {
    cache = deepMerge(DEFAULTS, JSON.parse(localStorage.getItem(KEY) || '{}'));
  } catch {
    cache = deepMerge({}, DEFAULTS);
  }
  return cache;
}

export function saveSettings(patch) {
  const next = deepMerge(getSettings(), patch);
  cache = next;
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
