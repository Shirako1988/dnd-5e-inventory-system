import React, { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  Backpack,
  Boxes,
  Moon,
  Sun,
  Monitor,
  Plus,
  Trash2,
  Pencil,
  ArrowUp,
  ArrowDown,
  ShieldCheck,
  Lock,
  Unlock,
  Save,
  X,
  PackagePlus,
  Coins,
  Scale,
  Box,
  ScrollText,
  LogIn,
  Crown,
  Users,
  DoorOpen,
  History,
  Wrench,
  UserRound,
  Mail,
  KeyRound,
  ChevronDown,
  ChevronUp,
  Sword,
  Shield,
  FlaskConical,
  Gem,
  Hammer,
  Utensils,
  Sparkles,
  Package,
  Crosshair,
  Shirt,
  Scroll,
  Copy,
  UserMinus,
  UserCheck,
  Eye,
  EyeOff,
  Image as ImageIcon,
  ExternalLink,
  Maximize2,
  RotateCcw,
} from "lucide-react";
import itemCatalogData from "./data/itemCatalog.json";
import { initializeApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type QuerySnapshot,
} from "firebase/firestore";


type CatalogItem = {
  id: string;
  name: string;
  source: string;
  page?: number | null;
  kind: string;
  category: string;
  rarity: string;
  weight: number | null;
  weightSource?: "official" | "raw" | "base" | "estimated" | "thievesguild" | "missing";
  valueSource?: "official" | "raw" | "fallback" | "thievesguild_sane" | "missing";
  valueNote?: string;
  weightEstimated?: boolean;
  weightNote?: string;
  valueGp: number | null;
  description: string;
};

const baseItemCatalog = itemCatalogData as CatalogItem[];

type LootQualityVariant = {
  code: "TQ" | "LQ" | "SQ";
  label: string;
  multiplier: number;
  percentLabel: string;
};

const LOOT_QUALITY_VARIANTS: LootQualityVariant[] = [
  { code: "TQ", label: "Terrible Quality", multiplier: 0.1, percentLabel: "10%" },
  { code: "LQ", label: "Low Quality", multiplier: 0.5, percentLabel: "50%" },
  { code: "SQ", label: "Superior Quality", multiplier: 1.5, percentLabel: "150%" },
];

function isLootQualityBaseItem(entry: CatalogItem) {
  if (entry.valueGp === null || entry.valueGp === undefined || entry.valueGp <= 0) return false;
  const name = normalizeSearchText(entry.name);
  const category = normalizeSearchText(entry.category);
  const kind = normalizeSearchText(entry.kind);
  const haystack = `${name} ${category} ${kind}`;

  if (category.includes("verkaufsgut") || kind === "harvest" || kind === "trinket" || kind === "magic-variant") return false;
  if (/arrow|bolt|ammunition|ammo|needle|bullet|sling bullet|dart/.test(haystack) || ["a", "af"].includes(kind)) return false;
  if (/shield|schild/.test(haystack) || kind === "s") return true;
  if (/armor|armour|rüstung|mail|plate|breastplate|hide armor|leather armor|chain shirt|chain mail|splint/.test(haystack) || category.includes("rüstung")) return true;
  if (/weapon|waffe|sword|axe|bow|crossbow|mace|dagger|spear|staff|club|hammer|flail|lance|rapier|scimitar|trident|whip|javelin|sling|blowgun/.test(haystack) || kind === "m" || kind === "r") return true;
  return false;
}

function qualityAdjustedValue(valueGp: number, multiplier: number) {
  return Math.round(valueGp * multiplier * 100) / 100;
}

function buildLootQualityCatalogVariants(entries: CatalogItem[]) {
  const variants: CatalogItem[] = [];
  for (const entry of entries) {
    if (!isLootQualityBaseItem(entry) || entry.valueGp === null || entry.valueGp === undefined) continue;
    for (const variant of LOOT_QUALITY_VARIANTS) {
      const valueGp = qualityAdjustedValue(entry.valueGp, variant.multiplier);
      variants.push({
        ...entry,
        id: `${entry.id}::loot-quality::${variant.code}`,
        name: `${entry.name} (${variant.code} ${variant.label})`,
        kind: `loot-quality-${variant.code.toLowerCase()}`,
        category: "Verkaufsgut",
        valueGp,
        valueNote: `${variant.label}: ${variant.percentLabel} des normalen Wertes. Normalwert: ${formatNumber(entry.valueGp)} gp.`,
        description: `${variant.label} (${variant.code}) von ${entry.name}. Verkaufsgut: ${variant.percentLabel} des normalen Wertes (${formatNumber(valueGp)} gp statt ${formatNumber(entry.valueGp)} gp).${entry.description ? `\n\n${entry.description}` : ""}`,
      });
    }
  }
  return variants;
}

const itemCatalog = [...baseItemCatalog, ...buildLootQualityCatalogVariants(baseItemCatalog)];

const ITEM_CATEGORIES: { id: ItemCategory; label: string; shortLabel: string; hint: string }[] = [
  { id: "weapon", label: "Waffen", shortLabel: "Waffe", hint: "Nah- und Fernkampfwaffen" },
  { id: "ammo", label: "Munition", shortLabel: "Munition", hint: "Pfeile, Bolzen, Kugeln" },
  { id: "armor", label: "Rüstungen", shortLabel: "Rüstung", hint: "Leichte, mittlere und schwere Rüstung" },
  { id: "shield", label: "Schilde", shortLabel: "Schild", hint: "Schilde und magische Schilde" },
  { id: "potion", label: "Tränke & Verbrauchbares", shortLabel: "Trank", hint: "Tränke, Gifte, Öle, verbrauchbare Alchemie" },
  { id: "scroll", label: "Schriftrollen & Bücher", shortLabel: "Schrift", hint: "Scrolls, Bücher, Karten, Schriftstücke" },
  { id: "tool", label: "Werkzeuge & Instrumente", shortLabel: "Werkzeug", hint: "Werkzeugsets, Foki, Instrumente" },
  { id: "food", label: "Essen & Vorräte", shortLabel: "Vorrat", hint: "Nahrung, Getränke, Rationen" },
  { id: "wealth", label: "Geld & Wertgegenstände", shortLabel: "Wertgut", hint: "Münzen, Edelsteine, Handelswaren" },
  { id: "vehicle", label: "Reittiere & Fahrzeuge", shortLabel: "Fahrzeug", hint: "Mounts, Fahrzeuge, Schiffe, Wagen" },
  { id: "magic", label: "Magische Gegenstände", shortLabel: "Magisch", hint: "Wundersame Gegenstände, Ringe, Stäbe, Artefakte" },
  { id: "gear", label: "Ausrüstung", shortLabel: "Ausrüstung", hint: "Normales Abenteuer- und Lagerzeug" },
  { id: "misc", label: "Sonstiges", shortLabel: "Sonstiges", hint: "Nicht eindeutig einsortierbar" },
  { id: "sale", label: "Verkaufsgut", shortLabel: "Verkaufsgut", hint: "Loot und Gegenstände, die verkauft werden sollen" },
];

const CATEGORY_ORDER = new Map<ItemCategory, number>(ITEM_CATEGORIES.map((entry, index) => [entry.id, index]));

function getCategoryDef(category: ItemCategory | undefined | null) {
  return ITEM_CATEGORIES.find((entry) => entry.id === category) ?? ITEM_CATEGORIES.find((entry) => entry.id === "misc")!;
}

function normalizeItemCategory(category: unknown): ItemCategory {
  return ITEM_CATEGORIES.some((entry) => entry.id === category) ? category as ItemCategory : "gear";
}

function itemCategoryOrder(category: ItemCategory | undefined | null) {
  return CATEGORY_ORDER.get(normalizeItemCategory(category)) ?? 999;
}

function categoryIcon(category: ItemCategory | undefined | null, className = "h-4 w-4") {
  switch (normalizeItemCategory(category)) {
    case "weapon": return <Sword className={className} />;
    case "ammo": return <Crosshair className={className} />;
    case "armor": return <Shirt className={className} />;
    case "shield": return <Shield className={className} />;
    case "potion": return <FlaskConical className={className} />;
    case "scroll": return <Scroll className={className} />;
    case "tool": return <Hammer className={className} />;
    case "food": return <Utensils className={className} />;
    case "wealth": return <Gem className={className} />;
    case "sale": return <Coins className={className} />;
    case "vehicle": return <Boxes className={className} />;
    case "magic": return <Sparkles className={className} />;
    case "gear": return <Package className={className} />;
    default: return <Box className={className} />;
  }
}

function inferCatalogCategory(entry: CatalogItem | undefined | null): ItemCategory {
  if (!entry) return "gear";
  const name = normalizeSearchText(entry.name);
  const category = normalizeSearchText(entry.category);
  const kind = normalizeSearchText(entry.kind);
  const haystack = `${name} ${category} ${kind}`;

  if (/verkaufsgut|terrible quality|low quality|superior quality|\btq\b|\blq\b|\bsq\b/.test(haystack) || kind.startsWith("loot-quality")) return "sale";
  if (/arrow|bolt|ammunition|ammo|needle|bullet|sling bullet|dart/.test(haystack) || ["a", "af"].includes(kind)) return "ammo";
  if (/shield|schild/.test(haystack) || kind === "s") return "shield";
  if (/armor|armour|rüstung|mail|plate|breastplate|hide armor|leather armor|chain shirt|chain mail|splint/.test(haystack) || category.includes("rüstung")) return "armor";
  if (/potion|trank|poison|gift|oil|elixir|vial|flask|acid|alchemist/.test(haystack) || category.includes("trank")) return "potion";
  if (/scroll|spell scroll|book|tome|manual|grimoire|schrift|spellbook|map|parchment/.test(haystack) || category.includes("scroll") || category.includes("sc")) return "scroll";
  if (/weapon|waffe|sword|axe|bow|crossbow|mace|dagger|spear|staff|club|hammer|flail|lance|rapier|scimitar|trident|whip|javelin|sling|blowgun/.test(haystack) || kind === "m" || kind === "r") return "weapon";
  if (/tool|supplies|instrument|focus|werkzeug|instrument|artisan|kit|utensils|dice set|dragonchess|playing card/.test(haystack)) return "tool";
  if (/food|drink|ration|ale|wine|beer|bread|cheese|meat|essen|trinken/.test(haystack)) return "food";
  if (/gem|coin|trade good|treasure|wert|handelsgut|bar|ingot|art object|jewel|ring \(|amulet \(|pendant/.test(haystack) || category.includes("$") || category.includes("handelsgut")) return "wealth";
  if (/mount|vehicle|wagon|cart|carriage|ship|boat|airship|saddle|reittier|fahrzeug|veh|shp|air|mnt/.test(haystack)) return "vehicle";
  if (/wondrous|wundersam|ring|wand|rod|staff|rute|zauberstab|artifact|magisch|magic/.test(haystack)) return "magic";
  if (/gear|equipment|ausrüstung|adventuring|container|bag|pack|rope|torch|lantern|tent|bedroll|clothes/.test(haystack)) return "gear";
  return "misc";
}

function categorySelectOptions() {
  return ITEM_CATEGORIES.map((category) => <option key={category.id} value={category.id}>{category.label}</option>);
}

function getItemOrderIndex(item: InventoryItem) {
  return typeof item.orderIndex === "number" ? item.orderIndex : item.createdAt ?? 0;
}

function memberRoleRank(role: MemberRole) {
  if (role === "dm") return 0;
  if (role === "player") return 1;
  return 2;
}

function memberRoleLabel(role: MemberRole) {
  if (role === "dm") return "DM";
  if (role === "player") return "Spieler";
  return "Anwärter";
}

function compareCampaignMembers(a: CampaignMember, b: CampaignMember) {
  const rank = memberRoleRank(a.role) - memberRoleRank(b.role);
  if (rank !== 0) return rank;
  return a.displayName.localeCompare(b.displayName, "de", { sensitivity: "base" });
}

type ThemeMode = "system" | "light" | "dark";
type BagType = "personal" | "shared" | "party" | "dm"; // legacy field, no longer controls permissions
type BagKind = "inventory" | "container";
type MemberRole = "dm" | "player" | "applicant";
type AccessMode = "all" | "dm" | "custom";
type ItemCategory = "weapon" | "ammo" | "armor" | "shield" | "potion" | "scroll" | "tool" | "food" | "wealth" | "sale" | "vehicle" | "magic" | "gear" | "misc";
type ItemSortKey = "custom" | "name" | "quantity" | "weightUnit" | "weightStack" | "volumeUnit" | "volumeStack" | "valueUnit" | "valueStack" | "createdAt" | "updatedAt";
type SortDirection = "asc" | "desc";
type CurrencyKey = "pp" | "gp" | "ep" | "sp" | "cp";
type CurrencyPouch = Record<CurrencyKey, number>;

const TARGET_ACCESS_ALL_KEY = "__all__";

type BagAccess = {
  targetMode: AccessMode;
  targetUserIds: string[];
  depositMode: AccessMode;
  depositUserIds: string[];
  readMode: AccessMode;
  readUserIds: string[];
  writeMode: AccessMode;
  writeUserIds: string[];
};

type Campaign = {
  id: string;
  name: string;
  dmUid: string;
  joinCode: string;
  joinCodeSearch?: string;
  tradeRateName?: string;
  tradeBuyMultiplier?: number;
  tradeSellMultiplier?: number;
  createdAt: number;
  updatedAt: number;
};

type CampaignMember = {
  uid: string;
  displayName: string;
  role: MemberRole;
  joinedAt: number;
  campaignName?: string;
};

type Bag = {
  id: string;
  name: string;
  description?: string;
  ownerUid: string | null;
  type?: BagType; // legacy/display fallback only
  kind?: BagKind;
  sortIndex: number;
  maxWeight: number | null;
  maxVolume: number | null;
  currentWeight?: number;
  currentVolume?: number;
  currentValue?: number;
  itemCount?: number;
  currency?: CurrencyPouch;
  permissions?: {
    read: string[];
    write: string[];
  }; // legacy fallback only
  access?: BagAccess;
  /**
   * Firestore-query-friendly mirror of access.targetMode/targetUserIds.
   * "__all__" means every approved player can see the bag as a target.
   * Custom visibility stores the allowed player UIDs directly.
   */
  targetAccessKeys?: string[];
  imageUrl?: string;
  imageZoom?: number;
  imagePositionX?: number;
  imagePositionY?: number;
  imageUpdatedAt?: number;
  imageUpdatedBy?: string;
  createdAt: number;
  updatedAt: number;
};

type InventoryItem = {
  id: string;
  bagId: string;
  name: string;
  quantity: number;
  weightPerUnit: number | null;
  volumePerUnit: number | null;
  valuePerUnit: number | null;
  description: string;
  notes: string;
  stackKey?: string;
  category?: ItemCategory;
  orderIndex?: number;
  imageUrl?: string;
  imageZoom?: number;
  imagePositionX?: number;
  imagePositionY?: number;
  imageUpdatedAt?: number;
  imageUpdatedBy?: string;
  createdBy: string;
  updatedBy: string;
  createdAt: number;
  updatedAt: number;
};


type AuditLogCategory = "all" | "items" | "currency" | "bags" | "members" | "campaign" | "system";

type AuditLogEntry = {
  id: string;
  actorUid: string;
  actorName: string;
  type: string;
  category?: AuditLogCategory;
  targetId: string | null;
  message: string;
  createdAt: number;
};


type CampaignBackup = {
  schema: "dnd_inventory_manager_backup_v1";
  exportedAt: number;
  exportedBy: { uid: string; displayName: string; role: MemberRole | "local" };
  reason: "manual_export" | "mirror_auto" | "mirror_manual";
  app: { name: "DND Inventory Manager"; backupVersion: 1 };
  campaign: Campaign | null;
  member: CampaignMember | null;
  members: CampaignMember[];
  bags: Bag[];
  items: InventoryItem[];
  auditLog: AuditLogEntry[];
  localState: {
    selectedBagId: string;
    bagOrderIds: string[];
    itemSortKey: ItemSortKey;
    itemSortDirection: SortDirection;
    collapsedCategoryKeys?: string[];
  };
};

type RestoreCandidate = {
  backup: CampaignBackup;
  fileName: string;
  warnings: string[];
};

const auditCategoryOptions: { key: AuditLogCategory; label: string }[] = [
  { key: "all", label: "Alle" },
  { key: "items", label: "Items" },
  { key: "currency", label: "Münzen" },
  { key: "bags", label: "Taschen" },
  { key: "members", label: "Mitglieder" },
  { key: "campaign", label: "Kampagne" },
  { key: "system", label: "System" },
];

function auditCategoryFromType(type: string): AuditLogCategory {
  if (type.startsWith("item_")) return "items";
  if (type.startsWith("currency_")) return "currency";
  if (type.startsWith("bag_")) return "bags";
  if (type.startsWith("member_")) return "members";
  if (type.startsWith("campaign_")) return "campaign";
  return "system";
}

function auditCategoryLabel(category: AuditLogCategory | undefined) {
  const normalized = category && category !== "all" ? category : "system";
  return auditCategoryOptions.find((entry) => entry.key === normalized)?.label ?? "System";
}

function auditTypeLabel(type: string) {
  const labels: Record<string, string> = {
    campaign_created: "Kampagne erstellt",
    campaign_repaired: "Daten repariert",
    campaign_deleted: "Kampagne gelöscht",
    campaign_backup_exported: "Backup exportiert",
    campaign_backup_mirror_connected: "Backup-Mirror verbunden",
    campaign_backup_mirror_disconnected: "Backup-Mirror getrennt",
    campaign_backup_import_selected: "Backup-Import vorbereitet",
    campaign_backup_imported: "Backup wiederhergestellt",
    campaign_trade_rates_updated: "Handelskurs geändert",
    member_join_requested: "Beitritt angefragt",
    member_approved: "Spieler bestätigt",
    member_removed: "Spieler entfernt",
    join_code_rotated: "Join-Code erneuert",
    bag_created: "Tasche erstellt",
    bag_updated: "Tasche geändert",
    bag_deleted: "Tasche gelöscht",
    item_created: "Item erstellt",
    item_updated: "Item geändert",
    item_deleted: "Item gelöscht",
    item_moved: "Item übertragen",
    item_stacked: "Item gestackt",
    item_quantity_changed: "Menge geändert",
    item_reordered: "Item sortiert",
    item_sold: "Verkaufsgut verkauft",
    currency_added: "Münzen hinzugefügt",
    currency_removed: "Münzen entnommen",
    currency_converted: "Münzen gewechselt",
    currency_transferred: "Münzen übertragen",
    currency_undo: "Münzen zurückgesetzt",
    currency_updated: "Münzen geändert",
  };
  return labels[type] ?? type.replace(/_/g, " ");
}

type UserCampaignSummary = {
  campaignId: string;
  name: string;
  joinCode: string;
  role: MemberRole;
  displayName: string;
  joinedAt: number;
  updatedAt: number;
};

type AppUserProfile = {
  uid: string;
  displayName: string;
  email: string | null;
  isAnonymous: boolean;
  createdAt: number;
  updatedAt: number;
};

type DeleteTarget =
  | { kind: "bag"; id: string; label: string }
  | { kind: "item"; id: string; label: string }
  | { kind: "campaign"; id: string; label: string }
  | { kind: "member"; id: string; label: string }
  | null;

type TransferTarget = {
  itemId: string;
  targetBagId: string;
  quantity: string;
} | null;

type SaleConfirmTarget = {
  bagId: string;
} | null;

type ThumbnailTarget =
  | { kind: "bag"; id: string }
  | { kind: "item"; id: string }
  | null;

type ImageViewerTarget = {
  title: string;
  imageUrl: string;
} | null;

type RepairPreview = {
  checkedBags: number;
  checkedItems: number;
  checkedMembers: number;
  bagPatches: Array<{ id: string; name: string; patch: Partial<Bag> }>;
  itemPatches: Array<{ id: string; name: string; patch: Partial<InventoryItem> }>;
  orphanItems: number;
};

const now = Date.now();
const localUserId = "local_user";
const activeCampaignStorageKey = "dnd-inventory-active-campaign-id";
const backupDbName = "dnd-inventory-backup-handles";
const backupStoreName = "mirrorHandles";
const DEFAULT_IMAGE_ZOOM = 1;
const DEFAULT_IMAGE_POSITION = 50;

function safeFileName(value: string) {
  return value.trim().replace(/[^a-z0-9äöüßÄÖÜ _.-]/gi, "_").replace(/_+/g, "_").slice(0, 80) || "kampagne";
}

function sanitizeImageUrl(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return "";
  try {
    const url = new URL(text);
    if (url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

function looksLikeDirectImageUrl(value: string) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return /\.(png|jpe?g|webp|gif|avif)(\?.*)?$/i.test(url.pathname + url.search);
  } catch {
    return false;
  }
}

function sanitizeImageZoom(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_IMAGE_ZOOM;
  return Math.max(1, Math.min(3, Math.round(numeric * 100) / 100));
}

function sanitizeImagePosition(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_IMAGE_POSITION;
  return Math.max(0, Math.min(100, Math.round(numeric * 100) / 100));
}

function thumbnailImageStyle(imageUrl: unknown, imageZoom: unknown, imagePositionX: unknown, imagePositionY: unknown): CSSProperties {
  if (!sanitizeImageUrl(imageUrl)) return {};
  const x = sanitizeImagePosition(imagePositionX);
  const y = sanitizeImagePosition(imagePositionY);
  return {
    objectFit: "cover",
    objectPosition: `${x}% ${y}%`,
    transform: `scale(${sanitizeImageZoom(imageZoom)})`,
    transformOrigin: `${x}% ${y}%`,
    userSelect: "none",
    pointerEvents: "none",
  };
}

function openBackupHandleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(backupDbName, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(backupStoreName)) db.createObjectStore(backupStoreName);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Backup-Datenbank konnte nicht geöffnet werden."));
  });
}

async function getStoredBackupHandle(campaignId: string): Promise<any | null> {
  const db = await openBackupHandleDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(backupStoreName, "readonly");
    const request = tx.objectStore(backupStoreName).get(campaignId);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error ?? new Error("Backup-Dateiverknüpfung konnte nicht gelesen werden."));
    tx.oncomplete = () => db.close();
  });
}

async function storeBackupHandle(campaignId: string, handle: any): Promise<void> {
  const db = await openBackupHandleDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(backupStoreName, "readwrite");
    tx.objectStore(backupStoreName).put(handle, campaignId);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error ?? new Error("Backup-Dateiverknüpfung konnte nicht gespeichert werden.")); };
  });
}

async function removeStoredBackupHandle(campaignId: string): Promise<void> {
  const db = await openBackupHandleDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(backupStoreName, "readwrite");
    tx.objectStore(backupStoreName).delete(campaignId);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error ?? new Error("Backup-Dateiverknüpfung konnte nicht entfernt werden.")); };
  });
}

async function writeTextToFileHandle(handle: any, text: string): Promise<void> {
  const permissionOptions = { mode: "readwrite" };
  if (typeof handle.queryPermission === "function") {
    let permission = await handle.queryPermission(permissionOptions);
    if (permission !== "granted" && typeof handle.requestPermission === "function") {
      permission = await handle.requestPermission(permissionOptions);
    }
    if (permission !== "granted") throw new Error("Der Browser hat keinen Schreibzugriff auf die Backup-Datei gewährt.");
  }
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
}

function downloadJsonFile(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function validateCampaignBackupPayload(payload: unknown): CampaignBackup {
  if (!payload || typeof payload !== "object") throw new Error("Die Datei enthält kein gültiges JSON-Objekt.");
  const backup = payload as Partial<CampaignBackup>;
  if (backup.schema !== "dnd_inventory_manager_backup_v1") throw new Error("Diese Datei ist kein DND-Inventory-Backup oder nutzt ein unbekanntes Format.");
  if (!backup.campaign || typeof backup.campaign.name !== "string") throw new Error("Im Backup fehlt die Kampagne.");
  if (!Array.isArray(backup.members)) throw new Error("Im Backup fehlt die Mitgliederliste.");
  if (!Array.isArray(backup.bags)) throw new Error("Im Backup fehlen die Taschen.");
  if (!Array.isArray(backup.items)) throw new Error("Im Backup fehlen die Items.");
  if (!Array.isArray(backup.auditLog)) backup.auditLog = [];
  if (!backup.localState) {
    backup.localState = { selectedBagId: "", bagOrderIds: [], itemSortKey: "custom", itemSortDirection: "asc", collapsedCategoryKeys: [] };
  }
  return backup as CampaignBackup;
}

function backupCounts(backup: CampaignBackup) {
  return {
    members: backup.members.length,
    bags: backup.bags.length,
    items: backup.items.length,
    logs: backup.auditLog.length,
  };
}

function bagOrderStorageKey(campaignId: string | null, uid: string) {
  return `dnd-inventory-bag-order:${campaignId ?? "local"}:${uid}`;
}

function selectedBagStorageKey(campaignId: string | null, uid: string) {
  return `dnd-inventory-selected-bag:${campaignId ?? "local"}:${uid}`;
}

function collapsedCategoriesStorageKey(campaignId: string | null, uid: string) {
  return `dnd-inventory-collapsed-categories:${campaignId ?? "local"}:${uid}`;
}

function inventoryCategoryKey(bagId: string, category: ItemCategory) {
  return `${bagId}:${category}`;
}

function orderBagsForUser(bagList: Bag[], orderIds: string[]) {
  const orderMap = new Map(orderIds.map((id, index) => [id, index]));
  return [...bagList].sort((a, b) => {
    const aKnown = orderMap.has(a.id);
    const bKnown = orderMap.has(b.id);

    if (aKnown && bKnown) return orderMap.get(a.id)! - orderMap.get(b.id)!;
    if (aKnown) return -1;
    if (bKnown) return 1;

    const sortDelta = (a.sortIndex ?? 0) - (b.sortIndex ?? 0);
    if (sortDelta !== 0) return sortDelta;
    return a.name.localeCompare(b.name, "de", { numeric: true, sensitivity: "base" });
  });
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const firebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId);
const firebaseApp = firebaseConfigured ? initializeApp(firebaseConfig) : null;
const firebaseAuth = firebaseApp ? getAuth(firebaseApp) : null;
const firebaseDb = firebaseApp ? getFirestore(firebaseApp) : null;

const initialBags: Bag[] = [
  {
    id: "bag_party_wagon",
    name: "Gruppenwagen",
    ownerUid: null,
    type: "party",
    kind: "inventory",
    sortIndex: 0,
    maxWeight: 1200,
    maxVolume: 800,
    currentWeight: 0,
    currentVolume: 0,
    currentValue: 0,
    itemCount: 0,
    currency: emptyCurrency(),
    permissions: { read: ["all"], write: ["all"] },
    access: publicBagAccess(),
    targetAccessKeys: targetAccessKeysForAccess(publicBagAccess()),
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "bag_dm_notes",
    name: "DM-Reservebeutel",
    ownerUid: localUserId,
    type: "dm",
    kind: "container",
    sortIndex: 1,
    maxWeight: null,
    maxVolume: null,
    currentWeight: 0,
    currentVolume: 0,
    currentValue: 0,
    itemCount: 0,
    currency: emptyCurrency(),
    permissions: { read: [], write: [] },
    access: dmOnlyAccess(),
    targetAccessKeys: targetAccessKeysForAccess(dmOnlyAccess()),
    createdAt: now,
    updatedAt: now,
  },
];

const initialItems: InventoryItem[] = [
  {
    id: "item_rope_001",
    bagId: "bag_party_wagon",
    name: "Hanfseil, 50 Fuß",
    quantity: 2,
    weightPerUnit: 10,
    volumePerUnit: 6,
    valuePerUnit: 1,
    description: "Robustes Seil für Klettern, Sichern und schlechte Ideen.",
    notes: "Startbeispiel. Kann gelöscht werden.",
    createdBy: localUserId,
    updatedBy: localUserId,
    createdAt: now,
    updatedAt: now,
  },
];

function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function makeJoinCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return `DND-${out.slice(0, 3)}-${out.slice(3)}`;
}

function normalizeJoinCode(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function numberOrNull(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanFirestorePayload<T extends Record<string, any>>(payload: T): T {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined)) as T;
}

function normalizeItemQuantity(value: unknown, fallback = 1) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return Math.max(0, Math.round(fallback));
  return Math.max(0, Math.round(numeric));
}

function clampedTransferAmount(value: unknown, available: unknown) {
  const availableQuantity = normalizeItemQuantity(available, 0);
  if (availableQuantity <= 0) return 0;
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.max(1, Math.min(availableQuantity, Math.round(numeric)));
}

function formatNumber(value: number | null | undefined, fallback = "—") {
  if (value === null || value === undefined) return fallback;
  if (Number.isInteger(value)) return `${value}`;
  return value.toFixed(2).replace(/\.00$/, "").replace(/0$/, "");
}

const DEFAULT_TRADE_RATE_NAME = "Standardpreise";
const DEFAULT_TRADE_BUY_MULTIPLIER = 1;
const DEFAULT_TRADE_SELL_MULTIPLIER = 0.5;

type TradeRates = {
  name: string;
  buyMultiplier: number;
  sellMultiplier: number;
};

function normalizeTradeRateName(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || DEFAULT_TRADE_RATE_NAME;
}

function normalizeTradeMultiplier(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.round(parsed * 10000) / 10000;
}

function campaignTradeRates(campaign: Campaign | null | undefined): TradeRates {
  return {
    name: normalizeTradeRateName(campaign?.tradeRateName),
    buyMultiplier: normalizeTradeMultiplier(campaign?.tradeBuyMultiplier, DEFAULT_TRADE_BUY_MULTIPLIER),
    sellMultiplier: normalizeTradeMultiplier(campaign?.tradeSellMultiplier, DEFAULT_TRADE_SELL_MULTIPLIER),
  };
}

function tradeAdjustedValue(value: number, multiplier: number) {
  return Math.round(value * multiplier * 100) / 100;
}

function formatMultiplier(value: number) {
  return `×${formatNumber(value)}`;
}

const currencyKeys: CurrencyKey[] = ["pp", "gp", "ep", "sp", "cp"];
const currencyValueInCopper: Record<CurrencyKey, number> = { pp: 1000, gp: 100, ep: 50, sp: 10, cp: 1 };
const COIN_WEIGHT_LB = 0.02;
const currencyDefs: Record<CurrencyKey, { label: string; short: string; icon: string }> = {
  pp: { label: "Platin", short: "PP", icon: "♕" },
  gp: { label: "Gold", short: "GP", icon: "●" },
  ep: { label: "Elektrum", short: "EP", icon: "◇" },
  sp: { label: "Silber", short: "SP", icon: "◐" },
  cp: { label: "Kupfer", short: "CP", icon: "◆" },
};

function emptyCurrency(): CurrencyPouch {
  return { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 };
}

function normalizeCurrency(value: unknown): CurrencyPouch {
  const src = value && typeof value === "object" ? value as Partial<Record<CurrencyKey, unknown>> : {};
  return {
    pp: Math.max(0, Math.floor(Number(src.pp) || 0)),
    gp: Math.max(0, Math.floor(Number(src.gp) || 0)),
    ep: Math.max(0, Math.floor(Number(src.ep) || 0)),
    sp: Math.max(0, Math.floor(Number(src.sp) || 0)),
    cp: Math.max(0, Math.floor(Number(src.cp) || 0)),
  };
}

function bagCurrency(bag: Bag | undefined | null): CurrencyPouch {
  return normalizeCurrency(bag?.currency);
}

function currencyToCopper(currency: CurrencyPouch): number {
  return currencyKeys.reduce((sum, key) => sum + currency[key] * currencyValueInCopper[key], 0);
}

function copperToCurrency(totalCopper: number): CurrencyPouch {
  let remaining = Math.max(0, Math.round(totalCopper));
  const pp = Math.floor(remaining / currencyValueInCopper.pp);
  remaining -= pp * currencyValueInCopper.pp;
  const gp = Math.floor(remaining / currencyValueInCopper.gp);
  remaining -= gp * currencyValueInCopper.gp;
  const ep = Math.floor(remaining / currencyValueInCopper.ep);
  remaining -= ep * currencyValueInCopper.ep;
  const sp = Math.floor(remaining / currencyValueInCopper.sp);
  remaining -= sp * currencyValueInCopper.sp;
  return { pp, gp, ep, sp, cp: remaining };
}

function addCurrency(left: CurrencyPouch, right: CurrencyPouch): CurrencyPouch {
  return {
    pp: left.pp + right.pp,
    gp: left.gp + right.gp,
    ep: left.ep + right.ep,
    sp: left.sp + right.sp,
    cp: left.cp + right.cp,
  };
}

function currencyDeltaText(currency: CurrencyPouch) {
  return currencyText(currency);
}

function currencyToGoldValue(currency: CurrencyPouch): number {
  return currencyToCopper(currency) / 100;
}

function currencyCoinCount(currency: CurrencyPouch): number {
  return currencyKeys.reduce((sum, key) => sum + currency[key], 0);
}

function currencyWeight(currency: CurrencyPouch): number {
  return currencyCoinCount(currency) * COIN_WEIGHT_LB;
}

function normalizeCoinInput(value: string): number {
  return Math.max(0, Math.floor(Number(value.replace(/[^0-9]/g, "")) || 0));
}

function canSubtractCurrency(currency: CurrencyPouch, key: CurrencyKey, amount: number) {
  return amount > 0 && currency[key] >= amount;
}

function currencyText(currency: CurrencyPouch) {
  const parts = currencyKeys.filter((key) => currency[key] > 0).map((key) => `${currency[key]} ${currencyDefs[key].short}`);
  return parts.length ? parts.join(" · ") : "0 Münzen";
}

function formatTimestamp(value: number | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function normalizeSearchText(value: string) {
  return value
    .toLocaleLowerCase("de-DE")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9+]+/gi, " ")
    .trim();
}

function catalogValueToInput(value: number | null | undefined) {
  return value === null || value === undefined ? "" : formatNumber(value);
}

function catalogMetaLine(entry: CatalogItem) {
  const page = entry.page ? ` S. ${entry.page}` : "";
  const rarity = entry.rarity && entry.rarity !== "none" ? ` · ${entry.rarity}` : "";
  const weight = entry.weight !== null && entry.weight !== undefined
    ? ` · ${entry.weightSource === "official" || entry.weightSource === "raw" ? "" : entry.weightSource === "thievesguild" ? "" : "~"}${formatNumber(entry.weight)} lb${entry.weightSource === "official" || entry.weightSource === "raw" ? "" : entry.weightSource === "thievesguild" ? " TG" : " geschätzt"}`
    : "";
  const value = entry.valueGp !== null && entry.valueGp !== undefined
    ? ` · ${formatNumber(entry.valueGp)} gp${entry.valueSource === "thievesguild_sane" ? " sane" : ""}`
    : "";
  return `${entry.source}${page} · ${entry.category}${rarity}${weight}${value}`;
}

function totalWeight(item: InventoryItem) {
  return item.quantity * (item.weightPerUnit ?? 0);
}

function totalVolume(item: InventoryItem) {
  return item.quantity * (item.volumePerUnit ?? 0);
}

function totalValue(item: InventoryItem) {
  return item.quantity * (item.valuePerUnit ?? 0);
}

function stackComparableText(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("de-DE");
}

function stackComparableNumber(value: number | null | undefined) {
  return value === null || value === undefined ? "null" : String(value);
}

function itemStackKey(item: Pick<InventoryItem, "name" | "weightPerUnit" | "volumePerUnit" | "valuePerUnit">) {
  return [
    stackComparableText(item.name),
    stackComparableNumber(item.weightPerUnit),
    stackComparableNumber(item.volumePerUnit),
    stackComparableNumber(item.valuePerUnit),
  ].join("||");
}

function stableHash(value: string) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < value.length; i += 1) {
    const ch = value.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

function stackDocumentId(bagId: string, item: Pick<InventoryItem, "name" | "weightPerUnit" | "volumePerUnit" | "valuePerUnit">) {
  return `stack_${stableHash(`${bagId}||${itemStackKey(item)}`)}`;
}

function isSameStackItem(a: InventoryItem, b: InventoryItem) {
  return itemStackKey(a) === itemStackKey(b);
}

function findStackMatch(itemList: InventoryItem[], bagId: string, item: InventoryItem, excludeItemId?: string) {
  return itemList.find((candidate) =>
    candidate.bagId === bagId &&
    candidate.id !== excludeItemId &&
    isSameStackItem(candidate, item),
  );
}


function getBagKind(bag: Bag | undefined | null): BagKind {
  if (!bag) return "inventory";
  return bag.kind ?? (bag.type === "dm" ? "container" : "inventory");
}

function bagKindLabel(kind: BagKind) {
  return kind === "container" ? "Behälter" : "Inventar";
}

function itemWeightAfterPatch(item: InventoryItem, patch: Partial<InventoryItem> = {}) {
  const quantity = patch.quantity ?? item.quantity;
  const weightPerUnit = patch.weightPerUnit ?? item.weightPerUnit ?? 0;
  return quantity * weightPerUnit;
}

function itemVolumeAfterPatch(item: InventoryItem, patch: Partial<InventoryItem> = {}) {
  const quantity = patch.quantity ?? item.quantity;
  const volumePerUnit = patch.volumePerUnit ?? item.volumePerUnit ?? 0;
  return quantity * volumePerUnit;
}

type LoadTone = "neutral" | "green" | "yellow" | "orange" | "red";

function bagLoadStatus(bag: Bag | undefined | null, weight: number) {
  if (!bag) return { label: "—", detail: "Keine Tasche", tone: "neutral" as LoadTone };
  const kind = getBagKind(bag);
  const max = bag.maxWeight;

  if (max === null || max === undefined || max <= 0) {
    return kind === "container"
      ? { label: "Kein Gewichtslimit", detail: "Behälter ohne Gewichtslimit", tone: "neutral" as LoadTone }
      : { label: "Kein Schwellenwert", detail: "Keine Encumbrance-Schwelle gesetzt", tone: "neutral" as LoadTone };
  }

  if (kind === "container") {
    if (weight > max) return { label: "Überfüllt", detail: `Über harter Grenze von ${formatNumber(max)} lb`, tone: "red" as LoadTone };
    return { label: "Kapazität frei", detail: `Harte Grenze: ${formatNumber(max)} lb`, tone: "green" as LoadTone };
  }

  if (weight <= max) return { label: "Normal", detail: `Bis ${formatNumber(max)} lb`, tone: "green" as LoadTone };
  if (weight <= max * 2) return { label: "Encumbered", detail: `${formatNumber(max)}–${formatNumber(max * 2)} lb`, tone: "yellow" as LoadTone };
  if (weight <= max * 3) return { label: "Heavily Encumbered", detail: `${formatNumber(max * 2)}–${formatNumber(max * 3)} lb`, tone: "orange" as LoadTone };
  return { label: "Overloaded", detail: `Über ${formatNumber(max * 3)} lb`, tone: "red" as LoadTone };
}

function loadToneClass(tone: LoadTone) {
  switch (tone) {
    case "green": return "border-emerald-700/30 bg-emerald-900/20 text-emerald-200";
    case "yellow": return "border-yellow-700/40 bg-yellow-900/20 text-yellow-100";
    case "orange": return "border-orange-700/40 bg-orange-900/25 text-orange-100";
    case "red": return "border-red-700/50 bg-red-900/30 text-red-100";
    default: return "border-current/10 bg-current/5";
  }
}

function itemSortValue(item: InventoryItem, key: ItemSortKey): string | number {
  switch (key) {
    case "custom":
      return getItemOrderIndex(item);
    case "name":
      return item.name.toLowerCase();
    case "quantity":
      return item.quantity;
    case "weightUnit":
      return item.weightPerUnit ?? 0;
    case "weightStack":
      return totalWeight(item);
    case "volumeUnit":
      return item.volumePerUnit ?? 0;
    case "volumeStack":
      return totalVolume(item);
    case "valueUnit":
      return item.valuePerUnit ?? 0;
    case "valueStack":
      return totalValue(item);
    case "createdAt":
      return item.createdAt ?? 0;
    case "updatedAt":
      return item.updatedAt ?? 0;
  }
}

function compareItems(a: InventoryItem, b: InventoryItem, sortKey: ItemSortKey, direction: SortDirection) {
  const categoryDelta = itemCategoryOrder(a.category) - itemCategoryOrder(b.category);
  if (categoryDelta !== 0) return categoryDelta;

  const left = itemSortValue(a, sortKey);
  const right = itemSortValue(b, sortKey);
  let result = 0;

  if (typeof left === "string" || typeof right === "string") {
    result = String(left).localeCompare(String(right), "de", { numeric: true, sensitivity: "base" });
  } else {
    result = left - right;
  }

  if (result === 0 && sortKey !== "custom") {
    result = getItemOrderIndex(a) - getItemOrderIndex(b);
  }

  if (result === 0) {
    result = a.name.localeCompare(b.name, "de", { numeric: true, sensitivity: "base" });
  }

  return sortKey === "custom" || direction === "asc" ? result : -result;
}

function typeLabel(type: BagType) {
  switch (type) {
    case "party":
      return "Gruppe";
    case "personal":
      return "Persönlich";
    case "shared":
      return "Geteilt";
    case "dm":
      return "DM";
  }
}

function typeIcon(type: BagType = "personal") {
  if (type === "party") return <Boxes className="h-4 w-4" />;
  if (type === "dm") return <ShieldCheck className="h-4 w-4" />;
  if (type === "shared") return <Unlock className="h-4 w-4" />;
  return <Backpack className="h-4 w-4" />;
}

function makeAccess(
  targetMode: AccessMode,
  depositMode: AccessMode,
  readMode: AccessMode,
  writeMode: AccessMode,
  targetUserIds: string[] = [],
  depositUserIds: string[] = [],
  readUserIds: string[] = [],
  writeUserIds: string[] = [],
): BagAccess {
  return { targetMode, targetUserIds, depositMode, depositUserIds, readMode, readUserIds, writeMode, writeUserIds };
}

function publicBagAccess(): BagAccess {
  return makeAccess("all", "all", "all", "all");
}

function dmOnlyAccess(): BagAccess {
  return makeAccess("dm", "dm", "dm", "dm");
}

function privateIncomingAllowedAccess(ownerUid: string): BagAccess {
  // Jeder sieht die Tasche und kann Items hineinlegen. Nur Besitzer + DM dürfen öffnen und bearbeiten.
  return makeAccess("all", "all", "custom", "custom", [], [], [ownerUid], [ownerUid]);
}

function normalizeAccess(access: Partial<BagAccess> | undefined): BagAccess | null {
  if (!access) return null;
  return {
    targetMode: access.targetMode ?? "dm",
    targetUserIds: access.targetUserIds ?? [],
    depositMode: access.depositMode ?? "dm",
    depositUserIds: access.depositUserIds ?? [],
    readMode: access.readMode ?? "dm",
    readUserIds: access.readUserIds ?? [],
    writeMode: access.writeMode ?? "dm",
    writeUserIds: access.writeUserIds ?? [],
  };
}

function getBagAccess(bag: Bag | undefined | null): BagAccess {
  const normalized = normalizeAccess(bag?.access);
  if (normalized) return normalized;

  // Legacy fallback for older prototype bags that still use type/permissions.
  const owner = bag?.ownerUid ?? "";
  const read = bag?.permissions?.read ?? [];
  const write = bag?.permissions?.write ?? [];
  const type = bag?.type ?? "personal";

  if (type === "party") return publicBagAccess();
  if (type === "dm") return dmOnlyAccess();
  if (type === "shared") return makeAccess("all", write.includes("all") ? "all" : "dm", "all", write.includes("all") ? "all" : "dm");

  const readUsers = Array.from(new Set([owner, ...read.filter((id) => id !== "all"), ...write.filter((id) => id !== "all")].filter(Boolean)));
  const writeUsers = Array.from(new Set([owner, ...write.filter((id) => id !== "all")].filter(Boolean)));
  return makeAccess("all", "all", read.includes("all") ? "all" : "custom", write.includes("all") ? "all" : "custom", [], [], readUsers, writeUsers);
}

function accessAllows(mode: AccessMode, userIds: string[], uid: string, isDm: boolean) {
  if (isDm) return true;
  if (mode === "all") return true;
  if (mode === "dm") return false;
  return userIds.includes(uid);
}

function uniqueUidList(ids: string[], allowedUserIds?: Set<string>) {
  return Array.from(new Set(ids.filter((id) => typeof id === "string" && id.trim()).map((id) => id.trim())))
    .filter((id) => !allowedUserIds || allowedUserIds.has(id))
    .sort();
}

function sanitizeAccessUserLists(access: BagAccess, allowedUserIds?: Set<string>): BagAccess {
  return {
    ...access,
    targetUserIds: uniqueUidList(access.targetUserIds ?? [], allowedUserIds),
    depositUserIds: uniqueUidList(access.depositUserIds ?? [], allowedUserIds),
    readUserIds: uniqueUidList(access.readUserIds ?? [], allowedUserIds),
    writeUserIds: uniqueUidList(access.writeUserIds ?? [], allowedUserIds),
  };
}

function removeUserFromAccess(access: BagAccess, uidToRemove: string): BagAccess {
  const cleaned = (ids: string[]) => (ids ?? []).filter((id) => id !== uidToRemove);
  return sanitizeAccessUserLists({
    ...access,
    targetUserIds: cleaned(access.targetUserIds),
    depositUserIds: cleaned(access.depositUserIds),
    readUserIds: cleaned(access.readUserIds),
    writeUserIds: cleaned(access.writeUserIds),
  });
}

function targetAccessKeysForAccess(access: BagAccess) {
  if (access.targetMode === "all") return [TARGET_ACCESS_ALL_KEY];
  if (access.targetMode === "custom") return uniqueUidList(access.targetUserIds);
  return [];
}

function withBagAccessMirror<T extends Partial<Bag>>(bagOrPatch: T): T {
  if (!bagOrPatch.access) return bagOrPatch;
  return {
    ...bagOrPatch,
    targetAccessKeys: targetAccessKeysForAccess(getBagAccess(bagOrPatch as Bag)),
  };
}

function bagTargetVisibleByMirror(bag: Bag, uid: string, isDm: boolean) {
  // Die Access-Struktur ist die Quelle der Wahrheit.
  // targetAccessKeys ist nur ein optionaler Mirror/Index und darf keine korrekt gesetzten Rechte verstecken,
  // sonst kommen alte Sichtbarkeitsbugs zurück, wenn Mirror-Felder fehlen oder veraltet sind.
  return canTargetBagByAccess(bag, uid, isDm);
}

function indexedVisiblePlayerIdsForBag(bag: Bag, playerUids: string[]) {
  return playerUids.filter((uid) => canTargetBagByAccess(bag, uid, false));
}

async function syncTargetVisibilityIndex(campaignId: string, latestBags: Bag[], latestMembers: CampaignMember[]) {
  if (!firebaseDb) return;

  const playerUids = uniqueUidList(latestMembers.filter((entry) => entry.role === "player").map((entry) => entry.uid));
  if (!playerUids.length) return;

  const now = Date.now();
  let batch = writeBatch(firebaseDb);
  let ops = 0;
  const commits: Promise<void>[] = [];

  const commitIfNeeded = () => {
    if (ops === 0) return;
    commits.push(batch.commit());
    batch = writeBatch(firebaseDb);
    ops = 0;
  };

  for (const playerUid of playerUids) {
    const allowedBagIds = new Set(
      latestBags
        .filter((bag) => canTargetBagByAccess(bag, playerUid, false))
        .map((bag) => bag.id),
    );

    const visibilityRef = collection(firebaseDb, "campaigns", campaignId, "targetVisibility", playerUid, "bags");
    const existingSnapshot = await getDocs(visibilityRef);
    const existingBagIds = new Set(existingSnapshot.docs.map((entry) => entry.id));

    for (const bagId of allowedBagIds) {
      if (existingBagIds.has(bagId)) continue;
      batch.set(doc(firebaseDb, "campaigns", campaignId, "targetVisibility", playerUid, "bags", bagId), {
        bagId,
        playerUid,
        updatedAt: now,
      });
      ops += 1;
      if (ops >= 450) commitIfNeeded();
    }

    for (const bagId of existingBagIds) {
      if (allowedBagIds.has(bagId)) continue;
      batch.delete(doc(firebaseDb, "campaigns", campaignId, "targetVisibility", playerUid, "bags", bagId));
      ops += 1;
      if (ops >= 450) commitIfNeeded();
    }
  }

  commitIfNeeded();
  await Promise.all(commits);
}

async function syncTargetVisibilityIndexForBag(campaignId: string, bag: Bag, latestMembers: CampaignMember[]) {
  if (!firebaseDb) return;

  const playerUids = uniqueUidList(latestMembers.filter((entry) => entry.role === "player").map((entry) => entry.uid));
  if (!playerUids.length) return;

  const allowedPlayerIds = new Set(indexedVisiblePlayerIdsForBag(bag, playerUids));
  const now = Date.now();
  let batch = writeBatch(firebaseDb);
  let ops = 0;
  const commits: Promise<void>[] = [];

  const commitIfNeeded = () => {
    if (ops === 0) return;
    commits.push(batch.commit());
    batch = writeBatch(firebaseDb);
    ops = 0;
  };

  for (const playerUid of playerUids) {
    const indexDoc = doc(firebaseDb, "campaigns", campaignId, "targetVisibility", playerUid, "bags", bag.id);
    if (allowedPlayerIds.has(playerUid)) {
      batch.set(indexDoc, {
        bagId: bag.id,
        playerUid,
        updatedAt: now,
      });
    } else {
      batch.delete(indexDoc);
    }
    ops += 1;
    if (ops >= 450) commitIfNeeded();
  }

  commitIfNeeded();
  await Promise.all(commits);
}

function canTargetBagByAccess(bag: Bag | undefined | null, uid: string, isDm: boolean) {
  if (!bag) return false;
  const access = getBagAccess(bag);
  return accessAllows(access.targetMode, access.targetUserIds, uid, isDm);
}

function modeShortLabel(mode: AccessMode, ids: string[]) {
  if (mode === "all") return "Alle";
  if (mode === "dm") return "Nur DM";
  return ids.length ? `Auswahl (${ids.length})` : "Auswahl (leer)";
}

function defaultBagAccessForType(type: BagType, actorUid: string): Pick<Bag, "ownerUid" | "permissions"> {
  switch (type) {
    case "party":
      return { ownerUid: null, permissions: { read: ["all"], write: ["all"] } };
    case "shared":
      return { ownerUid: null, permissions: { read: ["all"], write: [] } };
    case "dm":
      return { ownerUid: actorUid, permissions: { read: [], write: [] } };
    case "personal":
    default:
      return { ownerUid: actorUid, permissions: { read: [], write: [] } };
  }
}

export default function App() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem("dnd-inventory-theme") as ThemeMode | null;
    return saved ?? "system";
  });
  const [systemDark, setSystemDark] = useState(false);

  const [syncStatus, setSyncStatus] = useState<"local" | "connecting" | "online" | "error">(firebaseConfigured ? "connecting" : "local");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [userUid, setUserUid] = useState<string | null>(null);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [accountBusy, setAccountBusy] = useState(false);

  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(() => localStorage.getItem(activeCampaignStorageKey));
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [member, setMember] = useState<CampaignMember | null>(null);
  const [campaignAccessReady, setCampaignAccessReady] = useState(false);
  const [campaignAccessRefreshKey, setCampaignAccessRefreshKey] = useState(0);
  const [members, setMembers] = useState<CampaignMember[]>([]);
  const [userCampaigns, setUserCampaigns] = useState<UserCampaignSummary[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [auditLogOpen, setAuditLogOpen] = useState(false);
  const [auditLogLimit, setAuditLogLimit] = useState(50);
  const [auditLogFullyLoaded, setAuditLogFullyLoaded] = useState(false);
  const [auditLogCategoryFilter, setAuditLogCategoryFilter] = useState<AuditLogCategory>("all");
  const [auditLogActorFilter, setAuditLogActorFilter] = useState("all");
  const [auditLogSearch, setAuditLogSearch] = useState("");
  const [joinCodeCopied, setJoinCodeCopied] = useState(false);
  const [joinCodeVisible, setJoinCodeVisible] = useState(false);
  const [backupPanelOpen, setBackupPanelOpen] = useState(false);
  const [backupFileHandle, setBackupFileHandle] = useState<any | null>(null);
  const [backupMirrorEnabled, setBackupMirrorEnabled] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [backupLastSavedAt, setBackupLastSavedAt] = useState<number | null>(null);
  const [repairPreview, setRepairPreview] = useState<RepairPreview | null>(null);
  const [repairModalOpen, setRepairModalOpen] = useState(false);
  const [repairBusy, setRepairBusy] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [restoreCandidate, setRestoreCandidate] = useState<RestoreCandidate | null>(null);
  const [restoreConfirmCampaignName, setRestoreConfirmCampaignName] = useState("");
  const [restoreConfirmWord, setRestoreConfirmWord] = useState("");
  const [bagOrderIds, setBagOrderIds] = useState<string[]>([]);
  const [currencyUndoByBag, setCurrencyUndoByBag] = useState<Record<string, CurrencyPouch>>({});

  const [bags, setBags] = useState<Bag[]>(() => {
    if (firebaseConfigured) return [];
    const saved = localStorage.getItem("dnd-inventory-bags");
    return saved ? JSON.parse(saved) : initialBags;
  });
  const [items, setItems] = useState<InventoryItem[]>(() => {
    if (firebaseConfigured) return [];
    const saved = localStorage.getItem("dnd-inventory-items");
    return saved ? JSON.parse(saved) : initialItems;
  });
  const [activeItemsLoadedBagId, setActiveItemsLoadedBagId] = useState<string | null>(() => firebaseConfigured ? null : (bags[0]?.id ?? null));

  const [selectedBagId, setSelectedBagId] = useState(() => bags[0]?.id ?? "");
  const [search, setSearch] = useState("");
  const [itemSortKey, setItemSortKey] = useState<ItemSortKey>("custom");
  const [itemSortDirection, setItemSortDirection] = useState<SortDirection>("asc");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [transferTarget, setTransferTarget] = useState<TransferTarget>(null);
  const [saleConfirmTarget, setSaleConfirmTarget] = useState<SaleConfirmTarget>(null);
  const [thumbnailTarget, setThumbnailTarget] = useState<ThumbnailTarget>(null);
  const [imageViewerTarget, setImageViewerTarget] = useState<ImageViewerTarget>(null);
  const [editingBagId, setEditingBagId] = useState<string | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [expandedItemIds, setExpandedItemIds] = useState<string[]>([]);
  const [collapsedCategoryKeys, setCollapsedCategoryKeys] = useState<string[]>([]);
  const [itemCatalogOpen, setItemCatalogOpen] = useState(false);
  const [newBagName, setNewBagName] = useState("");
  const [newBagKind, setNewBagKind] = useState<BagKind>("inventory");
  const [newItem, setNewItem] = useState({
    name: "",
    quantity: "1",
    weightPerUnit: "",
    volumePerUnit: "",
    valuePerUnit: "",
    description: "",
    category: "gear" as ItemCategory,
  });
  const [tradeRateModalOpen, setTradeRateModalOpen] = useState(false);
  const [tradeRateNameInput, setTradeRateNameInput] = useState(DEFAULT_TRADE_RATE_NAME);
  const [tradeBuyInput, setTradeBuyInput] = useState(formatNumber(DEFAULT_TRADE_BUY_MULTIPLIER));
  const [tradeSellInput, setTradeSellInput] = useState(formatNumber(DEFAULT_TRADE_SELL_MULTIPLIER));

  async function syncUserProfile(user: User, displayNameOverride?: string) {
    if (!firebaseDb) return;
    const profileName = displayNameOverride?.trim() || user.displayName || user.email?.split("@")[0] || "Nutzer";
    const timestamp = Date.now();
    await setDoc(
      doc(firebaseDb, "users", user.uid),
      {
        uid: user.uid,
        displayName: profileName,
        email: user.email ?? null,
        isAnonymous: user.isAnonymous,
        updatedAt: timestamp,
        createdAt: timestamp,
      } satisfies AppUserProfile,
      { merge: true },
    );
  }

  async function registerAccount(email: string, password: string, passwordConfirm: string, displayName: string) {
    if (!firebaseAuth || !firebaseDb) throw new Error("Firebase Auth ist nicht bereit.");
    const cleanEmail = email.trim();
    const cleanName = displayName.trim();
    if (!cleanEmail) throw new Error("E-Mail ist erforderlich.");
    if (!cleanName) throw new Error("Anzeigename ist erforderlich.");
    if (!password) throw new Error("Passwort ist erforderlich.");
    if (password.length < 6) throw new Error("Das Passwort muss mindestens 6 Zeichen haben.");
    if (password !== passwordConfirm) throw new Error("Die beiden Passwörter stimmen nicht überein.");

    setAccountBusy(true);
    try {
      const result = await createUserWithEmailAndPassword(firebaseAuth, cleanEmail, password);
      await updateProfile(result.user, { displayName: cleanName });
      await syncUserProfile(result.user, cleanName);
      setAuthUser(result.user);
      setUserUid(result.user.uid);
    } finally {
      setAccountBusy(false);
    }
  }

  async function loginWithEmail(email: string, password: string) {
    if (!firebaseAuth) throw new Error("Firebase Auth ist nicht bereit.");
    const cleanEmail = email.trim();
    if (!cleanEmail || !password) throw new Error("E-Mail und Passwort sind erforderlich.");

    setAccountBusy(true);
    try {
      const result = await signInWithEmailAndPassword(firebaseAuth, cleanEmail, password);
      await syncUserProfile(result.user);
      setAuthUser(result.user);
      setUserUid(result.user.uid);
    } finally {
      setAccountBusy(false);
    }
  }

  async function logoutAccount() {
    if (!firebaseAuth) return;
    setAccountBusy(true);
    try {
      setActiveCampaignId(null);
      setCampaign(null);
      setMember(null);
      setMembers([]);
      setBags([]);
      setItems([]);
      setUserCampaigns([]);
      await signOut(firebaseAuth);
    } finally {
      setAccountBusy(false);
    }
  }

  async function resetPassword(email: string) {
    if (!firebaseAuth) throw new Error("Firebase Auth ist nicht bereit.");
    const cleanEmail = email.trim();
    if (!cleanEmail) throw new Error("Bitte eine E-Mail-Adresse eingeben.");
    await sendPasswordResetEmail(firebaseAuth, cleanEmail);
  }

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemDark(media.matches);
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    localStorage.setItem("dnd-inventory-theme", themeMode);
  }, [themeMode]);

  useEffect(() => {
    if (!firebaseConfigured) return;
    // Alte lokale Demo-Daten aus frühen Prototypen dürfen im Firebase-Modus nie in eine Kampagne hineinbluten.
    localStorage.removeItem("dnd-inventory-bags");
    localStorage.removeItem("dnd-inventory-items");
  }, []);

  useEffect(() => {
    if (!firebaseConfigured) localStorage.setItem("dnd-inventory-bags", JSON.stringify(bags));
  }, [bags]);

  useEffect(() => {
    if (!firebaseConfigured) localStorage.setItem("dnd-inventory-items", JSON.stringify(items));
  }, [items]);

  useEffect(() => {
    if (activeCampaignId) localStorage.setItem(activeCampaignStorageKey, activeCampaignId);
    else localStorage.removeItem(activeCampaignStorageKey);
  }, [activeCampaignId]);

  useEffect(() => {
    if (!firebaseConfigured || !firebaseAuth) return;

    setSyncStatus("connecting");
    setSyncError(null);

    const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
      try {
        if (!user || user.isAnonymous) {
          setAuthUser(null);
          setUserUid(null);
          setActiveCampaignId(null);
          setCampaign(null);
          setMember(null);
          setMembers([]);
          setBags([]);
          setItems([]);
          setActiveItemsLoadedBagId(null);
          setUserCampaigns([]);
          setSyncStatus("online");
          if (user?.isAnonymous) await signOut(firebaseAuth).catch(() => undefined);
          return;
        }
        setAuthUser(user);
        setUserUid(user.uid);
        await syncUserProfile(user).catch(() => undefined);
        setSyncStatus(activeCampaignId ? "connecting" : "online");
      } catch (error) {
        setSyncStatus("error");
        setSyncError(error instanceof Error ? error.message : "Unbekannter Auth-Fehler");
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!firebaseConfigured || !firebaseDb || !userUid) return;

    const userCampaignsRef = collection(firebaseDb, "users", userUid, "campaigns");
    const unsubscribe = onSnapshot(
      query(userCampaignsRef, orderBy("updatedAt", "desc")),
      (snapshot) => {
        setUserCampaigns(snapshot.docs.map((entry) => entry.data() as UserCampaignSummary));
      },
      (error) => {
        // Diese Liste ist Komfort. Wenn sie fehlschlägt, soll die App trotzdem per Join-Code funktionieren.
        console.warn("Kampagnenliste konnte nicht geladen werden", error.message);
      },
    );

    return () => unsubscribe();
  }, [userUid]);

  useEffect(() => {
    if (!firebaseConfigured || !firebaseDb || !userUid || !activeCampaignId) {
      setCampaignAccessReady(false);
      return;
    }

    let cancelled = false;
    setCampaignAccessReady(false);
    setCampaign(null);
    setMember(null);
    setMembers([]);
    setBags([]);
    setItems([]);
    setActiveItemsLoadedBagId(null);
    setAuditLog([]);
    setSyncStatus("connecting");
    setSyncError(null);

    const memberRef = doc(firebaseDb, "campaigns", activeCampaignId, "members", userUid);

    getDoc(memberRef)
      .then((snapshot) => {
        if (cancelled) return;
        if (!snapshot.exists()) {
          setCampaignAccessReady(false);
          setMember(null);
          setSyncStatus("error");
          setSyncError("Du bist mit diesem Firebase-Account kein Mitglied dieser Kampagne. Öffne sie über den Join-Code oder entferne sie aus deiner Liste.");
          return;
        }
        setMember(snapshot.data() as CampaignMember);
        setCampaignAccessReady(true);
        setSyncStatus("connecting");
      })
      .catch((error) => {
        if (cancelled) return;
        setCampaignAccessReady(false);
        setMember(null);
        setSyncStatus("error");
        setSyncError(error instanceof Error ? error.message : "Mitgliedschaft konnte nicht geprüft werden.");
      });

    return () => {
      cancelled = true;
      setCampaignAccessReady(false);
    };
  }, [activeCampaignId, userUid, campaignAccessRefreshKey]);

  useEffect(() => {
    if (!firebaseConfigured || !firebaseDb || !userUid || !activeCampaignId || !campaignAccessReady) return;

    setSyncStatus("connecting");
    setSyncError(null);

    const campaignRef = doc(firebaseDb, "campaigns", activeCampaignId);
    const memberRef = doc(firebaseDb, "campaigns", activeCampaignId, "members", userUid);

    const unsubCampaign = onSnapshot(
      campaignRef,
      (snapshot) => {
        setCampaign(snapshot.exists() ? (snapshot.data() as Campaign) : null);
        setSyncStatus("online");
      },
      (error) => {
        setSyncStatus("error");
        setSyncError(error.message);
      },
    );

    const unsubMember = onSnapshot(
      memberRef,
      (snapshot) => {
        const loadedMember = snapshot.exists() ? (snapshot.data() as CampaignMember) : null;
        setMember(loadedMember);
        if (!loadedMember) {
          setCampaignAccessReady(false);
          setBags([]);
          setItems([]);
          setActiveItemsLoadedBagId(null);
          setMembers([]);
          setAuditLog([]);
          setSyncStatus("error");
          setSyncError("Deine Mitgliedschaft in dieser Kampagne wurde entfernt.");
        } else {
          setSyncStatus("online");
        }
      },
      (error) => {
        setSyncStatus("error");
        setSyncError(error.message);
      },
    );

    if (member?.role === "applicant") {
      setMembers(member ? [member] : []);
      setAuditLog([]);
      setBags([]);
      setItems([]);
      return () => {
        unsubCampaign();
        unsubMember();
      };
    }

    const unsubMembers = onSnapshot(
      collection(firebaseDb, "campaigns", activeCampaignId, "members"),
      (snapshot) => {
        setMembers(snapshot.docs.map((entry) => entry.data() as CampaignMember).sort(compareCampaignMembers));
        setSyncStatus("online");
      },
      (error) => {
        // Mitgliederliste ist Komfort für die Rechte-UI. Sie darf nicht den ganzen Spieler-Client blockieren.
        console.warn("Mitgliederliste konnte nicht geladen werden", error.message);
        setMembers((prev) => prev.length ? prev : member ? [member] : []);
      },
    );

    return () => {
      unsubCampaign();
      unsubMember();
      unsubMembers();
    };
  }, [activeCampaignId, userUid, campaignAccessReady, member?.role]);

  useEffect(() => {
    if (!auditLogOpen) return;
    if (!firebaseConfigured || !firebaseDb || !activeCampaignId || !campaignAccessReady || (member?.role !== "dm" && member?.role !== "player")) return;

    const cappedLimit = Math.min(500, Math.max(50, auditLogLimit));
    const unsubscribe = onSnapshot(
      query(collection(firebaseDb, "campaigns", activeCampaignId, "auditLog"), orderBy("createdAt", "desc"), limit(cappedLimit)),
      (snapshot) => {
        setAuditLog(snapshot.docs.map((entry) => entry.data() as AuditLogEntry));
        setAuditLogFullyLoaded(snapshot.docs.length < cappedLimit || cappedLimit >= 500);
        setSyncStatus("online");
      },
      (error) => {
        console.warn("Aktivitätslog konnte nicht geladen werden", error.message);
        setSyncStatus("error");
        setSyncError(error.message);
      },
    );

    return () => unsubscribe();
  }, [auditLogOpen, auditLogLimit, firebaseConfigured, activeCampaignId, campaignAccessReady, member?.role]);

  const isDark = themeMode === "dark" || (themeMode === "system" && systemDark);

  const panelClass = isDark
    ? "border-[#7b6237]/50 bg-[#241a12] shadow-black/40"
    : "border-[#8a6a35]/35 bg-[#f8edcf] shadow-[#6d4d24]/20";
  const mutedText = isDark ? "text-[#c8b98f]" : "text-[#6a5130]";
  const inputClass = isDark
    ? "border-[#806337]/60 bg-[#1a130d] text-[#f3e7c8] placeholder:text-[#8f7e5e] focus:border-[#d2a94d] focus:outline-none"
    : "border-[#a47b39]/45 bg-[#fff8df] text-[#2d2116] placeholder:text-[#9a7a4b] focus:border-[#8a5c14] focus:outline-none";

  const buttonBase = "inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40";
  const primaryButton = isDark
    ? `${buttonBase} bg-[#b88a32] text-[#160f08] hover:bg-[#d0a34b]`
    : `${buttonBase} bg-[#7a4e17] text-[#fff4d0] hover:bg-[#5f3b10]`;
  const secondaryButton = isDark
    ? `${buttonBase} border border-[#8d713e]/60 bg-[#2f2316] text-[#f3e7c8] hover:bg-[#3b2b1b]`
    : `${buttonBase} border border-[#9b7339]/45 bg-[#f1ddb3] text-[#382615] hover:bg-[#e5cd9d]`;
  const dangerButton = `${buttonBase} bg-[#8f1d1d] text-[#fff1e5] hover:bg-[#aa2525]`;

  const isDm = !firebaseConfigured || member?.role === "dm";
  const isApplicant = firebaseConfigured && member?.role === "applicant";
  const isApprovedMember = !firebaseConfigured || member?.role === "dm" || member?.role === "player";
  const activeUid = userUid ?? localUserId;
  const currentBagOrderStorageKey = bagOrderStorageKey(activeCampaignId, activeUid);
  const currentSelectedBagStorageKey = selectedBagStorageKey(activeCampaignId, activeUid);
  const currentCollapsedCategoriesStorageKey = collapsedCategoriesStorageKey(activeCampaignId, activeUid);
  const sortedMembers = useMemo(() => [...members].sort(compareCampaignMembers), [members]);
  const tradeRates = useMemo(() => campaignTradeRates(campaign), [campaign?.tradeRateName, campaign?.tradeBuyMultiplier, campaign?.tradeSellMultiplier]);

  useEffect(() => {
    setTradeRateNameInput(tradeRates.name);
    setTradeBuyInput(formatNumber(tradeRates.buyMultiplier));
    setTradeSellInput(formatNumber(tradeRates.sellMultiplier));
  }, [tradeRates.name, tradeRates.buyMultiplier, tradeRates.sellMultiplier]);

  useEffect(() => {
    if (!campaign?.id || !isDm) {
      setBackupFileHandle(null);
      setBackupMirrorEnabled(false);
      setBackupLastSavedAt(null);
      setRestoreCandidate(null);
      setRestoreConfirmCampaignName("");
      setRestoreConfirmWord("");
      return;
    }
    let cancelled = false;
    getStoredBackupHandle(campaign.id)
      .then((handle) => {
        if (cancelled) return;
        if (handle) {
          setBackupFileHandle(handle);
          setBackupMirrorEnabled(true);
          setBackupMessage("Mirror-Datei ist für diese Kampagne gemerkt. Automatische Sicherung ist aktiv, sobald der Browser Schreibrecht hat.");
        } else {
          setBackupFileHandle(null);
          setBackupMirrorEnabled(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBackupFileHandle(null);
          setBackupMirrorEnabled(false);
        }
      });
    return () => { cancelled = true; };
  }, [campaign?.id, isDm]);

  const backupAutoSignature = useMemo(() => {
    if (!campaign || !isDm || !backupMirrorEnabled || !backupFileHandle) return "";
    return JSON.stringify({ campaign, members, bags, items, auditLog, bagOrderIds });
  }, [campaign, members, bags, items, auditLog, bagOrderIds, isDm, backupMirrorEnabled, backupFileHandle]);

  useEffect(() => {
    if (!backupAutoSignature || !backupMirrorEnabled || !backupFileHandle || !campaign || !isDm) return;
    const timeout = window.setTimeout(() => {
      writeMirrorBackup("mirror_auto").catch(() => undefined);
    }, 1500);
    return () => window.clearTimeout(timeout);
  }, [backupAutoSignature]);

  async function copyJoinCodeToClipboard() {
    const code = campaign?.joinCode;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setJoinCodeCopied(true);
      window.setTimeout(() => setJoinCodeCopied(false), 1800);
    } catch {
      setSyncStatus("error");
      setSyncError("Join-Code konnte nicht in die Zwischenablage kopiert werden.");
    }
  }

  function revealJoinCodeTemporarily() {
    setJoinCodeVisible(true);
    window.setTimeout(() => setJoinCodeVisible(false), 7000);
  }

  function buildCampaignBackup(reason: CampaignBackup["reason"]): CampaignBackup {
    return {
      schema: "dnd_inventory_manager_backup_v1",
      exportedAt: Date.now(),
      exportedBy: {
        uid: activeUid,
        displayName: member?.displayName ?? authUser?.displayName ?? authUser?.email ?? "Unbekannt",
        role: member?.role ?? "local",
      },
      reason,
      app: { name: "DND Inventory Manager", backupVersion: 1 },
      campaign,
      member,
      members: [...members],
      bags: [...bags],
      items: [...items],
      auditLog: [...auditLog],
      localState: {
        selectedBagId,
        bagOrderIds: [...bagOrderIds],
        itemSortKey,
        itemSortDirection,
        collapsedCategoryKeys: [...collapsedCategoryKeys],
      },
    };
  }

  function backupFilename() {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    return `dnd-inventory-backup-${safeFileName(campaign?.name ?? "kampagne")}-${stamp}.json`;
  }

  async function exportCampaignBackup() {
    if (!campaign || !isDm) {
      setBackupMessage("Nur der DM kann ein vollständiges Kampagnenbackup exportieren.");
      return;
    }
    const backup = buildCampaignBackup("manual_export");
    downloadJsonFile(backupFilename(), backup);
    setBackupLastSavedAt(Date.now());
    setBackupMessage("Backup-Datei wurde heruntergeladen.");
    logAction("campaign_backup_exported", `${member?.displayName ?? "DM"} hat ein Kampagnenbackup exportiert.`, campaign.id);
  }

  async function writeMirrorBackup(reason: CampaignBackup["reason"] = "mirror_auto") {
    if (!campaign || !isDm || !backupFileHandle) return;
    setBackupBusy(true);
    try {
      const backup = buildCampaignBackup(reason);
      await writeTextToFileHandle(backupFileHandle, JSON.stringify(backup, null, 2));
      setBackupLastSavedAt(Date.now());
      setBackupMessage(reason === "mirror_auto" ? "Mirror-Backup automatisch aktualisiert." : "Mirror-Backup wurde geschrieben.");
    } catch (error) {
      setBackupMirrorEnabled(false);
      setBackupMessage(error instanceof Error ? error.message : "Mirror-Backup konnte nicht geschrieben werden.");
    } finally {
      setBackupBusy(false);
    }
  }

  async function chooseMirrorBackupFile() {
    if (!campaign || !isDm) {
      setBackupMessage("Nur der DM kann eine Mirror-Backup-Datei verbinden.");
      return;
    }
    if (!("showSaveFilePicker" in window)) {
      setBackupMessage("Dieser Browser unterstützt keine direkte lokale Mirror-Datei. Nutze stattdessen den manuellen JSON-Export.");
      return;
    }
    setBackupBusy(true);
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: `dnd-inventory-mirror-${safeFileName(campaign.name)}.json`,
        types: [{ description: "DND Inventory Backup JSON", accept: { "application/json": [".json"] } }],
      });
      await storeBackupHandle(campaign.id, handle);
      setBackupFileHandle(handle);
      setBackupMirrorEnabled(true);
      setBackupMessage("Mirror-Datei verbunden. Die App aktualisiert sie automatisch nach Kampagnenänderungen.");
      await writeTextToFileHandle(handle, JSON.stringify(buildCampaignBackup("mirror_manual"), null, 2));
      setBackupLastSavedAt(Date.now());
      logAction("campaign_backup_mirror_connected", `${member?.displayName ?? "DM"} hat ein lokales Mirror-Backup verbunden.`, campaign.id);
    } catch (error) {
      setBackupMessage(error instanceof Error ? error.message : "Mirror-Datei konnte nicht verbunden werden.");
    } finally {
      setBackupBusy(false);
    }
  }

  async function disconnectMirrorBackup() {
    if (!campaign) return;
    try {
      await removeStoredBackupHandle(campaign.id).catch(() => undefined);
      setBackupFileHandle(null);
      setBackupMirrorEnabled(false);
      setBackupMessage("Mirror-Backup wurde getrennt. Manuelle Exporte bleiben weiter möglich.");
      logAction("campaign_backup_mirror_disconnected", `${member?.displayName ?? "DM"} hat das lokale Mirror-Backup getrennt.`, campaign.id);
    } catch (error) {
      setBackupMessage(error instanceof Error ? error.message : "Mirror-Backup konnte nicht getrennt werden.");
    }
  }


  async function handleRestoreFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!campaign || !isDm) {
      setBackupMessage("Nur der DM kann ein Backup importieren.");
      return;
    }
    setBackupBusy(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const backup = validateCampaignBackupPayload(parsed);
      const warnings: string[] = [];
      if (backup.campaign?.id && backup.campaign.id !== campaign.id) {
        warnings.push("Das Backup stammt von einer anderen Kampagnen-ID. Es wird trotzdem in die aktuell geöffnete Kampagne importiert; aktueller Join-Code und aktueller DM bleiben erhalten.");
      }
      if (backup.campaign?.dmUid && backup.campaign.dmUid !== campaign.dmUid) {
        warnings.push("Das Backup hat einen anderen DM. Beim Restore bleibt der aktuelle DM dieser Kampagne der DM.");
      }
      const backupBagIds = new Set((backup.bags ?? []).map((bag) => bag.id));
      const orphanItems = (backup.items ?? []).filter((item) => !backupBagIds.has(item.bagId)).length;
      if (orphanItems > 0) warnings.push(`${orphanItems} Item(s) verweisen auf fehlende Taschen. Sie werden beim Import in eine Rettungstasche verschoben.`);
      setRestoreCandidate({ backup, fileName: file.name, warnings });
      setRestoreConfirmCampaignName("");
      setRestoreConfirmWord("");
      const counts = backupCounts(backup);
      setBackupMessage(`Backup „${file.name}“ geladen: ${counts.bags} Taschen, ${counts.items} Items, ${counts.members} Mitglieder, ${counts.logs} Logeinträge. Noch nicht importiert.`);
      logAction("campaign_backup_import_selected", `${member?.displayName ?? "DM"} hat ein Backup zum Import ausgewählt.`, campaign.id);
    } catch (error) {
      setRestoreCandidate(null);
      setBackupMessage(error instanceof Error ? error.message : "Backup-Datei konnte nicht gelesen werden.");
    } finally {
      setBackupBusy(false);
    }
  }

  function normalizeImportedBag(raw: Bag, fallbackIndex: number, timestamp: number): Bag {
    return {
      id: typeof raw.id === "string" && raw.id ? raw.id : uid("bag_restore"),
      name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : `Wiederhergestellte Tasche ${fallbackIndex + 1}`,
      description: typeof (raw as Bag).description === "string" ? (raw as Bag).description : "",
      ownerUid: typeof raw.ownerUid === "string" ? raw.ownerUid : null,
      type: raw.type,
      kind: raw.kind === "container" ? "container" : "inventory",
      sortIndex: typeof raw.sortIndex === "number" ? raw.sortIndex : fallbackIndex,
      maxWeight: typeof raw.maxWeight === "number" ? raw.maxWeight : null,
      maxVolume: typeof raw.maxVolume === "number" ? raw.maxVolume : null,
      currentWeight: 0,
      currentVolume: 0,
      currentValue: 0,
      itemCount: 0,
      currency: normalizeCurrency(raw.currency),
      permissions: raw.permissions,
      access: getBagAccess(raw as Bag),
      targetAccessKeys: targetAccessKeysForAccess(getBagAccess(raw as Bag)),
      imageUrl: sanitizeImageUrl((raw as Bag).imageUrl),
      imageZoom: sanitizeImageZoom((raw as Bag).imageZoom),
      imagePositionX: sanitizeImagePosition((raw as Bag).imagePositionX),
      imagePositionY: sanitizeImagePosition((raw as Bag).imagePositionY),
      ...(typeof (raw as Bag).imageUpdatedAt === "number" ? { imageUpdatedAt: (raw as Bag).imageUpdatedAt } : {}),
      ...(typeof (raw as Bag).imageUpdatedBy === "string" ? { imageUpdatedBy: (raw as Bag).imageUpdatedBy } : {}),
      createdAt: typeof raw.createdAt === "number" ? raw.createdAt : timestamp,
      updatedAt: timestamp,
    };
  }

  function normalizeLiveItem(raw: Partial<InventoryItem> | undefined, fallbackId: string, timestamp = Date.now()): InventoryItem {
    const source = raw ?? {};
    return {
      id: typeof source.id === "string" && source.id ? source.id : fallbackId,
      bagId: typeof source.bagId === "string" ? source.bagId : "",
      name: typeof source.name === "string" && source.name.trim() ? source.name.trim() : "Unbenanntes Item",
      quantity: normalizeItemQuantity(source.quantity, 1),
      weightPerUnit: typeof source.weightPerUnit === "number" && Number.isFinite(source.weightPerUnit) ? source.weightPerUnit : null,
      volumePerUnit: typeof source.volumePerUnit === "number" && Number.isFinite(source.volumePerUnit) ? source.volumePerUnit : null,
      valuePerUnit: typeof source.valuePerUnit === "number" && Number.isFinite(source.valuePerUnit) ? source.valuePerUnit : null,
      description: typeof source.description === "string" ? source.description : "",
      notes: typeof source.notes === "string" ? source.notes : "",
      stackKey: typeof source.stackKey === "string" && source.stackKey ? source.stackKey : itemStackKey({
        name: typeof source.name === "string" && source.name.trim() ? source.name.trim() : "Unbenanntes Item",
        weightPerUnit: typeof source.weightPerUnit === "number" && Number.isFinite(source.weightPerUnit) ? source.weightPerUnit : null,
        volumePerUnit: typeof source.volumePerUnit === "number" && Number.isFinite(source.volumePerUnit) ? source.volumePerUnit : null,
        valuePerUnit: typeof source.valuePerUnit === "number" && Number.isFinite(source.valuePerUnit) ? source.valuePerUnit : null,
      }),
      category: normalizeItemCategory(source.category),
      orderIndex: typeof source.orderIndex === "number" && Number.isFinite(source.orderIndex) ? source.orderIndex : (typeof source.createdAt === "number" ? source.createdAt : timestamp),
      imageUrl: sanitizeImageUrl(source.imageUrl),
      imageZoom: sanitizeImageZoom(source.imageZoom),
      imagePositionX: sanitizeImagePosition(source.imagePositionX),
      imagePositionY: sanitizeImagePosition(source.imagePositionY),
      ...(typeof source.imageUpdatedAt === "number" ? { imageUpdatedAt: source.imageUpdatedAt } : {}),
      ...(typeof source.imageUpdatedBy === "string" ? { imageUpdatedBy: source.imageUpdatedBy } : {}),
      createdBy: typeof source.createdBy === "string" ? source.createdBy : activeUid,
      updatedBy: typeof source.updatedBy === "string" ? source.updatedBy : activeUid,
      createdAt: typeof source.createdAt === "number" ? source.createdAt : timestamp,
      updatedAt: typeof source.updatedAt === "number" ? source.updatedAt : timestamp,
    };
  }

  function normalizeImportedItem(raw: InventoryItem, knownBagIds: Set<string>, rescueBagId: string | null, timestamp: number): InventoryItem {
    const targetBagId = knownBagIds.has(raw.bagId) ? raw.bagId : rescueBagId ?? Array.from(knownBagIds)[0] ?? "restored_items";
    const normalized = normalizeLiveItem(raw, typeof raw.id === "string" && raw.id ? raw.id : uid("item_restore"), timestamp);
    return {
      ...normalized,
      bagId: targetBagId,
      updatedAt: timestamp,
    };
  }

  function normalizeImportedMember(raw: CampaignMember, timestamp: number): CampaignMember | null {
    if (!raw || typeof raw.uid !== "string" || !raw.uid) return null;
    const role: MemberRole = raw.uid === activeUid ? "dm" : raw.role === "applicant" ? "applicant" : "player";
    return {
      uid: raw.uid,
      displayName: typeof raw.displayName === "string" && raw.displayName.trim() ? raw.displayName.trim() : "Unbekannt",
      role,
      joinedAt: typeof raw.joinedAt === "number" ? raw.joinedAt : timestamp,
      campaignName: campaign?.name,
    };
  }

  function normalizeImportedAudit(raw: AuditLogEntry, timestamp: number): AuditLogEntry {
    const type = typeof raw.type === "string" && raw.type ? raw.type : "system_restored_entry";
    return {
      id: typeof raw.id === "string" && raw.id ? raw.id : uid("log_restore"),
      actorUid: typeof raw.actorUid === "string" && raw.actorUid ? raw.actorUid : activeUid,
      actorName: typeof raw.actorName === "string" && raw.actorName ? raw.actorName : "Unbekannt",
      type,
      category: raw.category ?? auditCategoryFromType(type),
      targetId: typeof raw.targetId === "string" ? raw.targetId : null,
      message: typeof raw.message === "string" ? raw.message : "Wiederhergestellter Logeintrag",
      createdAt: typeof raw.createdAt === "number" ? raw.createdAt : timestamp,
    };
  }

  async function restoreCampaignFromBackup() {
    if (!restoreCandidate || !campaign || !firebaseDb || !activeCampaignId || !userUid || !isDm) {
      setBackupMessage("Restore ist nur als DM in einer aktiven Firebase-Kampagne möglich.");
      return;
    }
    if (restoreConfirmCampaignName.trim() !== campaign.name) {
      setBackupMessage(`Bestätigung fehlt: Gib exakt den aktuellen Kampagnennamen „${campaign.name}“ ein.`);
      return;
    }
    if (restoreConfirmWord.trim() !== "IMPORTIEREN") {
      setBackupMessage("Bestätigung fehlt: Gib exakt IMPORTIEREN ein.");
      return;
    }

    const db = firebaseDb;

    setBackupBusy(true);
    try {
      const timestamp = Date.now();
      const backup = restoreCandidate.backup;
      const rescueNeeded = backup.items.some((item) => !backup.bags.some((bag) => bag.id === item.bagId));
      let restoredBags: Bag[] = backup.bags.map((bag, index) => normalizeImportedBag(bag, index, timestamp));
      if (rescueNeeded) {
        restoredBags.push({
          id: "bag_restored_orphans",
          name: "Wiederhergestellte Items",
          description: "Automatisch angelegte Rettungstasche für Items aus einem Backup, deren ursprüngliche Tasche fehlt.",
          ownerUid: activeUid,
          type: "dm",
          kind: "inventory",
          sortIndex: restoredBags.length,
          maxWeight: null,
          maxVolume: null,
          currentWeight: 0,
          currentVolume: 0,
          currentValue: 0,
          itemCount: 0,
          currency: emptyCurrency(),
          access: dmOnlyAccess(),
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      }
      const bagIds = new Set(restoredBags.map((bag) => bag.id));
      const restoredItems = backup.items.map((item) => normalizeImportedItem(item, bagIds, rescueNeeded ? "bag_restored_orphans" : null, timestamp));

      // Kapazitätsfelder aus den importierten Items neu berechnen, damit alte/kaputte Backups sauber werden.
      restoredBags = restoredBags.map((bag) => {
        const bagItems = restoredItems.filter((item) => item.bagId === bag.id);
        const access = getBagAccess(bag);
        return {
          ...bag,
          access,
          targetAccessKeys: targetAccessKeysForAccess(access),
          currentWeight: Number((bagItems.reduce((sum, item) => sum + totalWeight(item), 0) + currencyWeight(bagCurrency(bag))).toFixed(4)),
          currentVolume: Number(bagItems.reduce((sum, item) => sum + totalVolume(item), 0).toFixed(4)),
          currentValue: Number(bagItems.reduce((sum, item) => sum + totalValue(item), 0).toFixed(4)),
          itemCount: bagItems.reduce((sum, item) => sum + item.quantity, 0),
          updatedAt: timestamp,
        };
      });

      const memberMap = new Map<string, CampaignMember>();
      for (const rawMember of backup.members) {
        const normalized = normalizeImportedMember(rawMember, timestamp);
        if (normalized) memberMap.set(normalized.uid, normalized);
      }
      memberMap.set(activeUid, {
        uid: activeUid,
        displayName: member?.displayName ?? authUser?.displayName ?? authUser?.email ?? "DM",
        role: "dm",
        joinedAt: member?.joinedAt ?? timestamp,
        campaignName: backup.campaign?.name ?? campaign.name,
      });
      const restoredMembers = Array.from(memberMap.values()).sort(compareCampaignMembers);

      const restoredCampaign: Campaign = {
        ...campaign,
        name: backup.campaign?.name ?? campaign.name,
        id: activeCampaignId,
        dmUid: campaign.dmUid,
        joinCode: campaign.joinCode,
        joinCodeSearch: campaign.joinCodeSearch,
        updatedAt: timestamp,
      };

      const existingBags = await getDocs(collection(db, "campaigns", activeCampaignId, "bags"));
      const existingItems = await getDocs(collection(db, "campaigns", activeCampaignId, "items"));
      const existingMembers = await getDocs(collection(db, "campaigns", activeCampaignId, "members"));
      const existingLogs = await getDocs(collection(db, "campaigns", activeCampaignId, "auditLog"));

      async function commitOps(ops: ((batch: ReturnType<typeof writeBatch>) => void)[]) {
        for (let index = 0; index < ops.length; index += 400) {
          const batch = writeBatch(db);
          for (const op of ops.slice(index, index + 400)) op(batch);
          await batch.commit();
        }
      }

      const deleteOps: ((batch: ReturnType<typeof writeBatch>) => void)[] = [];
      existingLogs.docs.forEach((entry) => deleteOps.push((batch) => batch.delete(entry.ref)));
      existingItems.docs.forEach((entry) => deleteOps.push((batch) => batch.delete(entry.ref)));
      existingBags.docs.forEach((entry) => deleteOps.push((batch) => batch.delete(entry.ref)));
      existingMembers.docs.forEach((entry) => {
        if (entry.id !== activeUid) {
          deleteOps.push((batch) => batch.delete(entry.ref));
          deleteOps.push((batch) => batch.delete(doc(db, "users", entry.id, "campaigns", activeCampaignId)));
        }
      });
      await commitOps(deleteOps);

      const writeOps: ((batch: ReturnType<typeof writeBatch>) => void)[] = [];
      writeOps.push((batch) => batch.set(doc(db, "campaigns", activeCampaignId), restoredCampaign, { merge: true }));
      for (const bag of restoredBags) writeOps.push((batch) => batch.set(doc(db, "campaigns", activeCampaignId, "bags", bag.id), cleanFirestorePayload(bag as any)));
      for (const item of restoredItems) writeOps.push((batch) => batch.set(doc(db, "campaigns", activeCampaignId, "items", item.id), cleanFirestorePayload(item as any)));
      for (const restoredMember of restoredMembers) {
        writeOps.push((batch) => batch.set(doc(db, "campaigns", activeCampaignId, "members", restoredMember.uid), restoredMember));
        writeOps.push((batch) => batch.set(doc(db, "users", restoredMember.uid, "campaigns", activeCampaignId), {
          campaignId: activeCampaignId,
          name: restoredCampaign.name,
          joinCode: restoredCampaign.joinCode,
          role: restoredMember.role,
          displayName: restoredMember.displayName,
          joinedAt: restoredMember.joinedAt,
          updatedAt: timestamp,
        } satisfies UserCampaignSummary));
      }
      for (const rawLog of backup.auditLog.slice(-500)) {
        const log = normalizeImportedAudit(rawLog, timestamp);
        writeOps.push((batch) => batch.set(doc(db, "campaigns", activeCampaignId, "auditLog", log.id), log));
      }
      const restoreLog: AuditLogEntry = {
        id: uid("log"),
        actorUid: activeUid,
        actorName: member?.displayName ?? authUser?.displayName ?? authUser?.email ?? "DM",
        type: "campaign_backup_imported",
        category: "campaign",
        targetId: activeCampaignId,
        message: `${member?.displayName ?? "DM"} hat ein Backup wiederhergestellt: ${restoredBags.length} Taschen, ${restoredItems.length} Items, ${restoredMembers.length} Mitglieder.`,
        createdAt: timestamp,
      };
      writeOps.push((batch) => batch.set(doc(db, "campaigns", activeCampaignId, "auditLog", restoreLog.id), restoreLog));
      await commitOps(writeOps);

      setCampaign(restoredCampaign);
      setSelectedBagId(backup.localState?.selectedBagId && bagIds.has(backup.localState.selectedBagId) ? backup.localState.selectedBagId : restoredBags[0]?.id ?? "");
      if (Array.isArray(backup.localState?.bagOrderIds)) setBagOrderIds(backup.localState.bagOrderIds);
      const restoredSortKey = backup.localState?.itemSortKey;
      if (restoredSortKey && (["custom", "name", "quantity", "weightUnit", "weightStack", "volumeUnit", "volumeStack", "valueUnit", "valueStack", "createdAt", "updatedAt"] as string[]).includes(restoredSortKey)) setItemSortKey(restoredSortKey);
      const restoredSortDirection = backup.localState?.itemSortDirection;
      if (restoredSortDirection && (["asc", "desc"] as string[]).includes(restoredSortDirection)) setItemSortDirection(restoredSortDirection);
      if (Array.isArray(backup.localState?.collapsedCategoryKeys)) {
        const restoredCollapsed = backup.localState.collapsedCategoryKeys.filter((entry) => typeof entry === "string");
        setCollapsedCategoryKeys(restoredCollapsed);
        try {
          localStorage.setItem(currentCollapsedCategoriesStorageKey, JSON.stringify(restoredCollapsed));
        } catch {
          // Collapse-Zustand ist nur lokale UI.
        }
      }
      setRestoreCandidate(null);
      setRestoreConfirmCampaignName("");
      setRestoreConfirmWord("");
      setBackupLastSavedAt(timestamp);
      setBackupMessage("Backup wurde wiederhergestellt. Aktueller Join-Code und aktueller DM wurden aus Sicherheitsgründen beibehalten.");
    } catch (error) {
      setBackupMessage(error instanceof Error ? error.message : "Backup konnte nicht importiert werden.");
    } finally {
      setBackupBusy(false);
    }
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem(currentBagOrderStorageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      setBagOrderIds(Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === "string") : []);
    } catch {
      setBagOrderIds([]);
    }
  }, [currentBagOrderStorageKey]);

  useEffect(() => {
    try {
      const storedBagId = localStorage.getItem(currentSelectedBagStorageKey);
      setSelectedBagId(storedBagId || "");
    } catch {
      setSelectedBagId("");
    }
  }, [currentSelectedBagStorageKey]);

  useEffect(() => {
    if (!selectedBagId) return;
    try {
      localStorage.setItem(currentSelectedBagStorageKey, selectedBagId);
    } catch {
      // Zuletzt geöffnete Tasche ist nur lokale UI.
    }
  }, [selectedBagId, currentSelectedBagStorageKey]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(currentCollapsedCategoriesStorageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      setCollapsedCategoryKeys(Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === "string") : []);
    } catch {
      setCollapsedCategoryKeys([]);
    }
  }, [currentCollapsedCategoriesStorageKey]);

  function saveBagOrder(nextOrderIds: string[]) {
    setBagOrderIds(nextOrderIds);
    try {
      localStorage.setItem(currentBagOrderStorageKey, JSON.stringify(nextOrderIds));
    } catch {
      // Lokale Sortierung ist Komfort. Wenn localStorage blockiert, darf die App weiterlaufen.
    }
  }

  function saveCollapsedCategoryKeys(nextKeys: string[]) {
    const uniqueKeys = Array.from(new Set(nextKeys));
    setCollapsedCategoryKeys(uniqueKeys);
    try {
      localStorage.setItem(currentCollapsedCategoriesStorageKey, JSON.stringify(uniqueKeys));
    } catch {
      // Collapse-Zustand ist nur lokale UI.
    }
  }

  function toggleCategoryCollapsed(bagId: string, category: ItemCategory) {
    const key = inventoryCategoryKey(bagId, category);
    saveCollapsedCategoryKeys(
      collapsedCategoryKeys.includes(key)
        ? collapsedCategoryKeys.filter((entry) => entry !== key)
        : [...collapsedCategoryKeys, key],
    );
  }

  function canTargetBag(bag: Bag | undefined | null) {
    if (!bag) return false;
    return bagTargetVisibleByMirror(bag, activeUid, isDm);
  }

  function canDepositBag(bag: Bag | undefined | null) {
    if (!bag) return false;
    const access = getBagAccess(bag);
    return accessAllows(access.depositMode, access.depositUserIds, activeUid, isDm);
  }

  function canOpenBag(bag: Bag | undefined | null) {
    if (!bag) return false;
    const access = getBagAccess(bag);
    return accessAllows(access.readMode, access.readUserIds, activeUid, isDm);
  }

  function canWriteBag(bag: Bag | undefined | null) {
    if (!bag) return false;
    const access = getBagAccess(bag);
    return accessAllows(access.writeMode, access.writeUserIds, activeUid, isDm);
  }

  function bagAccessLine(bag: Bag) {
    const access = getBagAccess(bag);
    const open = canOpenBag(bag) ? "öffnbar" : "gesperrt";
    const write = canWriteBag(bag) ? "bearbeitbar" : "nicht bearbeitbar";
    return `${bagKindLabel(getBagKind(bag))} · ${open} · ${write} · Ziel: ${modeShortLabel(access.targetMode, access.targetUserIds)}`;
  }

  function getKnownBagTotals(bag: Bag) {
    const bagItems = items.filter((entry) => entry.bagId === bag.id);
    return {
      weight: bagItems.reduce((sum, entry) => sum + totalWeight(entry), 0) + currencyWeight(bagCurrency(bag)),
      volume: bagItems.reduce((sum, entry) => sum + totalVolume(entry), 0),
      value: bagItems.reduce((sum, entry) => sum + totalValue(entry), 0),
      count: bagItems.reduce((sum, entry) => sum + entry.quantity, 0),
    };
  }

  function getBagCapacityTotals(bag: Bag | undefined | null) {
    if (!bag) return { weight: 0, volume: 0, value: 0, count: 0 };
    // Seit dem Firestore-Schonmodus sind nur die Items der aktiv geöffneten Tasche live geladen.
    // Für alle anderen Taschen müssen die gespeicherten Summary-Felder verwendet werden.
    if (canOpenBag(bag) && bag.id === selectedOpenableBagId && activeItemsLoadedBagId === bag.id) return getKnownBagTotals(bag);
    return {
      weight: bag.currentWeight ?? 0,
      volume: bag.currentVolume ?? 0,
      value: bag.currentValue ?? 0,
      count: bag.itemCount ?? 0,
    };
  }

  function currencyWeightPatchForBag(bag: Bag, nextCurrency: CurrencyPouch) {
    const currentCurrency = bagCurrency(bag);
    const base = getBagCapacityTotals(bag);
    const nextWeight = base.weight - currencyWeight(currentCurrency) + currencyWeight(nextCurrency);
    return {
      currency: nextCurrency,
      currentWeight: Math.max(0, Number(nextWeight.toFixed(4))),
    };
  }

  function capacityPatchFromTotals(totals: { weight: number; volume: number; value: number; count: number }) {
    return {
      currentWeight: Math.max(0, Number(totals.weight.toFixed(4))),
      currentVolume: Math.max(0, Number(totals.volume.toFixed(4))),
      currentValue: Math.max(0, Number(totals.value.toFixed(4))),
      itemCount: Math.max(0, Math.round(totals.count)),
      updatedAt: Date.now(),
    };
  }

  function bagTotalsAfterDelta(bag: Bag, delta: { weight?: number; volume?: number; value?: number; count?: number }) {
    const base = getBagCapacityTotals(bag);
    return {
      weight: base.weight + (delta.weight ?? 0),
      volume: base.volume + (delta.volume ?? 0),
      value: base.value + (delta.value ?? 0),
      count: base.count + (delta.count ?? 0),
    };
  }

  function canFitIntoContainer(targetBag: Bag | undefined | null, addedWeight: number, addedVolume = 0, options: { replacingItem?: InventoryItem } = {}) {
    // Nur Behälter haben harte Grenzen. Inventare dürfen nach Variant Encumbrance überladen werden.
    if (!targetBag || getBagKind(targetBag) !== "container") return { ok: true };

    const totals = getBagCapacityTotals(targetBag);
    let baseWeight = totals.weight;
    let baseVolume = totals.volume;

    if (options.replacingItem && options.replacingItem.bagId === targetBag.id) {
      baseWeight -= totalWeight(options.replacingItem);
      baseVolume -= totalVolume(options.replacingItem);
    }

    const nextWeight = baseWeight + addedWeight;
    const nextVolume = baseVolume + addedVolume;

    if (targetBag.maxWeight !== null && targetBag.maxWeight !== undefined && nextWeight > targetBag.maxWeight) {
      return { ok: false, reason: `Der Behälter „${targetBag.name}“ ist voll. Gewicht: ${formatNumber(nextWeight)} / ${formatNumber(targetBag.maxWeight)} lb.` };
    }

    if (targetBag.maxVolume !== null && targetBag.maxVolume !== undefined && nextVolume > targetBag.maxVolume) {
      return { ok: false, reason: `Der Behälter „${targetBag.name}“ ist voll. Volumen: ${formatNumber(nextVolume)} / ${formatNumber(targetBag.maxVolume)}.` };
    }

    return { ok: true };
  }

  function blockWithCapacityMessage(message: string) {
    setSyncStatus("error");
    setSyncError(message);
  }

  useEffect(() => {
    if (!firebaseConfigured || !firebaseDb || !activeCampaignId || !userUid || !member || !campaignAccessReady || !isApprovedMember) {
      setBags([]);
      return;
    }

    const bagCollection = collection(firebaseDb, "campaigns", activeCampaignId, "bags");

    if (isDm) {
      return onSnapshot(
        query(bagCollection, orderBy("sortIndex")),
        (snapshot) => {
          setBags(snapshot.docs.map((entry) => entry.data() as Bag));
          setSyncStatus("online");
        },
        (error) => {
          setBags([]);
          setSyncStatus("error");
          setSyncError(error.message);
        },
      );
    }

    // Spielerpfad im Schonmodus:
    // Zwei Live-Queries direkt auf der echten Access-Struktur:
    // 1) Taschen mit Ziel/Sichtbarkeit = Alle
    // 2) Taschen mit targetMode=custom, in deren Ziel/Sichtbarkeits-Auswahl dieser Spieler steht
    // Dadurch sind wir nicht mehr von evtl. fehlenden/veralteten targetAccessKeys abhängig.
    // Keine per-Bag-Doc-Listener und kein Legacy-/Index-Live-Fallback.
    const allMap = new Map<string, Bag>();
    const customMap = new Map<string, Bag>();

    const publish = () => {
      const merged = new Map<string, Bag>();
      for (const [id, bag] of allMap) merged.set(id, bag);
      for (const [id, bag] of customMap) merged.set(id, bag);
      setBags(Array.from(merged.values()).filter((bag) => canTargetBagByAccess(bag, userUid, false)).sort((a, b) => a.sortIndex - b.sortIndex));
    };

    const applySnapshotChanges = (targetMap: Map<string, Bag>, snapshot: QuerySnapshot<DocumentData>) => {
      for (const change of snapshot.docChanges()) {
        if (change.type === "removed") targetMap.delete(change.doc.id);
        else targetMap.set(change.doc.id, change.doc.data() as Bag);
      }
      publish();
      setSyncStatus("online");
      setSyncError(null);
    };

    const handleBagQueryError = (label: string) => (error: Error) => {
      console.warn(`${label} konnte nicht geladen werden`, error.message);
      // Nicht leeren. Die andere Query kann trotzdem gültige Taschen liefern.
      setSyncStatus("error");
      setSyncError(error.message);
    };

    const unsubAll = onSnapshot(
      query(bagCollection, where("access.targetMode", "==", "all")),
      (snapshot) => applySnapshotChanges(allMap, snapshot),
      handleBagQueryError("Allgemeine sichtbare/Ziel-Taschen"),
    );

    const unsubCustom = onSnapshot(
      query(
        bagCollection,
        where("access.targetMode", "==", "custom"),
        where("access.targetUserIds", "array-contains", userUid),
      ),
      (snapshot) => applySnapshotChanges(customMap, snapshot),
      handleBagQueryError("Persönlich sichtbare/Ziel-Taschen"),
    );

    return () => {
      unsubAll();
      unsubCustom();
    };
  }, [activeCampaignId, userUid, member?.role, campaignAccessReady]);

  const visibleBags = useMemo(() => orderBagsForUser(bags.filter(canTargetBag), bagOrderIds), [bags, isDm, activeUid, bagOrderIds.join("|")]);
  const depositTargetBags = useMemo(() => visibleBags.filter(canDepositBag), [visibleBags, isDm, activeUid]);
  const openableBagIds = useMemo(() => visibleBags.filter(canOpenBag).map((bag) => bag.id), [visibleBags, isDm, activeUid]);
  const selectedBag = visibleBags.find((bag) => bag.id === selectedBagId) ?? visibleBags[0];
  const selectedOpenableBagId = selectedBag && canOpenBag(selectedBag) ? selectedBag.id : "";

  useEffect(() => {
    if (!firebaseConfigured || !firebaseDb || !activeCampaignId || !userUid || !member || !campaignAccessReady || !isApprovedMember || !selectedOpenableBagId) {
      setItems([]);
      setActiveItemsLoadedBagId(null);
      return;
    }

    setItems([]);
    setActiveItemsLoadedBagId(null);

    return onSnapshot(
      query(collection(firebaseDb, "campaigns", activeCampaignId, "items"), where("bagId", "==", selectedOpenableBagId)),
      (snapshot) => {
        setItems(snapshot.docs.map((entry) => normalizeLiveItem(entry.data() as Partial<InventoryItem>, entry.id)));
        setActiveItemsLoadedBagId(selectedOpenableBagId);
        setSyncStatus("online");
      },
      (error) => {
        setItems([]);
        setActiveItemsLoadedBagId(null);
        setSyncStatus("error");
        setSyncError(error.message);
      },
    );
  }, [activeCampaignId, userUid, member?.role, campaignAccessReady, selectedOpenableBagId]);


  useEffect(() => {
    if (!firebaseConfigured || !firebaseDb || !campaign || !isDm || !campaign.joinCodeSearch) return;
    setDoc(
      doc(firebaseDb, "joinCodes", campaign.joinCodeSearch),
      { campaignId: campaign.id, joinCode: campaign.joinCode, campaignName: campaign.name, updatedAt: Date.now() },
      { merge: true },
    ).catch(() => undefined);
  }, [campaign?.id, campaign?.joinCodeSearch, isDm]);

  useEffect(() => {
    if (!firebaseConfigured || !firebaseDb || !campaign || !member || !userUid) return;
    setDoc(
      doc(firebaseDb, "users", userUid, "campaigns", campaign.id),
      {
        campaignId: campaign.id,
        name: campaign.name,
        joinCode: member.role === "applicant" ? "—" : campaign.joinCode,
        role: member.role,
        displayName: member.displayName,
        joinedAt: member.joinedAt,
        updatedAt: Date.now(),
      } satisfies UserCampaignSummary,
      { merge: true },
    ).catch(() => undefined);
  }, [campaign?.id, campaign?.name, campaign?.joinCode, member?.role, member?.displayName, userUid]);

  useEffect(() => {
    if (!visibleBags.length) {
      if (selectedBagId) setSelectedBagId("");
      return;
    }
    if (!selectedBagId || !visibleBags.some((bag) => bag.id === selectedBagId)) {
      let storedBagId = "";
      try {
        storedBagId = localStorage.getItem(currentSelectedBagStorageKey) || "";
      } catch {
        storedBagId = "";
      }
      const restoredBag = storedBagId ? visibleBags.find((bag) => bag.id === storedBagId) : null;
      setSelectedBagId(restoredBag?.id ?? visibleBags[0].id);
    }
  }, [visibleBags, selectedBagId, currentSelectedBagStorageKey]);

  const itemsByBag = useMemo(() => {
    const map = new Map<string, InventoryItem[]>();
    for (const bag of bags) map.set(bag.id, []);
    for (const item of items) {
      if (!map.has(item.bagId)) map.set(item.bagId, []);
      map.get(item.bagId)!.push(item);
    }
    return map;
  }, [bags, items]);


  function nextItemOrderIndex(bagId: string, category: ItemCategory) {
    const sameCategory = (itemsByBag.get(bagId) ?? []).filter((item) => normalizeItemCategory(item.category) === category);
    return sameCategory.length ? Math.max(...sameCategory.map(getItemOrderIndex)) + 1 : 0;
  }

  function groupedItemsForDisplay(itemList: InventoryItem[]) {
    const groups = new Map<ItemCategory, InventoryItem[]>();
    for (const item of itemList) {
      const category = normalizeItemCategory(item.category);
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category)!.push(item);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => itemCategoryOrder(a) - itemCategoryOrder(b))
      .map(([category, entries]) => ({ category, entries }));
  }

  async function moveItemWithinCategory(itemId: string, direction: -1 | 1) {
    const item = items.find((entry) => entry.id === itemId);
    const bag = bags.find((entry) => entry.id === item?.bagId);
    if (!item || !bag || !canWriteBag(bag)) return;

    const category = normalizeItemCategory(item.category);
    const ordered = (itemsByBag.get(bag.id) ?? [])
      .filter((entry) => normalizeItemCategory(entry.category) === category)
      .sort((a, b) => getItemOrderIndex(a) - getItemOrderIndex(b) || a.name.localeCompare(b.name, "de", { numeric: true, sensitivity: "base" }) || a.id.localeCompare(b.id));

    const index = ordered.findIndex((entry) => entry.id === itemId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= ordered.length) return;

    const reordered = [...ordered];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);
    const nowTs = Date.now();

    if (!firebaseConfigured) {
      setItems((prev) => prev.map((entry) => {
        const nextIndex = reordered.findIndex((candidate) => candidate.id === entry.id);
        return nextIndex >= 0 ? { ...entry, orderIndex: nextIndex, updatedAt: nowTs, updatedBy: activeUid } : entry;
      }));
      return;
    }

    try {
      if (!firebaseDb || !activeCampaignId) throw new Error("Keine aktive Kampagne gefunden.");
      const batch = writeBatch(firebaseDb);
      for (let nextIndex = 0; nextIndex < reordered.length; nextIndex += 1) {
        const entry = reordered[nextIndex];
        if (getItemOrderIndex(entry) !== nextIndex || entry.id === moved.id) {
          batch.update(doc(firebaseDb, "campaigns", activeCampaignId, "items", entry.id), { orderIndex: nextIndex, updatedAt: nowTs, updatedBy: activeUid });
        }
      }
      await batch.commit();
      logAction("item_reordered", `${member?.displayName ?? "Jemand"} hat „${moved.name}“ in „${bag.name}“ ${direction < 0 ? "nach oben" : "nach unten"} sortiert.`, moved.id);
      setSyncStatus("online");
      setSyncError(null);
    } catch (error) {
      setSyncStatus("error");
      setSyncError(error instanceof Error ? error.message : "Item-Reihenfolge konnte nicht geändert werden.");
    }
  }

  const selectedItems = useMemo(() => {
    if (!selectedBag || !canOpenBag(selectedBag)) return [];
    const base = itemsByBag.get(selectedBag.id) ?? [];
    const queryText = search.trim().toLowerCase();
    const filtered = queryText
      ? base.filter(
          (item) =>
            item.name.toLowerCase().includes(queryText) ||
            item.description.toLowerCase().includes(queryText) ||
            item.notes.toLowerCase().includes(queryText),
        )
      : base;

    return [...filtered].sort((a, b) => compareItems(a, b, itemSortKey, itemSortDirection));
  }, [itemsByBag, selectedBag?.id, selectedBag?.access, search, isDm, activeUid, itemSortKey, itemSortDirection]);

  const groupedSelectedItems = useMemo(() => groupedItemsForDisplay(selectedItems), [selectedItems]);

  const catalogMatches = useMemo(() => {
    const raw = newItem.name.trim();
    const queryText = normalizeSearchText(raw);
    if (queryText.length < 2) return [] as CatalogItem[];
    const terms = queryText.split(/\s+/).filter(Boolean);
    return itemCatalog
      .map((entry) => {
        const name = normalizeSearchText(entry.name);
        const source = normalizeSearchText(entry.source);
        const category = normalizeSearchText(entry.category);
        const haystack = `${name} ${source} ${category}`;
        if (!terms.every((term) => haystack.includes(term))) return null;
        let score = 0;
        if (name === queryText) score += 200;
        if (name.startsWith(queryText)) score += 120;
        if (name.includes(queryText)) score += 60;
        score += Math.max(0, 40 - name.length / 2);
        if (entry.source === "PHB" || entry.source === "DMG") score += 20;
        if (entry.source === "XGE" || entry.source === "TCE") score += 10;
        return { entry, score };
      })
      .filter((value): value is { entry: CatalogItem; score: number } => value !== null)
      .sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name, "de-DE"))
      .slice(0, 8)
      .map((value) => value.entry);
  }, [newItem.name]);

  const bagTotals = useMemo(() => {
    const totals = new Map<string, { weight: number; volume: number; value: number; count: number }>();
    for (const bag of bags) {
      if (bag.id === selectedOpenableBagId) {
        const bagItems = itemsByBag.get(bag.id) ?? [];
        totals.set(bag.id, {
          weight: bagItems.reduce((sum, item) => sum + totalWeight(item), 0) + currencyWeight(bagCurrency(bag)),
          volume: bagItems.reduce((sum, item) => sum + totalVolume(item), 0),
          value: bagItems.reduce((sum, item) => sum + totalValue(item), 0),
          count: bagItems.reduce((sum, item) => sum + item.quantity, 0),
        });
      } else {
        totals.set(bag.id, getBagCapacityTotals(bag));
      }
    }
    return totals;
  }, [bags, itemsByBag, selectedOpenableBagId, activeItemsLoadedBagId]);

  useEffect(() => {
    if (!firebaseConfigured || !firebaseDb || !activeCampaignId || !isDm || !campaignAccessReady || bags.length === 0) return;
    if (!selectedOpenableBagId || activeItemsLoadedBagId !== selectedOpenableBagId) return;

    for (const bag of bags) {
      if (bag.id !== selectedOpenableBagId) continue;
      const totals = bagTotals.get(bag.id) ?? { weight: 0, volume: 0, value: 0, count: 0 };
      const weightChanged = Math.abs((bag.currentWeight ?? 0) - totals.weight) > 0.0001;
      const volumeChanged = Math.abs((bag.currentVolume ?? 0) - totals.volume) > 0.0001;
      const valueChanged = Math.abs((bag.currentValue ?? 0) - totals.value) > 0.0001;
      const countChanged = (bag.itemCount ?? 0) !== totals.count;

      if (weightChanged || volumeChanged || valueChanged || countChanged) {
        updateDoc(doc(firebaseDb, "campaigns", activeCampaignId, "bags", bag.id), capacityPatchFromTotals(totals)).catch(() => undefined);
      }
    }
  }, [firebaseConfigured, activeCampaignId, isDm, campaignAccessReady, bags, bagTotals, selectedOpenableBagId, activeItemsLoadedBagId]);

  async function createCampaign(campaignName: string, displayName: string) {
    if (!firebaseDb || !userUid) return;
    const cleanCampaignName = campaignName.trim() || "Neue Kampagne";
    const cleanDisplayName = displayName.trim() || "DM";
    const id = uid("campaign");
    const code = makeJoinCode();
    const createdAt = Date.now();
    const batch = writeBatch(firebaseDb);

    const campaignData: Campaign = {
      id,
      name: cleanCampaignName,
      dmUid: userUid,
      joinCode: code,
      joinCodeSearch: normalizeJoinCode(code),
      tradeRateName: DEFAULT_TRADE_RATE_NAME,
      tradeBuyMultiplier: DEFAULT_TRADE_BUY_MULTIPLIER,
      tradeSellMultiplier: DEFAULT_TRADE_SELL_MULTIPLIER,
      createdAt,
      updatedAt: createdAt,
    };

    const memberData: CampaignMember = {
      uid: userUid,
      displayName: cleanDisplayName,
      role: "dm",
      joinedAt: createdAt,
    };

    const groupBag: Bag = {
      id: uid("bag_party"),
      name: "Gruppentasche",
      description: "Gemeinsames Inventar der Gruppe.",
      ownerUid: null,
      type: "party",
      kind: "inventory",
      sortIndex: 0,
      maxWeight: 1200,
      maxVolume: 800,
      currentWeight: 0,
      currentVolume: 0,
      currentValue: 0,
      itemCount: 0,
      permissions: { read: ["all"], write: ["all"] },
      access: publicBagAccess(),
      targetAccessKeys: targetAccessKeysForAccess(publicBagAccess()),
      createdAt,
      updatedAt: createdAt,
    };

    const dmBag: Bag = {
      id: uid("bag_dm"),
      name: "DM-Reservebeutel",
      description: "Verdeckte Reserve und DM-Verwaltung.",
      ownerUid: userUid,
      type: "dm",
      kind: "container",
      sortIndex: 1,
      maxWeight: null,
      maxVolume: null,
      currentWeight: 0,
      currentVolume: 0,
      currentValue: 0,
      itemCount: 0,
      currency: emptyCurrency(),
      permissions: { read: [], write: [] },
      access: dmOnlyAccess(),
      targetAccessKeys: targetAccessKeysForAccess(dmOnlyAccess()),
      createdAt,
      updatedAt: createdAt,
    };

    batch.set(doc(firebaseDb, "campaigns", id), campaignData);
    batch.set(doc(firebaseDb, "joinCodes", campaignData.joinCodeSearch!), {
      campaignId: id,
      joinCode: code,
      campaignName: cleanCampaignName,
      createdAt,
    });
    batch.set(doc(firebaseDb, "campaigns", id, "members", userUid), memberData);
    batch.set(doc(firebaseDb, "users", userUid, "campaigns", id), {
      campaignId: id,
      name: cleanCampaignName,
      joinCode: code,
      role: "dm",
      displayName: cleanDisplayName,
      joinedAt: createdAt,
      updatedAt: createdAt,
    } satisfies UserCampaignSummary);
    batch.set(doc(firebaseDb, "campaigns", id, "bags", groupBag.id), groupBag);
    batch.set(doc(firebaseDb, "campaigns", id, "bags", dmBag.id), dmBag);
    await batch.commit();

    // Der initiale Auditlog darf nicht Teil des Erstellungs-Batches sein:
    // Firestore Rules prüfen auditLog.create mit isDm(campaignId), und bei einer neuen
    // Kampagne existiert die DM-Mitgliedschaft erst nach dem ersten Commit.
    // Deshalb wird der Log direkt danach geschrieben, wenn der DM-Member bereits existiert.
    const firstLogId = uid("log");
    await setDoc(doc(firebaseDb, "campaigns", id, "auditLog", firstLogId), {
      id: firstLogId,
      actorUid: userUid,
      actorName: cleanDisplayName,
      type: "campaign_created",
      category: "campaign",
      targetId: id,
      message: `${cleanDisplayName} hat die Kampagne „${cleanCampaignName}“ erstellt.`,
      createdAt,
    } satisfies AuditLogEntry).catch(() => undefined);

    setSelectedBagId(groupBag.id);
    setActiveCampaignId(id);
  }

  async function joinCampaign(inputJoinCode: string, displayName: string) {
    if (!firebaseDb || !userUid) return;
    const codeSearch = normalizeJoinCode(inputJoinCode);
    const cleanDisplayName = displayName.trim() || "Spieler";
    const joinCodeDoc = await getDoc(doc(firebaseDb, "joinCodes", codeSearch));
    const joinCodeData = joinCodeDoc.exists() ? (joinCodeDoc.data() as { campaignId: string; campaignName?: string; joinCode?: string }) : null;
    let campaignId = joinCodeData?.campaignId ?? "";

    if (!campaignId) {
      // Fallback nur für alte Prototyp-Kampagnen, bevor joinCodes eingeführt wurden.
      const result = await getDocs(query(collection(firebaseDb, "campaigns"), where("joinCodeSearch", "==", codeSearch), limit(1)));
      if (result.empty) throw new Error("Kein Kampagnenraum mit diesem Join-Code gefunden.");
      campaignId = result.docs[0].id;
    }

    const joinedAt = Date.now();
    const memberRef = doc(firebaseDb, "campaigns", campaignId, "members", userUid);

    try {
      // Neuer Spieler: Dokument erstellen. Kein vorheriges Lesen nötig, damit sichere Regeln den Join erlauben.
      await setDoc(memberRef, {
        uid: userUid,
        displayName: cleanDisplayName,
        role: "applicant",
        joinedAt,
        campaignName: joinCodeData?.campaignName ?? "Kampagne",
      } satisfies CampaignMember);
    } catch (createError) {
      // Bereits Mitglied: Nur Anzeigenamen ändern. Das klappt auch für einen bestehenden DM, ohne die Rolle zu überschreiben.
      try {
        await updateDoc(memberRef, { displayName: cleanDisplayName });
      } catch {
        throw createError;
      }
    }

    const memberSnapshot = await getDoc(memberRef);
    const savedMember = memberSnapshot.exists()
      ? (memberSnapshot.data() as CampaignMember)
      : ({ uid: userUid, displayName: cleanDisplayName, role: "applicant", joinedAt, campaignName: joinCodeData?.campaignName ?? "Kampagne" } satisfies CampaignMember);

    const campaignSnapshot = await getDoc(doc(firebaseDb, "campaigns", campaignId));
    const campaignData = campaignSnapshot.exists() ? (campaignSnapshot.data() as Campaign) : null;

    if (savedMember.role === "applicant") {
      const joinLogId = uid("log");
      await setDoc(doc(firebaseDb, "campaigns", campaignId, "auditLog", joinLogId), {
        id: joinLogId,
        actorUid: userUid,
        actorName: savedMember.displayName,
        type: "member_join_requested",
        category: "members",
        targetId: userUid,
        message: `${savedMember.displayName} möchte der Kampagne beitreten und wartet auf DM-Bestätigung.`,
        createdAt: Date.now(),
      } satisfies AuditLogEntry).catch(() => undefined);
    }

    await setDoc(
      doc(firebaseDb, "users", userUid, "campaigns", campaignId),
      {
        campaignId,
        name: campaignData?.name ?? savedMember.campaignName ?? "Kampagne",
        joinCode: savedMember.role === "applicant" ? "—" : (campaignData?.joinCode ?? inputJoinCode.trim().toUpperCase()),
        role: savedMember.role,
        displayName: savedMember.displayName,
        joinedAt: savedMember.joinedAt ?? joinedAt,
        updatedAt: Date.now(),
      } satisfies UserCampaignSummary,
      { merge: true },
    );

    // Wichtig beim Wiederbeitritt nach Kick: activeCampaignId kann identisch bleiben.
    // Dann feuert React keinen neuen Selection-Wechsel, obwohl das Mitgliedsdokument neu existiert.
    // Wir setzen den lokalen Status sofort und erzwingen zusätzlich eine neue Mitgliedschaftsprüfung.
    setMember(savedMember);
    setCampaign(campaignData);
    setCampaignAccessReady(true);
    setBags([]);
    setItems([]);
    setActiveItemsLoadedBagId(null);
    setAuditLog([]);
    setSyncStatus("connecting");
    setSyncError(null);
    setActiveCampaignId(campaignId);
    setCampaignAccessRefreshKey((value) => value + 1);
  }

  function leaveCampaignSelection() {
    setActiveCampaignId(null);
    setCampaignAccessReady(false);
    setCampaign(null);
    setMember(null);
    setMembers([]);
    setAuditLog([]);
    setSelectedBagId("");
    setBags([]);
    setItems([]);
    setSyncError(null);
    setSyncStatus(firebaseConfigured ? "online" : "local");
  }

  function clearLocalBrowserState() {
    localStorage.removeItem(activeCampaignStorageKey);
    localStorage.removeItem("dnd-inventory-bags");
    localStorage.removeItem("dnd-inventory-items");
    setActiveCampaignId(null);
    setCampaignAccessReady(false);
    setCampaign(null);
    setMember(null);
    setMembers([]);
    setAuditLog([]);
    setSelectedBagId("");
    setBags([]);
    setItems([]);
    setSyncError(null);
    setSyncStatus(firebaseConfigured ? "online" : "local");
  }

  function openKnownCampaign(campaignId: string) {
    setSyncError(null);
    setActiveCampaignId(campaignId);
  }

  async function removeCampaignReference(campaignId: string) {
    if (!firebaseDb || !userUid) return;
    await deleteDoc(doc(firebaseDb, "users", userUid, "campaigns", campaignId));
    setUserCampaigns((prev) => prev.filter((entry) => entry.campaignId !== campaignId));
    if (activeCampaignId === campaignId) leaveCampaignSelection();
  }

  async function deleteCampaign(campaignId: string) {
    if (!firebaseDb || !userUid) return;

    const campaignRef = doc(firebaseDb, "campaigns", campaignId);
    const campaignSnapshot = await getDoc(campaignRef);
    if (!campaignSnapshot.exists()) {
      await deleteDoc(doc(firebaseDb, "users", userUid, "campaigns", campaignId)).catch(() => undefined);
      setUserCampaigns((prev) => prev.filter((entry) => entry.campaignId !== campaignId));
      if (activeCampaignId === campaignId) leaveCampaignSelection();
      return;
    }

    const campaignData = campaignSnapshot.data() as Campaign;
    if (campaignData.dmUid !== userUid && member?.role !== "dm") {
      throw new Error("Nur der DM kann diese Kampagne löschen.");
    }

    const [bagsSnapshot, itemsSnapshot, membersSnapshot, auditSnapshot] = await Promise.all([
      getDocs(collection(firebaseDb, "campaigns", campaignId, "bags")),
      getDocs(collection(firebaseDb, "campaigns", campaignId, "items")),
      getDocs(collection(firebaseDb, "campaigns", campaignId, "members")),
      getDocs(collection(firebaseDb, "campaigns", campaignId, "auditLog")),
    ]);

    const refs = [
      ...bagsSnapshot.docs.map((entry) => entry.ref),
      ...itemsSnapshot.docs.map((entry) => entry.ref),
      ...auditSnapshot.docs.map((entry) => entry.ref),
      ...membersSnapshot.docs.map((entry) => doc(firebaseDb, "users", entry.id, "campaigns", campaignId)),
      ...membersSnapshot.docs.map((entry) => entry.ref),
    ];

    if (campaignData.joinCodeSearch) refs.push(doc(firebaseDb, "joinCodes", campaignData.joinCodeSearch));
    refs.push(campaignRef);

    for (let index = 0; index < refs.length; index += 450) {
      const batch = writeBatch(firebaseDb);
      for (const ref of refs.slice(index, index + 450)) batch.delete(ref);
      await batch.commit();
    }

    setUserCampaigns((prev) => prev.filter((entry) => entry.campaignId !== campaignId));
    if (activeCampaignId === campaignId) leaveCampaignSelection();
  }

  function campaignDocPath(...segments: string[]) {
    if (!firebaseDb || !activeCampaignId) return null;
    return doc(firebaseDb, "campaigns", activeCampaignId, ...segments);
  }

  async function writeBag(bag: Bag) {
    const ref = campaignDocPath("bags", bag.id);
    if (!ref) throw new Error("Keine aktive Kampagne gefunden.");
    await setDoc(ref, withBagAccessMirror(bag));
  }

  async function patchBag(id: string, patch: Partial<Bag>) {
    const ref = campaignDocPath("bags", id);
    if (!ref) throw new Error("Keine aktive Kampagne gefunden.");
    await updateDoc(ref, cleanFirestorePayload(withBagAccessMirror(patch) as any));
  }

  async function writeItem(item: InventoryItem) {
    const ref = campaignDocPath("items", item.id);
    if (!ref) throw new Error("Keine aktive Kampagne gefunden.");
    await setDoc(ref, cleanFirestorePayload(item as any));
  }

  async function patchItem(id: string, patch: Partial<InventoryItem>) {
    const ref = campaignDocPath("items", id);
    if (!ref) throw new Error("Keine aktive Kampagne gefunden.");
    await updateDoc(ref, cleanFirestorePayload(patch as any));
  }

  async function deleteItemDoc(id: string) {
    const ref = campaignDocPath("items", id);
    if (!ref) throw new Error("Keine aktive Kampagne gefunden.");
    await deleteDoc(ref);
  }

  function makeAuditLogEntry(type: string, message: string, targetId: string | null = null): AuditLogEntry | null {
    const actorUid = firebaseConfigured ? userUid : activeUid;
    if (!actorUid) return null;
    return {
      id: uid("log"),
      actorUid,
      actorName: member?.displayName ?? authUser?.displayName ?? authUser?.email ?? "Unbekannt",
      type,
      category: auditCategoryFromType(type),
      targetId,
      message,
      createdAt: Date.now(),
    };
  }

  function addAuditLogLocally(entry: AuditLogEntry) {
    setAuditLog((prev) => {
      if (prev.some((existing) => existing.id === entry.id)) return prev;
      return [entry, ...prev].sort((a, b) => b.createdAt - a.createdAt).slice(0, 500);
    });
  }

  function logAction(type: string, message: string, targetId: string | null = null) {
    const entry = makeAuditLogEntry(type, message, targetId);
    if (!entry) return;
    if (!firebaseDb || !activeCampaignId || !userUid) {
      addAuditLogLocally(entry);
      return;
    }
    setDoc(doc(firebaseDb, "campaigns", activeCampaignId, "auditLog", entry.id), cleanFirestorePayload(entry as any))
      .then(() => addAuditLogLocally(entry))
      .catch((error) => {
        console.warn("Aktivitätslog konnte nicht geschrieben werden", error instanceof Error ? error.message : error);
        setSyncStatus("error");
        setSyncError(error instanceof Error ? `Aktivitätslog konnte nicht geschrieben werden: ${error.message}` : "Aktivitätslog konnte nicht geschrieben werden.");
      });
  }

  async function updateTradeRates() {
    if (!firebaseDb || !activeCampaignId || !campaign || !isDm) return;
    const rateName = normalizeTradeRateName(tradeRateNameInput);
    const buyMultiplier = normalizeTradeMultiplier(tradeBuyInput, tradeRates.buyMultiplier || DEFAULT_TRADE_BUY_MULTIPLIER);
    const sellMultiplier = normalizeTradeMultiplier(tradeSellInput, tradeRates.sellMultiplier || DEFAULT_TRADE_SELL_MULTIPLIER);
    if (buyMultiplier <= 0 || sellMultiplier <= 0) {
      setSyncStatus("error");
      setSyncError("Handelskurs muss größer als 0 sein.");
      return;
    }
    try {
      await updateDoc(doc(firebaseDb, "campaigns", activeCampaignId), {
        tradeRateName: rateName,
        tradeBuyMultiplier: buyMultiplier,
        tradeSellMultiplier: sellMultiplier,
        updatedAt: Date.now(),
      });
      setTradeRateNameInput(rateName);
      setTradeBuyInput(formatNumber(buyMultiplier));
      setTradeSellInput(formatNumber(sellMultiplier));
      setTradeRateModalOpen(false);
      setSyncStatus("online");
      setSyncError(null);
      logAction("campaign_trade_rates_updated", `${member?.displayName ?? "DM"} hat den Handelskurs „${rateName}“ gesetzt: Kaufen ${formatMultiplier(buyMultiplier)}, Verkaufen ${formatMultiplier(sellMultiplier)}.`, activeCampaignId);
    } catch (error) {
      setSyncStatus("error");
      setSyncError(error instanceof Error ? error.message : "Handelskurs konnte nicht gespeichert werden.");
    }
  }

  function auditBadgeClass(entry: AuditLogEntry) {
    const category = entry.category ?? auditCategoryFromType(entry.type);
    if (category === "items") return isDark ? "border-sky-700/50 bg-sky-950/40 text-sky-100" : "border-sky-800/20 bg-sky-100 text-sky-950";
    if (category === "currency") return isDark ? "border-yellow-700/50 bg-yellow-950/35 text-yellow-100" : "border-yellow-800/20 bg-yellow-100 text-yellow-950";
    if (category === "bags") return isDark ? "border-amber-700/50 bg-amber-950/35 text-amber-100" : "border-amber-800/20 bg-amber-100 text-amber-950";
    if (category === "members") return isDark ? "border-emerald-700/50 bg-emerald-950/35 text-emerald-100" : "border-emerald-800/20 bg-emerald-100 text-emerald-950";
    if (category === "campaign") return isDark ? "border-purple-700/50 bg-purple-950/35 text-purple-100" : "border-purple-800/20 bg-purple-100 text-purple-950";
    return isDark ? "border-zinc-700/50 bg-zinc-950/35 text-zinc-100" : "border-zinc-800/20 bg-zinc-100 text-zinc-950";
  }

  function auditMatchesFilters(entry: AuditLogEntry) {
    const category = entry.category ?? auditCategoryFromType(entry.type);
    if (auditLogCategoryFilter !== "all" && category !== auditLogCategoryFilter) return false;
    if (auditLogActorFilter !== "all" && entry.actorUid !== auditLogActorFilter) return false;
    const searchText = normalizeSearchText(auditLogSearch);
    if (!searchText) return true;
    return normalizeSearchText(`${entry.message} ${entry.actorName} ${entry.type} ${auditTypeLabel(entry.type)} ${auditCategoryLabel(category)}`).includes(searchText);
  }

  function stableRepairStringify(value: unknown): string {
    if (value === undefined) return "null";
    if (value === null) return "null";
    if (Array.isArray(value)) return `[${value.map((entry) => stableRepairStringify(entry)).join(",")}]`;
    if (typeof value === "object") {
      const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, entryValue]) => entryValue !== undefined)
        .sort(([left], [right]) => left.localeCompare(right));
      return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableRepairStringify(entryValue)}`).join(",")}}`;
    }
    return JSON.stringify(value);
  }

  function patchValueChanged(currentValue: unknown, nextValue: unknown) {
    return stableRepairStringify(currentValue ?? null) !== stableRepairStringify(nextValue ?? null);
  }

  function compactPatch<T extends Record<string, any>>(current: Record<string, any>, patch: T): Partial<T> {
    const result: Partial<T> = {};
    for (const [key, value] of Object.entries(patch)) {
      if (key === "updatedAt" || key === "updatedBy") continue;
      if (patchValueChanged(current[key], value)) (result as Record<string, any>)[key] = value;
    }
    return result;
  }

  async function buildRepairPreview(): Promise<RepairPreview> {
    if (!firebaseConfigured || !firebaseDb || !activeCampaignId || !isDm) throw new Error("Nur der DM kann Kampagnendaten reparieren.");

    const [bagSnapshot, itemSnapshot, memberSnapshot] = await Promise.all([
      getDocs(collection(firebaseDb, "campaigns", activeCampaignId, "bags")),
      getDocs(collection(firebaseDb, "campaigns", activeCampaignId, "items")),
      getDocs(collection(firebaseDb, "campaigns", activeCampaignId, "members")),
    ]);

    const latestBags = bagSnapshot.docs.map((entry) => entry.data() as Bag);
    const repairTimestamp = Date.now();
    const latestItems = itemSnapshot.docs.map((entry) => normalizeLiveItem(entry.data() as Partial<InventoryItem>, entry.id, repairTimestamp));
    const validPlayerIds = new Set(
      memberSnapshot.docs
        .map((entry) => entry.data() as CampaignMember)
        .filter((entry) => entry.role === "player")
        .map((entry) => entry.uid),
    );

    const totalsByBag = new Map<string, { weight: number; volume: number; value: number; count: number }>();
    for (const bag of latestBags) totalsByBag.set(bag.id, { weight: currencyWeight(bagCurrency(bag)), volume: 0, value: 0, count: 0 });

    let orphanItems = 0;
    for (const item of latestItems) {
      const totals = totalsByBag.get(item.bagId);
      if (!totals) {
        orphanItems += 1;
        continue;
      }
      totals.weight += totalWeight(item);
      totals.volume += totalVolume(item);
      totals.value += totalValue(item);
      totals.count += item.quantity;
    }

    const bagPatches: RepairPreview["bagPatches"] = [];
    const itemPatches: RepairPreview["itemPatches"] = [];

    for (const bag of latestBags) {
      const totals = totalsByBag.get(bag.id) ?? { weight: 0, volume: 0, value: 0, count: 0 };
      const normalizedAccess = sanitizeAccessUserLists(getBagAccess(bag), validPlayerIds);
      const intended = cleanFirestorePayload({
        kind: getBagKind(bag),
        access: normalizedAccess,
        targetAccessKeys: targetAccessKeysForAccess(normalizedAccess),
        currentWeight: Math.max(0, Number(totals.weight.toFixed(4))),
        currentVolume: Math.max(0, Number(totals.volume.toFixed(4))),
        currentValue: Math.max(0, Number(totals.value.toFixed(4))),
        itemCount: Math.max(0, Math.round(totals.count)),
        maxWeight: bag.maxWeight ?? null,
        maxVolume: bag.maxVolume ?? null,
      } as any);
      const patch = compactPatch(bag as any, intended as any) as Partial<Bag>;
      if (Object.keys(patch).length) bagPatches.push({ id: bag.id, name: bag.name, patch });
    }

    for (let index = 0; index < itemSnapshot.docs.length; index += 1) {
      const raw = itemSnapshot.docs[index].data() as Partial<InventoryItem>;
      const normalized = latestItems[index];
      const intended = cleanFirestorePayload({
        id: normalized.id,
        bagId: normalized.bagId,
        name: normalized.name,
        quantity: normalized.quantity,
        weightPerUnit: normalized.weightPerUnit,
        volumePerUnit: normalized.volumePerUnit,
        valuePerUnit: normalized.valuePerUnit,
        description: normalized.description,
        notes: normalized.notes,
        stackKey: itemStackKey(normalized),
        category: normalizeItemCategory(normalized.category),
        orderIndex: normalized.orderIndex,
        imageUrl: normalized.imageUrl,
        imageZoom: normalized.imageZoom,
        imagePositionX: normalized.imagePositionX,
        imagePositionY: normalized.imagePositionY,
        createdBy: normalized.createdBy,
        updatedBy: normalized.updatedBy,
        createdAt: normalized.createdAt,
      } as any);
      const patch = compactPatch(raw as any, intended as any) as Partial<InventoryItem>;
      if (Object.keys(patch).length) itemPatches.push({ id: normalized.id, name: normalized.name, patch });
    }

    return {
      checkedBags: latestBags.length,
      checkedItems: latestItems.length,
      checkedMembers: memberSnapshot.docs.length,
      bagPatches,
      itemPatches,
      orphanItems,
    };
  }

  async function previewRepairCampaignData() {
    if (!firebaseConfigured || !firebaseDb || !activeCampaignId || !isDm) {
      setSyncStatus("error");
      setSyncError("Nur der DM kann Kampagnendaten reparieren.");
      return;
    }

    try {
      setRepairBusy(true);
      setSyncStatus("connecting");
      setSyncError("Kampagnendaten werden geprüft...");
      const preview = await buildRepairPreview();
      setRepairPreview(preview);
      setRepairModalOpen(true);
      setSyncStatus("online");
      setSyncError(null);
    } catch (error) {
      setSyncStatus("error");
      setSyncError(error instanceof Error ? error.message : "Kampagnendaten konnten nicht geprüft werden.");
    } finally {
      setRepairBusy(false);
    }
  }

  async function applyRepairPreview() {
    if (!firebaseConfigured || !firebaseDb || !activeCampaignId || !isDm || !repairPreview) return;

    try {
      setRepairBusy(true);
      setSyncStatus("connecting");
      setSyncError("Kampagnendaten werden repariert...");
      const nowTs = Date.now();
      const commits: Promise<void>[] = [];
      let batch = writeBatch(firebaseDb);
      let ops = 0;

      const commitIfNeeded = () => {
        if (!ops) return;
        commits.push(batch.commit());
        batch = writeBatch(firebaseDb);
        ops = 0;
      };

      for (const entry of repairPreview.bagPatches) {
        batch.update(doc(firebaseDb, "campaigns", activeCampaignId, "bags", entry.id), cleanFirestorePayload({ ...entry.patch, updatedAt: nowTs } as any));
        ops += 1;
        if (ops >= 450) commitIfNeeded();
      }
      for (const entry of repairPreview.itemPatches) {
        batch.update(doc(firebaseDb, "campaigns", activeCampaignId, "items", entry.id), cleanFirestorePayload({ ...entry.patch, updatedAt: nowTs, updatedBy: activeUid } as any));
        ops += 1;
        if (ops >= 450) commitIfNeeded();
      }
      commitIfNeeded();
      await Promise.all(commits);

      logAction(
        "campaign_repaired",
        `${member?.displayName ?? "DM"} hat die Kampagnendaten repariert: ${repairPreview.bagPatches.length} Taschen und ${repairPreview.itemPatches.length} Items geändert${repairPreview.orphanItems ? `, ${repairPreview.orphanItems} verwaiste Items ignoriert` : ""}.`,
        activeCampaignId,
      );

      setRepairModalOpen(false);
      setRepairPreview(null);
      setSyncStatus("online");
      setSyncError(null);
    } catch (error) {
      setSyncStatus("error");
      setSyncError(error instanceof Error ? error.message : "Kampagnendaten konnten nicht repariert werden.");
    } finally {
      setRepairBusy(false);
    }
  }



  async function addBag() {
    const cleanName = newBagName.trim();
    if (!cleanName || !activeCampaignId || !userUid) return;
    const nextIndex = bags.length ? Math.max(...bags.map((bag) => bag.sortIndex)) + 1 : 0;
    const createdAt = Date.now();
    const newBag: Bag = {
      id: uid("bag"),
      name: cleanName,
      description: "",
      ownerUid: activeUid,
      type: "personal",
      kind: newBagKind,
      sortIndex: nextIndex,
      maxWeight: 60,
      maxVolume: 40,
      currentWeight: 0,
      currentVolume: 0,
      currentValue: 0,
      itemCount: 0,
      currency: emptyCurrency(),
      permissions: { read: [], write: [] },
      access: privateIncomingAllowedAccess(activeUid),
      targetAccessKeys: targetAccessKeysForAccess(privateIncomingAllowedAccess(activeUid)),
      imageUrl: "",
      imageZoom: DEFAULT_IMAGE_ZOOM,
      imagePositionX: DEFAULT_IMAGE_POSITION,
      imagePositionY: DEFAULT_IMAGE_POSITION,
      createdAt,
      updatedAt: createdAt,
    };

    try {
      // Nicht optimistisch lokal hinzufügen: Bei Spielern kann sonst ein kurzer lokaler Bag-State entstehen,
      // bevor Firestore die neue Tasche bestätigt hat. Dadurch können Item-Listener mit neuen Bag-IDs
      // starten, für die die Security Rules noch keinen bestätigten Serverzustand sehen.
      await writeBag(newBag);
      logAction("bag_created", `${member?.displayName ?? "Jemand"} hat die Tasche „${newBag.name}“ erstellt.`, newBag.id);
      setSelectedBagId(newBag.id);
      setNewBagName("");
      setNewBagKind("inventory");
      setSyncStatus("online");
      setSyncError(null);
    } catch (error) {
      setSyncStatus("error");
      setSyncError(error instanceof Error ? error.message : "Tasche konnte nicht erstellt werden.");
    }
  }

  async function updateBag(id: string, patch: Partial<Bag>, options?: { silent?: boolean }) {
    const bag = bags.find((entry) => entry.id === id);
    if (!canWriteBag(bag)) return;

    const safePatch: Partial<Bag> = cleanFirestorePayload({ ...patch, updatedAt: Date.now() } as any);
    if (safePatch.access && isDm) {
      const validPlayerIds = new Set(members.filter((entry) => entry.role === "player").map((entry) => entry.uid));
      safePatch.access = sanitizeAccessUserLists(safePatch.access, validPlayerIds);
      safePatch.targetAccessKeys = targetAccessKeysForAccess(safePatch.access);
    }
    if (!isDm) {
      delete safePatch.access;
      delete safePatch.permissions;
      delete safePatch.ownerUid;
      delete safePatch.type;
      delete safePatch.sortIndex;
    }

    if (!firebaseConfigured) {
      setBags((prev) => prev.map((entry) => (entry.id === id ? { ...entry, ...safePatch } : entry)));
      return;
    }

    try {
      await patchBag(id, safePatch);
      if (!options?.silent) logAction("bag_updated", `${member?.displayName ?? "Jemand"} hat die Tasche „${bag?.name ?? id}“ geändert.`, id);
      setSyncStatus("online");
      setSyncError(null);
    } catch (error) {
      setSyncStatus("error");
      setSyncError(error instanceof Error ? error.message : "Tasche konnte nicht geändert werden.");
    }
  }


  function moveBag(id: string, direction: -1 | 1) {
    const ordered = [...visibleBags];
    const index = ordered.findIndex((bag) => bag.id === id);
    const swapIndex = index + direction;
    if (index < 0 || swapIndex < 0 || swapIndex >= ordered.length) return;

    const nextVisibleOrder = ordered.map((bag) => bag.id);
    const temp = nextVisibleOrder[index];
    nextVisibleOrder[index] = nextVisibleOrder[swapIndex];
    nextVisibleOrder[swapIndex] = temp;

    // Die Reihenfolge der linken Taschenleiste ist bewusst NICHT synchronisiert.
    // Jeder Browser/Firebase-User darf seine Inventare individuell sortieren.
    const visibleSet = new Set(ordered.map((bag) => bag.id));
    const hiddenOrStaleIds = bagOrderIds.filter((bagId) => !visibleSet.has(bagId));
    saveBagOrder([...nextVisibleOrder, ...hiddenOrStaleIds]);
  }


  async function approveMember(uid: string) {
    if (!firebaseConfigured || !firebaseDb || !activeCampaignId || !campaign || !isDm) return;
    const targetMember = members.find((entry) => entry.uid === uid);
    if (!targetMember || targetMember.role !== "applicant") return;

    const now = Date.now();
    const batch = writeBatch(firebaseDb);
    batch.update(doc(firebaseDb, "campaigns", activeCampaignId, "members", uid), { role: "player" });
    batch.set(doc(firebaseDb, "users", uid, "campaigns", activeCampaignId), {
      campaignId: activeCampaignId,
      name: campaign.name,
      joinCode: campaign.joinCode,
      role: "player",
      displayName: targetMember.displayName,
      joinedAt: targetMember.joinedAt,
      updatedAt: now,
    } satisfies UserCampaignSummary, { merge: true });
    await batch.commit();
    logAction("member_approved", `${member?.displayName ?? "DM"} hat ${targetMember.displayName} als Spieler bestätigt.`, uid);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;

    try {
      if (deleteTarget.kind === "campaign") {
        await deleteCampaign(deleteTarget.id);
        setDeleteTarget(null);
        return;
      }

      if (deleteTarget.kind === "member") {
        if (!firebaseConfigured || !firebaseDb || !activeCampaignId || !isDm || !campaign) return;
        if (deleteTarget.id === userUid) throw new Error("Der DM kann sich nicht selbst aus der Kampagne entfernen.");
        const targetMember = members.find((entry) => entry.uid === deleteTarget.id);
        if (targetMember?.role === "dm") throw new Error("Der DM kann nicht aus der Kampagne entfernt werden.");

        const oldJoinCodeSearch = campaign.joinCodeSearch ?? normalizeJoinCode(campaign.joinCode);
        const nextJoinCode = makeJoinCode();
        const nextJoinCodeSearch = normalizeJoinCode(nextJoinCode);
        const now = Date.now();

        const batch = writeBatch(firebaseDb);
        batch.delete(doc(firebaseDb, "campaigns", activeCampaignId, "members", deleteTarget.id));
        batch.delete(doc(firebaseDb, "users", deleteTarget.id, "campaigns", activeCampaignId));
        for (const bag of bags) {
          const oldAccess = getBagAccess(bag);
          const cleanedAccess = removeUserFromAccess(oldAccess, deleteTarget.id);
          if (JSON.stringify(oldAccess) !== JSON.stringify(cleanedAccess)) {
            batch.update(doc(firebaseDb, "campaigns", activeCampaignId, "bags", bag.id), {
              access: cleanedAccess,
              targetAccessKeys: targetAccessKeysForAccess(cleanedAccess),
              updatedAt: now,
            });
          }
        }
        if (oldJoinCodeSearch) batch.delete(doc(firebaseDb, "joinCodes", oldJoinCodeSearch));
        batch.set(doc(firebaseDb, "joinCodes", nextJoinCodeSearch), {
          campaignId: activeCampaignId,
          joinCode: nextJoinCode,
          campaignName: campaign.name,
          updatedAt: now,
        });
        batch.update(doc(firebaseDb, "campaigns", activeCampaignId), {
          joinCode: nextJoinCode,
          joinCodeSearch: nextJoinCodeSearch,
          updatedAt: now,
        });
        for (const entry of members) {
          if (entry.uid === deleteTarget.id || entry.role === "applicant") continue;
          batch.set(doc(firebaseDb, "users", entry.uid, "campaigns", activeCampaignId), {
            campaignId: activeCampaignId,
            name: campaign.name,
            joinCode: nextJoinCode,
            role: entry.role,
            displayName: entry.displayName,
            joinedAt: entry.joinedAt,
            updatedAt: now,
          } satisfies UserCampaignSummary, { merge: true });
        }
        await batch.commit();
        setJoinCodeVisible(false);
        logAction("member_removed", `${member?.displayName ?? "DM"} hat ${deleteTarget.label} aus der Kampagne entfernt.`, deleteTarget.id);
        logAction("join_code_rotated", `${member?.displayName ?? "DM"} hat den Beitrittscode automatisch erneuert, weil ein Mitglied entfernt wurde.`, activeCampaignId);
      }

      if (deleteTarget.kind === "bag") {
        const bag = bags.find((entry) => entry.id === deleteTarget.id);
        if (!canWriteBag(bag)) return;
        const deletedItems = items.filter((item) => item.bagId === deleteTarget.id);

        if (!firebaseConfigured) {
          const remaining = visibleBags.filter((entry) => entry.id !== deleteTarget.id);
          setBags((prev) => prev.filter((entry) => entry.id !== deleteTarget.id));
          setItems((prev) => prev.filter((item) => item.bagId !== deleteTarget.id));
          setSelectedBagId(remaining[0]?.id ?? "");
        } else if (firebaseDb && activeCampaignId) {
          const batch = writeBatch(firebaseDb);
          batch.delete(doc(firebaseDb, "campaigns", activeCampaignId, "bags", deleteTarget.id));
          for (const item of deletedItems) batch.delete(doc(firebaseDb, "campaigns", activeCampaignId, "items", item.id));
          await batch.commit();
          const remaining = visibleBags.filter((entry) => entry.id !== deleteTarget.id);
          setSelectedBagId(remaining[0]?.id ?? "");
          logAction("bag_deleted", `${member?.displayName ?? "Jemand"} hat die Tasche „${deleteTarget.label}“ gelöscht.`, deleteTarget.id);
        }
      }

      if (deleteTarget.kind === "item") {
        const item = items.find((entry) => entry.id === deleteTarget.id);
        const bag = bags.find((entry) => entry.id === item?.bagId);
        if (!canWriteBag(bag)) return;

        if (!firebaseConfigured) {
          setItems((prev) => prev.filter((entry) => entry.id !== deleteTarget.id));
        } else if (firebaseDb && activeCampaignId && item && bag) {
          const batch = writeBatch(firebaseDb);
          batch.delete(doc(firebaseDb, "campaigns", activeCampaignId, "items", deleteTarget.id));
          batch.update(doc(firebaseDb, "campaigns", activeCampaignId, "bags", bag.id), capacityPatchFromTotals(bagTotalsAfterDelta(bag, { weight: -totalWeight(item), volume: -totalVolume(item), value: -totalValue(item), count: -item.quantity })));
          await batch.commit();
          logAction("item_deleted", `${member?.displayName ?? "Jemand"} hat „${deleteTarget.label}“ gelöscht.`, deleteTarget.id);
        }
      }

      setSyncStatus(firebaseConfigured ? "online" : "local");
      setSyncError(null);
    } catch (error) {
      setSyncStatus("error");
      setSyncError(error instanceof Error ? error.message : "Löschvorgang fehlgeschlagen.");
    } finally {
      setDeleteTarget(null);
    }
  }


  function applyCatalogItem(entry: CatalogItem) {
    setNewItem((previous) => ({
      ...previous,
      name: entry.name,
      weightPerUnit: catalogValueToInput(entry.weight),
      volumePerUnit: "",
      valuePerUnit: catalogValueToInput(entry.valueGp),
      description: entry.description || `${entry.name} (${catalogMetaLine(entry)})`,
      category: inferCatalogCategory(entry),
    }));
    setItemCatalogOpen(false);
  }


  async function addItem() {
    setSyncError(null);
    setSyncStatus(firebaseConfigured ? "online" : "local");
    if (!selectedBag || !canWriteBag(selectedBag)) return;
    const name = newItem.name.trim();
    if (!name) return;
    const quantity = normalizeItemQuantity(newItem.quantity, 1);
    const createdAt = Date.now();
    const itemBase = {
      bagId: selectedBag.id,
      name,
      weightPerUnit: numberOrNull(newItem.weightPerUnit),
      volumePerUnit: numberOrNull(newItem.volumePerUnit),
      valuePerUnit: numberOrNull(newItem.valuePerUnit),
    };
    const itemCategory = normalizeItemCategory(newItem.category);
    const nextOrderIndex = nextItemOrderIndex(selectedBag.id, itemCategory);
    const item: InventoryItem = {
      id: stackDocumentId(selectedBag.id, itemBase),
      bagId: selectedBag.id,
      name,
      quantity,
      weightPerUnit: numberOrNull(newItem.weightPerUnit),
      volumePerUnit: numberOrNull(newItem.volumePerUnit),
      valuePerUnit: numberOrNull(newItem.valuePerUnit),
      description: newItem.description.trim(),
      notes: "",
      stackKey: itemStackKey(itemBase),
      category: itemCategory,
      orderIndex: nextOrderIndex,
      imageUrl: "",
      createdBy: activeUid,
      updatedBy: activeUid,
      createdAt,
      updatedAt: createdAt,
    };

    const fit = canFitIntoContainer(selectedBag, totalWeight(item), totalVolume(item));
    if (!fit.ok) {
      blockWithCapacityMessage(fit.reason ?? "Der Behälter ist voll.");
      return;
    }

    const existingStack = findStackMatch(items, selectedBag.id, item);

    if (!firebaseConfigured) {
      if (existingStack) {
        setItems((prev) => prev.map((entry) => entry.id === existingStack.id ? { ...entry, quantity: entry.quantity + item.quantity, updatedBy: activeUid, updatedAt: createdAt } : entry));
      } else {
        setItems((prev) => [...prev, item]);
      }
      setNewItem({ name: "", quantity: "1", weightPerUnit: "", volumePerUnit: "", valuePerUnit: "", description: "", category: "gear" });
      return;
    }

    try {
      const bagRef = campaignDocPath("bags", selectedBag.id);
      if (!bagRef || !firebaseDb) throw new Error("Keine aktive Kampagne gefunden.");
      const batch = writeBatch(firebaseDb);
      if (existingStack) {
        batch.update(campaignDocPath("items", existingStack.id)!, { quantity: existingStack.quantity + item.quantity, updatedBy: activeUid, updatedAt: createdAt });
      } else {
        const itemRef = campaignDocPath("items", item.id);
        if (!itemRef) throw new Error("Keine aktive Kampagne gefunden.");
        batch.set(itemRef, cleanFirestorePayload(item as any));
      }
      batch.update(bagRef, capacityPatchFromTotals(bagTotalsAfterDelta(selectedBag, { weight: totalWeight(item), volume: totalVolume(item), value: totalValue(item), count: item.quantity })));
      await batch.commit();
      logAction(existingStack ? "item_stacked" : "item_created", `${member?.displayName ?? "Jemand"} hat ${item.quantity}x „${item.name}“ in „${selectedBag.name}“ gelegt${existingStack ? " und mit einem vorhandenen Stapel zusammengeführt" : ""}.`, existingStack?.id ?? item.id);
      setNewItem({ name: "", quantity: "1", weightPerUnit: "", volumePerUnit: "", valuePerUnit: "", description: "", category: "gear" });
      setSyncStatus("online");
      setSyncError(null);
    } catch (error) {
      setSyncStatus("error");
      setSyncError(error instanceof Error ? error.message : "Item konnte nicht erstellt werden.");
    }
  }


  async function updateItem(id: string, patch: Partial<InventoryItem>) {
    setSyncError(null);
    setSyncStatus(firebaseConfigured ? "online" : "local");
    const current = items.find((entry) => entry.id === id);
    const currentBag = bags.find((bag) => bag.id === current?.bagId);
    const targetBag = patch.bagId ? bags.find((bag) => bag.id === patch.bagId) : currentBag;
    const isMove = Boolean(patch.bagId && patch.bagId !== current?.bagId);

    if (isMove) {
      if (!canWriteBag(currentBag) || !canDepositBag(targetBag)) return;
    } else if (!canWriteBag(currentBag)) {
      return;
    }

    if (current && targetBag) {
      const nextWeight = itemWeightAfterPatch(current, patch);
      const nextVolume = itemVolumeAfterPatch(current, patch);
      const fit = canFitIntoContainer(targetBag, nextWeight, nextVolume, { replacingItem: current });
      if (!fit.ok) {
        blockWithCapacityMessage(fit.reason ?? "Der Behälter ist voll.");
        return;
      }
    }

    const nowTs = Date.now();
    const nextCategory = normalizeItemCategory(patch.category ?? current?.category ?? "gear");
    const currentCategory = normalizeItemCategory(current?.category ?? "gear");
    const categoryChanged = Boolean(current && patch.category !== undefined && nextCategory !== currentCategory);
    const shouldAppendToTargetCategory = Boolean(current && targetBag && (isMove || categoryChanged));
    const safePatch: Partial<InventoryItem> = cleanFirestorePayload({ ...patch, updatedBy: activeUid, updatedAt: nowTs } as any);
    if (patch.category !== undefined) safePatch.category = nextCategory;
    if (shouldAppendToTargetCategory && targetBag) safePatch.orderIndex = nextItemOrderIndex(targetBag.id, nextCategory);

    if (!firebaseConfigured) {
      setItems((prev) => prev.map((entry) => (entry.id === id ? { ...entry, ...safePatch } : entry)));
      return;
    }

    try {
      if (!current || !targetBag || !currentBag || !firebaseDb || !activeCampaignId) throw new Error("Item oder Tasche nicht gefunden.");
      const itemRef = campaignDocPath("items", id);
      if (!itemRef) throw new Error("Keine aktive Kampagne gefunden.");

      const batch = writeBatch(firebaseDb);
      batch.update(itemRef, safePatch);

      const oldTotals = { weight: totalWeight(current), volume: totalVolume(current), value: totalValue(current), count: current.quantity };
      const nextItem = { ...current, ...safePatch } as InventoryItem;
      const newTotals = { weight: totalWeight(nextItem), volume: totalVolume(nextItem), value: totalValue(nextItem), count: nextItem.quantity };

      if (isMove && targetBag.id !== currentBag.id) {
        batch.update(doc(firebaseDb, "campaigns", activeCampaignId, "bags", currentBag.id), capacityPatchFromTotals(bagTotalsAfterDelta(currentBag, { weight: -oldTotals.weight, volume: -oldTotals.volume, value: -oldTotals.value, count: -oldTotals.count })));
        batch.update(doc(firebaseDb, "campaigns", activeCampaignId, "bags", targetBag.id), capacityPatchFromTotals(bagTotalsAfterDelta(targetBag, { weight: newTotals.weight, volume: newTotals.volume, value: newTotals.value, count: newTotals.count })));
      } else {
        batch.update(doc(firebaseDb, "campaigns", activeCampaignId, "bags", currentBag.id), capacityPatchFromTotals(bagTotalsAfterDelta(currentBag, { weight: newTotals.weight - oldTotals.weight, volume: newTotals.volume - oldTotals.volume, value: newTotals.value - oldTotals.value, count: newTotals.count - oldTotals.count })));
      }

      await batch.commit();

      if (isMove) {
        logAction("item_moved", `${member?.displayName ?? "Jemand"} hat „${current.name}“ nach „${targetBag?.name ?? "eine andere Tasche"}“ verschoben.`, id);
      } else if (typeof patch.quantity === "number" && patch.quantity !== current.quantity) {
        logAction("item_quantity_changed", `${member?.displayName ?? "Jemand"} hat die Menge von „${current.name}“ von ${current.quantity} auf ${patch.quantity} geändert.`, id);
      } else {
        logAction("item_updated", `${member?.displayName ?? "Jemand"} hat „${current.name}“ geändert.`, id);
      }

      setSyncStatus("online");
      setSyncError(null);
    } catch (error) {
      setSyncStatus("error");
      setSyncError(error instanceof Error ? error.message : "Item konnte nicht geändert werden.");
    }
  }


  async function saveThumbnailState(target: Exclude<ThumbnailTarget, null>, rawUrl: string, rawZoom: number, rawPositionX: number, rawPositionY: number) {
    const imageUrl = sanitizeImageUrl(rawUrl);
    const imageZoom = sanitizeImageZoom(rawZoom);
    const imagePositionX = sanitizeImagePosition(rawPositionX);
    const imagePositionY = sanitizeImagePosition(rawPositionY);
    const timestamp = Date.now();
    if (target.kind === "bag") {
      const bag = bags.find((entry) => entry.id === target.id);
      if (!bag || !canWriteBag(bag)) return;
      await updateBag(target.id, { imageUrl, imageZoom, imagePositionX, imagePositionY, imageUpdatedAt: timestamp, imageUpdatedBy: activeUid } as Partial<Bag>, { silent: true });
      logAction(imageUrl ? "bag_image_updated" : "bag_image_removed", `${member?.displayName ?? "Jemand"} hat das Bild von Tasche „${bag.name}“ ${imageUrl ? "gesetzt" : "entfernt"}.`, target.id);
    } else {
      const item = items.find((entry) => entry.id === target.id);
      const bag = bags.find((entry) => entry.id === item?.bagId);
      if (!item || !bag || !canWriteBag(bag)) return;
      await updateItem(target.id, { imageUrl, imageZoom, imagePositionX, imagePositionY, imageUpdatedAt: timestamp, imageUpdatedBy: activeUid } as Partial<InventoryItem>);
      logAction(imageUrl ? "item_image_updated" : "item_image_removed", `${member?.displayName ?? "Jemand"} hat das Bild von „${item.name}“ ${imageUrl ? "gesetzt" : "entfernt"}.`, target.id);
    }
  }

  function requestItemTransfer(itemId: string, targetBagId: string) {
    const item = items.find((entry) => entry.id === itemId);
    const currentBag = bags.find((bag) => bag.id === item?.bagId);
    const targetBag = bags.find((bag) => bag.id === targetBagId);
    if (!item || !currentBag || !targetBag) return;
    if (targetBag.id === currentBag.id) return;
    if (!canWriteBag(currentBag) || !canDepositBag(targetBag)) return;
    setTransferTarget({ itemId, targetBagId, quantity: String(item.quantity) });
  }

  function itemNeedsMetadataRepair(item: InventoryItem | undefined | null) {
    if (!item) return true;
    return (
      typeof item.description !== "string" ||
      typeof item.notes !== "string" ||
      item.category === undefined ||
      typeof item.weightPerUnit === "undefined" ||
      typeof item.volumePerUnit === "undefined" ||
      typeof item.valuePerUnit === "undefined" ||
      typeof item.createdBy !== "string" ||
      typeof item.createdAt !== "number"
    );
  }

  function transferredStackPayloadFromSource(item: InventoryItem, targetStackId: string, targetBagId: string, amount: number | ReturnType<typeof increment>, nowTs: number): Record<string, any> {
    return cleanFirestorePayload({
      id: targetStackId,
      bagId: targetBagId,
      name: item.name,
      quantity: amount,
      weightPerUnit: item.weightPerUnit ?? null,
      volumePerUnit: item.volumePerUnit ?? null,
      valuePerUnit: item.valuePerUnit ?? null,
      description: typeof item.description === "string" ? item.description : "",
      notes: typeof item.notes === "string" ? item.notes : "",
      stackKey: itemStackKey(item),
      category: normalizeItemCategory(item.category),
      orderIndex: nextItemOrderIndex(targetBagId, normalizeItemCategory(item.category)),
      imageUrl: sanitizeImageUrl(item.imageUrl),
      imageZoom: sanitizeImageZoom(item.imageZoom),
      imagePositionX: sanitizeImagePosition(item.imagePositionX),
      imagePositionY: sanitizeImagePosition(item.imagePositionY),
      ...(typeof item.imageUpdatedAt === "number" ? { imageUpdatedAt: item.imageUpdatedAt } : {}),
      ...(typeof item.imageUpdatedBy === "string" ? { imageUpdatedBy: item.imageUpdatedBy } : {}),
      createdBy: typeof item.createdBy === "string" ? item.createdBy : activeUid,
      createdAt: typeof item.createdAt === "number" ? item.createdAt : nowTs,
      updatedBy: activeUid,
      updatedAt: nowTs,
      lastTransferSourceItemId: item.id,
      lastTransferSourceBagId: item.bagId,
    });
  }

  async function confirmItemTransfer() {
    if (!transferTarget) return;

    const item = items.find((entry) => entry.id === transferTarget.itemId);
    const sourceBag = bags.find((bag) => bag.id === item?.bagId);
    const targetBag = bags.find((bag) => bag.id === transferTarget.targetBagId);
    if (!item || !sourceBag || !targetBag) {
      setTransferTarget(null);
      return;
    }

    const amount = clampedTransferAmount(transferTarget.quantity, item.quantity);
    if (amount <= 0) return;
    if (!canWriteBag(sourceBag) || !canDepositBag(targetBag)) return;

    const movedItem: InventoryItem = { ...item, bagId: targetBag.id, quantity: amount };
    const movedWeight = totalWeight(movedItem);
    const movedVolume = totalVolume(movedItem);
    const movedValue = totalValue(movedItem);

    const fit = canFitIntoContainer(targetBag, movedWeight, movedVolume);
    if (!fit.ok) {
      blockWithCapacityMessage(fit.reason ?? "Der Behälter ist voll.");
      return;
    }

    setSyncError(null);
    setSyncStatus(firebaseConfigured ? "online" : "local");

    let targetStack = findStackMatch(items, targetBag.id, movedItem, item.id);
    const targetStackId = targetStack?.id ?? stackDocumentId(targetBag.id, movedItem);

    if (!firebaseConfigured) {
      const nowTs = Date.now();
      if (targetStack) {
        if (amount >= item.quantity) {
          setItems((prev) => prev
            .filter((entry) => entry.id !== item.id)
            .map((entry) => entry.id === targetStack!.id ? { ...entry, quantity: entry.quantity + amount, updatedBy: activeUid, updatedAt: nowTs } : entry));
        } else {
          setItems((prev) => prev.map((entry) => {
            if (entry.id === item.id) return { ...entry, quantity: item.quantity - amount, updatedBy: activeUid, updatedAt: nowTs };
            if (entry.id === targetStack!.id) return { ...entry, quantity: entry.quantity + amount, updatedBy: activeUid, updatedAt: nowTs };
            return entry;
          }));
        }
      } else {
        const newStackItem: InventoryItem = {
          ...item,
          id: targetStackId,
          bagId: targetBag.id,
          quantity: amount,
          createdBy: activeUid,
          category: normalizeItemCategory(item.category),
          orderIndex: nextItemOrderIndex(targetBag.id, normalizeItemCategory(item.category)),
          updatedBy: activeUid,
          createdAt: nowTs,
          updatedAt: nowTs,
        };
        if (amount >= item.quantity) {
          setItems((prev) => prev.filter((entry) => entry.id !== item.id).concat(newStackItem));
        } else {
          setItems((prev) => prev.map((entry) => (entry.id === item.id ? { ...entry, quantity: item.quantity - amount, updatedBy: activeUid, updatedAt: nowTs } : entry)).concat(newStackItem));
        }
      }
      logAction(targetStack ? "item_stacked" : "item_moved", `${member?.displayName ?? "Jemand"} hat ${amount}x „${item.name}“ von „${sourceBag.name}“ nach „${targetBag.name}“ übertragen${targetStack ? " und mit einem vorhandenen Stapel zusammengeführt" : ""}.`, targetStackId);
      setTransferTarget(null);
      return;
    }

    try {
      if (!firebaseDb || !activeCampaignId) throw new Error("Keine aktive Kampagne gefunden.");
      const batch = writeBatch(firebaseDb);
      const sourceBagRef = doc(firebaseDb, "campaigns", activeCampaignId, "bags", sourceBag.id);
      const targetBagRef = doc(firebaseDb, "campaigns", activeCampaignId, "bags", targetBag.id);
      const itemRef = doc(firebaseDb, "campaigns", activeCampaignId, "items", item.id);
      const targetStackRef = doc(firebaseDb, "campaigns", activeCampaignId, "items", targetStackId);
      const nowTs = Date.now();

      if (!targetStack && canOpenBag(targetBag)) {
        const targetStackSnapshot = await getDoc(targetStackRef);
        if (targetStackSnapshot.exists()) {
          const loadedTargetStack = normalizeLiveItem(targetStackSnapshot.data() as Partial<InventoryItem>, targetStackSnapshot.id, nowTs);
          if (loadedTargetStack.bagId === targetBag.id && isSameStackItem(loadedTargetStack, movedItem)) targetStack = loadedTargetStack;
        }
      }

      if (targetStack) {
        const stackUpdate: Record<string, any> = {
          quantity: targetStack.quantity + amount,
          updatedBy: activeUid,
          updatedAt: nowTs,
          lastTransferSourceItemId: item.id,
          lastTransferSourceBagId: sourceBag.id,
        };
        if (itemNeedsMetadataRepair(targetStack)) {
          Object.assign(stackUpdate, transferredStackPayloadFromSource(item, targetStack.id, targetBag.id, targetStack.quantity + amount, nowTs));
        }
        batch.update(targetStackRef, cleanFirestorePayload(stackUpdate));
      } else {
        const stackPayload = transferredStackPayloadFromSource(item, targetStackId, targetBag.id, increment(amount), nowTs);
        batch.set(targetStackRef, cleanFirestorePayload(stackPayload), { merge: true });
      }

      if (amount >= item.quantity) {
        batch.delete(itemRef);
      } else {
        batch.update(itemRef, { quantity: item.quantity - amount, updatedBy: activeUid, updatedAt: nowTs });
      }

      batch.update(sourceBagRef, capacityPatchFromTotals(bagTotalsAfterDelta(sourceBag, { weight: -movedWeight, volume: -movedVolume, value: -movedValue, count: -amount })));
      batch.update(targetBagRef, capacityPatchFromTotals(bagTotalsAfterDelta(targetBag, { weight: movedWeight, volume: movedVolume, value: movedValue, count: amount })));

      const transferLog = makeAuditLogEntry(targetStack ? "item_stacked" : "item_moved", `${member?.displayName ?? "Jemand"} hat ${amount}x „${item.name}“ von „${sourceBag.name}“ nach „${targetBag.name}“ übertragen${targetStack ? " und mit einem vorhandenen Stapel zusammengeführt" : ""}.`, targetStackId);
      if (transferLog) {
        batch.set(doc(firebaseDb, "campaigns", activeCampaignId, "auditLog", transferLog.id), cleanFirestorePayload(transferLog as any));
      }

      await batch.commit();

      if (transferLog) addAuditLogLocally(transferLog);
      setTransferTarget(null);
      setSyncStatus("online");
      setSyncError(null);
    } catch (error) {
      setSyncStatus("error");
      setSyncError(error instanceof Error ? error.message : "Item konnte nicht übertragen werden.");
    }
  }


  function saleEntriesForBag(bagId: string) {
    return (itemsByBag.get(bagId) ?? []).filter((item) => normalizeItemCategory(item.category) === "sale" && item.quantity > 0);
  }

  function saleTotalsForEntries(entries: InventoryItem[]) {
    const baseValue = entries.reduce((sum, item) => sum + totalValue(item), 0);
    const localSellValue = tradeAdjustedValue(baseValue, tradeRates.sellMultiplier);
    const payoutCopper = Math.max(0, Math.round(localSellValue * 100));
    const payoutCurrency = copperToCurrency(payoutCopper);
    return {
      baseValue,
      localSellValue: payoutCopper / 100,
      payoutCopper,
      payoutCurrency,
      weight: entries.reduce((sum, item) => sum + totalWeight(item), 0),
      volume: entries.reduce((sum, item) => sum + totalVolume(item), 0),
      quantity: entries.reduce((sum, item) => sum + item.quantity, 0),
    };
  }

  async function confirmSellSaleGoods(bagId: string) {
    const bag = bags.find((entry) => entry.id === bagId);
    if (!bag || !canWriteBag(bag)) return;
    const saleEntries = saleEntriesForBag(bag.id);
    if (!saleEntries.length) {
      setSaleConfirmTarget(null);
      return;
    }

    const totals = saleTotalsForEntries(saleEntries);
    const currentCurrency = bagCurrency(bag);
    const nextCurrency = addCurrency(currentCurrency, totals.payoutCurrency);
    const coinWeightDelta = currencyWeight(nextCurrency) - currencyWeight(currentCurrency);
    const finalTotals = bagTotalsAfterDelta(bag, {
      weight: -totals.weight + coinWeightDelta,
      volume: -totals.volume,
      value: -totals.baseValue,
      count: -totals.quantity,
    });
    const fit = canFitIntoContainer(bag, -totals.weight + coinWeightDelta, -totals.volume);
    if (!fit.ok) {
      blockWithCapacityMessage(fit.reason ?? "Der Behälter ist voll.");
      return;
    }

    const nowTs = Date.now();
    const saleList = saleEntries.map((item) => `${item.quantity}x ${item.name}`).join("; ");
    const payoutText = currencyDeltaText(totals.payoutCurrency);
    const message = `${member?.displayName ?? "Jemand"} hat Verkaufsgut aus „${bag.name}“ verkauft: ${saleList}. Gutgeschrieben: ${payoutText} (${formatNumber(totals.localSellValue)} gp).`;
    const bagPatch = cleanFirestorePayload({
      ...capacityPatchFromTotals(finalTotals),
      currency: nextCurrency,
      updatedAt: nowTs,
    } as any);

    setSyncError(null);
    setSyncStatus(firebaseConfigured ? "online" : "local");

    if (!firebaseConfigured) {
      const soldIds = new Set(saleEntries.map((item) => item.id));
      setItems((prev) => prev.filter((item) => !soldIds.has(item.id)));
      setBags((prev) => prev.map((entry) => entry.id === bag.id ? { ...entry, ...bagPatch } : entry));
      logAction("item_sold", message, bag.id);
      setSaleConfirmTarget(null);
      return;
    }

    try {
      if (!firebaseDb || !activeCampaignId) throw new Error("Keine aktive Kampagne gefunden.");
      if (saleEntries.length > 430) throw new Error("Zu viele Verkaufsgut-Stacks auf einmal. Bitte verkaufe vorher einen Teil oder lösche alte Stapel.");
      const batch = writeBatch(firebaseDb);
      for (const item of saleEntries) {
        batch.delete(doc(firebaseDb, "campaigns", activeCampaignId, "items", item.id));
      }
      batch.update(doc(firebaseDb, "campaigns", activeCampaignId, "bags", bag.id), bagPatch);
      const logEntry = makeAuditLogEntry("item_sold", message, bag.id);
      if (logEntry) batch.set(doc(firebaseDb, "campaigns", activeCampaignId, "auditLog", logEntry.id), cleanFirestorePayload(logEntry as any));
      await batch.commit();
      if (logEntry) addAuditLogLocally(logEntry);
      setSaleConfirmTarget(null);
      setSyncStatus("online");
      setSyncError(null);
    } catch (error) {
      setSyncStatus("error");
      setSyncError(error instanceof Error ? error.message : "Verkaufsgut konnte nicht verkauft werden.");
    }
  }


  function rememberCurrencyUndo(bagId: string, previous: CurrencyPouch) {
    setCurrencyUndoByBag((prev) => ({ ...prev, [bagId]: previous }));
  }

  async function setBagCurrency(bagId: string, nextCurrency: CurrencyPouch, logMessage: string, logType = "currency_updated") {
    const bag = bags.find((entry) => entry.id === bagId);
    if (!bag) return;
    if (!canWriteBag(bag) && !isDm) return;
    const safeCurrency = normalizeCurrency(nextCurrency);
    const addedCoinWeight = currencyWeight(safeCurrency) - currencyWeight(bagCurrency(bag));
    if (addedCoinWeight > 0) {
      const fit = canFitIntoContainer(bag, addedCoinWeight, 0);
      if (!fit.ok) {
        blockWithCapacityMessage(fit.reason ?? "Der Behälter ist voll.");
        return;
      }
    }

    const nowTs = Date.now();
    const patch = { ...currencyWeightPatchForBag(bag, safeCurrency), updatedAt: nowTs } as Partial<Bag>;

    try {
      rememberCurrencyUndo(bagId, bagCurrency(bag));

      if (!firebaseConfigured) {
        setBags((prev) => prev.map((entry) => entry.id === bagId ? { ...entry, ...patch } : entry));
        logAction(logType, logMessage, bagId);
        return;
      }

      if (!firebaseDb || !activeCampaignId) throw new Error("Keine aktive Kampagne gefunden.");
      await patchBag(bagId, patch);

      // Sofort lokal spiegeln. Sonst wirkt die Aktion je nach Listener/Cache kurz oder dauerhaft so,
      // als wäre sie nur geloggt worden.
      setBags((prev) => prev.map((entry) => entry.id === bagId ? { ...entry, ...patch } : entry));
      logAction(logType, logMessage, bagId);
      setSyncStatus("online");
      setSyncError(null);
    } catch (error) {
      setSyncStatus("error");
      setSyncError(error instanceof Error ? error.message : "Münzen konnten nicht geändert werden.");
    }
  }

  async function changeBagCurrency(bagId: string, key: CurrencyKey, delta: number) {
    const bag = bags.find((entry) => entry.id === bagId);
    if (!bag || !canWriteBag(bag)) return;
    const current = bagCurrency(bag);
    const nextAmount = current[key] + delta;
    if (nextAmount < 0) return;
    const next = { ...current, [key]: nextAmount };
    const addedCoinWeight = delta > 0 ? delta * COIN_WEIGHT_LB : 0;
    if (addedCoinWeight > 0) {
      const fit = canFitIntoContainer(bag, addedCoinWeight, 0);
      if (!fit.ok) {
        blockWithCapacityMessage(fit.reason ?? "Der Behälter ist voll.");
        return;
      }
    }
    rememberCurrencyUndo(bagId, current);
    await updateBag(bagId, currencyWeightPatchForBag(bag, next), { silent: true });
    logAction(
      delta >= 0 ? "currency_added" : "currency_removed",
      `${member?.displayName ?? "Jemand"} hat ${Math.abs(delta)} ${currencyDefs[key].short} ${delta >= 0 ? "in" : "aus"} „${bag.name}“ ${delta >= 0 ? "gelegt" : "entnommen"}.`,
      bagId,
    );
  }

  async function undoBagCurrency(bagId: string) {
    const bag = bags.find((entry) => entry.id === bagId);
    const previous = currencyUndoByBag[bagId];
    if (!bag || !previous || !canWriteBag(bag)) return;
    const addedCoinWeight = currencyWeight(previous) - currencyWeight(bagCurrency(bag));
    if (addedCoinWeight > 0) {
      const fit = canFitIntoContainer(bag, addedCoinWeight, 0);
      if (!fit.ok) {
        blockWithCapacityMessage(fit.reason ?? "Der Behälter ist voll.");
        return;
      }
    }
    await updateBag(bagId, currencyWeightPatchForBag(bag, previous), { silent: true });
    setCurrencyUndoByBag((prev) => {
      const next = { ...prev };
      delete next[bagId];
      return next;
    });
    logAction("currency_undo", `${member?.displayName ?? "Jemand"} hat die letzte Münzänderung in „${bag.name}“ zurückgesetzt.`, bagId);
  }

  async function convertBagCurrency(bagId: string, source: CurrencyKey | "all", target: CurrencyKey, targetAmountRaw: string, convertAll: boolean) {
    const bag = bags.find((entry) => entry.id === bagId);
    if (!bag || !canWriteBag(bag)) return;
    const current = bagCurrency(bag);
    const next = { ...current };
    if (source === target && !convertAll) return;

    if (convertAll) {
      if (source === "all") {
        const total = currencyToCopper(current);
        const targetCount = Math.floor(total / currencyValueInCopper[target]);
        const remainder = total % currencyValueInCopper[target];
        const converted = emptyCurrency();
        converted[target] = targetCount;
        converted.cp = remainder;
        await setBagCurrency(bagId, converted, `${member?.displayName ?? "Jemand"} hat alle Münzen in „${bag.name}“ möglichst in ${currencyDefs[target].short} umgewandelt.`, "currency_converted");
        return;
      }

      const sourceCopper = current[source] * currencyValueInCopper[source];
      const targetCount = Math.floor(sourceCopper / currencyValueInCopper[target]);
      const remainder = sourceCopper % currencyValueInCopper[target];
      next[source] = 0;
      next[target] += targetCount;
      if (remainder > 0) next.cp += remainder;
      await setBagCurrency(bagId, next, `${member?.displayName ?? "Jemand"} hat alle ${currencyDefs[source].short} in „${bag.name}“ möglichst in ${currencyDefs[target].short} umgewandelt.`, "currency_converted");
      return;
    }

    const targetAmount = normalizeCoinInput(targetAmountRaw);
    if (targetAmount <= 0) return;
    const neededCopper = targetAmount * currencyValueInCopper[target];

    if (source === "all") {
      const total = currencyToCopper(current);
      if (total < neededCopper) return;
      let remainder = total - neededCopper;
      const converted = emptyCurrency();
      converted[target] = targetAmount;
      // Rest als kanonisches Wechselgeld zurücklegen, damit kein Wert verloren geht.
      for (const key of currencyKeys) {
        const count = Math.floor(remainder / currencyValueInCopper[key]);
        converted[key] += count;
        remainder -= count * currencyValueInCopper[key];
      }
      await setBagCurrency(bagId, converted, `${member?.displayName ?? "Jemand"} hat Münzen in „${bag.name}“ in ${targetAmount} ${currencyDefs[target].short} gewechselt.`, "currency_converted");
      return;
    }

    if (neededCopper % currencyValueInCopper[source] !== 0) return;
    const sourceAmount = neededCopper / currencyValueInCopper[source];
    if (current[source] < sourceAmount) return;
    next[source] -= sourceAmount;
    next[target] += targetAmount;
    await setBagCurrency(bagId, next, `${member?.displayName ?? "Jemand"} hat ${sourceAmount} ${currencyDefs[source].short} in ${targetAmount} ${currencyDefs[target].short} gewechselt.`, "currency_converted");
  }

  async function transferBagCurrency(sourceBagId: string, targetBagId: string, key: CurrencyKey, amountRaw: string) {
    const sourceBag = bags.find((entry) => entry.id === sourceBagId);
    const targetBag = bags.find((entry) => entry.id === targetBagId);
    const amount = normalizeCoinInput(amountRaw);
    if (!sourceBag || !targetBag || sourceBag.id === targetBag.id || amount <= 0) return;
    if (!canWriteBag(sourceBag) || !canDepositBag(targetBag)) return;
    const sourceCurrency = bagCurrency(sourceBag);
    const targetCurrency = bagCurrency(targetBag);
    if (sourceCurrency[key] < amount) return;
    const addedCoinWeight = amount * COIN_WEIGHT_LB;
    const fit = canFitIntoContainer(targetBag, addedCoinWeight, 0);
    if (!fit.ok) {
      blockWithCapacityMessage(fit.reason ?? "Der Zielbehälter ist voll.");
      return;
    }
    const nextSource = { ...sourceCurrency, [key]: sourceCurrency[key] - amount };
    const nextTarget = { ...targetCurrency, [key]: targetCurrency[key] + amount };
    rememberCurrencyUndo(sourceBag.id, sourceCurrency);
    rememberCurrencyUndo(targetBag.id, targetCurrency);

    const nowTs = Date.now();
    const sourcePatch = { ...currencyWeightPatchForBag(sourceBag, nextSource), updatedAt: nowTs } as Partial<Bag>;
    const targetPatch = { ...currencyWeightPatchForBag(targetBag, nextTarget), updatedAt: nowTs } as Partial<Bag>;
    const logMessage = `${member?.displayName ?? "Jemand"} hat ${amount} ${currencyDefs[key].short} von „${sourceBag.name}“ nach „${targetBag.name}“ übertragen.`;

    if (!firebaseConfigured) {
      setBags((prev) => prev.map((entry) => {
        if (entry.id === sourceBag.id) return { ...entry, ...sourcePatch };
        if (entry.id === targetBag.id) return { ...entry, ...targetPatch };
        return entry;
      }));
      logAction("currency_transferred", logMessage, sourceBag.id);
      return;
    }

    try {
      if (!firebaseDb || !activeCampaignId) throw new Error("Keine aktive Kampagne gefunden.");
      const batch = writeBatch(firebaseDb);
      batch.update(doc(firebaseDb, "campaigns", activeCampaignId, "bags", sourceBag.id), sourcePatch);
      batch.update(doc(firebaseDb, "campaigns", activeCampaignId, "bags", targetBag.id), targetPatch);
      await batch.commit();

      // Sofort lokal spiegeln, damit Quelle und Ziel direkt sichtbar aktualisiert werden.
      setBags((prev) => prev.map((entry) => {
        if (entry.id === sourceBag.id) return { ...entry, ...sourcePatch };
        if (entry.id === targetBag.id) return { ...entry, ...targetPatch };
        return entry;
      }));
      logAction("currency_transferred", logMessage, sourceBag.id);
      setSyncStatus("online");
      setSyncError(null);
    } catch (error) {
      setSyncStatus("error");
      setSyncError(error instanceof Error ? error.message : "Münzen konnten nicht übertragen werden.");
    }
  }


  function resetLocalPrototype() {
    setBags(initialBags);
    setItems(initialItems);
    setSelectedBagId(initialBags[0].id);
    setEditingBagId(null);
    setEditingItemId(null);
    setDeleteTarget(null);
    localStorage.removeItem("dnd-inventory-bags");
    localStorage.removeItem("dnd-inventory-items");
  }

  function toggleItemExpanded(itemId: string) {
    setExpandedItemIds((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId],
    );
  }

  const selectedTotals = selectedBag ? (canOpenBag(selectedBag) ? bagTotals.get(selectedBag.id) : getBagCapacityTotals(selectedBag)) : undefined;
  const auditActors = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of auditLog) map.set(entry.actorUid, entry.actorName || "Unbekannt");
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1], "de", { sensitivity: "base" }));
  }, [auditLog]);
  const filteredAuditLog = useMemo(() => auditLog.filter(auditMatchesFilters), [auditLog, auditLogCategoryFilter, auditLogActorFilter, auditLogSearch]);

  function openAuditLogModal() {
    setAuditLog([]);
    setAuditLogLimit(50);
    setAuditLogFullyLoaded(false);
    setAuditLogOpen(true);
  }

  function closeAuditLogModal() {
    setAuditLogOpen(false);
    setAuditLog([]);
    setAuditLogLimit(50);
    setAuditLogFullyLoaded(false);
  }

  const diagnosticRows = useMemo(() => {
    const activeListeners = [
      ["Auth", firebaseConfigured ? "aktiv" : "lokal"],
      ["Kampagnenliste", firebaseConfigured && userUid ? "aktiv" : "inaktiv"],
      ["Kampagne", firebaseConfigured && activeCampaignId && campaignAccessReady ? "aktiv" : "inaktiv"],
      ["Eigene Mitgliedschaft", firebaseConfigured && activeCampaignId && campaignAccessReady ? "aktiv" : "inaktiv"],
      ["Mitgliederliste", firebaseConfigured && activeCampaignId && campaignAccessReady && member?.role !== "applicant" ? "aktiv" : "inaktiv"],
      ["Taschen-Listener", isDm ? "1 Query · DM alle Taschen" : isApprovedMember ? "2 Queries · targetMode=all + targetMode=custom/user" : "inaktiv"],
      ["Einzelne Taschen-Doc-Listener", "0"],
      ["Legacy-/Index-Fallback", "aus · Access-Felder sind Quelle der Wahrheit"],
      ["Custom-Taschen-Query", isApprovedMember && !isDm ? "access.targetMode == custom + access.targetUserIds enthält UID" : isDm ? "nicht nötig für DM" : "inaktiv"],
      ["Item-Listener", selectedOpenableBagId ? `1 Query · ${selectedBag?.name ?? selectedOpenableBagId}` : "inaktiv"],
      ["Auditlog-Listener", auditLogOpen ? `aktiv · Limit ${auditLogLimit}` : "inaktiv"],
    ];
    return [
      ["Taschen geladen", String(bags.length)],
      ["Sichtbare/Ziel-Taschen", String(visibleBags.length)],
      ["Aktive Item-Tasche", selectedOpenableBagId ? (selectedBag?.name ?? selectedOpenableBagId) : "keine"],
      ["Item-Snapshot geladen", activeItemsLoadedBagId === selectedOpenableBagId && selectedOpenableBagId ? "ja" : selectedOpenableBagId ? "lädt" : "nein"],
      ["Items aktuell live geladen", String(items.length)],
      ["Auditlog geladen", String(auditLog.length)],
      ["Mitglieder geladen", String(members.length)],
      ["Erwartete aktive Listener", String(activeListeners.filter(([, value]) => value !== "inaktiv" && value !== "aus" && value !== "lokal").length)],
      ...activeListeners.map(([label, value]) => [`Listener: ${label}`, value]),
    ];
  }, [firebaseConfigured, userUid, activeCampaignId, campaignAccessReady, member?.role, isDm, isApprovedMember, bags.length, visibleBags.length, selectedOpenableBagId, selectedBag?.name, activeItemsLoadedBagId, items.length, auditLogOpen, auditLogLimit, auditLog.length, members.length]);
  const restoreReady = Boolean(restoreCandidate && campaign && restoreConfirmCampaignName.trim() === campaign.name && restoreConfirmWord.trim() === "IMPORTIEREN" && !backupBusy);
  const appClass = isDark ? "min-h-screen bg-[#16110c] text-[#f3e7c8]" : "min-h-screen bg-[#efe3c6] text-[#2d2116]";

  const syncBadge =
    syncStatus === "online"
      ? firebaseConfigured
        ? "Firebase Sync aktiv"
        : "Lokaler Modus"
      : syncStatus === "connecting"
        ? "Verbinde mit Firebase..."
        : syncStatus === "error"
          ? `Firebase Fehler: ${syncError ?? "unbekannt"}`
          : "Lokaler Modus · Firebase nicht konfiguriert";

  if (firebaseConfigured && !authUser) {
    return (
      <Shell appClass={appClass} isDark={isDark}>
        <CampaignGate
          isDark={isDark}
          panelClass={panelClass}
          mutedText={mutedText}
          inputClass={inputClass}
          primaryButton={primaryButton}
          secondaryButton={secondaryButton}
          syncBadge={syncBadge}
          userCampaigns={[]}
          onCreate={createCampaign}
          onJoin={joinCampaign}
          onOpenCampaign={openKnownCampaign}
          onDeleteCampaign={deleteCampaign}
          onRemoveCampaignReference={removeCampaignReference}
          onClearLocalData={clearLocalBrowserState}
          authUser={authUser}
          accountBusy={accountBusy}
          onRegister={registerAccount}
          onLogin={loginWithEmail}
          onLogout={logoutAccount}
          onResetPassword={resetPassword}
        />
      </Shell>
    );
  }

  if (firebaseConfigured && userUid && !activeCampaignId) {
    return (
      <Shell appClass={appClass} isDark={isDark}>
        <CampaignGate
          isDark={isDark}
          panelClass={panelClass}
          mutedText={mutedText}
          inputClass={inputClass}
          primaryButton={primaryButton}
          secondaryButton={secondaryButton}
          syncBadge={syncBadge}
          userCampaigns={userCampaigns}
          onCreate={createCampaign}
          onJoin={joinCampaign}
          onOpenCampaign={openKnownCampaign}
          onDeleteCampaign={deleteCampaign}
          onRemoveCampaignReference={removeCampaignReference}
          onClearLocalData={clearLocalBrowserState}
          authUser={authUser}
          accountBusy={accountBusy}
          onRegister={registerAccount}
          onLogin={loginWithEmail}
          onLogout={logoutAccount}
          onResetPassword={resetPassword}
        />
      </Shell>
    );
  }

  if (firebaseConfigured && activeCampaignId && (!campaign || !member)) {
    return (
      <Shell appClass={appClass} isDark={isDark}>
        <CenteredPanel panelClass={panelClass}>
          <h1 className="text-2xl font-black">Kampagne wird geladen...</h1>
          <p className={mutedText}>Falls diese Ansicht länger bleibt, fehlt dir eventuell die Mitgliedschaft oder die Firestore-Regeln blockieren den Zugriff.</p>
          <div className="mt-4 flex gap-2">
            <button className={secondaryButton} onClick={leaveCampaignSelection}>
              <DoorOpen className="h-4 w-4" /> Zur Kampagnenauswahl
            </button>
          </div>
        </CenteredPanel>
      </Shell>
    );
  }

  if (firebaseConfigured && activeCampaignId && campaign && member?.role === "applicant") {
    return (
      <Shell appClass={appClass} isDark={isDark}>
        <CenteredPanel panelClass={panelClass}>
          <div className="mb-4 flex items-center gap-3">
            <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${isDark ? "border-sky-500/50 bg-sky-950/40" : "border-sky-700/25 bg-sky-100/70"}`}>
              <UserRound className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black">Wartet auf DM-Bestätigung</h1>
              <p className={mutedText}>Du bist der Kampagne „{campaign?.name ?? member.campaignName ?? "Kampagne"}“ als Anwärter beigetreten.</p>
            </div>
          </div>
          <p className={`rounded-2xl border p-4 text-sm ${isDark ? "border-[#8d713e]/45 bg-[#1a130d]" : "border-[#9b7339]/30 bg-[#fff8df]"}`}>
            Bis der DM dich bestätigt, kannst du keine Taschen, Items, Mitgliederliste oder Logs sehen und nichts verändern.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className={secondaryButton} onClick={leaveCampaignSelection}>
              <DoorOpen className="h-4 w-4" /> Zur Kampagnenauswahl
            </button>
            {authUser && (
              <button className={dangerButton} onClick={logoutAccount}>
                <LogIn className="h-4 w-4" /> Ausloggen
              </button>
            )}
          </div>
        </CenteredPanel>
      </Shell>
    );
  }

  return (
    <div className={appClass}>
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.08]"
        style={{ backgroundImage: "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)", backgroundSize: "28px 28px" }}
      />

      <header className={`sticky top-0 z-20 border-b backdrop-blur-xl ${isDark ? "border-[#8d713e]/30 bg-[#16110c]/85" : "border-[#8a6a35]/30 bg-[#efe3c6]/85"}`}>
        <div className="flex w-full flex-col gap-3 px-3 py-4 sm:px-4 2xl:px-6">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border shadow-lg ${isDark ? "border-[#a9843f]/60 bg-[#2c2116]" : "border-[#8a6a35]/40 bg-[#fff3cf]"}`}>
                <ScrollText className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl font-black tracking-wide">DND Inventory Manager</h1>
                <p className={`flex flex-wrap items-center gap-x-1 gap-y-1 text-sm ${mutedText}`}>
                  <span>Kampagne: {campaign?.name ?? "Lokale Demo"} · Join-Code:</span>
                  {campaign?.joinCode ? (
                    <span className="inline-flex items-center gap-1">
                      <button
                        className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 font-mono font-bold transition hover:scale-[1.02] ${isDark ? "border-[#8d713e]/50 bg-[#2f2316] text-[#f3e7c8] hover:bg-[#3b2b1b]" : "border-[#9b7339]/40 bg-[#fff8df] text-[#2d2116] hover:bg-[#ead6a9]"}`}
                        onClick={copyJoinCodeToClipboard}
                        title={joinCodeVisible ? "Join-Code kopieren" : "Versteckten Join-Code kopieren"}
                      >
                        <Copy className="h-3.5 w-3.5" /> {joinCodeVisible ? campaign.joinCode : "•••-•••-•••"}
                      </button>
                      <button
                        className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border transition hover:scale-[1.03] ${isDark ? "border-[#8d713e]/50 bg-[#2f2316] hover:bg-[#3b2b1b]" : "border-[#9b7339]/40 bg-[#fff8df] hover:bg-[#ead6a9]"}`}
                        onClick={joinCodeVisible ? () => setJoinCodeVisible(false) : revealJoinCodeTemporarily}
                        title={joinCodeVisible ? "Join-Code ausblenden" : "Join-Code 7 Sekunden anzeigen"}
                      >
                        {joinCodeVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </span>
                  ) : (
                    <span className="font-mono font-bold">—</span>
                  )}
                  {joinCodeCopied && <span className="font-semibold text-emerald-500">kopiert</span>}
                  {member && <span> · {member.displayName} ({memberRoleLabel(member.role)})</span>}
                  <span className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 font-semibold ${isDark ? "border-[#8d713e]/40 bg-[#2f2316]/70 text-[#f4dfad]" : "border-[#9b7339]/30 bg-[#fff8df]/80 text-[#4a3218]"}`} title="Aktueller lokaler Handelskurs">
                    Kurs: {tradeRates.name} · Kauf {formatMultiplier(tradeRates.buyMultiplier)} · Verkauf {formatMultiplier(tradeRates.sellMultiplier)}
                  </span>
                </p>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-start gap-2 xl:justify-end">
              <div className={`flex rounded-xl border p-1 ${isDark ? "border-[#8d713e]/50 bg-[#20170f]" : "border-[#9b7339]/40 bg-[#f8edcf]"}`}>
                <button className={`${buttonBase} px-2 py-1 ${themeMode === "system" ? "bg-current/15" : ""}`} onClick={() => setThemeMode("system")} title="Systemmodus">
                  <Monitor className="h-4 w-4" />
                </button>
                <button className={`${buttonBase} px-2 py-1 ${themeMode === "light" ? "bg-current/15" : ""}`} onClick={() => setThemeMode("light")} title="Tagmodus">
                  <Sun className="h-4 w-4" />
                </button>
                <button className={`${buttonBase} px-2 py-1 ${themeMode === "dark" ? "bg-current/15" : ""}`} onClick={() => setThemeMode("dark")} title="Nachtmodus">
                  <Moon className="h-4 w-4" />
                </button>
              </div>
              <div className={`rounded-xl border px-3 py-2 text-sm ${isDark ? "border-emerald-700/50 bg-emerald-950/40 text-emerald-200" : "border-emerald-700/25 bg-emerald-100/60 text-emerald-900"}`}>
                {syncBadge}
              </div>
              {authUser && (
                <div className={`rounded-xl border px-3 py-2 text-sm ${isDark ? "border-[#8d713e]/50 bg-[#20170f]" : "border-[#9b7339]/40 bg-[#f8edcf]"}`}>
                  <span className="font-bold">{authUser.displayName || authUser.email}</span>
                  <span className={mutedText}> · Account</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isDm && activeCampaignId && campaign && (
              <button className={secondaryButton} onClick={() => setTradeRateModalOpen(true)} title="Lokalen Handelskurs bearbeiten">
                <Coins className="h-4 w-4" /> Handelskurs
              </button>
            )}
            {firebaseConfigured ? (
              <>
                {isDm && activeCampaignId && campaign && (
                  <>
                    <button className={secondaryButton} onClick={() => setBackupPanelOpen(true)}>
                      <Save className="h-4 w-4" /> Backup
                    </button>
                    <button className={secondaryButton} onClick={() => setDiagnosticsOpen(true)}>
                      <Monitor className="h-4 w-4" /> Diagnose
                    </button>
                    <button className={secondaryButton} onClick={previewRepairCampaignData} disabled={repairBusy}>
                      <Wrench className="h-4 w-4" /> Kampagnendaten reparieren
                    </button>
                    <button className={dangerButton} onClick={() => setDeleteTarget({ kind: "campaign", id: activeCampaignId, label: campaign.name })}>
                      <Trash2 className="h-4 w-4" /> Kampagne löschen
                    </button>
                  </>
                )}
                {authUser && (
                  <button className={secondaryButton} onClick={logoutAccount} disabled={accountBusy}>
                    <LogIn className="h-4 w-4" /> Ausloggen
                  </button>
                )}
                <button className={secondaryButton} onClick={leaveCampaignSelection}>
                  <DoorOpen className="h-4 w-4" /> Kampagne wechseln
                </button>
              </>
            ) : (
              <button className={secondaryButton} onClick={resetLocalPrototype}>Demo zurücksetzen</button>
            )}
          </div>
        </div>
      </header>

      <main className="grid w-full gap-3 px-2 py-3 sm:px-3 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start xl:grid-cols-[340px_minmax(0,1fr)] 2xl:px-5">
        <aside className={`min-w-0 rounded-3xl border p-3 shadow-xl lg:sticky lg:top-[104px] lg:max-h-[calc(100vh-120px)] lg:overflow-y-auto lg:overscroll-contain ${panelClass}`}>
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-black">Taschen</h2>
              <p className={`text-sm ${mutedText}`}>{isDm ? "Reihenfolge ist persönlich und wird nicht synchronisiert." : "Spielerzugriff: sichtbare Taschen werden angezeigt, gesperrte bleiben geschlossen."}</p>
            </div>
            {isDm ? <Crown className="h-6 w-6 opacity-80" /> : <Users className="h-6 w-6 opacity-80" />}
          </div>

          <div className="mb-4 space-y-2">
            <input
              value={newBagName}
              onChange={(event) => setNewBagName(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && addBag()}
              className={`w-full rounded-xl border px-3 py-2 text-sm ${inputClass}`}
              placeholder="Neues Inventar / Behälter..."
            />
            <div className="flex gap-2">
              <select className={`min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm ${inputClass}`} value={newBagKind} onChange={(event) => setNewBagKind(event.target.value as BagKind)}>
                <option value="inventory">Inventar</option>
                <option value="container">Behälter</option>
              </select>
              <button className={primaryButton} onClick={addBag} title="Tasche erstellen">
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {visibleBags.map((bag, index) => {
              const openable = canOpenBag(bag);
              const totals = openable ? bagTotals.get(bag.id) : getBagCapacityTotals(bag);
              const active = selectedBag?.id === bag.id;
              const weightStatus = bagLoadStatus(bag, totals?.weight ?? 0);
              const overloadedVolume = getBagKind(bag) === "container" && bag.maxVolume !== null && (totals?.volume ?? 0) > bag.maxVolume;
              const editing = editingBagId === bag.id;
              const writable = canWriteBag(bag);

              return (
                <div
                  key={bag.id}
                  className={`rounded-2xl border p-3 transition ${
                    active
                      ? isDark
                        ? "border-[#d2a94d] bg-[#3a2a16]"
                        : "border-[#7a4e17] bg-[#fff4cf]"
                      : isDark
                        ? "border-[#7b6237]/35 bg-[#1d150e]/70 hover:bg-[#261b12]"
                        : "border-[#9b7339]/25 bg-[#fff8df]/65 hover:bg-[#f7e8c2]"
                  }`}
                >
                  {editing ? (
                    <BagEditor
                      bag={bag}
                      members={members}
                      mutedText={mutedText}
                      inputClass={inputClass}
                      primaryButton={primaryButton}
                      secondaryButton={secondaryButton}
                      isDm={isDm}
                      onSave={(patch) => {
                        updateBag(bag.id, patch);
                        setEditingBagId(null);
                      }}
                      onCancel={() => setEditingBagId(null)}
                    />
                  ) : (
                    <>
                      <div className="mb-2 flex w-full items-start justify-between gap-2">
                        <div className="flex min-w-0 flex-1 items-start gap-2">
                          <ThumbnailButton
                            imageUrl={bag.imageUrl}
                            imageZoom={bag.imageZoom}
                            imagePositionX={bag.imagePositionX}
                            imagePositionY={bag.imagePositionY}
                            label={`Bild für Tasche ${bag.name}`}
                            isDark={isDark}
                            size="bag"
                            onClick={() => setThumbnailTarget({ kind: "bag", id: bag.id })}
                          />
                          <button className="min-w-0 flex-1 text-left" onClick={() => setSelectedBagId(bag.id)}>
                            <div className="flex items-center gap-2">
                              {typeIcon(bag.type)}
                              <h3 className="truncate font-black">{bag.name}</h3>
                            </div>
                            <p className={`mt-1 text-xs ${mutedText}`}>
                              {bagAccessLine(bag)}
                            </p>
                          </button>
                        </div>
                        {writable ? <Unlock className="h-4 w-4 opacity-70" /> : <Lock className="h-4 w-4 opacity-70" />}
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <MiniStat label="Gewicht" value={`${formatNumber(totals?.weight ?? 0)} / ${formatNumber(bag.maxWeight)}`} tone={weightStatus?.tone ?? "neutral"} sub={openable ? weightStatus?.label : "Inhalt verborgen"} />
                        <MiniStat label="Volumen" value={`${formatNumber(totals?.volume ?? 0)} / ${formatNumber(bag.maxVolume)}`} tone={overloadedVolume ? "red" : "neutral"} sub={getBagKind(bag) === "container" ? "harte Grenze" : undefined} />
                        <MiniStat label="Münzwert" value={openable ? `${formatNumber(currencyToGoldValue(bagCurrency(bag)))} gp` : "—"} sub={openable ? "nur Münzen" : "gesperrt"} />
                      </div>

                      <div className="mt-3 flex gap-2">
                        <button className={`${secondaryButton} flex-1 px-2 py-1`} onClick={() => moveBag(bag.id, -1)} disabled={index === 0}>
                          <ArrowUp className="h-4 w-4" />
                        </button>
                        <button className={`${secondaryButton} flex-1 px-2 py-1`} onClick={() => moveBag(bag.id, 1)} disabled={index === visibleBags.length - 1}>
                          <ArrowDown className="h-4 w-4" />
                        </button>
                        <button className={`${secondaryButton} flex-1 px-2 py-1`} onClick={() => setEditingBagId(bag.id)} disabled={!writable}>
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button className={`${dangerButton} flex-1 px-2 py-1`} onClick={() => setDeleteTarget({ kind: "bag", id: bag.id, label: bag.name })} disabled={!writable}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {firebaseConfigured && (
            <div className={`mt-4 rounded-2xl border p-3 text-sm ${isDark ? "border-[#7b6237]/35 bg-[#1d150e]/70" : "border-[#9b7339]/25 bg-[#fff8df]/70"}`}>
              <div className="mb-2 flex items-center gap-2 font-black"><Users className="h-4 w-4" /> Mitglieder</div>
              <div className="space-y-1">
                {sortedMembers.map((entry) => (
                  <div key={entry.uid} className="flex items-center justify-between gap-2 text-xs">
                    <span className="min-w-0 truncate">{entry.displayName}</span>
                    <div className="flex shrink-0 items-center gap-1">
                      <span className={`rounded-full px-2 py-0.5 font-bold ${entry.role === "dm" ? "bg-amber-800/40" : entry.role === "applicant" ? "bg-sky-900/45 text-sky-100" : "bg-current/10"}`}>{memberRoleLabel(entry.role)}</span>
                      {isDm && entry.role === "applicant" && (
                        <button
                          className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-800/80 text-emerald-50 transition hover:bg-emerald-700"
                          onClick={() => approveMember(entry.uid)}
                          title="Anwärter als Spieler bestätigen"
                        >
                          <UserCheck className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {isDm && entry.uid !== userUid && entry.role !== "dm" && (
                        <button
                          className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-red-900/75 text-red-50 transition hover:bg-red-800"
                          onClick={() => setDeleteTarget({ kind: "member", id: entry.uid, label: entry.displayName })}
                          title="Mitglied aus Kampagne entfernen"
                        >
                          <UserMinus className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {firebaseConfigured && (
            <div className={`mt-4 rounded-2xl border p-3 text-sm ${isDark ? "border-[#7b6237]/35 bg-[#1d150e]/70" : "border-[#9b7339]/25 bg-[#fff8df]/70"}`}>
              <div className="flex items-center justify-between gap-2 font-black">
                <span className="flex items-center gap-2"><History className="h-4 w-4" /> Aktivitätslog</span>
                <button className={`${secondaryButton} px-2 py-1 text-xs`} onClick={openAuditLogModal}>Öffnen</button>
              </div>
              <div className={`mt-2 text-xs ${mutedText}`}>Wird erst im großen Fenster geladen, um Firestore-Reads zu sparen.</div>
            </div>
          )}
        </aside>

        <section className="min-w-0 space-y-4">
          {selectedBag ? (
            <>
              <div className={`rounded-3xl border p-3 shadow-xl ${panelClass}`}>
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <div className="mb-2 flex items-center gap-2">
                      {typeIcon(selectedBag.type)}
                      <h2 className="text-2xl font-black">{selectedBag.name}</h2>
                    </div>
                    <p className={`${mutedText}`}>Ausgewählte Tasche · {canOpenBag(selectedBag) ? `${selectedItems.length} sichtbare Item-Zeilen` : "Inhalt gesperrt"}</p>
                    {selectedBag.description?.trim() && (
                      <p className={`mt-2 max-w-3xl whitespace-pre-wrap text-sm leading-relaxed ${mutedText}`}>{selectedBag.description.trim()}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 xl:min-w-[520px] xl:max-w-[620px]">
                    <BigStat icon={<Scale className="h-5 w-5" />} label="Gewicht" value={`${formatNumber(selectedTotals?.weight, "—")} / ${formatNumber(selectedBag.maxWeight)} lb`} tone={bagLoadStatus(selectedBag, selectedTotals?.weight ?? 0).tone} footer={`${bagKindLabel(getBagKind(selectedBag))}: ${bagLoadStatus(selectedBag, selectedTotals?.weight ?? 0).label}`} />
                    <BigStat icon={<Box className="h-5 w-5" />} label="Volumen" value={`${formatNumber(selectedTotals?.volume, "—")} / ${formatNumber(selectedBag.maxVolume)}`} tone={getBagKind(selectedBag) === "container" && selectedBag.maxVolume !== null && (selectedTotals?.volume ?? 0) > selectedBag.maxVolume ? "red" : "neutral"} footer={getBagKind(selectedBag) === "container" ? "harte Grenze" : "Anzeige"} />
                    <BigStat icon={<Coins className="h-5 w-5" />} label="Wert" value={canOpenBag(selectedBag) ? `${formatNumber((selectedTotals?.value ?? 0) + currencyToGoldValue(bagCurrency(selectedBag)))} gp` : "—"} footer={canOpenBag(selectedBag) ? "Items + Münzen" : "Inhalt gesperrt"} />
                  </div>
                </div>
                {canOpenBag(selectedBag) ? (
                  <CurrencyPanel
                    bag={selectedBag}
                    targetBags={visibleBags.filter((bag) => bag.id !== selectedBag.id && canDepositBag(bag))}
                    canEdit={canWriteBag(selectedBag)}
                    inputClass={inputClass}
                    primaryButton={primaryButton}
                    secondaryButton={secondaryButton}
                    mutedText={mutedText}
                    isDark={isDark}
                    undoAvailable={Boolean(currencyUndoByBag[selectedBag.id])}
                    onDelta={(key, delta) => changeBagCurrency(selectedBag.id, key, delta)}
                    onUndo={() => undoBagCurrency(selectedBag.id)}
                    onConvert={(source, target, amount, all) => convertBagCurrency(selectedBag.id, source, target, amount, all)}
                    onTransfer={(targetBagId, key, amount) => transferBagCurrency(selectedBag.id, targetBagId, key, amount)}
                  />
                ) : (
                  <div className={`mt-4 rounded-2xl border border-current/10 bg-current/5 p-3 text-sm font-bold ${mutedText}`}>
                    Münzen und Inhalt dieser Tasche sind für dich gesperrt.
                  </div>
                )}
              </div>

              <div className={`rounded-3xl border p-3 shadow-xl ${panelClass}`}>
                <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
                  <div>
                    <h3 className="flex items-center gap-2 text-lg font-black"><PackagePlus className="h-5 w-5" /> Item hinzufügen</h3>
                    <p className={`text-sm ${mutedText}`}>{canWriteBag(selectedBag) ? "Werte leer lassen, wenn Gewicht, Volumen oder Preis unbekannt sind. Behälter blocken lokal bei Überfüllung; Inventare dürfen nach Variant Encumbrance überladen werden." : canOpenBag(selectedBag) ? "Du darfst diese Tasche öffnen, aber hier keine Items erstellen oder bearbeiten." : "Diese Tasche ist sichtbar, aber ihr Inhalt ist gesperrt."}</p>
                  </div>
                  <input value={search} onChange={(event) => setSearch(event.target.value)} className={`rounded-xl border px-3 py-2 text-sm xl:w-72 ${inputClass}`} placeholder="In dieser Tasche suchen..." />
                </div>

                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(340px,2.6fr)_118px_72px_86px_86px_92px_minmax(180px,1.1fr)_130px]">
                  <Field label="Name / D&D-Katalog" mutedText={mutedText}>
                    <div className="relative">
                      <input
                        disabled={!canWriteBag(selectedBag)}
                        className={`w-full rounded-xl border px-3 py-2 text-sm ${inputClass}`}
                        placeholder="z. B. Heiltrank, rope, longsword..."
                        value={newItem.name}
                        autoComplete="off"
                        onFocus={() => setItemCatalogOpen(true)}
                        onBlur={() => window.setTimeout(() => setItemCatalogOpen(false), 150)}
                        onChange={(e) => {
                          setNewItem((p) => ({ ...p, name: e.target.value }));
                          setItemCatalogOpen(true);
                        }}
                      />
                      {itemCatalogOpen && catalogMatches.length > 0 && canWriteBag(selectedBag) && (
                        <div className={`absolute left-0 right-0 top-full z-40 mt-2 max-h-80 overflow-auto rounded-2xl border p-2 shadow-2xl ${isDark ? "border-[#8d713e]/60 bg-[#16100b]" : "border-[#9b7339]/35 bg-[#fff8df]"}`}>
                          <div className={`mb-1 px-2 text-[11px] font-bold ${mutedText}`}>Item-Katalog · {catalogMatches.length} Treffer</div>
                          {catalogMatches.map((entry) => (
                            <button
                              key={entry.id}
                              type="button"
                              className={`block w-full rounded-xl px-3 py-2 text-left transition ${isDark ? "hover:bg-[#2f2316]" : "hover:bg-[#ead6a9]"}`}
                              onMouseDown={(event) => {
                                event.preventDefault();
                                applyCatalogItem(entry);
                              }}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="truncate text-sm font-black">{entry.name}</span>
                                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${isDark ? "border-[#8d713e]/50 bg-[#2f2316]" : "border-[#9b7339]/35 bg-[#f1ddb3]"}`}>{entry.source}</span>
                              </div>
                              <div className={`mt-0.5 truncate text-[11px] ${mutedText}`}>{catalogMetaLine(entry)}</div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </Field>
                  <Field label="Kategorie" mutedText={mutedText}><select disabled={!canWriteBag(selectedBag)} className={`w-full rounded-xl border px-3 py-2 text-sm ${inputClass}`} value={newItem.category} onChange={(e) => setNewItem((p) => ({ ...p, category: e.target.value as ItemCategory }))}>{categorySelectOptions()}</select></Field>
                  <Field label="Menge" mutedText={mutedText}><input disabled={!canWriteBag(selectedBag)} className={`w-full rounded-xl border px-2 py-2 text-sm ${inputClass}`} placeholder="0" type="number" min="0" value={newItem.quantity} onChange={(e) => setNewItem((p) => ({ ...p, quantity: e.target.value }))} /></Field>
                  <Field label="Gewicht" mutedText={mutedText}><input disabled={!canWriteBag(selectedBag)} className={`w-full rounded-xl border px-2 py-2 text-sm ${inputClass}`} placeholder="lb" type="number" step="0.01" value={newItem.weightPerUnit} onChange={(e) => setNewItem((p) => ({ ...p, weightPerUnit: e.target.value }))} /></Field>
                  <Field label="Volumen" mutedText={mutedText}><input disabled={!canWriteBag(selectedBag)} className={`w-full rounded-xl border px-2 py-2 text-sm ${inputClass}`} placeholder="0" type="number" step="0.01" value={newItem.volumePerUnit} onChange={(e) => setNewItem((p) => ({ ...p, volumePerUnit: e.target.value }))} /></Field>
                  <Field label="Wert" mutedText={mutedText}><input disabled={!canWriteBag(selectedBag)} className={`w-full rounded-xl border px-2 py-2 text-sm ${inputClass}`} placeholder="gp" type="number" step="0.01" value={newItem.valuePerUnit} onChange={(e) => setNewItem((p) => ({ ...p, valuePerUnit: e.target.value }))} /></Field>
                  <Field label="Beschreibung" mutedText={mutedText} className="md:col-span-2 xl:col-span-1"><input disabled={!canWriteBag(selectedBag)} className={`w-full rounded-xl border px-3 py-2 text-sm ${inputClass}`} placeholder="Kurze Beschreibung des Items" value={newItem.description} onChange={(e) => setNewItem((p) => ({ ...p, description: e.target.value }))} /></Field>
                  <div className="flex items-end"><button className={`${primaryButton} w-full`} onClick={addItem} disabled={!canWriteBag(selectedBag)}><Plus className="h-4 w-4" /> Hinzufügen</button></div>
                </div>
              </div>

              <div className={`rounded-3xl border p-3 shadow-xl ${panelClass}`}>
                <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
                  <div>
                    <h3 className="text-lg font-black">Items in dieser Tasche</h3>
                    <p className={`text-sm ${mutedText}`}>Einzelwerte und Stackwerte mit direkter Mengenänderung.</p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <label className="space-y-1 text-xs">
                      <span className={`block px-1 ${mutedText}`}>Sortieren nach</span>
                      <select className={`rounded-xl border px-3 py-2 text-sm ${inputClass}`} value={itemSortKey} onChange={(event) => setItemSortKey(event.target.value as ItemSortKey)}>
                        <option value="custom">Eigene Reihenfolge</option>
                        <option value="name">Alphabetisch</option>
                        <option value="quantity">Menge</option>
                        <option value="weightUnit">Gewicht / Stück</option>
                        <option value="weightStack">Gewicht / Stack</option>
                        <option value="volumeUnit">Volumen / Stück</option>
                        <option value="volumeStack">Volumen / Stack</option>
                        <option value="valueUnit">Wert / Stück</option>
                        <option value="valueStack">Wert / Stack</option>
                        <option value="createdAt">Erstellt</option>
                        <option value="updatedAt">Zuletzt geändert</option>
                      </select>
                    </label>
                    <label className="space-y-1 text-xs">
                      <span className={`block px-1 ${mutedText}`}>Richtung</span>
                      <select className={`rounded-xl border px-3 py-2 text-sm ${inputClass}`} value={itemSortDirection} onChange={(event) => setItemSortDirection(event.target.value as SortDirection)} disabled={itemSortKey === "custom"}>
                        <option value="asc">Aufsteigend</option>
                        <option value="desc">Absteigend</option>
                      </select>
                    </label>
                    <div className={`rounded-xl border px-3 py-2 text-sm ${isDark ? "border-[#7b6237]/35 bg-[#1a130d]" : "border-[#9b7339]/25 bg-[#fff8df]"}`}>{selectedItems.length} Einträge</div>
                  </div>
                </div>

                <div className="space-y-3">
                  {!canOpenBag(selectedBag) ? (
                    <div className={`rounded-2xl border border-current/10 p-8 text-center ${mutedText}`}>
                      Diese Tasche ist für dich sichtbar, aber gesperrt. Du kannst sie nicht öffnen und ihren Inhalt nicht sehen.
                    </div>
                  ) : activeItemsLoadedBagId !== selectedOpenableBagId ? (
                    <div className={`rounded-2xl border border-current/10 p-8 text-center ${mutedText}`}>Items werden geladen… Die Taschenwerte bleiben bis dahin auf den gespeicherten Summen.</div>
                  ) : selectedItems.length === 0 ? (
                    <div className={`rounded-2xl border border-current/10 p-8 text-center ${mutedText}`}>Keine Items in dieser Tasche oder keine Treffer für die Suche.</div>
                  ) : (
                    groupedSelectedItems.flatMap(({ category, entries }) => {
                      const categoryDef = getCategoryDef(category);
                      const categoryWeight = entries.reduce((sum, entry) => sum + totalWeight(entry), 0);
                      const categoryVolume = entries.reduce((sum, entry) => sum + totalVolume(entry), 0);
                      const saleTotal = category === "sale" ? entries.reduce((sum, entry) => sum + totalValue(entry), 0) : 0;
                      const saleLocalSellTotal = category === "sale" ? tradeAdjustedValue(saleTotal, tradeRates.sellMultiplier) : 0;
                      const saleQuantity = category === "sale" ? entries.reduce((sum, entry) => sum + entry.quantity, 0) : 0;
                      const collapseKey = selectedBag ? inventoryCategoryKey(selectedBag.id, category) : category;
                      const categoryCollapsed = collapsedCategoryKeys.includes(collapseKey);
                      const sectionHeader = (
                        <div
                          key={`category-${category}`}
                          className={`mt-3 flex w-full flex-wrap items-center gap-2 rounded-2xl border px-3 py-2 text-left text-sm font-black ${isDark ? "border-[#8d713e]/35 bg-[#2a1f14]/70" : "border-[#9b7339]/25 bg-[#f1ddb3]/80"}`}
                        >
                          <button
                            type="button"
                            className={`flex h-8 w-8 items-center justify-center rounded-full border transition ${isDark ? "border-[#8d713e]/50 bg-[#1a130d] hover:bg-[#3a2a16]" : "border-[#9b7339]/35 bg-[#fff8df] hover:bg-[#ead6a9]"}`}
                            onClick={() => selectedBag && toggleCategoryCollapsed(selectedBag.id, category)}
                            title={categoryCollapsed ? "Kategorie ausklappen" : "Kategorie einklappen"}
                          >
                            {categoryCollapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </button>
                          <span className={`flex h-8 w-8 items-center justify-center rounded-full border ${isDark ? "border-[#8d713e]/50 bg-[#1a130d]" : "border-[#9b7339]/35 bg-[#fff8df]"}`}>{categoryIcon(category, "h-4 w-4")}</span>
                          <span>{categoryDef.label}</span>
                          <span className={`rounded-full border px-2 py-0.5 text-xs ${isDark ? "border-[#8d713e]/40 bg-[#1a130d]" : "border-[#9b7339]/25 bg-[#fff8df]"}`}>Gewicht: {formatNumber(categoryWeight)} lb</span>
                          {categoryVolume > 0 && <span className={`rounded-full border px-2 py-0.5 text-xs ${isDark ? "border-[#8d713e]/40 bg-[#1a130d]" : "border-[#9b7339]/25 bg-[#fff8df]"}`}>Volumen: {formatNumber(categoryVolume)}</span>}
                          {category === "sale" && (
                            <>
                              <span className={`rounded-full border px-2 py-0.5 text-xs ${isDark ? "border-emerald-700/50 bg-emerald-950/35 text-emerald-100" : "border-emerald-700/25 bg-emerald-100/70 text-emerald-950"}`}>Basiswert: {formatNumber(saleTotal)} gp</span>
                              <span className={`rounded-full border px-2 py-0.5 text-xs ${isDark ? "border-yellow-700/50 bg-yellow-950/35 text-yellow-100" : "border-yellow-700/25 bg-yellow-100/70 text-yellow-950"}`}>Lokaler Verkauf: {formatNumber(saleLocalSellTotal)} gp</span>
                              <button
                                type="button"
                                className={`${primaryButton} px-3 py-1.5 text-xs`}
                                disabled={!selectedBag || !canWriteBag(selectedBag) || saleQuantity <= 0}
                                onClick={() => selectedBag && setSaleConfirmTarget({ bagId: selectedBag.id })}
                                title="Verkaufsgut dieser Tasche verkaufen"
                              >
                                <Coins className="h-4 w-4" /> Sell
                              </button>
                            </>
                          )}
                          <span className={`ml-auto rounded-full border px-2 py-0.5 text-xs ${isDark ? "border-[#8d713e]/40 bg-[#1a130d]" : "border-[#9b7339]/25 bg-[#fff8df]"}`}>{entries.length}</span>
                        </div>
                      );
                      const saleSummary = category === "sale" ? (
                        <div key={`category-${category}-summary`} className={`rounded-2xl border px-4 py-3 text-sm ${isDark ? "border-emerald-700/40 bg-emerald-950/20 text-emerald-100" : "border-emerald-700/20 bg-emerald-100/55 text-emerald-950"}`}>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="font-black">Verkaufsgut gesamt</div>
                            <div className="text-right">
                              <div className="text-lg font-black tabular-nums">{formatNumber(saleLocalSellTotal)} gp</div>
                              <div className="text-[11px] font-bold opacity-75">lokaler Verkaufspreis · Basis {formatNumber(saleTotal)} gp</div>
                            </div>
                          </div>
                          <div className="mt-1 text-xs font-semibold opacity-80">{entries.length} Stapel · {saleQuantity} Gegenstände mit dem Tag „Verkaufsgut“ · Verkaufskurs {formatMultiplier(tradeRates.sellMultiplier)}.</div>
                        </div>
                      ) : null;
                      return categoryCollapsed ? [sectionHeader] : [
                        sectionHeader,
                        ...(saleSummary ? [saleSummary] : []),
                        ...entries.map((item) => {
                      const editing = editingItemId === item.id;
                      const currentBag = bags.find((bag) => bag.id === item.bagId);
                      const writable = canWriteBag(currentBag);
                      const categoryEntries = entries;
                      const categoryIndex = categoryEntries.findIndex((entry) => entry.id === item.id);
                      return editing ? (
                        <div key={item.id} className={`rounded-2xl border border-current/10 ${isDark ? "bg-[#1d150e]/70" : "bg-[#fff8df]/70"}`}>
                          <ItemEditor
                            item={item}
                            bags={visibleBags.length ? visibleBags : [selectedBag]}
                            inputClass={inputClass}
                            primaryButton={primaryButton}
                            secondaryButton={secondaryButton}
                            canDepositBagForOption={canDepositBag}
                            onCancel={() => setEditingItemId(null)}
                            onSave={(patch) => {
                              updateItem(item.id, patch);
                              setEditingItemId(null);
                            }}
                          />
                        </div>
                      ) : (
                        <div key={item.id} className={`rounded-2xl border px-3 py-2 ${isDark ? "border-[#7b6237]/35 bg-[#1d150e]/70" : "border-[#9b7339]/25 bg-[#fff8df]/70"}`}>
                          <div className="flex items-stretch gap-4">
                            <ThumbnailButton
                              imageUrl={item.imageUrl}
                              imageZoom={item.imageZoom}
                              imagePositionX={item.imagePositionX}
                              imagePositionY={item.imagePositionY}
                              label={`Bild für ${item.name}`}
                              isDark={isDark}
                              size="item"
                              onClick={() => setThumbnailTarget({ kind: "item", id: item.id })}
                            />

                            <div className="min-w-0 flex-1">
                              <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] xl:items-center">
                                <div className="flex min-w-0 items-center gap-2">
                                  <button
                                    type="button"
                                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-35 ${isDark ? "border-[#8d713e]/50 bg-[#1a130d] hover:bg-[#3a2a16]" : "border-[#9b7339]/35 bg-[#fff8df] hover:bg-[#ead6a9]"}`}
                                    title={sanitizeImageUrl(item.imageUrl) ? `Bild von ${item.name} groß ansehen` : "Kein Bild gesetzt"}
                                    disabled={!sanitizeImageUrl(item.imageUrl)}
                                    onClick={() => {
                                      const imageUrl = sanitizeImageUrl(item.imageUrl);
                                      if (imageUrl) setImageViewerTarget({ title: item.name, imageUrl });
                                    }}
                                  >
                                    <Maximize2 className="h-4 w-4" />
                                  </button>
                                  <h4 className="min-w-0 truncate text-base font-black">{item.name}</h4>
                                </div>
                                <span className={`inline-flex w-fit items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-bold opacity-85 ${isDark ? "border-[#8d713e]/40 bg-[#1a130d]" : "border-[#9b7339]/25 bg-[#fff8df]"}`}>{categoryIcon(category, "h-3.5 w-3.5")} {categoryDef.shortLabel}</span>
                                <select disabled={!writable} className={`min-w-0 rounded-xl border px-2 py-2 text-xs xl:w-[170px] ${inputClass}`} value={item.bagId} onChange={(event) => requestItemTransfer(item.id, event.target.value)} title="In andere Tasche verschieben">
                                  {(visibleBags.length ? visibleBags : [selectedBag]).map((bag) => <option key={bag.id} value={bag.id} disabled={!canDepositBag(bag)}>{bag.name}{canDepositBag(bag) ? "" : " (kein Hineinlegen)"}</option>)}
                                </select>
                                <button className={`${secondaryButton} px-3 py-2`} onClick={() => setEditingItemId(item.id)} disabled={!writable}><Pencil className="h-4 w-4" /> Bearbeiten</button>
                                <button className={`${dangerButton} px-3 py-2`} onClick={() => setDeleteTarget({ kind: "item", id: item.id, label: item.name })} disabled={!writable}><Trash2 className="h-4 w-4" /> Löschen</button>
                              </div>

                              <div className="mt-2 flex flex-col gap-2 2xl:flex-row 2xl:items-center 2xl:justify-between">
                                <div className="flex shrink-0 items-center gap-1">
                                  {itemSortKey === "custom" && (
                                    <>
                                      <button className={`${secondaryButton} px-2 py-2`} disabled={!writable || categoryIndex <= 0} onClick={() => moveItemWithinCategory(item.id, -1)} title="In dieser Kategorie nach oben"><ArrowUp className="h-4 w-4" /></button>
                                      <button className={`${secondaryButton} px-2 py-2`} disabled={!writable || categoryIndex >= categoryEntries.length - 1} onClick={() => moveItemWithinCategory(item.id, 1)} title="In dieser Kategorie nach unten"><ArrowDown className="h-4 w-4" /></button>
                                    </>
                                  )}
                                </div>

                                <div className="flex flex-wrap items-center gap-2 2xl:justify-end">
                                  <div className={`grid h-10 shrink-0 grid-cols-[auto_28px_56px_28px] items-center gap-1 rounded-full border px-2 text-xs shadow-inner ${isDark ? "border-[#8d713e]/50 bg-[#2f2316]" : "border-[#9b7339]/35 bg-[#f1ddb3]"}`}>
                                    <span className="pr-1 font-semibold opacity-75">Menge</span>
                                    <button disabled={!writable} className={`flex h-7 w-7 items-center justify-center rounded-full border transition hover:scale-105 disabled:opacity-30 ${isDark ? "border-[#8d713e]/60 bg-[#1a130d] hover:bg-[#3a2a16]" : "border-[#9b7339]/45 bg-[#fff8df] hover:bg-[#ead6a9]"}`} onClick={() => updateItem(item.id, { quantity: Math.max(0, item.quantity - 1) })} title="Menge verringern"><span className="relative -top-[2px] flex h-4 w-4 items-center justify-center text-lg font-black leading-none">−</span></button>
                                    <input
                                      disabled={!writable}
                                      className={`h-7 w-[56px] rounded-lg border px-0 text-center text-sm font-black leading-none tabular-nums ${inputClass}`}
                                      type="text"
                                      inputMode="numeric"
                                      pattern="[0-9]*"
                                      value={item.quantity}
                                      onChange={(event) => {
                                        const onlyDigits = event.target.value.replace(/\D/g, "");
                                        updateItem(item.id, { quantity: normalizeItemQuantity(onlyDigits, 0) });
                                      }}
                                      title="Menge direkt ändern"
                                    />
                                    <button disabled={!writable} className={`flex h-7 w-7 items-center justify-center rounded-full border transition hover:scale-105 disabled:opacity-30 ${isDark ? "border-[#8d713e]/60 bg-[#1a130d] hover:bg-[#3a2a16]" : "border-[#9b7339]/45 bg-[#fff8df] hover:bg-[#ead6a9]"}`} onClick={() => updateItem(item.id, { quantity: item.quantity + 1 })} title="Menge erhöhen"><span className="relative -top-[2px] flex h-4 w-4 items-center justify-center text-lg font-black leading-none">+</span></button>
                                  </div>

                                  <InlineItemValueStat label="Gewicht" unit="lb" single={item.weightPerUnit ?? 0} stack={totalWeight(item)} />
                                  <InlineItemValueStat label="Volumen" single={item.volumePerUnit ?? 0} stack={totalVolume(item)} />
                                  <InlineItemValueStat label="Wert" unit="gp" single={item.valuePerUnit ?? 0} stack={totalValue(item)} />
                                  <InlineLocalTradeValueStat baseSingle={item.valuePerUnit ?? 0} baseStack={totalValue(item)} rates={tradeRates} />
                                </div>
                              </div>

                              <div className="mt-2 flex min-w-0 items-start gap-2">
                            <button
                              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${isDark ? "border-[#8d713e]/50 bg-[#1a130d] hover:bg-[#3a2a16]" : "border-[#9b7339]/35 bg-[#fff8df] hover:bg-[#ead6a9]"}`}
                              onClick={() => toggleItemExpanded(item.id)}
                              title={expandedItemIds.includes(item.id) ? "Beschreibung einklappen" : "Beschreibung ausklappen"}
                            >
                              {expandedItemIds.includes(item.id) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </button>
                            {expandedItemIds.includes(item.id) ? (
                              <InlineDescriptionEditor
                                item={item}
                                writable={writable}
                                inputClass={inputClass}
                                primaryButton={primaryButton}
                                secondaryButton={secondaryButton}
                                mutedText={mutedText}
                                onSave={(patch) => updateItem(item.id, patch)}
                              />
                            ) : (
                              <p className={`min-w-0 flex-1 truncate text-sm ${mutedText}`}>{item.description || "Keine Beschreibung."}</p>
                            )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                      ];
                    })
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className={`rounded-3xl border p-8 text-center shadow-xl ${panelClass}`}>
              <h2 className="text-xl font-black">Keine sichtbare Tasche vorhanden</h2>
              <p className={mutedText}>Erstelle links eine neue Tasche oder bitte den DM um Freigabe.</p>
            </div>
          )}
        </section>
      </main>

      {saleConfirmTarget && (() => {
        const saleBag = visibleBags.find((bag) => bag.id === saleConfirmTarget.bagId) ?? bags.find((bag) => bag.id === saleConfirmTarget.bagId);
        const saleEntries = saleBag ? saleEntriesForBag(saleBag.id) : [];
        const saleTotals = saleTotalsForEntries(saleEntries);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
            <div className={`w-full max-w-3xl rounded-3xl border p-6 shadow-2xl ${isDark ? "border-[#8d713e]/55 bg-[#1b140e]/98" : "border-[#8a6a35]/35 bg-[#f8edd2]/98"}`}>
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="flex items-center gap-2 text-xl font-black"><Coins className="h-5 w-5" /> Verkaufsgut verkaufen</h3>
                  <p className={`mt-1 text-sm ${mutedText}`}>{saleBag?.name ?? "Unbekannte Tasche"}</p>
                </div>
                <button className={secondaryButton} onClick={() => setSaleConfirmTarget(null)}><X className="h-4 w-4" /></button>
              </div>

              <div className={`mb-4 rounded-2xl border px-4 py-3 text-sm ${isDark ? "border-yellow-700/45 bg-yellow-950/25 text-yellow-100" : "border-yellow-700/25 bg-yellow-100/70 text-yellow-950"}`}>
                <div className="font-black">Auszahlung nach aktuellem Verkaufskurs</div>
                <div className="mt-1 flex flex-wrap gap-2 text-xs font-bold">
                  <span>Basiswert: {formatNumber(saleTotals.baseValue)} gp</span>
                  <span>·</span>
                  <span>Lokaler Verkauf: {formatNumber(saleTotals.localSellValue)} gp</span>
                  <span>·</span>
                  <span>Münzen: {currencyDeltaText(saleTotals.payoutCurrency)}</span>
                  <span>·</span>
                  <span>Verkaufskurs {formatMultiplier(tradeRates.sellMultiplier)}</span>
                </div>
              </div>

              <div className={`mb-4 max-h-72 overflow-auto rounded-2xl border p-2 ${isDark ? "border-[#7b6237]/35 bg-[#1d150e]/70" : "border-[#9b7339]/25 bg-[#fff8df]/70"}`}>
                {saleEntries.length === 0 ? (
                  <div className={`p-4 text-center text-sm ${mutedText}`}>Kein Verkaufsgut mit Menge über 0 vorhanden.</div>
                ) : (
                  <div className="space-y-2">
                    {saleEntries.map((item) => {
                      const itemBase = totalValue(item);
                      const itemLocalSell = tradeAdjustedValue(itemBase, tradeRates.sellMultiplier);
                      return (
                        <div key={item.id} className="grid gap-2 rounded-xl border border-current/10 px-3 py-2 text-sm sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
                          <div className="min-w-0">
                            <div className="truncate font-black">{item.quantity}x {item.name}</div>
                            <div className={`text-xs ${mutedText}`}>{getCategoryDef(normalizeItemCategory(item.category)).label} · {formatNumber(totalWeight(item))} lb</div>
                          </div>
                          <div className="text-xs font-bold tabular-nums opacity-80">Basis {formatNumber(itemBase)} gp</div>
                          <div className="text-sm font-black tabular-nums">{formatNumber(itemLocalSell)} gp</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                <button className={secondaryButton} onClick={() => setSaleConfirmTarget(null)}><X className="h-4 w-4" /> Abbrechen</button>
                <button className={`${dangerButton} px-4 py-2`} disabled={!saleBag || !canWriteBag(saleBag) || saleEntries.length === 0} onClick={() => saleBag && confirmSellSaleGoods(saleBag.id)}><Trash2 className="h-4 w-4" /> Verkaufen und löschen</button>
              </div>
            </div>
          </div>
        );
      })()}

      {transferTarget && (() => {
        const item = items.find((entry) => entry.id === transferTarget.itemId);
        const sourceBag = bags.find((bag) => bag.id === item?.bagId);
        const targetBag = bags.find((bag) => bag.id === transferTarget.targetBagId);
        const amount = clampedTransferAmount(transferTarget.quantity, item?.quantity ?? 0);
        const previewItem = item ? { ...item, quantity: amount } as InventoryItem : null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
            <div className={`w-full max-w-xl rounded-3xl border p-6 shadow-2xl ${isDark ? "border-[#8d713e]/55 bg-[#1b140e]/98" : "border-[#8a6a35]/35 bg-[#f8edd2]/98"}`}>
              <h3 className="mb-2 text-xl font-black">Item übertragen</h3>
              <p className={`mb-4 text-sm ${mutedText}`}>
                Wähle, wie viele Stück übertragen werden sollen. Der Rest bleibt im Quellinventar.
              </p>

              <div className={`mb-4 rounded-2xl border p-4 ${isDark ? "border-[#7b6237]/35 bg-[#1d150e]/70" : "border-[#9b7339]/25 bg-[#fff8df]/70"}`}>
                <div className="mb-3 text-lg font-black">{item?.name ?? "Unbekanntes Item"}</div>
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  <div><span className={mutedText}>Von:</span> <span className="font-bold">{sourceBag?.name ?? "—"}</span></div>
                  <div><span className={mutedText}>Nach:</span> <span className="font-bold">{targetBag?.name ?? "—"}</span></div>
                  <div><span className={mutedText}>Vorhanden:</span> <span className="font-bold">{item?.quantity ?? 0}</span></div>
                  <div><span className={mutedText}>Übertragen:</span> <span className="font-bold">{amount}</span></div>
                </div>
              </div>

              <div className="mb-4 space-y-1 text-xs">
                <span className={`block px-1 ${mutedText}`}>Menge übertragen</span>
                <div className={`grid h-11 grid-cols-[auto_34px_80px_34px] items-center gap-2 rounded-2xl border px-3 text-xs shadow-inner ${isDark ? "border-[#8d713e]/50 bg-[#2f2316]" : "border-[#9b7339]/35 bg-[#f1ddb3]"}`}>
                  <span className="pr-1 font-semibold opacity-75">Menge</span>
                  <button
                    className={`flex h-8 w-8 items-center justify-center rounded-full border transition hover:scale-105 ${isDark ? "border-[#8d713e]/60 bg-[#1a130d] hover:bg-[#3a2a16]" : "border-[#9b7339]/45 bg-[#fff8df] hover:bg-[#ead6a9]"}`}
                    onClick={() => {
                      const current = clampedTransferAmount(transferTarget.quantity, item?.quantity ?? 0);
                      const next = Math.max(item?.quantity ? 1 : 0, current - 1);
                      setTransferTarget((prev) => prev ? { ...prev, quantity: String(next) } : prev);
                    }}
                    title="Menge verringern"
                  >
                    <span className="relative -top-[2px] flex h-4 w-4 items-center justify-center text-lg font-black leading-none">−</span>
                  </button>
                  <input
                    className={`h-8 w-[80px] rounded-lg border px-0 text-center text-sm font-black leading-none tabular-nums ${inputClass}`}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={transferTarget.quantity}
                    onChange={(event) => {
                      const digits = event.target.value.replace(/\D/g, "");
                      const max = normalizeItemQuantity(item?.quantity, 0);
                      const next = digits === "" ? "" : String(clampedTransferAmount(digits, max));
                      setTransferTarget((prev) => prev ? { ...prev, quantity: next } : prev);
                    }}
                  />
                  <button
                    className={`flex h-8 w-8 items-center justify-center rounded-full border transition hover:scale-105 ${isDark ? "border-[#8d713e]/60 bg-[#1a130d] hover:bg-[#3a2a16]" : "border-[#9b7339]/45 bg-[#fff8df] hover:bg-[#ead6a9]"}`}
                    onClick={() => {
                      const current = clampedTransferAmount(transferTarget.quantity, item?.quantity ?? 0);
                      const next = Math.min(normalizeItemQuantity(item?.quantity, 0), current + 1);
                      setTransferTarget((prev) => prev ? { ...prev, quantity: String(next) } : prev);
                    }}
                    title="Menge erhöhen"
                  >
                    <span className="relative -top-[2px] flex h-4 w-4 items-center justify-center text-lg font-black leading-none">+</span>
                  </button>
                </div>
              </div>

              {previewItem && (
                <div className="mb-5 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
                  <ItemValueStat label="Gewicht bewegt" unit="lb" single={previewItem.weightPerUnit ?? 0} stack={totalWeight(previewItem)} />
                  <ItemValueStat label="Volumen bewegt" single={previewItem.volumePerUnit ?? 0} stack={totalVolume(previewItem)} />
                  <ItemValueStat label="Wert bewegt" unit="gp" single={previewItem.valuePerUnit ?? 0} stack={totalValue(previewItem)} />
                </div>
              )}

              <div className="flex flex-wrap justify-end gap-2">
                <button className={secondaryButton} onClick={() => setTransferTarget(null)}><X className="h-4 w-4" /> Abbrechen</button>
                <button className={primaryButton} onClick={confirmItemTransfer} disabled={!item || !sourceBag || !targetBag || amount <= 0}><Save className="h-4 w-4" /> Übertragen</button>
              </div>
            </div>
          </div>
        );
      })()}

      {thumbnailTarget && (() => {
        const targetBag = thumbnailTarget.kind === "bag" ? bags.find((bag) => bag.id === thumbnailTarget.id) : null;
        const targetItem = thumbnailTarget.kind === "item" ? items.find((item) => item.id === thumbnailTarget.id) : null;
        const itemBag = targetItem ? bags.find((bag) => bag.id === targetItem.bagId) : null;
        const targetName = targetBag?.name ?? targetItem?.name ?? "Bild";
        const currentUrl = targetBag?.imageUrl ?? targetItem?.imageUrl ?? "";
        const currentZoom = targetBag?.imageZoom ?? targetItem?.imageZoom ?? DEFAULT_IMAGE_ZOOM;
        const currentPositionX = targetBag?.imagePositionX ?? targetItem?.imagePositionX ?? DEFAULT_IMAGE_POSITION;
        const currentPositionY = targetBag?.imagePositionY ?? targetItem?.imagePositionY ?? DEFAULT_IMAGE_POSITION;
        const editable = thumbnailTarget.kind === "bag" ? canWriteBag(targetBag) : canWriteBag(itemBag);
        return (
          <ThumbnailModal
            kind={thumbnailTarget.kind}
            targetName={targetName}
            imageUrl={currentUrl}
            imageZoom={currentZoom}
            imagePositionX={currentPositionX}
            imagePositionY={currentPositionY}
            canEdit={editable}
            panelClass={panelClass}
            inputClass={inputClass}
            primaryButton={primaryButton}
            secondaryButton={secondaryButton}
            dangerButton={dangerButton}
            mutedText={mutedText}
            isDark={isDark}
            onClose={() => setThumbnailTarget(null)}
            onSave={async (url, zoom, positionX, positionY) => {
              await saveThumbnailState(thumbnailTarget, url, zoom, positionX, positionY);
              setThumbnailTarget(null);
            }}
          />
        );
      })()}

      {imageViewerTarget && (
        <ImageViewerModal
          target={imageViewerTarget}
          panelClass={panelClass}
          secondaryButton={secondaryButton}
          mutedText={mutedText}
          onClose={() => setImageViewerTarget(null)}
        />
      )}

      {auditLogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className={`flex max-h-[90vh] w-full max-w-6xl flex-col rounded-3xl border p-5 shadow-2xl ${panelClass}`}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 text-2xl font-black"><History className="h-6 w-6" /> Aktivitätslog</h3>
                <p className={`text-sm ${mutedText}`}>{filteredAuditLog.length} von {auditLog.length} geladenen Einträgen · Limit {auditLogLimit}/500 · neueste zuerst</p>
              </div>
              <button className={secondaryButton} onClick={closeAuditLogModal}><X className="h-4 w-4" /> Schließen</button>
            </div>
            <div className={`mb-4 grid gap-3 rounded-2xl border p-3 text-sm md:grid-cols-[1fr_1fr_2fr_auto] ${isDark ? "border-[#7b6237]/35 bg-[#1d150e]/70" : "border-[#9b7339]/25 bg-[#fff8df]/70"}`}>
              <label className="space-y-1 text-xs">
                <span className={mutedText}>Kategorie</span>
                <select className={`w-full rounded-xl border px-2 py-2 text-sm ${inputClass}`} value={auditLogCategoryFilter} onChange={(e) => setAuditLogCategoryFilter(e.target.value as AuditLogCategory)}>
                  {auditCategoryOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-xs">
                <span className={mutedText}>Akteur</span>
                <select className={`w-full rounded-xl border px-2 py-2 text-sm ${inputClass}`} value={auditLogActorFilter} onChange={(e) => setAuditLogActorFilter(e.target.value)}>
                  <option value="all">Alle</option>
                  {auditActors.map(([uid, name]) => <option key={uid} value={uid}>{name}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-xs">
                <span className={mutedText}>Suche</span>
                <input className={`w-full rounded-xl border px-3 py-2 text-sm ${inputClass}`} value={auditLogSearch} onChange={(e) => setAuditLogSearch(e.target.value)} placeholder="z. B. Heiltrank, Münzen, Tasche, Spielername..." />
              </label>
              <button className={`${secondaryButton} self-end`} onClick={() => { setAuditLogCategoryFilter("all"); setAuditLogActorFilter("all"); setAuditLogSearch(""); }}>Filter zurücksetzen</button>
            </div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className={`text-xs ${mutedText}`}>Auditlog wird erst geladen, wenn dieses Fenster offen ist. Jeder Klick auf „Mehr laden“ erhöht das Limit um 50 bis maximal 500.</div>
              <button className={secondaryButton} onClick={() => setAuditLogLimit((prev) => Math.min(500, prev + 50))} disabled={auditLogFullyLoaded || auditLogLimit >= 500}>
                <Plus className="h-4 w-4" /> Mehr laden
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto pr-2">
              {filteredAuditLog.length === 0 ? (
                <div className={`rounded-2xl border border-current/10 p-6 text-center ${mutedText}`}>Keine passenden Aktionen gefunden.</div>
              ) : (
                <div className="space-y-2">
                  {filteredAuditLog.map((entry) => (
                    <div key={entry.id} className={`rounded-2xl border p-3 text-sm ${isDark ? "border-[#7b6237]/35 bg-[#1d150e]/70" : "border-[#9b7339]/25 bg-[#fff8df]/70"}`}>
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-black">{entry.actorName}</span>
                          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-black ${auditBadgeClass(entry)}`}>{auditCategoryLabel(entry.category ?? auditCategoryFromType(entry.type))}</span>
                          <span className={`rounded-full border border-current/15 px-2 py-0.5 text-[11px] font-bold ${mutedText}`}>{auditTypeLabel(entry.type)}</span>
                        </div>
                        <div className={`font-mono text-xs ${mutedText}`}>{formatTimestamp(entry.createdAt)}</div>
                      </div>
                      <div>{entry.message}</div>
                      <div className={`mt-1 text-xs ${mutedText}`}>Typ: {entry.type}{entry.targetId ? ` · Ziel: ${entry.targetId}` : ""}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {repairModalOpen && repairPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className={`w-full max-w-3xl rounded-3xl border p-6 shadow-2xl ${panelClass}`}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-xl font-black"><Wrench className="h-5 w-5" /> Kampagnendaten reparieren</h2>
                <p className={`mt-1 text-sm ${mutedText}`}>Die App schreibt nur Dokumente, bei denen wirklich etwas abweicht. Kein stumpfes Neuschreiben aller Items.</p>
              </div>
              <button className={secondaryButton} onClick={() => setRepairModalOpen(false)} disabled={repairBusy}><X className="h-4 w-4" /></button>
            </div>
            <div className={`mb-4 rounded-2xl border p-4 text-sm ${isDark ? "border-yellow-700/50 bg-yellow-950/25 text-yellow-100" : "border-yellow-800/25 bg-yellow-100/70 text-yellow-950"}`}>
              Diese Prüfung liest alle Taschen und Items der Kampagne. Ausführen bitte nur, wenn Daten beschädigt wirken oder Summen/Rechte repariert werden müssen.
            </div>
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <MiniStat label="Geprüfte Taschen" value={String(repairPreview.checkedBags)} />
              <MiniStat label="Geprüfte Items" value={String(repairPreview.checkedItems)} />
              <MiniStat label="Taschen mit Änderungen" value={String(repairPreview.bagPatches.length)} />
              <MiniStat label="Items mit Änderungen" value={String(repairPreview.itemPatches.length)} />
              <MiniStat label="Verwaiste Items" value={String(repairPreview.orphanItems)} />
              <MiniStat label="Geschätzte Writes" value={String(repairPreview.bagPatches.length + repairPreview.itemPatches.length + 1)} sub="inkl. Logeintrag" />
            </div>
            {(repairPreview.bagPatches.length > 0 || repairPreview.itemPatches.length > 0) && (
              <div className={`mt-4 max-h-52 overflow-auto rounded-2xl border border-current/10 p-3 text-xs ${mutedText}`}>
                {repairPreview.bagPatches.slice(0, 20).map((entry) => <div key={`bag-${entry.id}`}>Tasche „{entry.name}“: {Object.keys(entry.patch).join(", ")}</div>)}
                {repairPreview.itemPatches.slice(0, 40).map((entry) => <div key={`item-${entry.id}`}>Item „{entry.name}“: {Object.keys(entry.patch).join(", ")}</div>)}
                {repairPreview.bagPatches.length + repairPreview.itemPatches.length > 60 && <div>…weitere Änderungen gekürzt angezeigt.</div>}
              </div>
            )}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button className={secondaryButton} onClick={() => setRepairModalOpen(false)} disabled={repairBusy}><X className="h-4 w-4" /> Abbrechen</button>
              <button className={primaryButton} onClick={applyRepairPreview} disabled={repairBusy || (repairPreview.bagPatches.length + repairPreview.itemPatches.length) === 0}><Save className="h-4 w-4" /> Reparatur ausführen</button>
            </div>
          </div>
        </div>
      )}

      {diagnosticsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className={`flex max-h-[92vh] w-full max-w-2xl flex-col rounded-3xl border p-6 shadow-2xl ${panelClass}`}>
            <div className="mb-4 flex shrink-0 items-start justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-xl font-black"><Monitor className="h-5 w-5" /> Firestore-Diagnose</h2>
                <p className={`mt-1 text-sm ${mutedText}`}>Diese Werte sind lokale App-Zähler, keine offiziellen Firebase-Abrechnungszahlen. Sie zeigen aber, ob die App gerade zu viel live lädt.</p>
              </div>
              <button className={secondaryButton} onClick={() => setDiagnosticsOpen(false)}><X className="h-4 w-4" /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="space-y-2">
                {diagnosticRows.map(([label, value]) => (
                  <div key={label} className={`flex items-center justify-between gap-3 rounded-2xl border px-3 py-2 text-sm ${isDark ? "border-[#7b6237]/35 bg-[#1d150e]/70" : "border-[#9b7339]/25 bg-[#fff8df]/70"}`}>
                    <span className={mutedText}>{label}</span>
                    <span className="text-right font-black tabular-nums">{value}</span>
                  </div>
                ))}
              </div>
              <div className={`mt-4 rounded-2xl border border-current/10 p-3 text-xs ${mutedText}`}>
                Schonmodus aktiv: Items werden nur für die aktuell geöffnete Tasche live geladen. Auditlog lädt nur bei geöffnetem Logfenster. Taschen werden für Spieler nur noch über zwei AccessKey-Queries geladen; per-Taschen-Einzellistener, Legacy-Fallback und automatische Live-Reparatur sind deaktiviert.
              </div>
            </div>
          </div>
        </div>
      )}

      {tradeRateModalOpen && isDm && activeCampaignId && campaign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className={`w-full max-w-lg rounded-3xl border p-6 shadow-2xl ${panelClass}`}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-black">Handelskurs bearbeiten</h2>
                <p className={`mt-1 text-sm ${mutedText}`}>Diese Werte ändern nur die angezeigten lokalen Kauf- und Verkaufspreise. Item-Basiswerte bleiben unverändert.</p>
              </div>
              <button className={secondaryButton} onClick={() => setTradeRateModalOpen(false)} title="Schließen">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4">
              <label className="block space-y-1">
                <span className={`text-xs font-black uppercase tracking-wide ${mutedText}`}>Name des Kurses</span>
                <input
                  className={`w-full rounded-xl border px-3 py-2 text-sm font-bold ${inputClass}`}
                  value={tradeRateNameInput}
                  onChange={(event) => setTradeRateNameInput(event.target.value)}
                  placeholder="z. B. Elturel Preise"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className={`text-xs font-black uppercase tracking-wide ${mutedText}`}>Kaufen-Multiplikator</span>
                  <input
                    className={`w-full rounded-xl border px-3 py-2 text-sm font-black tabular-nums ${inputClass}`}
                    value={tradeBuyInput}
                    onChange={(event) => setTradeBuyInput(event.target.value.replace(",", "."))}
                    onKeyDown={(event) => { if (event.key === "Enter") updateTradeRates(); }}
                    inputMode="decimal"
                    placeholder="1.0"
                  />
                  <span className={`block text-xs ${mutedText}`}>Standard: ×1.0</span>
                </label>
                <label className="block space-y-1">
                  <span className={`text-xs font-black uppercase tracking-wide ${mutedText}`}>Verkaufen-Multiplikator</span>
                  <input
                    className={`w-full rounded-xl border px-3 py-2 text-sm font-black tabular-nums ${inputClass}`}
                    value={tradeSellInput}
                    onChange={(event) => setTradeSellInput(event.target.value.replace(",", "."))}
                    onKeyDown={(event) => { if (event.key === "Enter") updateTradeRates(); }}
                    inputMode="decimal"
                    placeholder="0.5"
                  />
                  <span className={`block text-xs ${mutedText}`}>Standard: ×0.5</span>
                </label>
              </div>
              <div className={`rounded-2xl border p-3 text-sm ${isDark ? "border-[#8d713e]/40 bg-[#20170f]" : "border-[#9b7339]/30 bg-[#fff8df]"}`}>
                Aktuelle Anzeige: <span className="font-black">{normalizeTradeRateName(tradeRateNameInput)}</span> · Kauf {formatMultiplier(normalizeTradeMultiplier(tradeBuyInput, DEFAULT_TRADE_BUY_MULTIPLIER))} · Verkauf {formatMultiplier(normalizeTradeMultiplier(tradeSellInput, DEFAULT_TRADE_SELL_MULTIPLIER))}
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <button className={secondaryButton} onClick={() => {
                  setTradeRateNameInput(DEFAULT_TRADE_RATE_NAME);
                  setTradeBuyInput(formatNumber(DEFAULT_TRADE_BUY_MULTIPLIER));
                  setTradeSellInput(formatNumber(DEFAULT_TRADE_SELL_MULTIPLIER));
                }}>Standard einsetzen</button>
                <button className={primaryButton} onClick={updateTradeRates}>
                  <Save className="h-4 w-4" /> Speichern
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {backupPanelOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className={`w-full max-w-3xl rounded-3xl border p-6 shadow-2xl ${isDark ? "border-[#8d713e]/55 bg-[#1b140e]/98" : "border-[#8a6a35]/35 bg-[#f8edd2]/98"}`}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 text-2xl font-black"><Save className="h-6 w-6" /> Backup & lokaler Mirror</h3>
                <p className={`mt-1 text-sm ${mutedText}`}>Backups enthalten Kampagne, Mitglieder, Taschen, Items, Münzen, Rechte und die letzten geladenen Logeinträge.</p>
              </div>
              <button className={secondaryButton} onClick={() => setBackupPanelOpen(false)}><X className="h-4 w-4" /> Schließen</button>
            </div>

            <div className={`mb-4 rounded-2xl border p-4 text-sm ${isDark ? "border-[#7b6237]/35 bg-[#1d150e]/80" : "border-[#9b7339]/25 bg-[#fff8df]/80"}`}>
              <div className="mb-1 font-black">Status</div>
              <div className={mutedText}>
                {backupMessage ?? "Noch kein Backup in dieser Sitzung erstellt."}
                {backupLastSavedAt && <span> · Letzte Sicherung: {formatTimestamp(backupLastSavedAt)}</span>}
              </div>
              {backupMirrorEnabled && <div className="mt-2 font-semibold text-emerald-500">Mirror aktiv: Änderungen werden automatisch nach kurzer Verzögerung in die gewählte Datei geschrieben.</div>}
            </div>

            <div className="grid gap-3 xl:grid-cols-3">
              <div className={`rounded-2xl border p-4 ${isDark ? "border-[#7b6237]/35 bg-[#1d150e]/70" : "border-[#9b7339]/25 bg-[#fff8df]/70"}`}>
                <h4 className="mb-2 text-lg font-black">Manueller Export</h4>
                <p className={`mb-4 text-sm ${mutedText}`}>Erstellt sofort eine JSON-Datei im Download-Ordner. Das funktioniert in jedem modernen Browser.</p>
                <button className={primaryButton} onClick={exportCampaignBackup} disabled={backupBusy || !isDm || !campaign}>
                  <Save className="h-4 w-4" /> Backup herunterladen
                </button>
              </div>

              <div className={`rounded-2xl border p-4 ${isDark ? "border-[#7b6237]/35 bg-[#1d150e]/70" : "border-[#9b7339]/25 bg-[#fff8df]/70"}`}>
                <h4 className="mb-2 text-lg font-black">Lokaler Mirror</h4>
                <p className={`mb-4 text-sm ${mutedText}`}>Du wählst einmal eine JSON-Datei. Danach aktualisiert die App diese Datei automatisch, sobald sich Kampagnendaten ändern.</p>
                <div className="flex flex-wrap gap-2">
                  <button className={primaryButton} onClick={chooseMirrorBackupFile} disabled={backupBusy || !isDm || !campaign}>
                    <Save className="h-4 w-4" /> Mirror-Datei wählen
                  </button>
                  <button className={secondaryButton} onClick={() => writeMirrorBackup("mirror_manual")} disabled={backupBusy || !backupFileHandle || !backupMirrorEnabled}>
                    Jetzt schreiben
                  </button>
                  <button className={dangerButton} onClick={disconnectMirrorBackup} disabled={backupBusy || !backupFileHandle}>
                    Trennen
                  </button>
                </div>
                <p className={`mt-3 text-xs ${mutedText}`}>Browser zeigen der Webseite keinen echten Dateipfad. Die App merkt sich nur die Dateiberechtigung im Browserprofil. Nach Browser-/Rechte-Reset musst du die Datei erneut wählen.</p>
              </div>

              <div className={`rounded-2xl border p-4 ${isDark ? "border-red-700/45 bg-red-950/20" : "border-red-900/25 bg-red-100/60"}`}>
                <h4 className="mb-2 text-lg font-black">Restore / Import</h4>
                <p className={`mb-4 text-sm ${mutedText}`}>Lädt eine Backup-Datei und überschreibt die aktuell geöffnete Kampagne erst nach harter Bestätigung.</p>
                <input id="backup-restore-file" type="file" accept="application/json,.json" className="hidden" onChange={handleRestoreFileSelected} />
                <label htmlFor="backup-restore-file" className={`${secondaryButton} inline-flex cursor-pointer`}>
                  Backup auswählen
                </label>
              </div>
            </div>

            {restoreCandidate && (() => {
              const counts = backupCounts(restoreCandidate.backup);
              return (
                <div className={`mt-4 rounded-2xl border p-4 text-sm ${isDark ? "border-red-700/50 bg-red-950/25" : "border-red-900/25 bg-red-100/70"}`}>
                  <h4 className="mb-2 text-lg font-black">Import bestätigen</h4>
                  <p className={mutedText}>
                    Datei: <span className="font-bold">{restoreCandidate.fileName}</span> · Backup-Kampagne: <span className="font-bold">{restoreCandidate.backup.campaign?.name}</span> · {counts.bags} Taschen · {counts.items} Items · {counts.members} Mitglieder · {counts.logs} Logs
                  </p>
                  {restoreCandidate.warnings.length > 0 && (
                    <div className={`mt-3 rounded-xl border p-3 ${isDark ? "border-amber-500/40 bg-amber-950/25 text-amber-100" : "border-amber-800/25 bg-amber-100 text-amber-950"}`}>
                      <div className="font-black">Warnungen</div>
                      <ul className="mt-1 list-disc pl-5">
                        {restoreCandidate.warnings.map((warning, index) => <li key={index}>{warning}</li>)}
                      </ul>
                    </div>
                  )}
                  <div className={`mt-3 rounded-xl border p-3 ${isDark ? "border-red-500/40 bg-red-950/30 text-red-100" : "border-red-900/25 bg-red-50 text-red-950"}`}>
                    <span className="font-black">Achtung:</span> Dieser Restore löscht die aktuellen Taschen, Items, Münzen und Logs dieser Kampagne und ersetzt sie durch das Backup. Aktueller DM und aktueller Join-Code bleiben aus Sicherheitsgründen erhalten.
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <label className="space-y-1 text-xs">
                      <span className="block px-1 opacity-75">Aktuellen Kampagnennamen exakt eingeben: {campaign?.name}</span>
                      <input className={`w-full rounded-xl border px-3 py-2 text-sm ${inputClass}`} value={restoreConfirmCampaignName} onChange={(event) => setRestoreConfirmCampaignName(event.target.value)} placeholder={campaign?.name ?? "Kampagnenname"} />
                    </label>
                    <label className="space-y-1 text-xs">
                      <span className="block px-1 opacity-75">Zur Bestätigung exakt IMPORTIEREN eingeben</span>
                      <input className={`w-full rounded-xl border px-3 py-2 text-sm ${inputClass}`} value={restoreConfirmWord} onChange={(event) => setRestoreConfirmWord(event.target.value)} placeholder="IMPORTIEREN" />
                    </label>
                  </div>
                  <div className="mt-4 flex flex-wrap justify-end gap-2">
                    <button className={secondaryButton} onClick={() => { setRestoreCandidate(null); setRestoreConfirmCampaignName(""); setRestoreConfirmWord(""); }}>
                      <X className="h-4 w-4" /> Import abbrechen
                    </button>
                    <button className={dangerButton} onClick={restoreCampaignFromBackup} disabled={!restoreReady}>
                      <Trash2 className="h-4 w-4" /> Kampagne aus Backup wiederherstellen
                    </button>
                  </div>
                </div>
              );
            })()}

            <div className={`mt-4 rounded-2xl border p-4 text-sm ${isDark ? "border-amber-700/40 bg-amber-950/20 text-amber-100" : "border-amber-800/20 bg-amber-100/70 text-amber-950"}`}>
              <span className="font-black">Wichtig:</span> Import überschreibt nur die aktuell geöffnete Kampagne. Er setzt nicht heimlich eine neue Kampagne an und stellt aus Sicherheitsgründen keinen alten Join-Code wieder her.
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className={`w-full max-w-md rounded-3xl border p-6 shadow-2xl ${panelClass}`}>
            <h3 className="mb-2 text-xl font-black">Löschen bestätigen</h3>
            <p className={`mb-5 ${mutedText}`}>
              Soll <span className="font-bold">{deleteTarget.label}</span> wirklich gelöscht werden?
              {deleteTarget.kind === "bag" && " Alle Items in dieser Tasche werden ebenfalls entfernt."}
              {deleteTarget.kind === "campaign" && " Die gesamte Kampagne inklusive Taschen, Items, Mitglieder und Log wird gelöscht. Das kann nicht rückgängig gemacht werden."}
              {deleteTarget.kind === "member" && " Das Mitglied verliert den Zugriff und die Kampagne wird aus seiner Kampagnenliste entfernt. Taschen und Items bleiben erhalten. Danach wird automatisch ein neuer Beitrittscode erzeugt."}
            </p>
            <div className="flex justify-end gap-2">
              <button className={secondaryButton} onClick={() => setDeleteTarget(null)}><X className="h-4 w-4" /> Abbrechen</button>
              <button className={dangerButton} onClick={confirmDelete}>{deleteTarget.kind === "member" ? <UserMinus className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />} {deleteTarget.kind === "member" ? "Entfernen" : "Löschen"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Shell({ appClass, isDark, children }: { appClass: string; isDark: boolean; children: React.ReactNode }) {
  return (
    <div className={appClass}>
      <div className="pointer-events-none fixed inset-0 opacity-[0.08]" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)", backgroundSize: "28px 28px" }} />
      <div className={`min-h-screen border-b ${isDark ? "border-[#8d713e]/30" : "border-[#8a6a35]/30"}`}>{children}</div>
    </div>
  );
}

function CenteredPanel({ panelClass, children }: { panelClass: string; children: React.ReactNode }) {
  return <div className="mx-auto flex min-h-screen max-w-2xl items-center justify-center p-6"><div className={`w-full rounded-3xl border p-6 shadow-xl ${panelClass}`}>{children}</div></div>;
}

function CampaignGate({
  isDark,
  panelClass,
  mutedText,
  inputClass,
  primaryButton,
  secondaryButton,
  syncBadge,
  userCampaigns,
  onCreate,
  onJoin,
  onOpenCampaign,
  onDeleteCampaign,
  onRemoveCampaignReference,
  onClearLocalData,
  authUser,
  accountBusy,
  onRegister,
  onLogin,
  onLogout,
  onResetPassword,
}: {
  isDark: boolean;
  panelClass: string;
  mutedText: string;
  inputClass: string;
  primaryButton: string;
  secondaryButton: string;
  syncBadge: string;
  userCampaigns: UserCampaignSummary[];
  onCreate: (campaignName: string, displayName: string) => Promise<void>;
  onJoin: (joinCode: string, displayName: string) => Promise<void>;
  onOpenCampaign: (campaignId: string) => void;
  onDeleteCampaign: (campaignId: string) => Promise<void>;
  onRemoveCampaignReference: (campaignId: string) => Promise<void>;
  onClearLocalData: () => void;
  authUser: User | null;
  accountBusy: boolean;
  onRegister: (email: string, password: string, passwordConfirm: string, displayName: string) => Promise<void>;
  onLogin: (email: string, password: string) => Promise<void>;
  onLogout: () => Promise<void>;
  onResetPassword: (email: string) => Promise<void>;
}) {
  const [campaignName, setCampaignName] = useState("Elturel");
  const [dmName, setDmName] = useState(authUser?.displayName || "DM");
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [playerName, setPlayerName] = useState(authUser?.displayName || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountEmail, setAccountEmail] = useState(authUser?.email || "");
  const [accountPassword, setAccountPassword] = useState("");
  const [accountPasswordConfirm, setAccountPasswordConfirm] = useState("");
  const [accountName, setAccountName] = useState(authUser?.displayName || "");
  const [accountMessage, setAccountMessage] = useState<string | null>(null);
  const [campaignDeleteTarget, setCampaignDeleteTarget] = useState<UserCampaignSummary | null>(null);
  const [referenceRemoveTarget, setReferenceRemoveTarget] = useState<UserCampaignSummary | null>(null);

  useEffect(() => {
    setAccountName(authUser?.displayName || "");
    setAccountEmail(authUser?.email || "");
    setDmName(authUser?.displayName || "DM");
    setPlayerName(authUser?.displayName || "");
    setAccountPassword("");
    setAccountPasswordConfirm("");
  }, [authUser?.uid, authUser?.displayName, authUser?.email]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setBusy(false);
    }
  }

  async function runAccount(action: () => Promise<void>, successMessage: string) {
    setError(null);
    setAccountMessage(null);
    try {
      await action();
      setAccountPassword("");
      setAccountPasswordConfirm("");
      setAccountMessage(successMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Account-Fehler");
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center p-4">
      <div className={`w-full rounded-3xl border p-5 shadow-xl ${panelClass}`}>
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border shadow-lg ${isDark ? "border-[#a9843f]/60 bg-[#2c2116]" : "border-[#8a6a35]/40 bg-[#fff3cf]"}`}><ScrollText className="h-6 w-6" /></div>
            <div>
              <h1 className="text-2xl font-black">DND Inventory Manager</h1>
              <p className={mutedText}>{authUser ? "Kampagne erstellen oder per Join-Code beitreten." : "Einloggen oder neuen Account registrieren."}</p>
            </div>
          </div>
          <div className={`rounded-xl border px-3 py-2 text-sm ${isDark ? "border-emerald-700/50 bg-emerald-950/40 text-emerald-200" : "border-emerald-700/25 bg-emerald-100/60 text-emerald-900"}`}>{syncBadge}</div>
        </div>

        <div className={`mb-4 rounded-3xl border p-4 ${isDark ? "border-[#7b6237]/35 bg-[#1d150e]/70" : "border-[#9b7339]/25 bg-[#fff8df]/70"}`}>
          <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-black"><UserRound className="h-5 w-5" /> Account</h2>
              <p className={`text-sm ${mutedText}`}>
                {authUser
                  ? `Angemeldet als ${authUser.email ?? "Account"}. Kampagnen sind online an diesen Account gebunden.`
                  : "Registriere dich oder logge dich ein. Ohne Account werden keine Kampagnen geöffnet oder erstellt."}
              </p>
            </div>
            {authUser && (
              <button className={secondaryButton} disabled={accountBusy} onClick={() => runAccount(onLogout, "Du wurdest ausgeloggt.")}>
                <LogIn className="h-4 w-4" /> Ausloggen
              </button>
            )}
          </div>

          {accountMessage && <div className={`mb-3 rounded-xl border px-3 py-2 text-sm ${isDark ? "border-emerald-700/50 bg-emerald-950/30 text-emerald-100" : "border-emerald-700/25 bg-emerald-100 text-emerald-950"}`}>{accountMessage}</div>}

          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(180px,1fr)_minmax(150px,0.8fr)_minmax(150px,0.8fr)_minmax(150px,0.8fr)]">
            <label className="space-y-1 text-xs">
              <span className={`block px-1 ${mutedText}`}>E-Mail</span>
              <input className={`w-full rounded-xl border px-3 py-2 text-sm ${inputClass}`} value={accountEmail} onChange={(e) => setAccountEmail(e.target.value)} placeholder="name@example.com" autoComplete="email" />
            </label>
            <label className="space-y-1 text-xs">
              <span className={`block px-1 ${mutedText}`}>Passwort</span>
              <input className={`w-full rounded-xl border px-3 py-2 text-sm ${inputClass}`} value={accountPassword} onChange={(e) => setAccountPassword(e.target.value)} placeholder="mind. 6 Zeichen" type="password" autoComplete="current-password" />
            </label>
            <label className="space-y-1 text-xs">
              <span className={`block px-1 ${mutedText}`}>Passwort wiederholen</span>
              <input className={`w-full rounded-xl border px-3 py-2 text-sm ${inputClass}`} value={accountPasswordConfirm} onChange={(e) => setAccountPasswordConfirm(e.target.value)} placeholder="nur für Registrierung" type="password" autoComplete="new-password" />
            </label>
            <label className="space-y-1 text-xs">
              <span className={`block px-1 ${mutedText}`}>Anzeigename</span>
              <input className={`w-full rounded-xl border px-3 py-2 text-sm ${inputClass}`} value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="z. B. Shirako" autoComplete="nickname" />
            </label>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button className={`${secondaryButton} whitespace-nowrap`} disabled={accountBusy || !accountEmail.trim() || !accountPassword} onClick={() => runAccount(() => onLogin(accountEmail, accountPassword), "Login erfolgreich.")}>
              <KeyRound className="h-4 w-4" /> Einloggen
            </button>
            <button className={`${primaryButton} whitespace-nowrap`} disabled={accountBusy || !accountEmail.trim() || !accountPassword || !accountPasswordConfirm || !accountName.trim()} onClick={() => runAccount(() => onRegister(accountEmail, accountPassword, accountPasswordConfirm, accountName), "Account wurde erstellt.")}>
              <Mail className="h-4 w-4" /> Registrieren
            </button>
            <button className={`${secondaryButton} whitespace-nowrap`} disabled={accountBusy || !accountEmail.trim()} onClick={() => runAccount(() => onResetPassword(accountEmail), "Passwort-Reset-Mail wurde angefordert.")}>
              Passwort vergessen
            </button>
          </div>
        </div>

        {error && <div className="mb-4 rounded-2xl border border-red-500/40 bg-red-950/30 p-3 text-sm text-red-200">{error}</div>}

        {authUser ? (
          <>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className={`rounded-3xl border p-4 ${isDark ? "border-[#7b6237]/35 bg-[#1d150e]/70" : "border-[#9b7339]/25 bg-[#fff8df]/70"}`}>
                <h2 className="mb-2 flex items-center gap-2 text-xl font-black"><Crown className="h-5 w-5" /> Neue Kampagne erstellen</h2>
                <p className={`mb-4 text-sm ${mutedText}`}>Du wirst automatisch DM. Die App erzeugt einen Join-Code für deine Spieler.</p>
                <div className="space-y-3">
                  <Field label="Kampagnenname" mutedText={mutedText}><input className={`w-full rounded-xl border px-3 py-2 text-sm ${inputClass}`} value={campaignName} onChange={(e) => setCampaignName(e.target.value)} /></Field>
                  <Field label="Dein Anzeigename" mutedText={mutedText}><input className={`w-full rounded-xl border px-3 py-2 text-sm ${inputClass}`} value={dmName} onChange={(e) => setDmName(e.target.value)} /></Field>
                  <button className={`${primaryButton} w-full`} disabled={busy} onClick={() => run(() => onCreate(campaignName, dmName))}><Plus className="h-4 w-4" /> Kampagne erstellen</button>
                </div>
              </div>

              <div className={`rounded-3xl border p-4 ${isDark ? "border-[#7b6237]/35 bg-[#1d150e]/70" : "border-[#9b7339]/25 bg-[#fff8df]/70"}`}>
                <h2 className="mb-2 flex items-center gap-2 text-xl font-black"><LogIn className="h-5 w-5" /> Kampagne öffnen / beitreten</h2>
                <p className={`mb-4 text-sm ${mutedText}`}>Gib den Join-Code ein. Wenn du schon Mitglied bist, wird die Kampagne einfach wieder geöffnet.</p>
                <div className="space-y-3">
                  <Field label="Join-Code" mutedText={mutedText}><input className={`w-full rounded-xl border px-3 py-2 font-mono text-sm uppercase ${inputClass}`} value={joinCodeInput} onChange={(e) => setJoinCodeInput(e.target.value)} placeholder="DND-ABC-123" /></Field>
                  <Field label="Dein Spielername" mutedText={mutedText}><input className={`w-full rounded-xl border px-3 py-2 text-sm ${inputClass}`} value={playerName} onChange={(e) => setPlayerName(e.target.value)} placeholder="z. B. Arirali" /></Field>
                  <button className={`${secondaryButton} w-full`} disabled={busy || !joinCodeInput.trim()} onClick={() => run(() => onJoin(joinCodeInput, playerName))}><LogIn className="h-4 w-4" /> Beitreten</button>
                </div>
              </div>
            </div>

            <div className={`mt-4 rounded-3xl border p-4 ${isDark ? "border-[#7b6237]/35 bg-[#1d150e]/70" : "border-[#9b7339]/25 bg-[#fff8df]/70"}`}>
              <h2 className="mb-2 flex items-center gap-2 text-xl font-black"><DoorOpen className="h-5 w-5" /> Meine Kampagnen</h2>
              <p className={`mb-3 text-sm ${mutedText}`}>Hier kannst du eine Kampagne wieder öffnen, ohne einen neuen Raum zu erstellen oder einen Join-Code neu einzugeben.</p>
              {userCampaigns.length === 0 ? (
                <div className={`rounded-2xl border border-current/10 px-3 py-2 text-sm ${mutedText}`}>Noch keine gespeicherten Kampagnen für diesen Account.</div>
              ) : (
                <div className="grid gap-2 md:grid-cols-2">
                  {userCampaigns.map((entry) => (
                    <div key={entry.campaignId} className={`rounded-2xl border p-3 text-left transition ${isDark ? "border-[#7b6237]/35 bg-[#1a130d]" : "border-[#9b7339]/25 bg-[#f8edcf]"}`}>
                      <button className="w-full text-left" onClick={() => onOpenCampaign(entry.campaignId)} disabled={busy}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-black">{entry.name}</span>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${entry.role === "dm" ? "bg-amber-800/40" : entry.role === "applicant" ? "bg-sky-900/45 text-sky-100" : "bg-current/10"}`}>{memberRoleLabel(entry.role)}</span>
                        </div>
                        <div className={`mt-1 text-xs ${mutedText}`}>{entry.role === "applicant" ? "Status: wartet auf DM-Bestätigung" : <>Join-Code: <span className="font-mono font-bold">{entry.joinCode}</span></>} · zuletzt: {formatTimestamp(entry.updatedAt)}</div>
                      </button>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button className={`${secondaryButton} px-3 py-1.5 text-xs`} onClick={() => onOpenCampaign(entry.campaignId)} disabled={busy}><DoorOpen className="h-4 w-4" /> Öffnen</button>
                        {entry.role === "dm" && (
                          <button className={`${isDark ? "border border-red-700/60 bg-red-950/50 text-red-100 hover:bg-red-900/60" : "border border-red-800/30 bg-red-100 text-red-950 hover:bg-red-200"} inline-flex items-center justify-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold transition`} onClick={() => setCampaignDeleteTarget(entry)} disabled={busy}>
                            <Trash2 className="h-4 w-4" /> Kampagne löschen
                          </button>
                        )}
                        <button className={`${secondaryButton} px-3 py-1.5 text-xs opacity-85`} onClick={() => setReferenceRemoveTarget(entry)} disabled={busy}><X className="h-4 w-4" /> Nur aus Liste entfernen</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className={`rounded-3xl border p-4 text-sm ${isDark ? "border-[#7b6237]/35 bg-[#1d150e]/70" : "border-[#9b7339]/25 bg-[#fff8df]/70"}`}>
            <h2 className="mb-2 text-xl font-black">Login erforderlich</h2>
            <p className={mutedText}>Registriere dich oder logge dich ein. Danach kannst du Kampagnen erstellen, beitreten und deine Kampagnenliste accountbasiert wiederherstellen.</p>
          </div>
        )}

        <div className={`mt-4 rounded-2xl border border-current/10 p-3 text-sm ${mutedText}`}>
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <span>Wenn alte Prototyp-Daten oder ein kaputter Kampagnenverweis stören, kannst du nur die lokalen Browserdaten dieser App leeren. Firebase-Kampagnen werden dadurch nicht gelöscht.</span>
            <button className={`${secondaryButton} shrink-0 px-3 py-2`} onClick={onClearLocalData} disabled={busy}>Lokale App-Daten leeren</button>
          </div>
        </div>

        <p className={`mt-4 text-sm ${mutedText}`}>Hinweis: Kampagnen werden pro E-Mail-Account gespeichert. Nach dem Login sind sie auch nach lokalen Browserdaten-Löschungen wieder verfügbar.</p>

        {campaignDeleteTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
            <div className={`w-full max-w-lg rounded-3xl border p-6 shadow-2xl ${panelClass}`}>
              <h3 className="mb-2 text-xl font-black">Kampagne löschen?</h3>
              <p className={`mb-4 text-sm ${mutedText}`}>Das löscht <span className="font-bold">{campaignDeleteTarget.name}</span> inklusive Taschen, Items, Mitglieder und Aktivitätslog aus Firebase. Das kann nicht rückgängig gemacht werden.</p>
              <div className="flex flex-wrap justify-end gap-2">
                <button className={secondaryButton} onClick={() => setCampaignDeleteTarget(null)} disabled={busy}><X className="h-4 w-4" /> Abbrechen</button>
                <button className={`${isDark ? "bg-red-800 text-red-50 hover:bg-red-700" : "bg-red-800 text-white hover:bg-red-700"} inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition disabled:opacity-50`} disabled={busy} onClick={() => run(async () => { await onDeleteCampaign(campaignDeleteTarget.campaignId); setCampaignDeleteTarget(null); })}>
                  <Trash2 className="h-4 w-4" /> Endgültig löschen
                </button>
              </div>
            </div>
          </div>
        )}

        {referenceRemoveTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
            <div className={`w-full max-w-lg rounded-3xl border p-6 shadow-2xl ${panelClass}`}>
              <h3 className="mb-2 text-xl font-black">Nur aus deiner Liste entfernen?</h3>
              <p className={`mb-4 text-sm ${mutedText}`}>Das entfernt <span className="font-bold">{referenceRemoveTarget.name}</span> nur aus „Meine Kampagnen“ dieses Accounts. Die Firebase-Kampagne selbst wird nicht gelöscht.</p>
              <div className="flex flex-wrap justify-end gap-2">
                <button className={secondaryButton} onClick={() => setReferenceRemoveTarget(null)} disabled={busy}><X className="h-4 w-4" /> Abbrechen</button>
                <button className={secondaryButton} disabled={busy} onClick={() => run(async () => { await onRemoveCampaignReference(referenceRemoveTarget.campaignId); setReferenceRemoveTarget(null); })}>
                  <Trash2 className="h-4 w-4" /> Aus Liste entfernen
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ThumbnailButton({ imageUrl, imageZoom, imagePositionX, imagePositionY, label, isDark, onClick, size = "md" }: { imageUrl?: string; imageZoom?: number; imagePositionX?: number; imagePositionY?: number; label: string; isDark: boolean; onClick: () => void; size?: "sm" | "md" | "bag" | "item" }) {
  const cleanUrl = sanitizeImageUrl(imageUrl);
  const sizeClass =
    size === "sm"
      ? "h-11 w-11"
      : size === "bag"
        ? "h-16 w-16"
        : size === "item"
          ? "aspect-square w-24 self-center sm:w-28"
          : "h-12 w-12";
  const placeholderIconClass = size === "item" ? "h-7 w-7" : "h-4 w-4";
  return (
    <button
      type="button"
      className={`${sizeClass} group relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl border transition hover:scale-[1.02] ${isDark ? "border-[#8d713e]/50 bg-[#1a130d] hover:bg-[#3a2a16]" : "border-[#9b7339]/35 bg-[#fff8df] hover:bg-[#ead6a9]"}`}
      onClick={(event) => { event.stopPropagation(); onClick(); }}
      title={cleanUrl ? `${label} ändern` : `${label} setzen`}
    >
      {cleanUrl ? (
        <img src={cleanUrl} alt="" draggable={false} className="h-full w-full select-none" style={thumbnailImageStyle(cleanUrl, imageZoom, imagePositionX, imagePositionY)} referrerPolicy="no-referrer" />
      ) : (
        <div className="flex flex-col items-center justify-center gap-1 text-[9px] font-black uppercase tracking-wide opacity-70">
          <ImageIcon className={placeholderIconClass} />
          <span>Bild</span>
        </div>
      )}
      <span className="pointer-events-none absolute inset-0 hidden items-center justify-center bg-black/55 text-white group-hover:flex">
        <Pencil className="h-5 w-5" />
      </span>
    </button>
  );
}

function ImageViewerModal({ target, panelClass, secondaryButton, mutedText, onClose }: { target: Exclude<ImageViewerTarget, null>; panelClass: string; secondaryButton: string; mutedText: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/88 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className={`flex max-h-[94vh] w-full max-w-7xl flex-col rounded-3xl border p-4 shadow-2xl ${panelClass}`} onClick={(event) => event.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-xl font-black"><Maximize2 className="h-5 w-5" /> Bildansicht</h2>
            <p className={`mt-1 truncate text-sm ${mutedText}`}>{target.title}</p>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <a className={`${secondaryButton} px-3 py-2`} href={target.imageUrl} target="_blank" rel="noreferrer" title="Original in neuem Tab öffnen">
              <ExternalLink className="h-4 w-4" /> Original öffnen
            </a>
            <button className={`${secondaryButton} px-3 py-2`} onClick={onClose} title="Schließen">
              <X className="h-4 w-4" /> Schließen
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-current/10 bg-black/40 p-3">
          <img
            src={target.imageUrl}
            alt={target.title}
            className="mx-auto max-h-[78vh] max-w-full rounded-xl object-contain"
            referrerPolicy="no-referrer"
          />
        </div>
      </div>
    </div>
  );
}

function ThumbnailModal({ kind, targetName, imageUrl, imageZoom, imagePositionX, imagePositionY, canEdit, panelClass, inputClass, primaryButton, secondaryButton, dangerButton, mutedText, isDark, onClose, onSave }: { kind: "bag" | "item"; targetName: string; imageUrl?: string; imageZoom?: number; imagePositionX?: number; imagePositionY?: number; canEdit: boolean; panelClass: string; inputClass: string; primaryButton: string; secondaryButton: string; dangerButton: string; mutedText: string; isDark: boolean; onClose: () => void; onSave: (url: string, zoom: number, positionX: number, positionY: number) => Promise<void> | void }) {
  const [url, setUrl] = useState(imageUrl ?? "");
  const [zoom, setZoom] = useState<number>(sanitizeImageZoom(imageZoom));
  const [positionX, setPositionX] = useState<number>(sanitizeImagePosition(imagePositionX));
  const [positionY, setPositionY] = useState<number>(sanitizeImagePosition(imagePositionY));
  const [busy, setBusy] = useState(false);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const cleanUrl = sanitizeImageUrl(url);
  const hasInvalidInput = url.trim().length > 0 && !cleanUrl;
  const directWarning = cleanUrl && !looksLikeDirectImageUrl(cleanUrl);

  useEffect(() => {
    setUrl(imageUrl ?? "");
    setZoom(sanitizeImageZoom(imageZoom));
    setPositionX(sanitizeImagePosition(imagePositionX));
    setPositionY(sanitizeImagePosition(imagePositionY));
  }, [imageUrl, imageZoom, imagePositionX, imagePositionY, kind, targetName]);

  async function save(nextUrl: string) {
    const clean = sanitizeImageUrl(nextUrl);
    if (nextUrl.trim() && !clean) return;
    setBusy(true);
    try {
      await onSave(clean, zoom, positionX, positionY);
    } finally {
      setBusy(false);
    }
  }

  function resetView() {
    setZoom(DEFAULT_IMAGE_ZOOM);
    setPositionX(DEFAULT_IMAGE_POSITION);
    setPositionY(DEFAULT_IMAGE_POSITION);
  }

  function handleZoomChange(nextZoom: number) {
    const cleanZoom = sanitizeImageZoom(nextZoom);
    // Position bleibt absichtlich erhalten. Durch den dynamischen transform-origin bleibt
    // z. B. „ganz oben“ auch nach dem Reinzoomen wirklich oben.
    setZoom(cleanZoom);
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!canEdit || !cleanUrl) return;
    event.preventDefault();
    const box = previewRef.current;
    if (!box) return;
    dragState.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: positionX,
      originY: positionY,
    };
    box.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const box = previewRef.current;
    const drag = dragState.current;
    if (!box || !drag || drag.pointerId !== event.pointerId) return;
    const rect = box.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const factor = Math.max(0.35, zoom);
    const nextX = drag.originX - ((event.clientX - drag.startX) / rect.width) * (100 / factor);
    const nextY = drag.originY - ((event.clientY - drag.startY) / rect.height) * (100 / factor);
    setPositionX(sanitizeImagePosition(nextX));
    setPositionY(sanitizeImagePosition(nextY));
  }

  function clearPointer(event?: React.PointerEvent<HTMLDivElement>) {
    const box = previewRef.current;
    if (box && dragState.current && event && box.hasPointerCapture(event.pointerId)) {
      box.releasePointerCapture(event.pointerId);
    }
    dragState.current = null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className={`w-full max-w-4xl rounded-3xl border p-6 shadow-2xl ${panelClass}`}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-black"><ImageIcon className="h-5 w-5" /> Bild für {kind === "bag" ? "Tasche" : "Item"}</h2>
            <p className={`mt-1 text-sm ${mutedText}`}>{targetName}</p>
          </div>
          <button className={secondaryButton} onClick={onClose} disabled={busy} title="Schließen"><X className="h-4 w-4" /></button>
        </div>

        <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
          <div className="space-y-3">
            <div
              ref={previewRef}
              className={`relative flex aspect-square w-full select-none items-center justify-center overflow-hidden rounded-2xl border ${isDark ? "border-[#8d713e]/50 bg-[#1a130d]" : "border-[#9b7339]/35 bg-[#fff8df]"} ${cleanUrl && canEdit ? "cursor-grab touch-none active:cursor-grabbing" : ""}`}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={clearPointer}
              onPointerCancel={clearPointer}
            >
              {cleanUrl ? (
                <img src={cleanUrl} alt="Vorschau" draggable={false} className="h-full w-full select-none" style={thumbnailImageStyle(cleanUrl, zoom, positionX, positionY)} referrerPolicy="no-referrer" />
              ) : (
                <div className={`flex flex-col items-center gap-2 text-sm font-bold ${mutedText}`}>
                  <ImageIcon className="h-8 w-8" />
                  Keine Bild-URL
                </div>
              )}
              {cleanUrl && canEdit && <div className="pointer-events-none absolute inset-x-2 bottom-2 rounded-lg bg-black/60 px-2 py-1 text-[11px] font-semibold text-white/90">Zum Ausrichten im Vorschaubild ziehen · Zoom per Regler</div>}
            </div>
            {cleanUrl && (
              <div className={`rounded-2xl border border-current/10 p-3 text-xs ${mutedText}`}>
                Das fertige Thumbnail benutzt genau diesen Ausschnitt. Beim späteren Großbild bleibt das Original natürlich unverändert.
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className={`rounded-2xl border border-current/10 p-3 text-sm ${mutedText}`}>
              Lade dein Bild bei einem externen Bildhost hoch, kopiere den direkten Bildlink und füge ihn hier ein. Gespeichert wird nur die URL, keine Datei in Firebase.
            </div>
            <a
              className={`${secondaryButton} w-full px-4 py-2`}
              href="https://postimages.org/"
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink className="h-4 w-4" /> Bild bei Postimages hochladen
            </a>
            <label className="block space-y-1 text-xs">
              <span className={`block px-1 ${mutedText}`}>Direkte Bild-URL</span>
              <input
                className={`w-full rounded-xl border px-3 py-2 text-sm ${inputClass}`}
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                disabled={!canEdit || busy}
                placeholder="https://i.postimg.cc/.../bild.webp"
              />
            </label>
            {hasInvalidInput && <div className="rounded-xl border border-red-500/40 bg-red-950/30 px-3 py-2 text-xs font-bold text-red-100">Bitte eine gültige https:// Bild-URL einfügen.</div>}
            {directWarning && <div className={`rounded-xl border border-yellow-500/35 px-3 py-2 text-xs font-semibold ${isDark ? "bg-yellow-950/25 text-yellow-100" : "bg-yellow-100/70 text-yellow-950"}`}>Der Link sieht nicht wie ein direkter Bildlink aus. Er kann funktionieren, aber zuverlässiger sind Links, die auf .jpg, .png, .webp, .gif oder .avif enden.</div>}
            {!canEdit && <div className={`rounded-xl border border-current/10 px-3 py-2 text-xs font-semibold ${mutedText}`}>Du kannst dieses Bild ansehen, aber nicht ändern.</div>}

            <div className={`rounded-2xl border border-current/10 p-4 ${cleanUrl ? "" : "opacity-60"}`}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-black">Thumbnail-Ausschnitt</div>
                  <div className={`text-xs ${mutedText}`}>Hier legst du Zoom und Bildposition für das kleine Vorschaubild fest.</div>
                </div>
                <button type="button" className={`${secondaryButton} px-3 py-2`} onClick={resetView} disabled={!canEdit || busy || !cleanUrl}><RotateCcw className="h-4 w-4" /> Zurücksetzen</button>
              </div>
              <div className="space-y-3">
                <label className="block space-y-1 text-xs">
                  <span className={`block px-1 ${mutedText}`}>Zoom · {formatNumber(zoom)}×</span>
                  <input type="range" min={1} max={3} step={0.05} value={zoom} onChange={(event) => handleZoomChange(Number(event.target.value))} disabled={!canEdit || busy || !cleanUrl} className="themed-range w-full" />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block space-y-1 text-xs">
                    <span className={`block px-1 ${mutedText}`}>Horizontal · {Math.round(positionX)}%</span>
                    <input type="range" min={0} max={100} step={1} value={positionX} onChange={(event) => setPositionX(sanitizeImagePosition(Number(event.target.value)))} disabled={!canEdit || busy || !cleanUrl} className="themed-range w-full" />
                  </label>
                  <label className="block space-y-1 text-xs">
                    <span className={`block px-1 ${mutedText}`}>Vertikal · {Math.round(positionY)}%</span>
                    <input type="range" min={0} max={100} step={1} value={positionY} onChange={(event) => setPositionY(sanitizeImagePosition(Number(event.target.value)))} disabled={!canEdit || busy || !cleanUrl} className="themed-range w-full" />
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button className={secondaryButton} onClick={onClose} disabled={busy}><X className="h-4 w-4" /> Abbrechen</button>
          {canEdit && cleanUrl && <button className={`${dangerButton} px-4 py-2`} onClick={() => save("")} disabled={busy}><Trash2 className="h-4 w-4" /> Entfernen</button>}
          {canEdit && <button className={`${primaryButton} px-4 py-2`} onClick={() => save(url)} disabled={busy || hasInvalidInput}><Save className="h-4 w-4" /> Speichern</button>}
        </div>
      </div>
    </div>
  );
}

function Field({ label, mutedText, className = "", children }: { label: string; mutedText: string; className?: string; children: React.ReactNode }) {
  return <label className={`space-y-1 text-xs ${className}`}><span className={`block px-1 ${mutedText}`}>{label}</span>{children}</label>;
}

function MiniStat({ label, value, tone = "neutral", sub }: { label: string; value: string; tone?: LoadTone; sub?: string }) {
  return (
    <div className={`flex min-h-[74px] flex-col rounded-xl border px-2 py-2 ${loadToneClass(tone)}`}>
      <div className="text-xs opacity-70">{label}</div>
      <div className="mt-1 truncate font-black">{value}</div>
      <div className="mt-auto h-4 truncate text-[10px] font-semibold opacity-80">{sub ?? ""}</div>
    </div>
  );
}

function renderInlineFormatting(text: string) {
  const nodes: React.ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const token = match[0];
    if (token.startsWith("**")) {
      nodes.push(<strong key={`b-${index++}`} className="font-black">{token.slice(2, -2)}</strong>);
    } else {
      nodes.push(<em key={`i-${index++}`} className="italic">{token.slice(1, -1)}</em>);
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function MiniMarkdown({ text }: { text: string }) {
  const lines = text.split(/\r?\n/);
  return (
    <div className="space-y-1 whitespace-pre-wrap break-words leading-relaxed">
      {lines.map((line, index) => (
        <p key={index}>{line.trim() ? renderInlineFormatting(line) : "\u00a0"}</p>
      ))}
    </div>
  );
}

function InlineItemValueStat({ label, single, stack, unit = "" }: { label: string; single: number; stack: number; unit?: string }) {
  const suffix = unit ? ` ${unit}` : "";
  const singleText = `${formatNumber(single)}${suffix}`;
  const stackText = `${formatNumber(stack)}${suffix}`;
  const minWidth = label === "Wert"
    ? Math.min(360, Math.max(170, Math.max(singleText.length + 3, stackText.length + 8) * 8 + 42))
    : Math.min(280, Math.max(150, Math.max(singleText.length + 3, stackText.length + 8) * 7 + 34));
  return (
    <div className="h-12 shrink-0 rounded-lg border border-current/10 bg-current/5 px-2 py-1 text-[11px]" style={{ minWidth }}>
      <div className="whitespace-nowrap font-black leading-4 opacity-75">{label}</div>
      <div className="mt-0.5 grid grid-cols-[max-content_max-content] gap-2 leading-4">
        <div className="whitespace-nowrap"><span className="opacity-60">1x </span><span className="font-black tabular-nums">{singleText}</span></div>
        <div className="whitespace-nowrap border-l border-current/10 pl-2"><span className="opacity-60">Stack </span><span className="font-black tabular-nums">{stackText}</span></div>
      </div>
    </div>
  );
}

function InlineLocalTradeValueStat({ baseSingle, baseStack, rates }: { baseSingle: number; baseStack: number; rates: TradeRates }) {
  const singleText = `${formatNumber(tradeAdjustedValue(baseSingle, rates.sellMultiplier))} gp`;
  const stackText = `${formatNumber(tradeAdjustedValue(baseStack, rates.sellMultiplier))} gp`;
  const minWidth = Math.min(360, Math.max(170, Math.max(singleText.length + 3, stackText.length + 8) * 8 + 42));
  return (
    <div className="h-12 shrink-0 rounded-lg border border-current/10 bg-current/5 px-2 py-1 text-[11px]" style={{ minWidth }}>
      <div className="whitespace-nowrap font-black leading-4 opacity-75">Lokaler Wert</div>
      <div className="mt-0.5 grid grid-cols-[max-content_max-content] gap-2 leading-4">
        <div className="whitespace-nowrap"><span className="opacity-60">1x </span><span className="font-black tabular-nums">{singleText}</span></div>
        <div className="whitespace-nowrap border-l border-current/10 pl-2"><span className="opacity-60">Stack </span><span className="font-black tabular-nums">{stackText}</span></div>
      </div>
    </div>
  );
}

function ItemValueStat({ label, single, stack, unit = "" }: { label: string; single: number; stack: number; unit?: string }) {
  const suffix = unit ? ` ${unit}` : "";
  return (
    <div className="min-w-0 rounded-lg border border-current/10 bg-current/5 px-2 py-1">
      <div className="truncate font-black opacity-75">{label}</div>
      <div className="mt-0.5 grid grid-cols-2 gap-1">
        <div className="min-w-0">
          <div className="truncate opacity-60">1x</div>
          <div className="truncate font-black">{formatNumber(single)}{suffix}</div>
        </div>
        <div className="min-w-0 border-l border-current/10 pl-2">
          <div className="truncate opacity-60">Stack</div>
          <div className="truncate font-black">{formatNumber(stack)}{suffix}</div>
        </div>
      </div>
    </div>
  );
}

function BigStat({ icon, label, value, tone = "neutral", footer }: { icon: React.ReactNode; label: string; value: string; tone?: LoadTone; footer?: string }) {
  return (
    <div className={`flex min-h-[112px] flex-col rounded-2xl border p-4 ${loadToneClass(tone)}`}>
      <div className="mb-2 flex items-center gap-2 text-sm opacity-75">{icon}{label}</div>
      <div className="whitespace-nowrap text-xl font-black">{value}</div>
      <div className="mt-auto h-8 text-xs font-bold leading-4 opacity-85">
        {footer ? <span className="block max-w-full break-words">{footer}</span> : null}
      </div>
    </div>
  );
}

function BagEditor({
  bag,
  members,
  mutedText,
  inputClass,
  primaryButton,
  secondaryButton,
  isDm,
  onSave,
  onCancel,
}: {
  bag: Bag;
  members: CampaignMember[];
  mutedText: string;
  inputClass: string;
  primaryButton: string;
  secondaryButton: string;
  isDm: boolean;
  onSave: (patch: Partial<Bag>) => void;
  onCancel: () => void;
}) {
  const access = getBagAccess(bag);
  const [name, setName] = useState(bag.name);
  const [description, setDescription] = useState(typeof bag.description === "string" ? bag.description : "");
  const [kind, setKind] = useState<BagKind>(getBagKind(bag));
  const [maxWeight, setMaxWeight] = useState(bag.maxWeight?.toString() ?? "");
  const [maxVolume, setMaxVolume] = useState(bag.maxVolume?.toString() ?? "");

  const [targetMode, setTargetMode] = useState<AccessMode>(access.targetMode);
  const [targetUserIds, setTargetUserIds] = useState<string[]>(access.targetUserIds);
  const [depositMode, setDepositMode] = useState<AccessMode>(access.depositMode);
  const [depositUserIds, setDepositUserIds] = useState<string[]>(access.depositUserIds);
  const [readMode, setReadMode] = useState<AccessMode>(access.readMode);
  const [readUserIds, setReadUserIds] = useState<string[]>(access.readUserIds);
  const [writeMode, setWriteMode] = useState<AccessMode>(access.writeMode);
  const [writeUserIds, setWriteUserIds] = useState<string[]>(access.writeUserIds);

  function toggleUser(list: string[], uid: string) {
    return list.includes(uid) ? list.filter((entry) => entry !== uid) : [...list, uid];
  }

  const playerMembers = members.filter((entry) => entry.role === "player");

  return (
    <div className="space-y-3">
      <div className="space-y-3">
        <Field label="Taschenname" mutedText={mutedText}>
          <input className={`w-full rounded-xl border px-3 py-2 text-sm ${inputClass}`} value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Ariralis Rucksack, Gruppenwagen, DM-Reserve" />
        </Field>

        <Field label="Beschreibung" mutedText={mutedText}>
          <textarea
            className={`w-full rounded-xl border px-3 py-2 text-sm leading-relaxed ${inputClass}`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Kurze Beschreibung, Hinweise, Besitzer, Inhaltsschwerpunkt ..."
          />
        </Field>

        <div className="grid gap-2 md:grid-cols-3 md:items-start">
          <label className="flex min-h-[86px] flex-col justify-between text-xs">
            <span className={`block px-1 ${mutedText}`}>Inventarart</span>
            <select className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm ${inputClass}`} value={kind} onChange={(e) => setKind(e.target.value as BagKind)}>
              <option value="inventory">Inventar</option>
              <option value="container">Behälter</option>
            </select>
            <span className={`mt-1 block min-h-[16px] px-1 text-[10px] ${mutedText}`}>{kind === "container" ? "harte Kapazität" : "Variant Encumbrance"}</span>
          </label>

          <label className="flex min-h-[86px] flex-col justify-between text-xs">
            <span className={`block px-1 ${mutedText}`}>Max Gewicht</span>
            <input className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm ${inputClass}`} value={maxWeight} onChange={(e) => setMaxWeight(e.target.value)} placeholder="leer = unbegrenzt" type="number" step="0.01" />
            <span className={`mt-1 block min-h-[16px] px-1 text-[10px] ${mutedText}`}>{kind === "container" ? "harte Grenze" : "Encumbered ab"}</span>
          </label>

          <label className="flex min-h-[86px] flex-col justify-between text-xs">
            <span className={`block px-1 ${mutedText}`}>Max Volumen</span>
            <input className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm ${inputClass}`} value={maxVolume} onChange={(e) => setMaxVolume(e.target.value)} placeholder="leer = unbegrenzt" type="number" step="0.01" />
            <span className={`mt-1 block min-h-[16px] px-1 text-[10px] ${mutedText}`}>{kind === "container" ? "harte Grenze" : "nur Anzeige"}</span>
          </label>
        </div>
      </div>

      <div className={`rounded-2xl border border-current/10 p-3 text-xs ${mutedText}`}>
        {isDm
          ? "Der DM hat immer Vollzugriff. Inventare nutzen Variant Encumbrance; Behälter haben harte Kapazitätsgrenzen. „Als Ziel sichtbar“ steuert, ob die Tasche links und in Zielauswahlen auftaucht."
          : "Du kannst diese Tasche bearbeiten, aber die Zugriffsrechte sind nur für den DM änderbar."}
      </div>

      {isDm && (
      <div className="grid gap-3 xl:grid-cols-2">
        <AccessControl
          title="Als Ziel sichtbar für"
          description="Wer diese Tasche links sieht und sie als mögliches Ziel kennt."
          mode={targetMode}
          userIds={targetUserIds}
          members={playerMembers}
          inputClass={inputClass}
          mutedText={mutedText}
          onModeChange={setTargetMode}
          onToggleUser={(uid) => setTargetUserIds((prev) => toggleUser(prev, uid))}
        />
        <AccessControl
          title="Items hineinlegen dürfen"
          description="Wer Items in diese Tasche verschieben darf, ohne sie öffnen zu müssen."
          mode={depositMode}
          userIds={depositUserIds}
          members={playerMembers}
          inputClass={inputClass}
          mutedText={mutedText}
          onModeChange={setDepositMode}
          onToggleUser={(uid) => setDepositUserIds((prev) => toggleUser(prev, uid))}
        />
        <AccessControl
          title="Tasche öffnen dürfen"
          description="Wer den Inhalt dieser Tasche sehen darf."
          mode={readMode}
          userIds={readUserIds}
          members={playerMembers}
          inputClass={inputClass}
          mutedText={mutedText}
          onModeChange={setReadMode}
          onToggleUser={(uid) => setReadUserIds((prev) => toggleUser(prev, uid))}
        />
        <AccessControl
          title="Tasche bearbeiten dürfen"
          description="Wer Items ändern, entnehmen, löschen und die Tasche verwalten darf."
          mode={writeMode}
          userIds={writeUserIds}
          members={playerMembers}
          inputClass={inputClass}
          mutedText={mutedText}
          onModeChange={setWriteMode}
          onToggleUser={(uid) => setWriteUserIds((prev) => toggleUser(prev, uid))}
        />
      </div>
      )}

      <div className="flex gap-2">
        <button
          className={`${primaryButton} flex-1 px-2 py-1`}
          onClick={() =>
            onSave({
              name: name.trim() || bag.name,
              description: description.trim(),
              kind,
              maxWeight: numberOrNull(maxWeight),
              maxVolume: numberOrNull(maxVolume),
              ...(isDm
                ? {
                    access: {
                      targetMode,
                      targetUserIds,
                      depositMode,
                      depositUserIds,
                      readMode,
                      readUserIds,
                      writeMode,
                      writeUserIds,
                    },
                  }
                : {}),
            })
          }
        >
          <Save className="h-4 w-4" /> Speichern
        </button>
        <button className={`${secondaryButton} flex-1 px-2 py-1`} onClick={onCancel}>
          <X className="h-4 w-4" /> Abbrechen
        </button>
      </div>
    </div>
  );
}

function AccessControl({
  title,
  description,
  mode,
  userIds,
  members,
  inputClass,
  mutedText,
  onModeChange,
  onToggleUser,
}: {
  title: string;
  description: string;
  mode: AccessMode;
  userIds: string[];
  members: CampaignMember[];
  inputClass: string;
  mutedText: string;
  onModeChange: (mode: AccessMode) => void;
  onToggleUser: (uid: string) => void;
}) {
  return (
    <div className="flex min-h-[188px] flex-col rounded-2xl border border-current/10 bg-current/5 p-3">
      <div className="mb-2">
        <div className="font-black">{title}</div>
        <div className={`text-xs ${mutedText}`}>{description}</div>
      </div>
      <div className="mt-auto">
        <select className={`mb-2 w-full rounded-xl border px-3 py-2 text-sm ${inputClass}`} value={mode} onChange={(e) => onModeChange(e.target.value as AccessMode)}>
          <option value="all">Alle</option>
          <option value="dm">Nur DM</option>
          <option value="custom">Ausgewählte Spieler</option>
        </select>
      </div>
      {mode === "custom" && (
        <div className="space-y-1">
          {members.length === 0 ? (
            <div className={`rounded-xl border border-current/10 px-3 py-2 text-xs ${mutedText}`}>Noch keine Spieler in der Kampagne.</div>
          ) : (
            members.map((entry) => (
              <label key={entry.uid} className="flex cursor-pointer items-center justify-between gap-2 rounded-xl border border-current/10 px-3 py-2 text-xs hover:bg-current/5">
                <span className="truncate">{entry.displayName}</span>
                <input type="checkbox" checked={userIds.includes(entry.uid)} onChange={() => onToggleUser(entry.uid)} />
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}


function CurrencyPanel({
  bag,
  targetBags,
  canEdit,
  inputClass,
  primaryButton,
  secondaryButton,
  mutedText,
  isDark,
  undoAvailable,
  onDelta,
  onUndo,
  onConvert,
  onTransfer,
}: {
  bag: Bag;
  targetBags: Bag[];
  canEdit: boolean;
  inputClass: string;
  primaryButton: string;
  secondaryButton: string;
  mutedText: string;
  isDark: boolean;
  undoAvailable: boolean;
  onDelta: (key: CurrencyKey, delta: number) => void;
  onUndo: () => void;
  onConvert: (source: CurrencyKey | "all", target: CurrencyKey, amount: string, all: boolean) => void;
  onTransfer: (targetBagId: string, key: CurrencyKey, amount: string) => void;
}) {
  const currency = bagCurrency(bag);
  const [coinInputs, setCoinInputs] = useState<Record<CurrencyKey, string>>({ pp: "", gp: "", ep: "", sp: "", cp: "" });
  const [convertSource, setConvertSource] = useState<CurrencyKey | "all">("all");
  const [convertTarget, setConvertTarget] = useState<CurrencyKey>("gp");
  const [convertAmount, setConvertAmount] = useState("");
  const [transferKey, setTransferKey] = useState<CurrencyKey>("gp");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferTargetBagId, setTransferTargetBagId] = useState("");

  useEffect(() => {
    if (!transferTargetBagId && targetBags[0]) setTransferTargetBagId(targetBags[0].id);
    if (transferTargetBagId && !targetBags.some((entry) => entry.id === transferTargetBagId)) setTransferTargetBagId(targetBags[0]?.id ?? "");
  }, [targetBags, transferTargetBagId]);

  const panelInner = isDark ? "border-[#8d713e]/35 bg-[#1d150e]/72" : "border-[#9b7339]/25 bg-[#fff8df]/75";
  const chipClass = isDark ? "border-[#8d713e]/50 bg-[#1a130d]" : "border-[#9b7339]/35 bg-[#fff8df]";

  return (
    <div className={`mt-4 rounded-2xl border p-3 ${panelInner}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-base font-black"><Coins className="h-5 w-5" /> Münzen</h3>
          <p className={`text-xs ${mutedText}`}>Gesamtwert: {formatNumber(currencyToGoldValue(currency))} gp · Gewicht: {formatNumber(currencyWeight(currency))} lb · {currencyText(currency)}</p>
        </div>
        <button className={`${secondaryButton} px-3 py-1.5 text-xs`} disabled={!canEdit || !undoAvailable} onClick={onUndo} title="Letzte Münzänderung zurücksetzen"><History className="h-4 w-4" /> Rückgängig</button>
      </div>

      <div className="grid gap-2 xl:grid-cols-5">
        {currencyKeys.map((key) => {
          const amount = normalizeCoinInput(coinInputs[key]);
          const canMinus = canEdit && amount > 0 && canSubtractCurrency(currency, key, amount);
          return (
            <div key={key} className={`rounded-2xl border p-2 ${chipClass}`}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={`flex h-8 w-8 items-center justify-center rounded-full border text-sm font-black ${chipClass}`}>{currencyDefs[key].icon}</span>
                  <div>
                    <div className="text-sm font-black">{currency[key]}</div>
                    <div className={`text-[10px] font-bold uppercase ${mutedText}`}>{currencyDefs[key].label}</div>
                  </div>
                </div>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${chipClass}`}>{currencyDefs[key].short}</span>
              </div>
              <div className="grid grid-cols-[30px_minmax(0,1fr)_30px] gap-1">
                <button className={`${secondaryButton} px-0 py-1.5`} disabled={!canMinus} onClick={() => { onDelta(key, -amount); setCoinInputs((p) => ({ ...p, [key]: "" })); }}>−</button>
                <input className={`min-w-0 rounded-xl border px-2 py-1.5 text-center text-sm font-black ${inputClass}`} disabled={!canEdit} inputMode="numeric" pattern="[0-9]*" placeholder="0" value={coinInputs[key]} onChange={(event) => setCoinInputs((p) => ({ ...p, [key]: event.target.value.replace(/\D/g, "") }))} />
                <button className={`${primaryButton} px-0 py-1.5`} disabled={!canEdit || amount <= 0} onClick={() => { onDelta(key, amount); setCoinInputs((p) => ({ ...p, [key]: "" })); }}>+</button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 grid gap-2 xl:grid-cols-[1fr_1fr]">
        <div className={`rounded-2xl border p-3 ${chipClass}`}>
          <div className="mb-2 text-sm font-black">Münzen umwandeln</div>
          <div className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto_auto] md:items-end">
            <label className="space-y-1 text-xs"><span className={mutedText}>Von</span><select className={`w-full rounded-xl border px-2 py-2 text-sm ${inputClass}`} disabled={!canEdit} value={convertSource} onChange={(e) => setConvertSource(e.target.value as CurrencyKey | "all")}><option value="all">Alle Münzen</option>{currencyKeys.map((key) => <option key={key} value={key}>{currencyDefs[key].label}</option>)}</select></label>
            <label className="space-y-1 text-xs"><span className={mutedText}>Nach</span><select className={`w-full rounded-xl border px-2 py-2 text-sm ${inputClass}`} disabled={!canEdit} value={convertTarget} onChange={(e) => setConvertTarget(e.target.value as CurrencyKey)}>{currencyKeys.map((key) => <option key={key} value={key}>{currencyDefs[key].label}</option>)}</select></label>
            <label className="space-y-1 text-xs"><span className={mutedText}>Zielmenge</span><input className={`w-full rounded-xl border px-2 py-2 text-sm ${inputClass}`} disabled={!canEdit} inputMode="numeric" pattern="[0-9]*" placeholder="z. B. 117" value={convertAmount} onChange={(e) => setConvertAmount(e.target.value.replace(/\D/g, ""))} /></label>
            <button className={`${secondaryButton} px-3 py-2`} disabled={!canEdit || normalizeCoinInput(convertAmount) <= 0} onClick={() => { onConvert(convertSource, convertTarget, convertAmount, false); setConvertAmount(""); }}>Wechseln</button>
            <button className={`${primaryButton} px-3 py-2`} disabled={!canEdit} onClick={() => { onConvert(convertSource, convertTarget, convertAmount, true); setConvertAmount(""); }}>ALL</button>
          </div>
          <div className={`mt-2 text-[11px] ${mutedText}`}>Kurs: 1 PP = 10 GP = 20 EP = 100 SP = 1000 CP. Hinweis: Beim Umwandeln bleibt der Gesamtwert gleich, nur die Münzarten ändern sich.</div>
        </div>

        <div className={`rounded-2xl border p-3 ${chipClass}`}>
          <div className="mb-2 text-sm font-black">Münzen übertragen</div>
          <div className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
            <label className="space-y-1 text-xs"><span className={mutedText}>Währung</span><select className={`w-full rounded-xl border px-2 py-2 text-sm ${inputClass}`} disabled={!canEdit} value={transferKey} onChange={(e) => setTransferKey(e.target.value as CurrencyKey)}>{currencyKeys.map((key) => <option key={key} value={key}>{currencyDefs[key].label}</option>)}</select></label>
            <label className="space-y-1 text-xs"><span className={mutedText}>Menge</span><input className={`w-full rounded-xl border px-2 py-2 text-sm ${inputClass}`} disabled={!canEdit} inputMode="numeric" pattern="[0-9]*" placeholder="0" value={transferAmount} onChange={(e) => setTransferAmount(e.target.value.replace(/\D/g, ""))} /></label>
            <label className="space-y-1 text-xs"><span className={mutedText}>Ziel</span><select className={`w-full rounded-xl border px-2 py-2 text-sm ${inputClass}`} disabled={!canEdit || targetBags.length === 0} value={transferTargetBagId} onChange={(e) => setTransferTargetBagId(e.target.value)}>{targetBags.length === 0 ? <option value="">Kein Ziel</option> : targetBags.map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}</select></label>
            <button className={`${primaryButton} px-3 py-2`} disabled={!canEdit || !transferTargetBagId || normalizeCoinInput(transferAmount) <= 0 || currency[transferKey] < normalizeCoinInput(transferAmount)} onClick={() => { onTransfer(transferTargetBagId, transferKey, transferAmount); setTransferAmount(""); }}>Übertragen</button>
          </div>
        </div>
      </div>
    </div>
  );
}


function InlineDescriptionEditor({
  item,
  writable,
  inputClass,
  primaryButton,
  secondaryButton,
  mutedText,
  onSave,
}: {
  item: InventoryItem;
  writable: boolean;
  inputClass: string;
  primaryButton: string;
  secondaryButton: string;
  mutedText: string;
  onSave: (patch: Partial<InventoryItem>) => void;
}) {
  const [description, setDescription] = useState(item.description);
  const [notes, setNotes] = useState(item.notes);

  useEffect(() => {
    setDescription(item.description);
    setNotes(item.notes);
  }, [item.id, item.description, item.notes]);

  const dirty = description !== item.description || notes !== item.notes;
  const descriptionRows = Math.max(3, Math.min(12, description.split(/\r?\n/).length + 2));
  const notesRows = Math.max(2, Math.min(8, notes.split(/\r?\n/).length + 1));

  if (!writable) {
    return (
      <div className={`min-w-0 flex-1 rounded-xl border border-current/10 bg-current/5 px-3 py-2 text-sm ${mutedText}`}>
        <MiniMarkdown text={item.description || "Keine Beschreibung."} />
        {item.notes && (
          <div className="mt-2 border-t border-current/10 pt-2">
            <div className="mb-1 text-xs font-black uppercase tracking-wide opacity-70">Notizen</div>
            <MiniMarkdown text={item.notes} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-w-0 flex-1 rounded-xl border border-current/10 bg-current/5 p-3 text-sm">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-black uppercase tracking-wide opacity-70">Beschreibung direkt bearbeiten</div>
        <div className={`text-xs ${mutedText}`}>Markdown: **fett**, *kursiv*, Zeilenumbrüche</div>
      </div>

      <label className="block space-y-1 text-xs">
        <span className={`block px-1 ${mutedText}`}>Beschreibung</span>
        <textarea
          className={`w-full rounded-xl border px-3 py-2 text-sm leading-relaxed ${inputClass}`}
          rows={descriptionRows}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Beschreibung mit Zeilenumbrüchen und **fett** / *kursiv*"
        />
      </label>

      <label className="mt-2 block space-y-1 text-xs">
        <span className={`block px-1 ${mutedText}`}>Notizen</span>
        <textarea
          className={`w-full rounded-xl border px-3 py-2 text-sm leading-relaxed ${inputClass}`}
          rows={notesRows}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Optionale Notizen"
        />
      </label>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className={`${primaryButton} px-3 py-1.5`}
          disabled={!dirty}
          onClick={() => onSave({ description: description.trim(), notes: notes.trim() })}
        >
          <Save className="h-4 w-4" /> Beschreibung speichern
        </button>
        <button
          className={`${secondaryButton} px-3 py-1.5`}
          disabled={!dirty}
          onClick={() => {
            setDescription(typeof item.description === "string" ? item.description : "");
            setNotes(typeof item.notes === "string" ? item.notes : "");
          }}
        >
          <X className="h-4 w-4" /> Zurücksetzen
        </button>
      </div>
    </div>
  );
}

function ItemEditor({ item, bags, inputClass, primaryButton, secondaryButton, canDepositBagForOption, onSave, onCancel }: { item: InventoryItem; bags: Bag[]; inputClass: string; primaryButton: string; secondaryButton: string; canDepositBagForOption: (bag: Bag) => boolean; onSave: (patch: Partial<InventoryItem>) => void; onCancel: () => void }) {
  const [name, setName] = useState(item.name ?? "");
  const [quantity, setQuantity] = useState(String(normalizeItemQuantity(item.quantity, 1)));
  const [weight, setWeight] = useState(item.weightPerUnit?.toString() ?? "");
  const [volume, setVolume] = useState(item.volumePerUnit?.toString() ?? "");
  const [value, setValue] = useState(item.valuePerUnit?.toString() ?? "");
  const [description, setDescription] = useState(typeof item.description === "string" ? item.description : "");
  const [notes, setNotes] = useState(typeof item.notes === "string" ? item.notes : "");
  const [category, setCategory] = useState<ItemCategory>(normalizeItemCategory(item.category));
  const [bagId, setBagId] = useState(item.bagId);
  const descriptionRows = Math.max(5, Math.min(16, description.split(/\r?\n/).length + 3));
  const notesRows = Math.max(3, Math.min(10, notes.split(/\r?\n/).length + 2));

  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-black uppercase tracking-wide opacity-80">Item bearbeiten</h4>
        <div className="text-xs opacity-65">Beschreibung unterstützt **fett**, *kursiv* und Zeilenumbrüche.</div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <label className="space-y-1 text-xs"><span className="block px-1 opacity-75">Name</span><input className={`w-full rounded-xl border px-3 py-2 text-sm ${inputClass}`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Itemname" /></label>
        <label className="space-y-1 text-xs"><span className="block px-1 opacity-75">Menge</span><input className={`w-full rounded-xl border px-3 py-2 text-sm ${inputClass}`} value={quantity} onChange={(e) => setQuantity(e.target.value)} type="number" min="0" placeholder="0" /></label>
        <label className="space-y-1 text-xs"><span className="block px-1 opacity-75">Tasche</span><select className={`w-full rounded-xl border px-3 py-2 text-sm ${inputClass}`} value={bagId} onChange={(e) => setBagId(e.target.value)}>{bags.map((bag) => <option key={bag.id} value={bag.id} disabled={!canDepositBagForOption(bag)}>{bag.name}{canDepositBagForOption(bag) ? "" : " (kein Hineinlegen)"}</option>)}</select></label>
        <label className="space-y-1 text-xs"><span className="block px-1 opacity-75">Kategorie</span><select className={`w-full rounded-xl border px-3 py-2 text-sm ${inputClass}`} value={category} onChange={(e) => setCategory(e.target.value as ItemCategory)}>{categorySelectOptions()}</select></label>
        <label className="space-y-1 text-xs"><span className="block px-1 opacity-75">Gewicht pro Stück</span><input className={`w-full rounded-xl border px-3 py-2 text-sm ${inputClass}`} value={weight} onChange={(e) => setWeight(e.target.value)} type="number" step="0.01" placeholder="0.5" /></label>
        <label className="space-y-1 text-xs"><span className="block px-1 opacity-75">Volumen pro Stück</span><input className={`w-full rounded-xl border px-3 py-2 text-sm ${inputClass}`} value={volume} onChange={(e) => setVolume(e.target.value)} type="number" step="0.01" placeholder="0.2" /></label>
        <label className="space-y-1 text-xs"><span className="block px-1 opacity-75">Wert pro Stück (gp)</span><input className={`w-full rounded-xl border px-3 py-2 text-sm ${inputClass}`} value={value} onChange={(e) => setValue(e.target.value)} type="number" step="0.01" placeholder="50" /></label>

        <label className="space-y-1 text-xs md:col-span-2 xl:col-span-3">
          <span className="block px-1 opacity-75">Beschreibung</span>
          <textarea
            className={`w-full rounded-xl border px-3 py-2 text-sm leading-relaxed ${inputClass}`}
            rows={descriptionRows}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Beschreibung mit Zeilenumbrüchen und **fett** / *kursiv*"
          />
        </label>

        <label className="space-y-1 text-xs md:col-span-2 xl:col-span-3">
          <span className="block px-1 opacity-75">Notizen</span>
          <textarea
            className={`w-full rounded-xl border px-3 py-2 text-sm leading-relaxed ${inputClass}`}
            rows={notesRows}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Zusätzliche Notizen"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button className={`${primaryButton} px-4 py-2`} onClick={() => onSave({ name: name.trim() || item.name, quantity: normalizeItemQuantity(quantity, 0), weightPerUnit: numberOrNull(weight), volumePerUnit: numberOrNull(volume), valuePerUnit: numberOrNull(value), description: description.trim(), notes: notes.trim(), category, bagId })}><Save className="h-4 w-4" /> Speichern</button>
        <button className={`${secondaryButton} px-4 py-2`} onClick={onCancel}><X className="h-4 w-4" /> Abbrechen</button>
      </div>
    </div>
  );
}
