import { describe, it, expect } from 'vitest';
import { typeLabel } from '../ui/base.jsx';

describe('Nature de la maintenance corrective', () => {
  it('Curative, Palliative et Sinistre sont reprises dans le type de la DI / de l’OT', () => {
    for (const n of ['Curative', 'Palliative', 'Sinistre']) expect(typeLabel({ typeMaintenance: 'Corrective', sousType: n })).toBe('Corrective — ' + n);
    expect(typeLabel({ typeMaintenance: 'Corrective' })).toBe('Corrective — Curative');   // valeur par défaut inchangée
  });
});
