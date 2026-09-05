import { useEffect, useRef, useState, type CSSProperties } from 'react';

// Limit original downloads to visible images. Successful CORS downloads become
// small local WebP previews; the original URL in campaign data is never changed.
const jobs: (() => Promise<void>)[] = [];
let running = 0;
function drain() { while (running < 4 && jobs.length) { running++; void jobs.shift()!().finally(() => { running--; drain(); }); } }
function queued<T>(task:()=>Promise<T>):Promise<T> { return new Promise((resolve,reject)=>{jobs.push(async()=>{try{resolve(await task());}catch(error){reject(error);}});drain();}); }
const shared = new Map<string, Promise<string>>();
const noCors = new Set<string>();
let database: Promise<IDBDatabase> | undefined;
function db():Promise<IDBDatabase> {
  return database ??= new Promise((resolve,reject)=>{
    const request=indexedDB.open('inventory-thumbnails-v1',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('images',{keyPath:'url'});
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
}
async function cached(url:string):Promise<Blob|null> {
  try {const database=await db();return await new Promise(resolve=>{const req=database.transaction('images').objectStore('images').get(url);req.onsuccess=()=>resolve(req.result && Date.now()-req.result.createdAt<7*86400000 ? req.result.blob : null);req.onerror=()=>resolve(null);});}catch{return null;}
}
async function save(url:string,blob:Blob) {
  try {
    const database=await db();const tx=database.transaction('images','readwrite');const store=tx.objectStore('images');store.put({url,blob,createdAt:Date.now()});
    const count=store.count();count.onsuccess=()=>{if(count.result>200){let remaining=count.result-200;const cursor=store.openCursor();cursor.onsuccess=()=>{if(cursor.result&&remaining-->0){cursor.result.delete();cursor.result.continue();}};}};
  }catch{/* Local caching is optional, including private browsing and quota errors. */}
}
async function original(url:string):Promise<string> {
  return new Promise((resolve,reject)=>{
    const image=new Image();image.referrerPolicy='no-referrer';image.decoding='async';
    const timer=setTimeout(()=>{image.src='';reject(new Error('Bildserver antwortet zu langsam.'));},25000);
    image.onload=()=>{clearTimeout(timer);resolve(url);};image.onerror=()=>{clearTimeout(timer);reject(new Error('Bild nicht erreichbar.'));};image.src=url;
  });
}
function preview(url:string):Promise<string> {
  const existing=shared.get(url);if(existing)return existing;
  const promise=queued(async()=>{
    const hit=await cached(url);if(hit)return URL.createObjectURL(hit);
    const host=new URL(url).host;if(noCors.has(host))return original(url);
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),25000);
    try {
      const response=await fetch(url,{mode:'cors',referrerPolicy:'no-referrer',signal:controller.signal});
      if(!response.ok)throw new Error('Bildserver meldet einen Fehler.');
      const blob=await response.blob();
      if(blob.size>30*1024*1024)throw new Error('Bild ist größer als 30 MB.');
      const bitmap=await createImageBitmap(blob);const scale=Math.min(1,384/Math.max(bitmap.width,bitmap.height));
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
      canvas.getContext('2d')!.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
      const small=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Vorschau fehlgeschlagen.')),'image/webp',0.82));
      void save(url,small);return URL.createObjectURL(small);
    } catch(error) {
      if(controller.signal.aborted)throw new Error('Bildserver antwortet zu langsam.');
      noCors.add(host);return original(url);
    } finally {clearTimeout(timer);}
  });
  shared.set(url,promise);void promise.catch(()=>shared.delete(url));return promise;
}
export function ThumbnailImage({src,style}:{src:string;style:CSSProperties}) {
  const ref=useRef<HTMLSpanElement>(null);const [visible,setVisible]=useState(false);const [resolved,setResolved]=useState('');const [failed,setFailed]=useState(false);const [attempt,setAttempt]=useState(0);
  useEffect(()=>{if(!ref.current)return;const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){setVisible(true);observer.disconnect();}},{rootMargin:'150px'});observer.observe(ref.current);return()=>observer.disconnect();},[]);
  useEffect(()=>{if(!visible)return;let alive=true;setResolved('');setFailed(false);preview(src).then(value=>{if(alive)setResolved(value);},()=>{if(alive)setFailed(true);});return()=>{alive=false;};},[src,visible,attempt]);
  return <span ref={ref} className="flex h-full w-full items-center justify-center" aria-busy={!resolved&&!failed}>
    {resolved ? <img src={resolved} alt="" draggable={false} loading="lazy" decoding="async" className="h-full w-full select-none" style={style} referrerPolicy="no-referrer" onError={()=>{setResolved('');setFailed(true);shared.delete(src);}}/> : failed ? <span className="p-1 text-center text-[10px]" role="img" aria-label="Bild konnte nicht geladen werden">Bild nicht geladen<br/><span role="button" tabIndex={0} className="underline" onClick={e=>{e.stopPropagation();shared.delete(src);setAttempt(n=>n+1);}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();shared.delete(src);setAttempt(n=>n+1);}}}>Erneut laden</span></span> : <span className="animate-pulse text-[10px] opacity-60">Bild lädt…</span>}
  </span>;
}
