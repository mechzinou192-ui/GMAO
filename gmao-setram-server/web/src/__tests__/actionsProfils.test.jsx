import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

vi.mock('../api.js', () => ({ api: { users: vi.fn(async () => ({ users: [] })) } }));
import { EditeurProfils } from '../pages/Administration.jsx';
import { controleProfil, definirProfilsPersonnalises, catalogue, peutFaire, actionPermise, normaliserActions } from '../../../server/src/profils-core.js';

afterEach(() => { cleanup(); definirProfilsPersonnalises([]); });

const chargé = { role: 'Chargé système' };

describe('droits créer / modifier / supprimer par module, décidés par le super administrateur', () => {
  it('sans réglage : comportement inchangé (toutes les actions)', () => {
    expect(peutFaire(chargé, 2, 'supprimer')).toBe(true);
    expect(controleProfil(chargé, 'bts', { code: 'OT1' }, null)).toBeNull();
    expect(controleProfil(chargé, 'equipements', null, { code: 'E1' })).toBeNull();
  });

  it('profil de base restreint : suppression d\'OT et création d\'équipement refusées, le reste permis', () => {
    definirProfilsPersonnalises([{ nom: 'Chargé système', surcharge: true, actions: { 2: ['creer', 'modifier'], 0: ['modifier'] } }]);
    expect(catalogue()['Chargé système'].cloture).toBe(true);                     // le reste du profil est conservé
    expect(controleProfil(chargé, 'bts', { code: 'OT1' }, null)).toMatch(/suppression non autorisée/);
    expect(controleProfil(chargé, 'bts', null, { code: 'OT2' })).toBeNull();
    expect(controleProfil(chargé, 'bts', { code: 'OT1' }, { code: 'OT1', x: 1 })).toBeNull();
    expect(controleProfil(chargé, 'equipements', null, { code: 'E1' })).toMatch(/création non autorisée.*Arborescence/);
    expect(controleProfil(chargé, 'equipements', { code: 'E1' }, { code: 'E1', nom: 'n' })).toBeNull();
    expect(peutFaire(chargé, 0, 'creer')).toBe(false);
    expect(peutFaire({ superAdmin: true }, 0, 'creer')).toBe(true);
  });

  it('collection écrite par deux modules (DS : stock ou OT) : permise si l\'un des modules du profil l\'autorise', () => {
    definirProfilsPersonnalises([{ nom: 'Gestionnaire de stock', surcharge: true, actions: { 4: ['modifier'] } }]);
    expect(actionPermise({ role: 'Gestionnaire de stock' }, 'dss', 'creer')).toBe(false);
    expect(actionPermise({ role: 'Gestionnaire de stock' }, 'pieces', 'modifier')).toBe(true);
  });

  it('profil personnalisé « lecture seule » sur un module', () => {
    definirProfilsPersonnalises([{ nom: 'Coordinateur', volets: [4, 5], actions: { 5: [] } }]);
    const u = { role: 'Coordinateur' };
    expect(controleProfil(u, 'intervenants', { id: 1 }, { id: 1, nom: 'x' })).toMatch(/modification non autorisée.*personnel/);
    expect(controleProfil(u, 'pieces', null, { code: 'P-1' })).toBeNull();
  });

  it('normalisation : tout coché = pas de restriction ; valeurs invalides ignorées', () => {
    expect(normaliserActions({ 2: ['creer', 'modifier', 'supprimer'] })).toBeUndefined();
    expect(normaliserActions({ 2: ['creer', 'x'], 6: [], 99: [] })).toEqual({ 2: ['creer'] });
  });

  it('écran Profils : décocher « Supprimer » pour les OT enregistre la restriction du profil de base', () => {
    let liste = [];
    const set = (f) => { liste = typeof f === 'function' ? f(liste) : f; };
    render(<EditeurProfils profilsPerso={[]} setProfilsPerso={set} />);
    fireEvent.click(screen.getByText('Chargé système'));
    fireEvent.click(screen.getByLabelText('Supprimer — Ordres de Travail (OT)'));
    fireEvent.click(screen.getByText('Enregistrer'));
    expect(liste).toEqual([{ nom: 'Chargé système', surcharge: true, actions: { 2: ['creer', 'modifier'] } }]);
  });
});
