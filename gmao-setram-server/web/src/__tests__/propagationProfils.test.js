import { describe, it, expect } from 'vitest';
import { createDemoApi } from '../demo/apiDemo.js';
import { genererDemo } from '../../../server/src/demo/donnees.js';
import { propagerDroitsProfil, definitionProfil } from '../../../server/src/profils-core.js';

const MDP = Object.fromEntries(genererDemo().users.map((u) => [u.id, u.password]));

describe('modification d\'un profil répercutée sur les comptes', () => {
  it('logique pure : ajout et retrait de modules, décochages manuels conservés', () => {
    const avant = { volets: [1, 2, 3], tousSystemes: false }, apres = { volets: [1, 3, 5], tousSystemes: false };
    const d = { Alger: { systems: ['CFO'], volets: [1, 2] }, Oran: { systems: ['LAC'], volets: [1, 3] } };
    expect(propagerDroitsProfil(d, avant, apres)).toEqual({ Alger: { systems: ['CFO'], volets: [1, 5] }, Oran: { systems: ['LAC'], volets: [1, 3, 5] } });
    expect(definitionProfil('Exploitation', { volets: [0] }).volets).toEqual([0, 1]);
    expect(definitionProfil('Exploitation', null).volets).toEqual([1]);
  });

  it('démo : le super admin ajoute Arborescence au profil Exploitation, le compte démo y a accès', async () => {
    const api = createDemoApi({ stockage: null });
    await api.login('demo.exploitation', MDP['demo.exploitation']);
    expect(Object.values((await api.me()).user.droits).every((g) => !g.volets.includes(0))).toBe(true);

    await api.login('demo.admin', MDP['demo.admin']);
    await api.save('profils', 'Exploitation', { unit: '', data: { surcharge: true, volets: [1, 0] } });

    await api.login('demo.exploitation', MDP['demo.exploitation']);
    const droits = (await api.me()).user.droits;
    expect(Object.values(droits).every((g) => g.volets.includes(0) && g.volets.includes(1))).toBe(true);
    expect((await api.list('arborescence')).items.length).toBeGreaterThan(0);

    await api.login('demo.admin', MDP['demo.admin']);
    await api.remove('profils', 'Exploitation');                       // réglage retiré : retour au profil d'origine
    await api.login('demo.exploitation', MDP['demo.exploitation']);
    expect(Object.values((await api.me()).user.droits).every((g) => g.volets.join() === '1')).toBe(true);
  });
});
