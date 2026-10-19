// Run with: node tests/bonds.test.cjs
// Uses the full production script and an atomic in-memory IDB test double.
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const clone=x=>JSON.parse(JSON.stringify(x));

function setup(){
  const nodes=new Map();
  const node=()=>({innerHTML:'',textContent:'',value:'',dataset:{},style:{},classList:{toggle(){},add(){},remove(){}},addEventListener(){},setAttribute(){},querySelector(){return node();},querySelectorAll(){return [];},insertAdjacentHTML(_where,html){this.innerHTML=html+this.innerHTML;},appendChild(){},remove(){}});
  const document={getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);},querySelectorAll(){return [];},querySelector(){return null;},addEventListener(){},createElement:node,body:node()};
  const storage=new Map();
  const sandbox={document,console,navigator:{},indexedDB:{open(){return {};}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},history:{state:null,length:1,pushState(){},replaceState(){},back(){}},location:{href:'https://example.test/'},addEventListener(){},URL,Blob,TextDecoder};
  sandbox.window=sandbox;
  const context=vm.createContext(sandbox);
  const all=Array.from({length:8},(_,i)=>fs.readFileSync(path.join(root,`app.part${i+1}.txt`),'utf8')).join('');
  vm.runInContext(all,context,{timeout:2000});
  const api=vm.runInContext('({catalog:MOA_BOND_EDITION,world:WORLD_MEMBERS,oldRelations:WORLD_RELATIONS,prepareBondPlan,migrateBondEdition,bondMemberMatches,bondRecordHtml,bondVisibleRows,bondNetworkHtml,renderBonds,seed})',context);
  return {context,api,nodes};
}

function makeDb(initial={},failWrite=null){
  const db={rows:{},transactions:[],failWrite};
  for(const name of ['members','relations','history','images','production','schedules'])db.rows[name]=new Map((initial[name]||[]).map(x=>[x.id,clone(x)]));
  db.transaction=(names,mode='readonly')=>{
    if(typeof names==='string')names=[names];
    db.transactions.push({names:names.slice(),mode});
    const stage=Object.fromEntries(names.map(n=>[n,new Map([...db.rows[n]].map(([k,v])=>[k,clone(v)]))]));
    let pending=0,aborted=false;
    const tx={error:null,oncomplete:null,onabort:null,onerror:null,abort(){if(aborted)return;aborted=true;queueMicrotask(()=>tx.onabort?.());},objectStore(name){
      assert.ok(names.includes(name));
      function request(op,fn){
        const req={result:undefined,error:null,onsuccess:null,onerror:null};pending++;
        queueMicrotask(()=>{
          if(aborted)return;
          try{
            if(op==='put'&&db.failWrite?.(name))throw Object.assign(new Error('quota test'),{name:'QuotaExceededError'});
            req.result=fn();req.onsuccess?.({target:req});
          }catch(e){tx.error=e;req.error=e;req.onerror?.();tx.onerror?.();tx.abort();return;}
          pending--;
          if(!pending&&!aborted){if(mode==='readwrite')for(const n of names)db.rows[n]=stage[n];tx.oncomplete?.();}
        });
        return req;
      }
      return {getAll:()=>request('getAll',()=>clone([...stage[name].values()])),get:id=>request('get',()=>stage[name].has(id)?clone(stage[name].get(id)):undefined),put:obj=>request('put',()=>{stage[name].set(obj.id,clone(obj));return obj.id;})};
    }};
    return tx;
  };
  db.dump=()=>Object.fromEntries(Object.entries(db.rows).map(([k,m])=>[k,[...m.values()]]));
  return db;
}
function useDb(env,db){env.context.__testDb=db;vm.runInContext('db=__testDb',env.context);}
function legacy(api){
  const members=clone(api.world).map((m,i)=>({...m,id:'existing_'+i,createdAt:'2026-09-01',updatedAt:'2026-09-27',deletedAt:null}));
  const relations=clone(api.oldRelations).map(r=>({id:'seedrel_'+r.k,seedKey:r.k,personA:members.find(m=>m.name===r.a).id,personB:members.find(m=>m.name===r.b).id,personAName:r.a,personBName:r.b,tags:r.tags,aToB:r.aToB,bToA:r.bToA,memo:r.memo,closeness:null,createdAt:'2026-09-27',updatedAt:'2026-09-27'}));
  return {members,relations,images:[{id:'photo',memberId:members[0].id,dataUrl:'data:image/png;base64,keep-me',category:'顔8方向'}],production:[{id:'prod',memberId:members[0].id,nextAngle:'右90°'}],schedules:[{id:'appointment',content:'保存済みの予定'}],history:[{id:'old_history',detail:'残す履歴'}]};
}

(async()=>{
  const env=setup(),{api}=env;
  assert.equal(api.catalog.relations.length,51);assert.equal(api.catalog.stories.length,8);
  const initial=legacy(api);
  initial.members[0].age=42;initial.members[0].memo='端末で編集した設定';
  const personal=initial.relations.find(r=>r.seedKey==='moa-noa');personal.memo='手入力の大切なメモ';personal.closeness=5;personal.aToB='手入力の呼び方';
  const db=makeDb(initial);useDb(env,db);
  const first=await api.migrateBondEdition();assert.equal(first.done,false);
  const after=db.dump();
  for(const m of initial.members)assert.deepEqual(after.members.find(x=>x.id===m.id),m,'existing profiles are unchanged');
  for(const name of ['images','production','schedules'])assert.deepEqual(after[name],initial[name],name+' is untouched');
  const updated=after.relations.find(r=>r.id===personal.id);
  assert.equal(updated.memo,personal.memo);assert.equal(updated.closeness,5);assert.equal(updated.aToB,personal.aToB);assert.ok(updated.bond.origin);
  assert.equal(after.members.filter(m=>m.name==='奏').length,1);assert.equal(after.members.filter(m=>m.name==='玲愛').length,0);
  assert.ok(after.members.some(m=>m.name==='天宮さら'));assert.ok(after.members.some(m=>m.name==='咲愛'));
  assert.ok(after.relations.some(r=>r.bond?.key==='kanade-ritsuka'));
  const snapshot=after.history.find(h=>h.snapshot);assert.deepEqual(snapshot.snapshot.members,initial.members);assert.deepEqual(snapshot.snapshot.relations,initial.relations);
  const repeat=await api.migrateBondEdition();assert.equal(repeat.done,true);assert.deepEqual(db.dump(),after,'repeat update adds no duplicate records');
  console.log('PASS existing IDs, profiles, photos, manual notes, backups and repeat updates');

  const tombstones=legacy(api);
  tombstones.members.push({id:'deleted_kanade',name:'奏',deletedAt:'2026-10-18'});
  tombstones.members.push({id:'nickname_fu',name:'フーちゃん',memo:'既存の別名登録',deletedAt:null});
  tombstones.relations.find(r=>r.seedKey==='moa-rin').deletedAt='2026-10-18';
  const protectedRelation=tombstones.relations.find(r=>r.seedKey==='moa-noa');protectedRelation.bond={origin:'自分で修正済み',editedAt:'2026-10-18'};
  const p=clone(api.prepareBondPlan(tombstones.members,tombstones.relations,tombstones.history,'stamp'));
  assert.ok(!p.memberWrites.some(m=>m.name==='奏'||m.name==='李芙香'));
  assert.ok(!p.relationWrites.some(r=>r.personA==='deleted_kanade'||r.personB==='deleted_kanade'||r.seedKey==='moa-rin'||r.id===protectedRelation.id));
  assert.ok(p.relationWrites.some(r=>r.bond.key==='moa-fu'&&[r.personA,r.personB].includes('nickname_fu')));
  assert.deepEqual(clone(api.bondMemberMatches(tombstones.members,'希彩')).map(m=>m.name),['希彩']);
  const ambiguous=tombstones.members.concat({id:'second_moa',name:'萌 愛',deletedAt:null});
  const ap=api.prepareBondPlan(ambiguous,tombstones.relations,[],'stamp');assert.ok(ap.issues.some(x=>x.includes('萌愛')));assert.ok(!ap.relationWrites.some(r=>r.bond.key==='moa-kazuha'));
  console.log('PASS deleted records, aliases, same readings, ambiguity and edited lore');

  const failDb=makeDb(initial,name=>name==='relations');useDb(env,failDb);
  await assert.rejects(api.migrateBondEdition(),/quota test/);assert.deepEqual(failDb.dump(),initial,'failed migration rolls back every store and marker');
  failDb.failWrite=null;await api.migrateBondEdition();assert.ok(failDb.dump().relations.some(r=>r.bond));
  assert.ok(failDb.transactions.every(t=>t.names.join(',')==='members,relations,history'));
  console.log('PASS atomic failure rollback and safe retry');

  useDb(env,db);
  const hostile={id:'x',personA:'a',personB:'b',personAName:'<script>bad()</script>',personBName:'<img src=x onerror=bad()>',tags:['<svg/onload=bad()>'],memo:'<script>memo()</script>',bond:{origin:'<img src=x>',events:['<script>event()</script>'],distance:'<svg>',source:'<b>source</b>'}};
  const card=api.bondRecordHtml(hostile);assert.ok(!card.includes('<script>'));assert.ok(!card.includes('<img'));assert.ok(card.includes('&lt;script&gt;'));
  const beforeBackup=JSON.stringify(db.dump());
  for(const mode of ['list','map','stories']){
    env.context.__mode=mode;vm.runInContext("state.view='bonds';state.memberId=null;state.bondMode=__mode;state.bondSearch='';state.bondPerson='';",env.context);
    await api.renderBonds();assert.equal(env.nodes.get('screenTitle').textContent,'関係と絆');assert.ok(env.nodes.get('bondResults').innerHTML.length>100);
    if(mode==='list')assert.ok(env.nodes.get('bondResults').innerHTML.includes('現在の距離感'));
    if(mode==='map')assert.ok(env.nodes.get('bondResults').innerHTML.includes('bond-network'));
    if(mode==='stories')assert.ok(env.nodes.get('bondResults').innerHTML.includes('誕生日'));
  }
  env.nodes.get('bondSearch').oninput({target:{value:'存在しない検索語'}});assert.ok(env.nodes.get('bondResults').innerHTML.includes('まだ記録されていません'));
  assert.equal(JSON.stringify(db.dump()),beforeBackup,'view changes are read only');
  console.log('PASS complete-script integration, three views, search and escaped HTML');

  const fresh=setup(),freshDb=makeDb();useDb(fresh,freshDb);await fresh.api.seed();
  assert.equal(freshDb.dump().members.length,97);assert.equal(freshDb.dump().members.filter(m=>m.name==='奏').length,1);
  assert.equal(freshDb.dump().relations.filter(r=>r.bond).length,51);
  console.log('PASS fresh installation: 79 existing + 18 named additions, 51 enriched relationships');

  const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const loader=fs.readFileSync(path.join(root,'app.js'),'utf8');
  const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
  const assets=vm.runInNewContext(sw.split("self.addEventListener")[0]+';ASSETS');
  for(const match of index.matchAll(/(?:href|src)="(\.\/(?:app\.js|styles\.css)[^"]*)"/g))assert.ok(assets.includes(match[1]),'offline cache includes versioned entry asset');
  for(const match of loader.matchAll(/'(\.\/app\.part\d+\.txt)'/g))assert.ok(assets.includes(match[1]),'offline cache includes every loaded part');
  assert.ok(loader.includes("serviceWorker.register('./sw.js')"));
  console.log('PASS versioned entry assets and complete offline precache');
})().catch(error=>{console.error(error);process.exitCode=1;});
