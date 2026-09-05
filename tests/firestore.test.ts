import {test, before, after, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds,type RulesTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,updateDoc,writeBatch,deleteDoc,type Firestore} from 'firebase/firestore';
import {commitInventoryOperation} from '../src/inventoryStore';
import type {Bag,InventoryItem} from '../src/App';
let env:RulesTestEnvironment;
const base='campaigns/c';const pouch=(gp:number)=>({pp:0,gp,ep:0,sp:0,cp:0});
const access={targetMode:'all',targetUserIds:[],readMode:'all',readUserIds:[],writeMode:'all',writeUserIds:[],depositMode:'all',depositUserIds:[]};
const bag=(id:string):Bag=>({id,name:id,ownerUid:'player',kind:'inventory',maxWeight:null,maxVolume:null,sortIndex:0,createdAt:1,updatedAt:1,updatedBy:'dm',currentWeight:3,currentVolume:3,currentValue:30,itemCount:3,currency:pouch(0),access:access as any});
const item=(id='goods'):InventoryItem=>({id,bagId:'a',name:'Ware',quantity:3,weightPerUnit:1,volumePerUnit:1,valuePerUnit:10,description:'',notes:'',category:'sale',createdBy:'dm',updatedBy:'dm',createdAt:1,updatedAt:1});
const db=(user='player')=>env.authenticatedContext(user).firestore() as unknown as Firestore;
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-inventory',firestore:{host:'127.0.0.1',port:8080,rules:readFileSync('firestore-secure.rules','utf8')}});});
after(async()=>{await env.cleanup();});
beforeEach(async()=>{await env.clearFirestore();await env.withSecurityRulesDisabled(async ctx=>{const d=ctx.firestore();await d.doc(base).set({id:'c',dmUid:'dm'});for(const uid of ['dm','player','player2'])await d.doc(`${base}/members/${uid}`).set({uid,role:uid==='dm'?'dm':'player'});for(const id of ['a','b'])await d.doc(`${base}/bags/${id}`).set(bag(id));await d.doc(`${base}/items/goods`).set(item());});});
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
