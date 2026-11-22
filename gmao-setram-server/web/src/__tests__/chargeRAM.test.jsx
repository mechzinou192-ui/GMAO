import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';

const exporterXlsx = vi.fn();
vi.mock('../excel.js', async (orig) => ({ ...(await orig()), exporterXlsx: (...a) => exporterXlsx(...a) }));
import { IndicateursPage } from '../pages/Indicateurs.jsx';

const EQ = { code: 'CFO.ALG.SST.01', unit: 'Alger', system: 'CFO', subCode: 'SST', nom: 'Transformateur T1', sousEquip: [] };
const now = new Date();
const mois = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
const jour = mois + '-' + String(now.getDate()).padStart(2, '0');   // aujourd'hui : toujours dans le mois et dans la période par défaut
const OT = { code: 'OT-PREV-1', eq: EQ.code, nom: EQ.nom, type: 'Préventive', plan: 'PLAN-1', etat: 'Clôturé', dateGeneration: jour, dateCloture: jour,
  intervenants: [{ nom: 'A. Haddad', fonction: 'Technicien', temps: 3, logistique: 1 }, { nom: 'M. Rahmani', fonction: 'Technicien', temps: 4, logistique: 0 }] };   // 8 h de charge GMAO

const afficher = (extra = {}) => {
  const onSave = vi.fn();
  render(<IndicateursPage unit="Alger" unitesRH={['Alger']} dis={[]} bts={[OT]} planning={[]} equipements={[EQ]} pieces={[]} systemsList={[]} treeStruct={{}}
    chargesRAM={[]} onSaveChargeRAM={onSave} peutSaisirRAM {...extra} />);
  fireEvent.click(screen.getByText('Ressources humaines'));
  return onSave;
};
const NOM_MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'][now.getMonth()];

beforeEach(() => { cleanup(); exporterXlsx.mockClear(); });
afterEach(cleanup);

describe('charge RAM mensuelle (Indicateurs → Ressources humaines)', () => {
  it('la saisie du mois est transmise pour être sauvegardée (unité + mois), sans passer par un bouton', () => {
    const onSave = afficher();
    const champ = screen.getByLabelText('Charge RAM ' + NOM_MOIS);
    fireEvent.change(champ, { target: { value: '10' } });
    fireEvent.blur(champ);
    expect(onSave).toHaveBeenCalledWith('Alger', mois, 10);
  });
  it('le taux d’efficience du mois se calcule seul : charge GMAO ÷ charge RAM saisie', () => {
    afficher({ chargesRAM: [{ code: 'RAM-Alger-' + mois, unit: 'Alger', mois, chargeRAM: 10 }] });
    const ligne = screen.getByTestId('rh-mois-' + mois);
    expect(ligne.textContent).toContain('8,0 h');          // charge GMAO : 3 + 1 + 4
    expect(ligne.textContent).toContain('80,0 %');         // 8 ÷ 10
    expect(screen.getByTestId('rh-ram').textContent).toContain('Taux d\'efficience mensuel');
  });
  it('mois sans charge RAM : pas de taux ; saisie en lecture seule pour un profil consultation', () => {
    afficher({ peutSaisirRAM: false });
    expect(screen.queryByLabelText('Charge RAM ' + NOM_MOIS)).toBeNull();
    expect(screen.getByTestId('rh-mois-' + mois).textContent).toContain('—');
  });
  it('export à deux angles : « Par intervenant » et « Par unité » (charge RAM sauvegardée)', () => {
    afficher({ chargesRAM: [{ code: 'RAM-Alger-' + mois, unit: 'Alger', mois, chargeRAM: 10 }] });
    fireEvent.click(within(screen.getByTestId('rh-ram')).getByText(/Export/));
    expect(exporterXlsx).toHaveBeenCalledTimes(1);
    const { feuilles } = exporterXlsx.mock.calls[0][0];
    expect(feuilles.map((f) => f.nom)).toEqual(['Par intervenant', 'Par unité']);
    const unite = feuilles[1];
    expect(unite.colonnes.map((c) => c.h)).toEqual(['Unité', 'Mois', 'Charge GMAO (h)', 'Charge RAM saisie (h)', 'Taux d\'efficience (%)']);
    expect(unite.lignes).toHaveLength(13);                                                    // 12 mois + total de l'année
    expect(unite.lignes.find((l) => l[1].startsWith(NOM_MOIS))).toEqual(['Alger', NOM_MOIS + ' ' + now.getFullYear(), 8, 10, 80]);
    expect(feuilles[0].lignes.map((l) => l[0]).sort()).toEqual(['A. Haddad', 'M. Rahmani']);
  });
});
