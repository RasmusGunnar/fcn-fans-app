import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const root=path.resolve(import.meta.dirname,'..');
function modules(mocks){
 const cache=new Map();
 const load=file=>{
  if(cache.has(file))return cache.get(file).exports;
  const module={exports:{}};cache.set(file,module);
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('require','module','exports',code)(name=>{
   if(name in mocks)return mocks[name];
   assert.ok(name.startsWith('.'),'Unmocked dependency '+name);
   return load(path.resolve(path.dirname(file),name+'.ts'));
  },module,module.exports);
  return module.exports;
 };
 return file=>load(path.join(root,file));
}
const id='10000000-0000-4000-8000-000000000001';
const load=modules({'../lib/instagram':{}});
const {carpoolChatNotice,CARPOOL_CHAT_CLOSED,CHAT_STATE_UNAVAILABLE}=load('src/utils/carpoolChat.ts');
test('canonical chat states: open/full/ordinary stay writable, closed states do not',()=>{
 for(const state of [null,{ride_status:'open'},{ride_status:'full'}])assert.equal(carpoolChatNotice(state),null);
 assert.equal(carpoolChatNotice({ride_status:'cancelled'}),'Turen er aflyst – chatten er lukket.');
 assert.equal(carpoolChatNotice({ride_status:'completed'}),'Turen er afsluttet – chatten er lukket.');
 for(const state of [undefined,{},[],{ride_status:'other'}])assert.equal(carpoolChatNotice(state),CHAT_STATE_UNAVAILABLE);
});
test('stale client errors have specific human copy, other messaging errors unchanged',()=>{
 const {getDirectMessageErrorMessage:error}=load('src/utils/directMessages.ts');
 assert.equal(error({message:'carpool_chat_read_only',code:'42501'}),CARPOOL_CHAT_CLOSED);
 assert.equal(error({message:'direct_message_blocked'}),'I kan ikke sende beskeder til hinanden.');
 assert.equal(error({message:'anything_private'}),'Beskeden kunne ikke sendes. Prøv igen.');
});
for(const [type,state,rpcError,expected] of [
 ['group',{ride_status:'cancelled'},false,'Turen er aflyst – chatten er lukket.'],
 ['group',{ride_status:'completed'},false,'Turen er afsluttet – chatten er lukket.'],
 ['group',null,false,null],['group',{ride_status:'open'},false,null],
 ['group',null,true,CHAT_STATE_UNAVAILABLE],['group',undefined,'throw',CHAT_STATE_UNAVAILABLE],
 ['direct',null,false,undefined],
])test('details member-scoped reader '+type+' '+JSON.stringify(state)+' '+rpcError,async()=>{
 const calls=[];
 const api=modules({
  'expo-crypto':{},'../lib/messageMedia':{},'../lib/logger':{},'../lib/instagram':{},
  '../lib/supabase':{supabase:{rpc:(name,args)=>{
   calls.push(name);assert.equal(args.p_conversation_id,id);
   if(name==='get_conversation_details')return {maybeSingle:async()=>({data:{conversation_id:id,conversation_type:type,conversation_name:'Aflyst - editable title'},error:null})};
   assert.equal(name,'carpool_chat_state');
   if(rpcError==='throw')throw Error('offline');
   return Promise.resolve({data:state,error:rpcError?{code:'PGRST202'}:null});
  }}},
 })('src/services/messagesApi.ts');
 assert.equal((await api.getConversationDetails(id)).readOnlyReason,expected);
 assert.equal(calls.includes('carpool_chat_state'),type==='group');
});
test('focused ride refreshes after background return and removes listener on blur',()=>{
 const source=fs.readFileSync(path.join(root,'src/screens/CarpoolScreen.tsx'),'utf8');
 const body=source.match(/useFocusEffect\(useCallback\(\(\) => \{([\s\S]*?)\n  }, \[load\]\)\);/)[1];
 let loads=0,removed=0,listener;
 const ref={current:0};
 const cleanup=new Function('load','AppState','requestVersion',body)(()=>{loads++;},{currentState:'active',addEventListener:(event,fn)=>{assert.equal(event,'change');listener=fn;return{remove(){removed++;}};}},ref);
 assert.equal(loads,1);listener('active');assert.equal(loads,1);
 listener('background');listener('active');assert.equal(loads,2);
 listener('active');assert.equal(loads,2);cleanup();assert.equal(removed,1);assert.equal(ref.current,1);
});
test('native composer and send share read-only guard; stale send closes without clearing draft',()=>{
 const source=fs.readFileSync(path.join(root,'src/screens/ConversationScreen.tsx'),'utf8');
 assert.match(source,/details\?\.blocked \|\| details\?\.readOnlyReason\) return/);
 assert.match(source,/details\?\.readOnlyReason \? \([\s\S]*?lock-closed-outline[\s\S]*?\) : details\?\.blocked/);
 assert.match(source,/error.message === CARPOOL_CHAT_CLOSED[\s\S]*?readOnlyReason: CARPOOL_CHAT_CLOSED/);
 assert.match(source,/enabled: Boolean\(isFocused && details && !details.readOnlyReason\)/);
});
