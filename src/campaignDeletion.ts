import { collection, doc, getDoc, getDocs, increment, writeBatch, type Firestore } from 'firebase/firestore';
import type { Campaign } from './App';

export async function deleteCampaignData(db:Firestore, campaignId:string, actorUid:string, confirmedName:string) {
  const campaignRef=doc(db,'campaigns',campaignId);
  const snapshot=await getDoc(campaignRef);
  if(!snapshot.exists())throw new Error('Diese Kampagne existiert nicht mehr.');
  const campaign=snapshot.data() as Campaign;
  if(confirmedName!==campaign.name)throw new Error('Der Kampagnenname stimmt nicht überein. Bitte öffne die Bestätigung erneut.');
  // Join-code removal is reserved for the recorded owner by the existing rules.
  if(campaign.dmUid!==actorUid)throw new Error('Nur der ursprüngliche Kampagnenbesitzer kann die gesamte Kampagne löschen.');
  const member=await getDoc(doc(db,'campaigns',campaignId,'members',actorUid));
  if(member.data()?.role!=='dm')throw new Error('Nur ein DM dieser Kampagne kann sie löschen.');
  const [bags,items,members,logs]=await Promise.all(['bags','items','members','auditLog'].map(name=>getDocs(collection(db,'campaigns',campaignId,name))));
  // Keep owner and acting DM until the final atomic batch, including for large campaigns.
  const retained=members.docs.filter(entry=>entry.id===actorUid || entry.id===campaign.dmUid);
  const retainedIds=new Set(retained.map(entry=>entry.id));
  const removed=members.docs.filter(entry=>!retainedIds.has(entry.id));
  const refs=[...items.docs.map(e=>e.ref),...bags.docs.map(e=>e.ref),...logs.docs.map(e=>e.ref),
    ...removed.flatMap(e=>[doc(db,'users',e.id,'campaigns',campaignId),e.ref])];
  for(let i=0;i<refs.length;i+=400) {
    const batch=writeBatch(db);
    for(const ref of refs.slice(i,i+400))batch.delete(ref);
    // The existing backup-maintenance gate also authorizes deletion of resource items.
    batch.update(campaignRef,{maintenanceRevision:increment(1)});
    await batch.commit();
  }
  const final=writeBatch(db);
  for(const entry of retained){final.delete(doc(db,'users',entry.id,'campaigns',campaignId));final.delete(entry.ref);}
  if(campaign.joinCodeSearch)final.delete(doc(db,'joinCodes',campaign.joinCodeSearch));
  final.delete(campaignRef);
  await final.commit();
}
