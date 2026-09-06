import { useState } from 'react';

export function CampaignDeleteDialog({name, panelClass, inputClass, secondaryButton, onCancel, onConfirm}: {
  name:string; panelClass:string; inputClass:string; secondaryButton:string;
  onCancel:()=>void; onConfirm:(confirmedName:string)=>Promise<void>;
}) {
  const [typedName,setTypedName]=useState('');
  const [acknowledged,setAcknowledged]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  async function confirm() {
    if(busy || typedName!==name || !acknowledged)return;
    setBusy(true);setError(null);
    try {await onConfirm(typedName);} catch(err) {setError(err instanceof Error ? err.message : 'Löschen fehlgeschlagen.');}
    finally {setBusy(false);}
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
    <div role="dialog" aria-modal="true" aria-label="Kampagne endgültig löschen" className={`w-full max-w-lg rounded-3xl border p-6 shadow-2xl ${panelClass}`}>
      <h3 className="mb-2 text-xl font-black">Kampagne endgültig löschen?</h3>
      <p className="mb-4 text-sm">Damit löschst du <strong>{name}</strong> mit allen Inventaren, Items, Mitgliedern und dem Aktivitätslog für alle Spieler. Ausblenden wäre jederzeit rückgängig zu machen; diese Löschung nicht.</p>
      <label className="block space-y-2 text-sm">Kampagnenname zur Bestätigung eingeben
        <input autoFocus autoComplete="off" disabled={busy} className={`w-full rounded-xl border px-3 py-2 ${inputClass}`} value={typedName} onChange={e=>setTypedName(e.target.value)}/>
      </label>
      <label className="my-4 flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" disabled={busy} checked={acknowledged} onChange={e=>setAcknowledged(e.target.checked)}/>Ich möchte die Kampagne für alle Spieler unwiderruflich löschen.</label>
      {error && <p role="alert" className="mb-4 text-sm text-red-400">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <button className={secondaryButton} disabled={busy} onClick={onCancel}>Abbrechen</button>
        <button className="rounded-xl bg-red-800 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40" disabled={busy || typedName!==name || !acknowledged} onClick={confirm}>{busy?'Wird gelöscht …':'Endgültig löschen'}</button>
      </div>
    </div>
  </div>;
}
