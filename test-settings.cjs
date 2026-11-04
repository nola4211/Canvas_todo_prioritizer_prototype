const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

// Backend checks: missing rows use defaults, saved rows round-trip, and invalid values never reach Supabase.
require('./priorities.js');
require('./backend.js');
let savedRow=null,failSave=false;
const client={from(table){assert.equal(table,'user_settings');let patch=null;
 const query={select(){return query},upsert(value){patch={...value};return query},single(){return execute(true)},then(resolve,reject){return execute(false).then(resolve,reject)}};
 async function execute(single){
  if(failSave)return {data:null,error:{message:'Network unavailable'}};
  if(patch)savedRow={...patch};
  return {data:single?(savedRow&&{...savedRow}):(savedRow?[{...savedRow}]:[]),error:null};
 }
 return query;
}};

(async()=>{
 const adapter=globalThis.CanvasBackend.create(client,['1']);
 assert.deepEqual(await adapter.loadUserSettings(),{push_notifications:true,sync_with_canvas:true,dark_mode:false});
 savedRow={push_notifications:false,sync_with_canvas:true,dark_mode:true};
 assert.deepEqual(await adapter.loadUserSettings(),savedRow);
 assert.deepEqual(await adapter.saveUserSettings({push_notifications:true,sync_with_canvas:false,dark_mode:true}),{push_notifications:true,sync_with_canvas:false,dark_mode:true});
 await assert.rejects(adapter.saveUserSettings({push_notifications:'yes'}),/turned on or off/);

 // Page checks: wait for confirmation, apply the saved theme, preserve values on failure, and clear on sign-out.
 const elements=new Map();
 function element(id){if(!elements.has(id))elements.set(id,{value:'',checked:false,dataset:{},innerHTML:'',textContent:'',hidden:false,disabled:false,
  classList:{contains:()=>false,add(){},remove(){},toggle(){}},addEventListener(){}});return elements.get(id)}
 const settingControls=[];
 const documentElement={dataset:{},removeAttribute(name){if(name==='data-theme')delete this.dataset.theme}};
 const context=vm.createContext({console,Date,Intl,setTimeout,clearTimeout,window:{APP_CONFIG:{}},
  document:{documentElement,getElementById:element,querySelectorAll:selector=>selector==='[data-user-setting], #settings-priority-button'?settingControls:[],addEventListener(){}}});
 vm.runInContext(fs.readFileSync(__dirname+'/priorities.js','utf8'),context);
 const inline=[...fs.readFileSync(__dirname+'/index.html','utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
 vm.runInContext(inline,context);
 const run=code=>vm.runInContext(code,context);
 let releaseSave=null,uiFail=false;
 context.testBackend={
  async loadUserSettings(){return {push_notifications:false,sync_with_canvas:true,dark_mode:true}},
  async saveUserSettings(value){if(uiFail)throw new Error('Network unavailable');await new Promise(resolve=>releaseSave=()=>resolve({...value}));return {...value}}
 };
 run("backend=testBackend;user={id:'demo'};S.settingsReady=true;S.userSettings={push_notifications:true,sync_with_canvas:true,dark_mode:false}");
 const dark=element('dark-setting');dark.dataset.userSetting='dark_mode';dark.checked=true;settingControls.push(dark);
 context.testInput=dark;
 const pending=run('changeUserSetting(testInput)');
 assert.equal(dark.checked,false);assert.equal(run('S.settingsSaving'),true);assert.equal(dark.disabled,true);
 releaseSave();await pending;
 assert.equal(run('S.userSettings.dark_mode'),true);assert.equal(documentElement.dataset.theme,'dark');assert.equal(dark.checked,true);assert.equal(dark.disabled,false);

 const push=element('push-setting');push.dataset.userSetting='push_notifications';push.checked=false;settingControls.push(push);context.testInput=push;
 uiFail=true;await run('changeUserSetting(testInput)');
 assert.equal(run('S.userSettings.push_notifications'),true);assert.equal(push.checked,true);assert.match(element('settings-message').textContent,/Could not save/);

 uiFail=false;await run('loadSavedUserSettings(loadVersion)');
 assert.equal(run('S.userSettings.push_notifications'),false);assert.equal(run('S.userSettings.dark_mode'),true);assert.equal(documentElement.dataset.theme,'dark');
 run('resetUserSettings()');
 assert.equal(run('S.settingsReady'),false);assert.equal(documentElement.dataset.theme,undefined);
 console.log('PASS: user setting defaults, validation, owner-row read/write behavior, confirmed saves, failure rollback, refresh loading, theme application, and sign-out clearing.');
})().catch(error=>{console.error(error);process.exitCode=1});
