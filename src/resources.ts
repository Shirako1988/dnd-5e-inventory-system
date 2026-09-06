export type RestEvent = 'shortRest' | 'longRest' | 'dawn';
export type ItemResource = {
  id: string;
  name: string;
  current: number;
  maximum: number;
  reset: 'none' | RestEvent;
  recovery: string; // "all", a fixed integer, or NdM+K. Never evaluated as code.
  note?: string;
  needsSetup?: boolean;
};
export const restLabels: Record<RestEvent | 'none', string> = {
  none: 'Keine', shortRest: 'Short Rest', longRest: 'Long Rest', dawn: 'Dawn',
};
export const MAX_RESOURCES = 8;
export function parseRecovery(raw: string): { dice: number; sides: number; bonus: number } | 'all' | null {
  const value = raw.trim().toLowerCase().replace(/\s/g, '');
  if (value === 'all') return 'all';
  if (/^\d+$/.test(value) && Number(value) <= 100000) return { dice: 0, sides: 0, bonus: Number(value) };
  const match = value.match(/^(\d{0,2})d(\d{1,5})(?:([+-]\d{1,5}))?$/);
  if (!match) return null;
  const dice = Number(match[1] || 1), sides = Number(match[2]), bonus = Number(match[3] || 0);
  return dice >= 1 && dice <= 50 && sides >= 2 && sides <= 10000 ? { dice, sides, bonus } : null;
}
export function resourceError(resources: ItemResource[]): string | null {
  if (resources.length > MAX_RESOURCES) return `Höchstens ${MAX_RESOURCES} Ressourcen pro Gegenstand.`;
  const ids = new Set<string>();
  for (const r of resources) {
    if (!r || typeof r !== 'object') return 'Ungültige Ressource.';
    if (r.needsSetup) return 'Die markierten Katalogvorgaben müssen vor dem Speichern festgelegt werden.';
    if (typeof r.name !== 'string' || typeof r.recovery !== 'string' || (r.note !== undefined && typeof r.note !== 'string')) return 'Ungültige Ressourcenfelder.';
    if (typeof r.id !== 'string' || !r.id || r.id.length>100 || ids.has(r.id)) return 'Ressourcen müssen eindeutige Kennungen haben.';
    ids.add(r.id);
    if (r.recovery.length>32 || (r.note?.length ?? 0)>1500) return 'Regeneration maximal 32 Zeichen, Hinweis maximal 1500 Zeichen.';
    if (!r.name?.trim() || r.name.length > 100) return 'Jede Ressource braucht einen Namen (maximal 100 Zeichen).';
    if (!Number.isSafeInteger(r.maximum) || r.maximum < 1 || r.maximum > 100000) return 'Das Maximum muss eine ganze Zahl zwischen 1 und 100000 sein.';
    if (!Number.isSafeInteger(r.current) || r.current < 0 || r.current > r.maximum) return 'Aktuelle Anwendungen müssen zwischen 0 und dem Maximum liegen.';
    if (!Object.prototype.hasOwnProperty.call(restLabels, r.reset)) return 'Unbekannter Regenerationszeitpunkt.';
    if (r.reset !== 'none' && !parseRecovery(r.recovery)) return 'Regeneration: all, eine ganze Zahl oder eine Formel wie 1d6+1.';
  }
  return null;
}
// Missing fields mean legacy data, not a request to refill a used item.
export function itemResources(item: { resources?: ItemResource[] }): ItemResource[] {
  return Array.isArray(item.resources) ? item.resources : [];
}
export function resourceSignature(resources: ItemResource[]): string {
  return JSON.stringify(resources.map(({name, current, maximum, reset, recovery, note}) =>
    [name.trim(), current, maximum, reset, recovery.replace(/\s/g, '').toLowerCase(), note || '']).sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
}
export function recoversAt(resource: ItemResource, event: RestEvent): boolean {
  return resource.reset === event || (event === 'longRest' && resource.reset === 'shortRest');
}
export function recoverResource(resource: ItemResource, event: RestEvent, random: () => number = Math.random): ItemResource {
  if (!recoversAt(resource, event) || resource.current >= resource.maximum) return { ...resource };
  const formula = parseRecovery(resource.recovery);
  if (!formula) throw new Error(`Ungültige Regeneration: ${resource.name}`);
  if (formula === 'all') return { ...resource, current: resource.maximum };
  let amount = formula.bonus;
  for (let i=0; i<formula.dice; i++) amount += 1 + Math.floor(random() * formula.sides);
  return { ...resource, current: Math.min(resource.maximum, resource.current + Math.max(0, amount)) };
}
export function adjustResource(resources: ItemResource[], id: string, delta: number): ItemResource[] {
  if (!Number.isSafeInteger(delta) || delta === 0) throw new Error('Bitte eine positive ganze Anzahl eingeben.');
  const error = resourceError(resources);
  if (error) throw new Error(error);
  const selected = resources.find(r => r.id === id);
  if (!selected) throw new Error('Ressource wurde inzwischen entfernt.');
  const current = selected.current + delta;
  if (current < 0) throw new Error('Nicht genügend Anwendungen vorhanden.');
  if (current > selected.maximum) throw new Error('Das Maximum der Ressource würde überschritten.');
  return resources.map(r => r.id === id ? { ...r, current } : { ...r });
}
export function consumeResource(resources: ItemResource[], id: string, amount: number): ItemResource[] {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Bitte eine positive ganze Anzahl eingeben.');
  return adjustResource(resources, id, -amount);
}
// A repeatable random stream prevents transaction retries from rerolling a rest.
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => { state += 0x6D2B79F5; let x = state; x = Math.imul(x ^ x >>> 15, x | 1); x ^= x + Math.imul(x ^ x >>> 7, x | 61); return ((x ^ x >>> 14) >>> 0) / 4294967296; };
}
