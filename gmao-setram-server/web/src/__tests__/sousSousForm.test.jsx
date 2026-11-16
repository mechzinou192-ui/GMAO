import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SousSousEquipForm } from '../pages/Arborescence.jsx';

const equip = { code: 'CFO.ALG.SST.01', nom: 'Transformateur' };
const se = { code: 'CFO.ALG.SST.01.01', nom: 'Moteur', sousSousEquip: [{ code: 'CFO.ALG.SST.01.01.01', nom: 'Rotor', fournisseurs: [] }, { code: 'CFO.ALG.SST.01.01.03', nom: 'Stator', fournisseurs: [] }] };

describe('formulaire sous-sous-équipement', () => {
  it('création : propose le code suivant (après le plus grand existant) et renvoie parent + sous-équipement', () => {
    const onSubmit = vi.fn();
    render(<SousSousEquipForm modal={{ mode: 'add', equip, se }} onSubmit={onSubmit} />);
    expect(screen.getByDisplayValue('CFO.ALG.SST.01.01.04')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('ex: Roulement'), { target: { value: 'Roulement' } });
    fireEvent.click(screen.getByText('Créer le sous-sous-équipement'));
    expect(onSubmit).toHaveBeenCalledWith({ parentCode: 'CFO.ALG.SST.01', seCode: 'CFO.ALG.SST.01.01', code: 'CFO.ALG.SST.01.01.04', nom: 'Roulement', fournisseurs: [{ nom: 'Non renseigné', tel: '', email: '' }] });
  });
  it('nom vide : rien n\'est envoyé', () => {
    const onSubmit = vi.fn();
    render(<SousSousEquipForm modal={{ mode: 'add', equip, se }} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByText('Créer le sous-sous-équipement'));
    expect(onSubmit).not.toHaveBeenCalled();
  });
  it('modification : garde le code existant', () => {
    const onSubmit = vi.fn();
    render(<SousSousEquipForm modal={{ mode: 'edit', equip, se, ss: se.sousSousEquip[0] }} onSubmit={onSubmit} />);
    expect(screen.getByDisplayValue('CFO.ALG.SST.01.01.01')).toBeTruthy();
    fireEvent.change(screen.getByDisplayValue('Rotor'), { target: { value: 'Rotor bobiné' } });
    fireEvent.click(screen.getByText('Enregistrer les modifications'));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ code: 'CFO.ALG.SST.01.01.01', nom: 'Rotor bobiné' });
  });
});
