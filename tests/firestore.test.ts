import {test, before, after, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds,type RulesTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,updateDoc,writeBatch,deleteDoc,type Firestore} from 'firebase/firestore';
import {commitInventoryOperation} from '../src/inventoryStore';
import {joinCampaignMembership,openCampaignMembership,recoverOwnedCampaigns,setCampaignHidden} from '../src/campaignMembership';
import {deleteCampaignData} from '../src/campaignDeletion';
import type {Bag,InventoryItem} from '../src/App';
let env:RulesTestEnvironment;
const base='campaigns/c';const pouch=(gp:number)=>({pp:0,gp,ep:0,sp:0,cp:0});
const access={targetMode:'all',targetUserIds:[],readMode:'all',readUserIds:[],writeMode:'all',writeUserIds:[],depositMode:'all',depositUserIds:[]};
const bag=(id:string):Bag=>({id,name:id,ownerUid:'player',kind:'inventory',maxWeight:null,maxVolume:null,sortIndex:0,createdAt:1,updatedAt:1,updatedBy:'dm',currentWeight:3,currentVolume:3,currentValue:30,itemCount:3,currency:pouch(0),access:access as any});
const item=(id='goods'):InventoryItem=>({id,bagId:'a',name:'Ware',quantity:3,weightPerUnit:1,volumePerUnit:1,valuePerUnit:10,description:'',notes:'',category:'sale',createdBy:'dm',updatedBy:'dm',createdAt:1,updatedAt:1});
const db=(user='player')=>env.authenticatedContext(user).firestore() as unknown as Firestore;
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-inventory',firestore:{host:'127.0.0.1',port:8080,rules:readFileSync('firestore-secure.rules','utf8')}});});
after(async()=>{await env.cleanup();});
beforeEach(async()=>{await env.clearFirestore();await env.withSecurityRulesDisabled(async ctx=>{const d=ctx.firestore();await d.doc(base).set({id:'c',name:'Testkampagne',dmUid:'dm',joinCode:'TEST',joinCodeSearch:'TEST'});for(const uid of ['dm','player','player2'])await d.doc(`${base}/members/${uid}`).set({uid,role:uid==='dm'?'dm':'player',displayName:uid,joinedAt:1,campaignName:'Testkampagne'});for(const id of ['a','b'])await d.doc(`${base}/bags/${id}`).set(bag(id));await d.doc(`${base}/items/goods`).set(item());});});
test('player sale changes updatedBy after DM edit, including legacy summaries',async()=>{
 await env.withSecurityRulesDisabled(async ctx=>{await ctx.firestore().doc(`${base}/bags/a`).set({id:'a',name:'a',access,kind:'inventory'});});
 const d=db();const batch=writeBatch(d);batch.delete(doc(d,base,'items','goods'));batch.update(doc(d,base,'bags','a'),{currency:pouch(30),currentWeight:0.6,currentVolume:0,currentValue:0,itemCount:0,updatedAt:2,updatedBy:'player'});await assertSucceeds(batch.commit());assert.equal((await getDoc(doc(d,base,'bags','a'))).data()?.currency.gp,30);
});
test('read-only player cannot sell, edit, or withdraw; write batch fully rolls back',async()=>{
 await env.withSecurityRulesDisabled(async ctx=>{await ctx.firestore().doc(`${base}/bags/a`).update({'access.writeMode':'dm','access.depositMode':'dm'});});
 const d=db(),batch=writeBatch(d);batch.delete(doc(d,base,'items','goods'));batch.update(doc(d,base,'bags','a'),{currency:pouch(30),currentValue:0,itemCount:0,currentVolume:0,updatedBy:'player'});await assertFails(batch.commit());assert.equal((await getDoc(doc(d,base,'items','goods'))).data()?.quantity,3);await assertFails(updateDoc(doc(d,base,'bags','a'),{currency:pouch(5)}));
});
test('old client writes to resource items fail for player AND DM; legacy items still work',async()=>{
 await env.withSecurityRulesDisabled(async ctx=>{await ctx.firestore().doc(`${base}/items/goods`).update({resourceVersion:1,resourceRevision:1,resources:[{id:'uses',name:'Uses',current:10,maximum:10,reset:'none',recovery:'all'}]});await ctx.firestore().doc(`${base}/items/legacy`).set(item('legacy'));});
 for(const uid of ['player','dm']){const d=db(uid);await assertFails(updateDoc(doc(d,base,'items','goods'),{quantity:2,updatedBy:uid}));await assertFails(deleteDoc(doc(d,base,'items','goods')));await assertSucceeds(updateDoc(doc(d,base,'items','legacy'),{quantity:2,updatedBy:uid}));}
});
test('resource split is atomic and fresh target document is readable',async()=>{
 const d=db();await commitInventoryOperation(d,'c','player',async read=>{const b=await read.bag('a');const original=(await read.item('goods'))!;await read.item('split');return {items:new Map([['goods',{...original,quantity:2,resources:[{id:'uses',name:'Uses',current:10,maximum:10,reset:'none',recovery:'all'}]}],['split',{...original,id:'split',quantity:1,resources:[{id:'uses',name:'Uses',current:9,maximum:10,reset:'none',recovery:'all'}]}]]),bags:new Map([[b.id,{}]])};});
 assert.equal((await getDoc(doc(d,base,'items','goods'))).data()?.quantity,2);assert.equal((await getDoc(doc(d,base,'items','split'))).data()?.resources[0].current,9);
});
test('concurrent transactional updates preserve all increments',async()=>{
 const incrementOnce=async(user:string)=>commitInventoryOperation(db(user),'c',user,async read=>{const b=await read.bag('a');return {bags:new Map([[b.id,{currency:pouch(b.currency!.gp+1)}]])};});
 await Promise.all([incrementOnce('player'),incrementOnce('player2')]);assert.equal((await getDoc(doc(db(),base,'bags','a'))).data()?.currency.gp,2);
});
test('deposit-only target accepts currency transfer but prevents source withdrawal',async()=>{
 await env.withSecurityRulesDisabled(async ctx=>{await ctx.firestore().doc(`${base}/bags/b`).update({'access.writeMode':'dm',currency:pouch(0)});await ctx.firestore().doc(`${base}/bags/a`).update({currency:pouch(5)});});
 const d=db();await commitInventoryOperation(d,'c','player',async read=>{const a=await read.bag('a'),b=await read.bag('b');return {bags:new Map([[a.id,{currency:pouch(0)}],[b.id,{currency:pouch(b.currency!.gp+a.currency!.gp)}]])};});
 await assertFails(updateDoc(doc(d,base,'bags','b'),{currency:pouch(0)}));assert.equal((await getDoc(doc(d,base,'bags','b'))).data()?.currency.gp,5);
});
test('unknown users have no access to data or missing item probes',async()=>{await assertFails(getDoc(doc(db('outsider'),base,'items','missing')));await assertFails(getDoc(doc(db('outsider'),base,'items','goods')));});
test('resource sale deletion requires the matching bag revision and stays atomic',async()=>{
 await env.withSecurityRulesDisabled(async ctx=>{await ctx.firestore().doc(`${base}/items/goods`).update({resourceVersion:1,resourceRevision:1,resources:[{id:'uses',name:'Uses',current:7,maximum:10,reset:'none',recovery:'all'}]});});
 const d=db();await assertSucceeds(commitInventoryOperation(d,'c','player',async read=>{const b=await read.bag('a');await read.item('goods');return {items:new Map([['goods',null]]),bags:new Map([[b.id,{currency:pouch(15),currentWeight:0.3,currentVolume:0,currentValue:0,itemCount:0}]])};}));
 assert.equal((await getDoc(doc(d,base,'items','goods'))).exists(),false);assert.equal((await getDoc(doc(d,base,'bags','a'))).data()?.resourceRevision,1);
});
test('thirty resource stacks can recover in one player transaction',async()=>{
 await env.withSecurityRulesDisabled(async ctx=>{for(let i=0;i<30;i++)await ctx.firestore().doc(`${base}/items/r${i}`).set({...item(`r${i}`),resourceVersion:1,resourceRevision:1,resources:[{id:'uses',name:'Uses',current:0,maximum:10,reset:'longRest',recovery:'all'}]});});
 await assertSucceeds(commitInventoryOperation(db(),'c','player',async read=>{const b=await read.bag('a');const writes=new Map<string,InventoryItem|null>();for(let i=0;i<30;i++){const value=(await read.item(`r${i}`))!;writes.set(value.id,{...value,resources:value.resources!.map(r=>({...r,current:r.maximum}))});}return {items:writes,bags:new Map([[b.id,{}]])};}));
 assert.equal((await getDoc(doc(db(),base,'items','r29'))).data()?.resources[0].current,10);
});
test('DM backup maintenance can restore a guarded item; player cannot invoke it',async()=>{
 await env.withSecurityRulesDisabled(async ctx=>{await ctx.firestore().doc(`${base}/items/goods`).update({resourceVersion:1,resourceRevision:1,resources:[{id:'uses',name:'Uses',current:7,maximum:10,reset:'none',recovery:'all'}]});});
 for(const user of ['player','dm']){const d=db(user),batch=writeBatch(d);batch.update(doc(d,base),{maintenanceRevision:1});batch.set(doc(d,base,'items','goods'),item());if(user==='player')await assertFails(batch.commit());else await assertSucceeds(batch.commit());}
 assert.equal((await getDoc(doc(db(),base,'items','goods'))).data()?.resources,undefined);
});
test('resource definitions reject invalid counters and accept all eight valid resources',async()=>{
 const r={id:'x',name:'Uses',current:1,maximum:1,reset:'longRest',recovery:'all'};
 const d=db();await assertFails(setDoc(doc(d,base,'items','bad'),{...item('bad'),updatedBy:'player',resourceVersion:1,resourceRevision:1,resources:[{...r,current:2}]}));
 await assertSucceeds(setDoc(doc(d,base,'items','valid'),{...item('valid'),updatedBy:'player',resourceVersion:1,resourceRevision:1,resources:Array.from({length:8},(_,i)=>({...r,id:`r${i}`}))}));
 await assertSucceeds(updateDoc(doc(d,base,'items','valid'),{resourceRevision:2,quantity:4}));
});
test('eight-resource stack transfers and merges into a deposit-only inventory',async()=>{
 const resources=Array.from({length:8},(_,i)=>({id:`r${i}`,name:`Use ${i}`,current:1,maximum:1,reset:'dawn',recovery:'all'}));
 await env.withSecurityRulesDisabled(async ctx=>{await ctx.firestore().doc(`${base}/bags/b`).update({'access.writeMode':'dm','access.readMode':'dm'});await ctx.firestore().doc(`${base}/items/goods`).update({resourceVersion:1,resourceRevision:1,resources});await ctx.firestore().doc(`${base}/items/target`).set({...item('target'),bagId:'b',quantity:1,resourceVersion:1,resourceRevision:1,resources});});
 const d=db();await assertSucceeds(commitInventoryOperation(d,'c','player',async read=>{const a=await read.bag('a'),b=await read.bag('b'),source=(await read.item('goods'))!,target=(await read.item('target'))!;return {items:new Map([['goods',null],['target',{...target,quantity:target.quantity+source.quantity,lastTransferSourceBagId:'a',lastTransferSourceItemId:'goods'} as InventoryItem]]),bags:new Map([[a.id,{currentWeight:0,currentVolume:0,currentValue:0,itemCount:0}],[b.id,{currentWeight:4,currentVolume:4,currentValue:40,itemCount:4}]])};}));
 assert.equal((await getDoc(doc(d,base,'items','target'))).data()?.quantity,4);assert.equal((await getDoc(doc(d,base,'items','target'))).data()?.resources.length,8);
});

test('rejoining preserves existing DM, player and applicant memberships exactly',async()=>{
 await env.withSecurityRulesDisabled(async ctx=>{await ctx.firestore().doc(`${base}/members/pending`).set({uid:'pending',role:'applicant',displayName:'Original',joinedAt:7});});
 for(const uid of ['dm','player','pending']) {
  const d=db(uid),ref=doc(d,base,'members',uid),original=(await getDoc(ref)).data();
  const result=await joinCampaignMembership(d,'c',uid,'Wrong replacement','Testkampagne');
  assert.equal(result.created,false);assert.deepEqual((await getDoc(ref)).data(),original);
  assert.equal((await getDoc(doc(d,'users',uid,'campaigns','c'))).data()?.role,original?.role);
 }
});
test('two simultaneous first joins create one applicant; no last-write role or name overwrite',async()=>{
 const [a,b]=await Promise.all([joinCampaignMembership(db('new'),'c','new','First','Testkampagne'),joinCampaignMembership(db('new'),'c','new','Second','Testkampagne')]);
 assert.equal(Number(a.created)+Number(b.created),1);assert.equal(a.member.role,'applicant');assert.deepEqual(a.member,b.member);
 await assertFails(getDoc(doc(db('new'),base,'items','goods')));
});
test('new membership checks the current code; own missing membership is readable, others are private',async()=>{
 const d=db('new');await assertSucceeds(getDoc(doc(d,base,'members','new')));
 await assertFails(getDoc(doc(d,base,'members','player')));await assertFails(getDoc(doc(d,base)));
 await assert.rejects(()=>joinCampaignMembership(d,'c','new','New','Testkampagne','REVOKED'));
 assert.equal((await getDoc(doc(d,base,'members','new'))).exists(),false);
 await env.withSecurityRulesDisabled(async ctx=>{await ctx.firestore().doc('joinCodes/TEST').set({campaignId:'c'});});
 const result=await joinCampaignMembership(d,'c','new','New','Testkampagne','TEST');assert.equal(result.created,true);
});
test('rules stop the old client from demoting the owner; display-name updates remain allowed',async()=>{
 const d=db('dm'),ref=doc(d,base,'members','dm');
 await assertFails(setDoc(ref,{uid:'dm',role:'applicant',displayName:'Oops',joinedAt:8}));
 await assertFails(updateDoc(ref,{role:'player'}));await assertFails(deleteDoc(ref));
 await assertSucceeds(updateDoc(ref,{displayName:'New name'}));
 assert.equal((await getDoc(ref)).data()?.role,'dm');
});
test('neither a player nor another DM can steal ownership or demote/remove the owner',async()=>{
 await env.withSecurityRulesDisabled(async ctx=>{await ctx.firestore().doc(`${base}/members/player2`).update({role:'dm'});});
 for(const uid of ['player','player2','dm']) {
  const d=db(uid);await assertFails(updateDoc(doc(d,base),{dmUid:'player'}));
  await assertFails(updateDoc(doc(d,base,'members','dm'),{role:'applicant'}));
  await assertFails(deleteDoc(doc(d,base,'members','dm')));
 }
 await assertFails(updateDoc(doc(db(),base,'members','player'),{role:'dm'}));
});
test('recorded owner repairs legacy demotion or missing membership; players cannot claim recovery',async()=>{
 for(const damage of ['demoted','missing']) {
  await env.withSecurityRulesDisabled(async ctx=>{const ref=ctx.firestore().doc(`${base}/members/dm`);if(damage==='demoted')await ref.update({role:'applicant'});else await ref.delete();});
  const result=await joinCampaignMembership(db('dm'),'c','dm','Recovered','Testkampagne');
  assert.equal(result.member.role,'dm');assert.equal((await getDoc(doc(db('dm'),base,'members','dm'))).data()?.role,'dm');
 }
 await assert.rejects(()=>openCampaignMembership(db(),'c','player','Claimed',true));
 await assertFails(setDoc(doc(db('outsider'),base,'members','outsider'),{uid:'outsider',role:'dm'}));
});
test('hidden campaigns keep membership and data; old removed owner references can be recovered without a code',async()=>{
 const d=db('dm');await openCampaignMembership(d,'c','dm','DM');
 const original=(await getDoc(doc(d,base,'members','dm'))).data();
 await setCampaignHidden(d,'dm','c',true);
 assert.equal((await getDoc(doc(d,'users','dm','campaigns','c'))).data()?.hidden,true);
 assert.deepEqual((await getDoc(doc(d,base,'members','dm'))).data(),original);
 assert.equal((await getDoc(doc(d,base,'items','goods'))).data()?.quantity,3);
 await setCampaignHidden(d,'dm','c',false);assert.equal((await getDoc(doc(d,'users','dm','campaigns','c'))).data()?.hidden,false);
 await deleteDoc(doc(d,'users','dm','campaigns','c'));
 await env.withSecurityRulesDisabled(async ctx=>{await ctx.firestore().doc(`${base}/members/dm`).update({role:'applicant'});await ctx.firestore().doc('campaigns/other').set({id:'other',dmUid:'other'});});
 assert.equal(await recoverOwnedCampaigns(d,'dm','DM'),1);
 assert.equal((await getDoc(doc(d,'users','dm','campaigns','c'))).data()?.role,'dm');
 assert.equal(await recoverOwnedCampaigns(db(),'player','Player'),0);
});
test('campaign creation and DM bootstrap still succeed together',async()=>{
 const d=db('creator'),batch=writeBatch(d);
 batch.set(doc(d,'campaigns','fresh'),{id:'fresh',dmUid:'creator',name:'Fresh'});
 batch.set(doc(d,'campaigns','fresh','members','creator'),{uid:'creator',role:'dm',displayName:'DM',joinedAt:1});
 await assertSucceeds(batch.commit());
});
test('campaign deletion requires a matching name and membership in that particular campaign',async()=>{
 await assert.rejects(()=>deleteCampaignData(db('dm'),'c','dm','Wrong'));
 await assert.rejects(()=>deleteCampaignData(db(),'c','player','Testkampagne'));
 await env.withSecurityRulesDisabled(async ctx=>{await ctx.firestore().doc(`${base}/members/player2`).update({role:'dm'});});
 await assert.rejects(()=>deleteCampaignData(db('player2'),'c','player2','Testkampagne'));
 assert.equal((await getDoc(doc(db('dm'),base,'items','goods'))).exists(),true);
});
test('large campaign deletion retains DM authority until its final batch and handles resource items',async()=>{
 await env.withSecurityRulesDisabled(async ctx=>{
  const d=ctx.firestore(),batch=d.batch();
  for(let i=0;i<405;i++)batch.set(d.doc(`${base}/auditLog/log${i}`),{message:'Test'});
  batch.update(d.doc(`${base}/items/goods`),{resourceVersion:1,resourceRevision:1,resources:[{id:'r',name:'Uses',current:1,maximum:1,reset:'none',recovery:'all'}]});
  batch.set(d.doc('joinCodes/TEST'),{campaignId:'c'});await batch.commit();
 });
 await assertSucceeds(deleteCampaignData(db('dm'),'c','dm','Testkampagne'));
 await env.withSecurityRulesDisabled(async ctx=>{
  const d=ctx.firestore();assert.equal((await d.doc(base).get()).exists,false);
  for(const name of ['items','bags','members','auditLog'])assert.equal((await d.collection(`${base}/${name}`).get()).size,0,name);
  assert.equal((await d.doc('joinCodes/TEST').get()).exists,false);
 });
});
