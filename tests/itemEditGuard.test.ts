import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertUnchangedItemFields} from '../src/itemEditGuard';
import type {InventoryItem} from '../src/App';
import type {ItemResource} from '../src/resources';

const resource:ItemResource={id:'uses',name:'Anwendungen',current:7,maximum:10,reset:'none',recovery:'all'};
const baseline={id:'kit',bagId:'a',name:'Kit',quantity:3,resources:[resource]} as InventoryItem;

test('resource deletion accepts identical values with different map-key order',()=>{
  const ordered=Object.fromEntries(Object.entries(resource).sort(([a],[b])=>a.localeCompare(b))) as unknown as ItemResource;
  const current={...baseline,resources:[ordered]};
  assert.deepEqual(current,baseline);
  assert.notEqual(JSON.stringify(current.resources),JSON.stringify(baseline.resources));
  assert.doesNotThrow(()=>assertUnchangedItemFields(current,baseline,{resources:[]}));
  assert.equal(resource.current,7);
});

test('removing a resource refuses real concurrent changes, including ids and notes',()=>{
  for(const change of [{current:6},{maximum:11},{name:'Neu'},{reset:'dawn' as const},{recovery:'1d6'},{id:'replacement'},{note:'Neue Sonderregel'}]) {
    assert.throws(()=>assertUnchangedItemFields({...baseline,resources:[{...resource,...change}]},baseline,{resources:[]}));
  }
});

test('resource additions, removals and changed list order are still conflicts',()=>{
  const other={...resource,id:'other',name:'Zauber'};
  assert.throws(()=>assertUnchangedItemFields({...baseline,resources:[]},baseline,{resources:[]}));
  assert.throws(()=>assertUnchangedItemFields({...baseline,resources:[resource,other]},baseline,{resources:[]}));
  assert.throws(()=>assertUnchangedItemFields({...baseline,resources:[other,resource]},{...baseline,resources:[resource,other]},{resources:[]}));
});

test('editor fields retain their conflict protection; unrelated metadata does not block',()=>{
  assert.throws(()=>assertUnchangedItemFields({...baseline,quantity:4},baseline,{quantity:3,resources:[]}));
  assert.throws(()=>assertUnchangedItemFields({...baseline,name:'Anderes Kit'},baseline,{name:'Kit',resources:[]}));
  assert.doesNotThrow(()=>assertUnchangedItemFields({...baseline,updatedAt:99,updatedBy:'other'},baseline,{resources:[]}));
  assert.doesNotThrow(()=>assertUnchangedItemFields({...baseline,resources:[{...resource,note:undefined}]},baseline,{resources:[]}));
});
