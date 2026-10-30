const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function element(){return {value:'',textContent:'',children:[],append(...nodes){this.children.push(...nodes)},replaceChildren(){this.children=[]},focus(){}}}
const nodes={};function find(node,id){if(node?.id===id)return node;for(const child of node?.children||[]){const hit=find(child,id);if(hit)return hit}}
const draft={status:'review',request_id:'11111111-1111-4111-8111-111111111111',name:'Reading',class_name:'History',due_date:'2030-01-01',estimated_minutes:30,time_source:'student',estimate_allowed:false,optional:false,percentage_of_grade:null,grade_weight_answered:true};
let savedDraft=structuredClone(draft),fail=false,saves=0,refreshes=0,resolveSave=null;
const backend={loadAssignmentDraft:async()=>structuredClone(savedDraft),async confirmAssignmentDraft(){saves++;if(resolveSave)await new Promise(resolve=>{resolveSave=resolve});if(fail)throw Error('Network failed');savedDraft.status='created';return {id:'9'}},async changeAssignmentDraft(id,request,action){savedDraft.status=action==='cancel'?'cancelled':'collecting'}};
const client={from(table){const q={select(){return q},order(){return q},limit(){return q},eq(){return q},then(resolve){resolve({data:table==='chat'?[{chat_ID:1,title:'Study'}]:[]})}};return q}};
const context={document:{getElementById:id=>find(nodes.cb,id)|| (nodes[id]??=element()),createElement:element,createTextNode:text=>({textContent:text})},CanvasBackend:{id:String},crypto:{randomUUID:()=>draft.request_id},Date};vm.createContext(context);vm.runInContext(fs.readFileSync('chat.js','utf8'),context);
(async()=>{
 const ui=context.CanvasChat.create(client,{backend,onSaved:async()=>{refreshes++}});await ui.open();assert.ok(find(nodes.cb,'chat-create-assignment'));
 fail=true;await ui.confirmDraft();assert.equal(saves,1);assert.equal(refreshes,0);assert.match(nodes['chat-status'].textContent,/couldn’t confirm the save/);assert.ok(find(nodes.cb,'chat-create-assignment'));
 fail=false;await ui.confirmDraft();assert.equal(refreshes,1);assert.equal(find(nodes.cb,'chat-create-assignment'),undefined);await ui.confirmDraft();assert.equal(saves,2);
 savedDraft=structuredClone(draft);savedDraft.estimated_minutes=601;await ui.open();await ui.confirmDraft();assert.equal(saves,2);assert.match(nodes['chat-status'].textContent,/10 hours/);
 find(nodes.cb,'chat-long-confirm').checked=true;await ui.confirmDraft();assert.equal(saves,3);
 savedDraft=structuredClone(draft);await ui.open();await ui.changeDraft('edit');assert.equal(savedDraft.status,'collecting');assert.equal(find(nodes.cb,'chat-create-assignment'),undefined);
 await ui.changeDraft('cancel');assert.equal(savedDraft.status,'cancelled');assert.equal(saves,3);
 savedDraft=structuredClone(draft);await ui.open();resolveSave=true;const pending=ui.confirmDraft();await Promise.resolve();ui.reset();resolveSave();await pending;assert.equal(refreshes,2);assert.equal(nodes['chat-history'].value,'');
 console.log('PASS: saved reviews, failure/retry, confirmation locks, long-estimate acknowledgement, edit/cancel, and stale sign-out response handling.');
})().catch(e=>{console.error(e);process.exitCode=1});
