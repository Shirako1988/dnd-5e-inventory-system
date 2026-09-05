import { doc, runTransaction, type Firestore } from 'firebase/firestore';
import { itemResources, resourceError } from './resources';
import type { Bag, InventoryItem, AuditLogEntry } from './App';

export type InventoryPlan = {
  items?: Map<string, InventoryItem | null>;
  bags: Map<string, Partial<Bag>>;
  audit?: AuditLogEntry | null;
};
export type InventoryReader = {
  bag: (id: string) => Promise<Bag>;
  item: (id: string) => Promise<InventoryItem | null>;
};
export type PlanBuilder = (read: InventoryReader) => Promise<InventoryPlan>;
export function isResourceItem(item: InventoryItem | null | undefined): boolean {
  return Boolean(item && (item.resourceVersion === 1 || itemResources(item).length));
}
export function finalizePlan(plan: InventoryPlan, oldBags: Map<string, Bag>, oldItems: Map<string, InventoryItem | null>, actor: string, now: number): InventoryPlan {
  const guardedBags = new Set<string>();
  for (const [id, next] of plan.items ?? []) {
    const before = oldItems.get(id);
    if (next && next.id !== id) throw new Error('Ungültige Gegenstandskennung.');
    if (next && (!Number.isSafeInteger(next.quantity) || next.quantity < 0)) throw new Error('Ungültige Gegenstandsmenge.');
    if (isResourceItem(before) || isResourceItem(next)) {
      if (before) guardedBags.add(before.bagId);
      if (next) {
        const error = resourceError(itemResources(next));
        if (error) throw new Error(error);
        guardedBags.add(next.bagId);
        next.resourceVersion = 1;
        next.resourceRevision = (before?.resourceRevision ?? 0) + 1;
      }
    }
    if (next) { next.updatedAt = now; next.updatedBy = actor; }
  }
  for (const id of guardedBags) if (!plan.bags.has(id)) throw new Error('Ressourcenänderung ohne zugehöriges Inventar.');
  for (const [id, patch] of plan.bags) {
    const before = oldBags.get(id);
    if (!before) throw new Error('Inventar muss vor dem Ändern gelesen werden.');
    if (!plan.items?.size && patch.currency) {
      delete patch.currentVolume; delete patch.currentValue; delete patch.itemCount;
    }
    patch.updatedAt = now;
    patch.updatedBy = actor;
    patch.mutationVersion = (before.mutationVersion ?? 0) + 1;
    if (guardedBags.has(id)) patch.resourceRevision = (before.resourceRevision ?? 0) + 1;
  }
  return plan;
}
export async function commitInventoryOperation(db: Firestore, campaignId: string, actor: string, build: PlanBuilder): Promise<InventoryPlan> {
  return runTransaction(db, async tx => {
    const oldBags = new Map<string, Bag>(), oldItems = new Map<string, InventoryItem | null>();
    const read: InventoryReader = {
      bag: async id => {
        if (!oldBags.has(id)) {
          const snap = await tx.get(doc(db, 'campaigns', campaignId, 'bags', id));
          if (!snap.exists()) throw new Error('Inventar wurde inzwischen entfernt.');
          oldBags.set(id, { ...snap.data(), id } as Bag);
        }
        return structuredClone(oldBags.get(id)!);
      },
      item: async id => {
        if (!oldItems.has(id)) {
          const snap = await tx.get(doc(db, 'campaigns', campaignId, 'items', id));
          oldItems.set(id, snap.exists() ? { ...snap.data(), id } as InventoryItem : null);
        }
        return structuredClone(oldItems.get(id)!);
      },
    };
    const plan = finalizePlan(await build(read), oldBags, oldItems, actor, Date.now());
    if ((plan.items?.size ?? 0) + plan.bags.size + (plan.audit ? 1 : 0) > 450) throw new Error('Zu viele Änderungen auf einmal (maximal 450). Bitte das Inventar aufteilen. Es wurde nichts geändert.');
    for (const [id, item] of plan.items ?? []) {
      if (!oldItems.has(id)) throw new Error('Gegenstand muss vor dem Ändern gelesen werden.');
      const ref = doc(db, 'campaigns', campaignId, 'items', id);
      if (item) tx.set(ref, JSON.parse(JSON.stringify(item)));
      else tx.delete(ref);
    }
    for (const [id, patch] of plan.bags) tx.update(doc(db, 'campaigns', campaignId, 'bags', id), JSON.parse(JSON.stringify(patch)));
    if (plan.audit) tx.set(doc(db, 'campaigns', campaignId, 'auditLog', plan.audit.id), plan.audit);
    return plan;
  });
}
