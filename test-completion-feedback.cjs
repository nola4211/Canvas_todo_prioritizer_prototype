// Behavioral checks: confirmation must follow persistence, never precede it.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const elements=new Map();
const classes=()=>({values:new Set(),contains(x){return this.values.has(x)},add(x){this.values.add(x)},remove(x){this.values.delete(x)},toggle(x,on){if(on)this.add(x);else this.remove(x)}});
function element(id){if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',hidden:false,value:'',disabled:false,classList:classes(),addEventListener(){}});return elements.get(id)}
let finishSave,finishMotion,motions=0,quiet=false,rejectSave;
const checkbox={innerHTML:'',attributes:{},setAttribute(k,v){this.attributes[k]=v}};
const status={textContent:''};
const card={dataset:{assignmentId:'1'},classList:classes(),getClientRects:()=>[{}],contains:()=>false,
 querySelector:selector=>selector==='[data-complete]'?checkbox:status,
 animate(){motions++;return {finished:new Promise(resolve=>{finishMotion=resolve})}}};
const context=vm.createContext({console,Intl,Date,Promise,Map,Set,setTimeout:()=>1,clearTimeout(){},
 window:{APP_CONFIG:{},matchMedia:()=>({matches:quiet})},document:{activeElement:null,getElementById:element,querySelectorAll:selector=>selector==='[data-assignment-id]'?[card]:[],addEventListener(){}}});
vm.runInContext(fs.readFileSync(__dirname+'/priorities.js','utf8'),context);
vm.runInContext([...fs.readFileSync(__dirname+'/index.html','utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1],context);
context.testBackend={save:()=>new Promise((resolve,reject)=>{finishSave=resolve;rejectSave=reject})};
vm.runInContext("backend=testBackend;user={id:'private-user'};S.ready=true;S.A=[{id:'1',n:'Test assignment',c:'IS401',d:TODAY,t:30,p:2,g:5}];S.done={'1':false}",context);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
 const save=vm.runInContext("tog('1')",context);
 assert.equal(card.classList.contains('completion-confirmed'),false);
 assert.equal(vm.runInContext('S.done[1]',context),false);
 finishSave(true);await tick();
 assert.equal(card.classList.contains('completion-confirmed'),true);
 assert.equal(checkbox.attributes['aria-checked'],'true');
 assert.match(status.textContent,/Completed/);
 assert.equal(vm.runInContext('S.done[1]',context),false,'leave the confirmed check visible before regrouping');
 assert.equal(vm.runInContext('S.saving.has("1")',context),true);
 finishMotion();await save;
 assert.equal(vm.runInContext('S.done[1]',context),true);
 assert.match(element('list').innerHTML,/completed-heading/);
 assert.match(element('toast').innerHTML,/moved to Completed/);
 assert.equal(element('signout').disabled,false);
 // A failed save must retain the task and show no green success state or toast.
 card.classList.remove('completion-confirmed');element('toast').innerHTML='';
 vm.runInContext('S.done[1]=false',context);
 const failed=vm.runInContext("tog('1')",context);rejectSave(Error('Connection unavailable'));await failed;
 assert.equal(vm.runInContext('S.done[1]',context),false);
 assert.equal(card.classList.contains('completion-confirmed'),false);
 assert.equal(element('toast').innerHTML,'');assert.match(element('sync-error').textContent,/Connection unavailable/);
 // Reduced motion skips animation, but preserves the same confirmed destination.
 quiet=true;const before=motions;const reduced=vm.runInContext("tog('1')",context);finishSave(true);await reduced;
 assert.equal(motions,before);assert.equal(vm.runInContext('S.done[1]',context),true);
 // A response arriving after the account changed cannot complete the old user's task.
 card.classList.remove('completion-confirmed');vm.runInContext('S.done[1]=false',context);
 const stale=vm.runInContext("tog('1')",context);vm.runInContext('user=null',context);finishSave(true);await stale;
 assert.equal(vm.runInContext('S.done[1]',context),false);assert.equal(card.classList.contains('completion-confirmed'),false);
 console.log('PASS: confirmed green feedback precedes regrouping; failed/stale saves never succeed; reduced motion skips animation.');
})().catch(error=>{console.error(error);process.exitCode=1});
