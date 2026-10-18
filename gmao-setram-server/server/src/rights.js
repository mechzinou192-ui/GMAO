import { config } from './config.js';

export * from './rights-core.js';

const arr = (v) => (Array.isArray(v) ? v : []);

// Validation de la forme des droits envoyés par l'administrateur
export function validateDroits(droits) {
  if (droits == null || typeof droits !== 'object' || Array.isArray(droits)) return 'droits invalides';
  const out = {};
  for (const [unit, g] of Object.entries(droits)) {
    if (!config.units.includes(unit)) return `unité inconnue : ${unit}`;
    if (!g || typeof g !== 'object') return `droits invalides pour ${unit}`;
    const systems = arr(g.systems);
    const volets = arr(g.volets);
    if (!systems.every(s => typeof s === 'string' && s.length <= 40)) return `systèmes invalides (${unit})`;
    if (!volets.every(v => Number.isInteger(v) && v >= 0 && v <= 6)) return `volets invalides (${unit})`;
    out[unit] = { systems, volets, ...(Array.isArray(g.kpi) ? { kpi: g.kpi.map(String) } : {}) };
  }
  return { value: out };
}
