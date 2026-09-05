import { useState } from 'react';
import { MAX_RESOURCES, resourceError, restLabels, type ItemResource } from './resources';

export function ResourceEditor({ resources, onChange, inputClass, buttonClass }: {
  resources: ItemResource[]; onChange: (resources: ItemResource[]) => void; inputClass: string; buttonClass: string;
}) {
  const field = `w-full min-w-0 rounded-xl border px-3 py-2 text-sm ${inputClass}`;
  const patch = (index: number, change: Partial<ItemResource>) => onChange(resources.map((r,i) => i===index ? {...r,...change} : r));
  const error = resourceError(resources);
  return <section className="space-y-3 rounded-2xl border border-current/20 p-3" aria-label="Ressourcen bearbeiten">
    <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-black">Ressourcen pro Exemplar</h4>
      <button type="button" className={buttonClass} disabled={resources.length>=MAX_RESOURCES} onClick={()=>onChange([...resources,{id:crypto.randomUUID(),name:'Anwendungen',current:1,maximum:1,reset:'none',recovery:'all'}])}>+ Ressource</button></div>
    {!resources.length && <p className="text-xs opacity-70">Optional: Ladungen, Anwendungen oder andere begrenzte Fähigkeiten.</p>}
    {resources.map((r,index)=><div key={r.id} className="space-y-2 rounded-xl border border-current/10 p-3">
      {r.needsSetup && <div className="rounded-lg bg-amber-500/20 p-2 text-sm"><p>Diese Vorgabe hängt von Würfeln oder der Auswahl des DMs ab. Bitte Werte und Namen festlegen.</p><button type="button" className={buttonClass} onClick={()=>patch(index,{needsSetup:false})}>Werte sind festgelegt</button></div>}
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        <label className="text-xs">Name<input aria-label={`Ressourcenname ${index+1}`} className={field} value={r.name} maxLength={100} onChange={e=>patch(index,{name:e.target.value})}/></label>
        <label className="text-xs">Aktuell<input aria-label={`Aktuelle Anwendungen ${index+1}`} className={field} type="number" min="0" max={r.maximum} value={r.current} onChange={e=>patch(index,{current:Number(e.target.value)})}/></label>
        <label className="text-xs">Maximum<input aria-label={`Maximale Anwendungen ${index+1}`} className={field} type="number" min="1" max="100000" value={r.maximum} onChange={e=>patch(index,{maximum:Number(e.target.value)})}/></label>
        <label className="text-xs">Regeneration<select aria-label={`Regeneration ${index+1}`} className={field} value={r.reset} onChange={e=>patch(index,{reset:e.target.value as ItemResource['reset']})}>{Object.entries(restLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
        <label className="text-xs">Menge zurück<input aria-label={`Regenerationsmenge ${index+1}`} className={field} disabled={r.reset==='none'} value={r.recovery} placeholder="all, 3 oder 1d6+1" onChange={e=>patch(index,{recovery:e.target.value})}/></label>
        <div className="flex items-end"><button type="button" className={buttonClass} onClick={()=>onChange(resources.filter((_,i)=>i!==index))}>Ressource entfernen</button></div>
      </div>
      <label className="block text-xs">Hinweis / Sonderregel<input className={field} value={r.note??''} maxLength={1500} placeholder="Optional, z. B. Sonderregel bei der letzten Ladung" onChange={e=>patch(index,{note:e.target.value})}/></label>
    </div>)}
    {!!resources.length && <p className="text-xs opacity-70">„all“ füllt vollständig auf. Long Rest schließt Short Rest ein. Diese Werte gelten für jedes Exemplar dieses Stapels. Verbrauch teilt ein Exemplar automatisch ab.</p>}
    {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
  </section>;
}

export function ResourceControls({resource,canEdit,onUse,inputClass,buttonClass}: {resource:ItemResource;canEdit:boolean;onUse:(amount:number)=>void;inputClass:string;buttonClass:string}) {
  const [amount,setAmount]=useState('1');const n=Number(amount);
  return <div className="rounded-xl border border-current/20 p-2 text-xs">
    <div className="flex flex-wrap items-center gap-2"><span className="font-bold">{resource.name}</span><strong className="tabular-nums">{resource.current}/{resource.maximum}</strong><span className="opacity-65">pro Exemplar · {restLabels[resource.reset]}{resource.reset!=='none'?` (${resource.recovery==='all'?'vollständig':resource.recovery})`:''}</span>
      <input aria-label={`${resource.name}: Anzahl verbrauchen`} className={`ml-auto w-16 rounded-lg border px-2 py-1 ${inputClass}`} type="number" min="1" max={resource.current} value={amount} disabled={!canEdit} onChange={e=>setAmount(e.target.value)}/>
      <button type="button" className={`${buttonClass} px-2 py-1`} disabled={!canEdit||!Number.isSafeInteger(n)||n<1||n>resource.current} onClick={()=>onUse(n)}>Verbrauchen</button></div>
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-current/10"><div className="h-full bg-amber-500" style={{width:`${Math.max(0,Math.min(100,100*resource.current/resource.maximum))}%`}}/></div>
    {resource.note && <p className="mt-1 opacity-75">{resource.note}</p>}
  </div>;
}
