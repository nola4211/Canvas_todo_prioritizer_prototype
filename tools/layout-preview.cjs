// Optional local visual-review fixture. Never calls Supabase or an AI provider.
// Run: node tools/layout-preview.cjs [port]; open /layout-fixture or /signed-out.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const fixture = `
user={id:'layout-fixture'};
const fixtureSave=async()=>{await new Promise(resolve=>setTimeout(resolve,250));if(window.layoutSaveFailure)throw Error('Preview connection unavailable')};
backend={
 async load(){await fixtureSave();return S.A.slice()},
 async loadLists(){return S.lists.slice(2)},
 async loadListAssignments(){return S.memberships.slice()},
 async loadUserPriorities(){return [{scope:'settings',rules:S.userRules,ignore_user_rules:false}]},
 async saveUserPriorities(scope,rules,ignore_user_rules){await fixtureSave();return {rules,ignore_user_rules}},
 async saveListPriorities(id,priority_rules,ignore_user_rules){await fixtureSave();return {id,priority_rules,ignore_user_rules}},
 async createAssignment(input){await fixtureSave();return {...input,id:'fixture-'+Date.now(),persisted:false}}
};
db={auth:{signOut:async()=>({error:null})}};
S.ready=S.listsReady=S.prioritiesReady=true;
const fixtureDate=TODAY;
S.lists.push(...Array.from({length:8},(_,i)=>({id:'fixture-'+i,name:'Study planning list '+(i+1),priority_rules:[]})));
S.A=[
 {id:'fixture-1',n:'Prepare the product presentation',description:'Review stakeholder feedback and prepare the next iteration.',c:'IS 401',d:fixtureDate,t:90,p:3,g:15},
 {id:'fixture-2',n:'LongAssignmentTitleWithoutSpaces'.repeat(6),description:'Long titles should wrap inside the card, keeping every action reachable.',c:'IS 403',d:fixtureDate,t:45,p:2,g:null},
 {id:'fixture-3',n:'Read the next chapter',description:'A longer description with a URL-like string: '+ 'reading-reference-'.repeat(14),c:'IS 401',d:fixtureDate,t:30,p:1,g:5},
 {id:'fixture-4',n:'Completed practice assignment',c:'IS 402',d:fixtureDate,t:20,p:0,g:5}
];
S.done={'fixture-4':true};
for(const list of S.lists.slice(2))S.memberships.push({list_id:list.id,assignment_id:'fixture-1'});
showSession();$('sync-status').textContent='Layout preview - synthetic data; no database connection';home();
chatClient={
 async open(){
  $('chat-history').innerHTML='<option>Sample planning conversation</option>';
  $('cb').innerHTML='<div class="msg bot">This is a synthetic conversation for checking layout. Your upcoming assignments appear in your task list.</div><div class="msg me">Can you help me plan my work for today?</div><div class="msg bot">Start with your highest-priority assignment, then leave time for your reading. '+ 'ReferenceWithoutSpaces'.repeat(12)+'</div>';
  $('chat-status').textContent='Layout fixture only - messages are not sent';
 },newChat(){return this.open()},selectChat(){return this.open()},send(){},reset(){}
};
`;
http.createServer((req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1');
  const fixtureRoute=['/layout-fixture','/signed-out'].includes(url.pathname);
  const file=path.resolve(root,'.'+(fixtureRoute||url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
  if(!file.startsWith(root+path.sep)||!['.html','.js','.css'].includes(path.extname(file))){res.writeHead(404);res.end();return}
  let content=fs.readFileSync(file,'utf8');
  if(fixtureRoute){
   content=content.replace('<script src="config.js"></script>','').replace(/<script src="https:\/\/cdn.jsdelivr.net\/npm\/@supabase[^<]+<\/script>/,'');
   content=content.replace(/home\(\);\s*boot\(\);\s*<\/script>/,url.pathname==='/signed-out'?'home();showSession();</script>':'window.layoutSaveFailure='+JSON.stringify(url.searchParams.get('save')==='fail')+';'+fixture+'\n</script>');
  }
  res.writeHead(200,{'Content-Type':path.extname(file)==='.html'?'text/html; charset=utf-8':path.extname(file)==='.css'?'text/css':'text/javascript','Cache-Control':'no-store'});res.end(content);
 }catch{res.writeHead(404);res.end('Not found')}
}).listen(Number(process.argv[2]||4185),'127.0.0.1',()=>console.log('Layout review: http://127.0.0.1:'+(process.argv[2]||4185)+'/layout-fixture'));
