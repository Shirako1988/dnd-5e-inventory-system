"""Build explicit resource defaults from the bundled descriptions; no network or runtime guessing.
The review report records the source passages and special cases for maintainers.
"""
import json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
items=json.loads((ROOT/'src/data/itemCatalog.json').read_text())
number_words={'one':1,'two':2,'three':3,'four':4,'five':5,'six':6,'seven':7,'eight':8,'nine':9,'ten':10,'twelve':12,'twenty':20}
num=r'(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve|twenty)'
def number(s):return int(s) if s.isdigit() else number_words[s.lower()]
def resource(name,maximum,reset='none',recovery='all',note=''):
 return dict(id=re.sub(r'[^a-z0-9]+','-',name.lower()).strip('-') or 'resource',name=name,current=maximum,maximum=maximum,reset=reset,recovery=recovery,**({'note':note} if note else {}))
def event(text):
 text=text.lower()
 if 'short' in text and 'rest' in text:return 'shortRest'
 if 'long rest' in text:return 'longRest'
 if 'dawn' in text:return 'dawn'
 return 'none'
def parse(item):
 d=item['description']; compact=re.sub(r'\s+',' ',d).replace('’',"'")
 out=[]
 charge=re.search(r'\b(?:has|have|with|contains|holds|starts with) ('+num+r') charges\b',compact,re.I)
 if charge and number(charge[1].lower())>0:
  maximum=number(charge[1].lower());reset='none';recovery='all';notes=[]
  m=re.search(r'\bregains?\s+(all|\d+d\d+(?:\s*[+-]\s*\d+)?|\d+)\s+(?:(?:of )?(?:its |the )?(?:expended |expanded |spent )?)charges?\b([^.]*)',compact,re.I)
  if m:
   recovery=re.sub(r'\s+','',m[1].lower());reset=event(m[2])
   if reset=='none':notes.append(m[0]+'.')
  if not m and re.search(r'\bregain|\brecharge',compact,re.I):notes.append('Sonderregel zum Aufladen: siehe Beschreibung; manuell bearbeiten.')
  if re.search(r'last charge|last of (?:its|the) charges',compact,re.I):notes.append('Sonderregel bei der letzten Ladung beachten; Würfe/Zerstörung werden nicht automatisch ausgeführt.')
  out.append(resource('Ladungen',maximum,reset,recovery,' '.join(notes)))
 if not out:
  cell=re.search(r'gives (?:the )?[^.]{0,45}?('+num+r') charges',compact,re.I)
  finite=re.search(r'of its ('+num+r') charges|has a single charge',compact,re.I)
  if cell:out.append(resource('Ladungen',number(cell[1].lower()),note='Wird durch eine neue Energiezelle aufgefüllt; manuell bearbeiten.'))
  elif finite:out.append(resource('Ladungen',number(finite[1].lower()) if finite[1] else 1))
 # Explicit once-per-rest/dawn abilities, often in separate paragraphs.
 for index,paragraph in enumerate(re.split(r'\n\s*\n',d)):
  t=re.sub(r'\s+',' ',paragraph).replace('’',"'")
  trigger=re.search(r"(?:can'?t|cannot|can not)\s+(?:be )?(?:use|used|do|cast|invoke|activate|summon|produce|perform|create)[^.]{0,180}?(?:until|before)[^.]{0,130}(?:dawn|rest)",t,re.I)
  if not trigger:continue
  if charge and re.search(r'charges?',t,re.I):continue
  # Per-spell/per-bead or per-creature budgets need explicit definitions.
  if re.search(r'instrument of the bards',item['name'],re.I) or re.search(r'(?:each|same) (?:spell|bead)|(?:a |the )creature (?:can.t|cannot)',trigger[0],re.I):continue
  heading=re.findall(r'\*\*([^*]+)\*\*',paragraph)
  label=heading[-1].strip('.: ') if heading else 'Anwendung'
  reset=event(trigger[0]);maximum=1
  uses=re.search(r'('+num+r') times',t,re.I)
  if uses:maximum=number(uses[1].lower())
  if any(r['name']==label for r in out):label += ' '+str(index+1)
  out.append(resource(label,maximum,reset,'all',trigger[0].strip()+'.'))
 if "healer's kit" in item['name'].lower():out=[resource('Anwendungen',10)]
 overrides = {
  'item:dmg:boots_of_speed':[resource('Minuten',10,'longRest')],
  'item:idrotf:cauldron_of_plenty':[resource('Eintopf zubereiten',3,'dawn')],
  'item:skt:claw_of_the_wyrm_rune':[resource('Wyrmslayer',3,'dawn')],
  'item:tftyp:amulet_of_protection_from_turning':[resource('Turning abwehren',3,'dawn')],
  'item:tftyp:eagle_whistle':[resource('Flug',3,'dawn')],
  'item:bmt:key_card':[resource('Anwendung',5,'dawn')],
  'item:ai:living_loot_satchel':[resource('Gegenstand ziehen',5,'dawn')],
  'item:ftd:platinum_scarf':[resource('Schuppen',3,'dawn')],
  'item:ggr:sunforger':[resource('Explosion',1,'shortRest')],
  'item:bam:talarith':[resource('Golem beschwören',1,'shortRest')],
  'item:egw:luxon_beacon':[resource('Fragment of Possibility',1,'dawn')],
  'item:dmg:rod_of_rulership':[resource('Anwendung',1,'dawn')],
  'item:coa:gauntlets_of_rage':[resource('Fury',1,'shortRest')],
  'item:tftyp:waythe':[resource('Ladungen',7,'dawn',note='Wie Wand of Enemy Detection; hier alle Ladungen bei Dawn.')],
  'item:skt:korolnor_scepter':[resource('Ladungen',10,'dawn','1d6+4')],
  'item:hotdq:tankard_of_plenty':[resource('Anwendungen pro Tag',3,note='Drei Anwendungen pro Tag; Tageswechsel ist im Quelltext nicht genauer festgelegt. Manuell auffüllen.')],
  'item:bgg:harp_of_gilded_plenty':[resource('Soothing Melody',5,'dawn'),resource('Feast of Plenty',1,note='Erst nach 1d10+10 Tagen erneut nutzbar; manuell auffüllen.')],
  'tg:391':[resource('Münzwurf',1,'shortRest')],
  'tg:410':[resource('Zauberanwendungen pro Tag',3,note='Drei Anwendungen pro Tag, gemeinsamer Pool der drei genannten Zauber. Tageswechsel manuell.')],
 }
 if item['id'] in overrides:out=overrides[item['id']]
 if 'instrument_of_the_bards,' in item['id']:
  spells=['fly','invisibility','levitate','protection from evil and good']
  extra=re.search(r'In addition, .*? can be used to cast ([^.]+)',compact,re.I)
  if extra:spells += re.split(r',\s*(?:and\s+)?|\s+and\s+',extra[1])
  out=[resource(spell.strip().capitalize(),1,'dawn') for spell in spells]
 if 'will_of_the_talon_' in item['id']:
  out=[resource('Frightful Presence',1,'dawn')]+[resource('Breath: '+name,1,'dawn') for name in ['Acid','Cold','Fire','Lightning','Poison']]
 if 'spell_gem_(' in item['id']:out=[resource('Zauber einprägen',1,'dawn',note='Zählt das Einprägen. Ein verbrauchter gespeicherter Zauber wird bei Dawn nicht automatisch wiederhergestellt.')]
 if item['id']=='item:dmg:necklace_of_prayer_beads':
  r=resource('Perle: Typ festlegen',1,'dawn',note='1d4+2 magische Perlen, Typen durch DM festlegen. Für jede tatsächlich vorhandene Perle eine Ressource anlegen.');r['needsSetup']=True;out=[r]
 if not out:
  variable=re.search(r'(?:has|with|containing|starts with|begins existence with) (\d+)d(\d+)(?:\s*\+\s*(\d+))? charges',compact,re.I)
  if variable:
   maximum=int(variable[1])*int(variable[2])+int(variable[3] or 0)
   r=resource('Ladungen',maximum,note='Anfangsladungen auswürfeln und eintragen: '+variable[0]+'.');r['needsSetup']=True;out=[r]
 if item['id'] in ['item:coa:true-ice_shards_(dagger)','item:coa:true-ice_shards_(rapier)']:
  out=[resource('Sub-Zero',1,'longRest'),resource('Omniscient',1,'longRest',note='Gemeinsame Anwendung für Scrying / Find the Path. Bei gepaarten Shards gemeinsame Nutzung manuell abstimmen.')]
 if item['id']=='tg:404':
  r=resource('Ladungen',4,note='Anfang: 1d3+1 würfeln. Regeneriert 1 Ladung pro Tag; Zeitpunkt manuell.');r['needsSetup']=True;out=[r]
 return out
out={};unresolved=[]
for item in items:
 resources=parse(item)
 if resources:out[item['id']]=resources
 if re.search(r'\bcharges?\b|next dawn|short rest|long rest|\buses\b|times per day',item['description'],re.I) and not resources:
  sentences=[re.sub(r'\s+',' ',s) for s in re.split(r'(?<=[.!?])\s+',item['description']) if re.search(r'\bcharges?\b|next dawn|short rest|long rest|\buses\b|times per day',s,re.I)]
  unresolved.append({'id':item['id'],'name':item['name'],'sentences':sentences})
(ROOT/'src/data/resourceCatalog.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
(ROOT/'docs').mkdir(exist_ok=True)
(ROOT/'docs/resource-catalog-review.json').write_text(json.dumps(unresolved,ensure_ascii=False,indent=2))
print('Defaults:',len(out),'resources:',sum(map(len,out.values())),'review:',len(unresolved))
