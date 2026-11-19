import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { PlanForm } from '../pages/Preventif.jsx';

afterEach(() => cleanup());
const ss = { code: 'CFO.ALG.SST.01.01.01', nom: 'Rotor', fournisseurs: [] };
const se = { code: 'CFO.ALG.SST.01.01', nom: 'Moteur', sousSousEquip: [ss] };
const eq = { code: 'CFO.ALG.SST.01', nom: 'Transformateur', emplacement: 'Local 1', system: 'CFO', subCode: 'SST', unit: 'Alger', sousEquip: [se] };
const props = { systemsList: [['CFO', 'Courant fort']], treeStruct: { CFO: [{ code: 'SST', sub: 'Sous-station' }] }, unit: 'Alger', equipements: [eq], compteurs: [], inter: [], pieces: [], onSubmit: () => {} };

describe('plan préventif : tous les nœuds de l\'arborescence', () => {
  it('propose système, sous-système, équipement, sous-équipement et sous-sous-équipement', () => {
    render(<PlanForm mode="create" {...props} />);
    fireEvent.change(screen.getByDisplayValue('— Choisir un système —'), { target: { value: 'CFO' } });
    expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(5);
    fireEvent.click(screen.getByText('Sous-équipement (1)'));          // filtre par niveau
    expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(1);
  });
  it('un plan sur un sous-sous-équipement garde eq / se / ss', () => {
    const onSubmit = vi.fn();
    render(<PlanForm mode="create" {...props} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByDisplayValue('— Choisir un système —'), { target: { value: 'CFO' } });
    fireEvent.change(screen.getByLabelText('Nœud de l\'arborescence'), { target: { value: 'rotor' } });   // recherche
    fireEvent.click(within(screen.getByRole('listbox')).getByText(ss.code));
    fireEvent.change(screen.getByPlaceholderText(/Contrôler le serrage/), { target: { value: 'Tâche' } });
    fireEvent.click(screen.getByText('+ Ajouter'));
    fireEvent.click(screen.getByText('Créer le plan'));
    expect(onSubmit).toHaveBeenCalled();
    expect(onSubmit.mock.calls[0][0].data).toMatchObject({ sys: 'CFO', eq: eq.code, se: se.code, ss: ss.code });
  });
});
