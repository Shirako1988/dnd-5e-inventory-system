import type { InventoryItem } from './App';

// Firestore maps have no meaningful key order. Resource array order and every
// stored value (including ids, notes and counters) must still match exactly.
function sameStoredValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => sameStoredValue(value, right[index]));
  }
  const a = left as Record<string, unknown>, b = right as Record<string, unknown>;
  // Optional undefined properties are omitted by our Firestore serializer.
  const aKeys = Object.keys(a).filter(key => a[key] !== undefined);
  const bKeys = Object.keys(b).filter(key => b[key] !== undefined);
  return aKeys.length === bKeys.length && aKeys.every(key =>
    Object.prototype.hasOwnProperty.call(b, key) && sameStoredValue(a[key], b[key]));
}

const fieldLabels: Partial<Record<keyof InventoryItem, string>> = {
  resources:'Ressourcen', name:'Name', quantity:'Menge', category:'Kategorie',
  weightPerUnit:'Gewicht', volumePerUnit:'Volumen', valuePerUnit:'Wert',
  description:'Beschreibung', notes:'Notizen', bagId:'Inventar',
  imageUrl:'Bild', imageZoom:'Bildausschnitt', imagePositionX:'Bildausschnitt', imagePositionY:'Bildausschnitt',
  imageUpdatedAt:'Bild', imageUpdatedBy:'Bild',
};

/** Both inputs use the same legacy defaults shown by the editor. */
export function assertUnchangedItemFields(current: InventoryItem, baseline: InventoryItem, patch: Partial<InventoryItem>) {
  for (const key of Object.keys(patch) as (keyof InventoryItem)[]) {
    if (!sameStoredValue(current[key], baseline[key])) {
      throw new Error(`Dieser Gegenstand wurde gleichzeitig geändert (${fieldLabels[key] ?? 'Gegenstandsdaten'}). Bitte Bearbeiten abbrechen und erneut öffnen, um die aktuellen Werte zu laden.`);
    }
  }
}
