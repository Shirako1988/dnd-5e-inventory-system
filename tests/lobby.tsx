// Browser fixture: the real lobby component, with in-memory callbacks only.
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import type {User} from 'firebase/auth';
import {CampaignGate,type UserCampaignSummary} from '../src/App';
import '../src/styles.css';
declare global {interface Window {lobbyEvents:string[];failDeletion:boolean}}
window.lobbyEvents=[];
window.failDeletion=false;
const owner:UserCampaignSummary={campaignId:'c',name:'Testkampagne',joinCode:'TEST',role:'dm',displayName:'DM',joinedAt:1,updatedAt:1};
function Fixture() {
 const [campaigns,setCampaigns]=useState<UserCampaignSummary[]>([owner,{...owner,campaignId:'hidden',name:'Verborgene Runde',role:'player',hidden:true}]);
 const hide=async(id:string,hidden:boolean)=>setCampaigns(all=>all.map(c=>c.campaignId===id?{...c,hidden}:c));
 const noop=async()=>{};
 return <div className="min-h-screen bg-[#16110c] text-[#f3e7c8]"><CampaignGate isDark panelClass="border-[#7b6237]/50 bg-[#241a12] shadow-black/40" mutedText="text-[#c8b98f]" inputClass="border-[#806337]/60 bg-[#1a130d] text-[#f3e7c8]" primaryButton="rounded-xl bg-amber-800 px-3 py-2" secondaryButton="inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold border border-[#8d713e]/60 bg-[#2f2316] text-[#f3e7c8]" syncBadge="Lokaler UI-Test" userCampaigns={campaigns} authUser={{uid:'dm',email:'test@example.test',displayName:'DM'} as User} accountBusy={false} onCreate={noop} onJoin={noop} onOpenCampaign={id=>window.lobbyEvents.push(`open:${id}`)} onDeleteCampaign={async(id,name)=>{if(window.failDeletion)throw new Error('Test: Server lehnt Löschung ab.');window.lobbyEvents.push(`delete:${id}:${name}`);}} onRemoveCampaignReference={id=>hide(id,true)} onRestoreCampaignReference={id=>hide(id,false)} onRecoverCampaigns={async()=>{window.lobbyEvents.push('recover');setCampaigns(all=>all.map(c=>({...c,hidden:false})));return 1;}} onClearLocalData={()=>{}} onRegister={noop} onLogin={noop} onLogout={noop} onResetPassword={noop}/></div>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
