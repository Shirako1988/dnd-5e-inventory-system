import { collection, doc, getDocs, query, runTransaction, updateDoc, where, type Firestore } from 'firebase/firestore';
import type { Campaign, CampaignMember, UserCampaignSummary } from './App';

/** Opens an existing membership; the immutable campaign owner can repair their DM role. */
export async function openCampaignMembership(db: Firestore, campaignId: string, actorUid: string, fallbackName: string, ownerOnly = false) {
  return runTransaction(db, async tx => {
    const campaignRef = doc(db, 'campaigns', campaignId);
    const memberRef = doc(db, 'campaigns', campaignId, 'members', actorUid);
    const campaignSnapshot = await tx.get(campaignRef);
    const memberSnapshot = await tx.get(memberRef);
    if (!campaignSnapshot.exists()) throw new Error('Diese Kampagne existiert nicht mehr.');
    const campaign = {...campaignSnapshot.data(), id:campaignId} as Campaign;
    const owner = campaign.dmUid === actorUid;
    if (ownerOnly && !owner) throw new Error('Nur der ursprüngliche Kampagnenbesitzer kann seinen DM-Zugang wiederherstellen.');
    let member = memberSnapshot.exists() ? memberSnapshot.data() as CampaignMember : null;
    if (owner && (!member || member.role !== 'dm')) {
      member = {...member, uid:actorUid, displayName:member?.displayName || fallbackName || 'DM', role:'dm', joinedAt:member?.joinedAt ?? Date.now(), campaignName:campaign.name};
      tx.set(memberRef, member);
    }
    if (!member) throw new Error('Du bist mit diesem Account kein Mitglied dieser Kampagne.');
    const reference: UserCampaignSummary = {
      campaignId, name:campaign.name, joinCode:member.role === 'applicant' ? '—' : campaign.joinCode,
      role:member.role, displayName:member.displayName, joinedAt:member.joinedAt,
      updatedAt:Date.now(), hidden:false,
    };
    tx.set(doc(db, 'users', actorUid, 'campaigns', campaignId), reference, {merge:true});
    return {campaign, member};
  });
}

/** Read before create: repeated/concurrent joins never overwrite an existing member. */
export async function joinCampaignMembership(db: Firestore, campaignId: string, actorUid: string, displayName: string, campaignName: string, codeSearch?: string) {
  let created: boolean;
  try {
    created = await runTransaction(db, async tx => {
      const memberRef = doc(db, 'campaigns', campaignId, 'members', actorUid);
      const snapshot = await tx.get(memberRef);
      if (snapshot.exists()) return false;
      if (codeSearch) {
        const code = await tx.get(doc(db, 'joinCodes', codeSearch));
        if (!code.exists() || code.data().campaignId !== campaignId) throw new Error('Dieser Beitrittscode ist nicht mehr gültig.');
      }
      tx.set(memberRef, {uid:actorUid, displayName, campaignName, role:'applicant', joinedAt:Date.now()} satisfies CampaignMember);
      return true;
    });
  } catch (error) {
    // A missing owner's membership must be recreated as DM, never as applicant.
    if ((error as {code?:string})?.code !== 'permission-denied') throw error;
    try { return {...await openCampaignMembership(db, campaignId, actorUid, displayName, true), created:false}; }
    catch { throw error; }
  }
  return {...await openCampaignMembership(db, campaignId, actorUid, displayName), created};
}

export async function setCampaignHidden(db: Firestore, actorUid: string, campaignId: string, hidden: boolean) {
  await updateDoc(doc(db, 'users', actorUid, 'campaigns', campaignId), {hidden, updatedAt:Date.now()});
}

export async function recoverOwnedCampaigns(db: Firestore, actorUid: string, displayName: string): Promise<number> {
  const owned = await getDocs(query(collection(db, 'campaigns'), where('dmUid', '==', actorUid)));
  for (const campaign of owned.docs) await openCampaignMembership(db, campaign.id, actorUid, displayName, true);
  return owned.size;
}
