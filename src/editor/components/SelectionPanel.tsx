import type { EnemySpawn, HazardSpawn, ItemSpawn } from '@/game/sim/world';
import type { Selection } from '@/editor/types';
import { EnemyProperties } from './EnemyProperties';
import { HazardProperties } from './HazardProperties';

/** Panel lateral de propiedades de la entidad seleccionada. */
export function SelectionPanel({
  selection,
  selectedEnemy,
  selectedHazard,
  selectedItem,
  duplicateSelected,
  deleteSelected,
  onEnemyChange,
  onHazardChange,
}: {
  selection: Selection;
  selectedEnemy: EnemySpawn | undefined;
  selectedHazard: HazardSpawn | undefined;
  selectedItem: ItemSpawn | undefined;
  duplicateSelected: () => void;
  deleteSelected: () => void;
  onEnemyChange: (updated: EnemySpawn) => void;
  onHazardChange: (updated: HazardSpawn) => void;
}) {
  if (!selection) return null;
  return (
    <section className="editor-section">
      <h2>Selección</h2>
      {selection.type !== 'start' && selection.type !== 'patrol' && (
        <div className="editor-field-row">
          <button type="button" className="editor-btn" onClick={duplicateSelected}>
            Duplicar
          </button>
          <button type="button" className="editor-btn editor-btn-danger" onClick={deleteSelected}>
            Borrar
          </button>
        </div>
      )}
      {selection.type === 'start' && <p className="editor-hint">Inicio del jugador (arrástralo en el lienzo).</p>}
      {selection.type === 'patrol' && (
        <>
          <p className="editor-hint">Destino de patrulla (arrástralo en el lienzo).</p>
          <button type="button" className="editor-btn editor-btn-danger editor-btn-wide" onClick={deleteSelected}>
            Quitar destino de patrulla
          </button>
        </>
      )}

      {selectedEnemy && <EnemyProperties enemy={selectedEnemy} onChange={onEnemyChange} />}
      {selectedHazard && <HazardProperties hazard={selectedHazard} onChange={onHazardChange} />}
      {selectedItem && <p className="editor-hint">{selectedItem.kind} · arrástralo para moverlo.</p>}
    </section>
  );
}
