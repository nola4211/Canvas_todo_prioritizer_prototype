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
 async save(id,previous,next){await fixtureSave();const task=S.A.find(row=>row.id===id);if(!task||!!S.done[id]!==previous)throw Error('Preview save conflict');task.completed=next;return next},
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
const nextSessionDate=new Date(fixtureDate+'T12:00:00Z');nextSessionDate.setUTCDate(nextSessionDate.getUTCDate()+1);
const nextSessionDay=nextSessionDate.toISOString().slice(0,10);
const toFixtureIso=(local,zone='America/Denver')=>CanvasStudySessions.toIso(local,zone,CanvasStudySessions.offsetOptions(local,zone)[0]);
S.sessions=[
 {id:'fixture-session-1',assignment_id:'fixture-1',starts_at:toFixtureIso(fixtureDate+'T10:00'),ends_at:toFixtureIso(fixtureDate+'T11:00'),timezone:'America/Denver',version:1,cancelled_at:null,assignment_title:'Prepare the product presentation'},
 {id:'fixture-session-2',assignment_id:'fixture-2',starts_at:toFixtureIso(fixtureDate+'T23:30'),ends_at:toFixtureIso(nextSessionDay+'T00:30'),timezone:'America/Denver',version:1,cancelled_at:null,assignment_title:'LongAssignmentTitleWithoutSpaces'.repeat(6)}
];
sessionBackend={
 async loadStudySessions(){return S.sessions.slice()},
 async listAgentGrants(){return [{id:'fixture-agent-grant',client_id:'synthetic-preview-client',client_name:'Synthetic Preview Agent',approved_at:'2026-11-05T12:00:00Z'}]}
};
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
  const consentFixture=url.pathname==='/oauth-consent-preview';
  const routedPath=consentFixture?'/oauth-consent.html':fixtureRoute||url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname);
  const file=path.resolve(root,'.'+routedPath);
  if(!file.startsWith(root+path.sep)||!['.html','.js','.css'].includes(path.extname(file))){res.writeHead(404);res.end();return}
  let content=fs.readFileSync(file,'utf8');
  if(consentFixture){
   const mock=`window.APP_CONFIG={supabaseUrl:'https://preview.invalid',publishableKey:'preview-only'};window.supabase={createClient(){return {auth:{getSession:async()=>({data:{session:{user:{id:'synthetic-preview-user'}}},error:null}),oauth:{getAuthorizationDetails:async(id)=>({data:{authorization_id:id,client:{id:'synthetic-preview-client',name:'Synthetic Preview Agent'},scope:'openid profile'},error:null})}}}}};`;
   content=content.replace('<script src="config.js"></script>','').replace(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase[^<]+<\/script>/,'');
   content=content.replace(/<script>\s*'use strict';/,`<script>\n${mock}\n'use strict';`);
  }
  if(fixtureRoute){
   content=content.replace('<script src="config.js"></script>','').replace(/<script src="https:\/\/cdn.jsdelivr.net\/npm\/@supabase[^<]+<\/script>/,'');
   const previewIcons='<style>.fi::before{font-family:system-ui,sans-serif!important}.fi-rr-angle-down::before{content:"↓"!important}.fi-rr-angle-left::before{content:"←"!important}.fi-rr-angle-right::before{content:"→"!important}.fi-rr-angle-small-down::before{content:"⌄"!important}.fi-rr-angle-up::before{content:"↑"!important}.fi-rr-calendar::before{content:"▦"!important}.fi-rr-calendar-arrow-up::before{content:"↗"!important}.fi-rr-chart-histogram::before{content:"▥"!important}.fi-rr-check::before{content:"✓"!important}.fi-rr-clock::before{content:"◷"!important}.fi-rr-comment-alt-medical::before{content:"✉"!important}.fi-rr-cross::before{content:"×"!important}.fi-rr-file-edit::before{content:"✎"!important}.fi-rr-flag::before{content:"⚑"!important}.fi-rr-graduation-cap::before{content:"♧"!important}.fi-rr-list::before{content:"≡"!important}.fi-rr-menu-burger::before{content:"☰"!important}.fi-rr-paper-plane::before{content:"➤"!important}.fi-rr-percentage::before{content:"%"!important}.fi-rr-plus::before{content:"+"!important}.fi-rr-refresh::before{content:"↻"!important}.fi-rr-robot::before{content:"▣"!important}.fi-rr-settings::before{content:"⚙"!important}.fi-rr-sort-alt::before{content:"↕"!important}.fi-rr-trash::before{content:"⌫"!important}.fi-rr-user::before{content:"♙"!important}</style>';
   content=content.replace('</head>',`${previewIcons}</head>`);
   const markPreview=`function markPreviewReady(){const width=Math.max(document.documentElement.scrollWidth,document.body.scrollWidth);const childOverflow=[...document.querySelectorAll('body *')].some(el=>{const overflow=getComputedStyle(el).overflowX;return el.clientWidth>0&&el.scrollWidth>el.clientWidth+1&&!['hidden','clip','auto','scroll'].includes(overflow)});document.documentElement.dataset.previewReady='true';document.documentElement.dataset.previewViewport=innerWidth+'x'+innerHeight;document.documentElement.dataset.previewHorizontalOverflow=String(width>innerWidth||childOverflow);document.documentElement.dataset.previewScrollWidth=String(width)}`;
   const screen=url.searchParams.get('screen')||'assignments';
   const screenScripts={
    assignments:'markPreviewReady();',
    calendar:'(async()=>{openCal(TODAY);await loadVisibleStudySessions();cal();markPreviewReady()})();',
    session:'(async()=>{openCal(TODAY);await loadVisibleStudySessions();cal();openStudySessionEditor();markPreviewReady()})();',
    settings:'pan(\'settings\').then(markPreviewReady);'
   };
   const selectedScreen=Object.hasOwn(screenScripts,screen)?screenScripts[screen]:screenScripts.assignments;
   const startup=url.pathname==='/signed-out'?'home();showSession();</script>':'window.layoutSaveFailure='+JSON.stringify(url.searchParams.get('save')==='fail')+';'+fixture+'\n'+markPreview+'\n'+selectedScreen+'\n</script>';
   content=content.replace(/home\(\);\s*boot\(\);\s*<\/script>/,startup);
  }
  if(consentFixture)content=content.replace('</body>','<script>setTimeout(()=>{const width=Math.max(document.documentElement.scrollWidth,document.body.scrollWidth);const childOverflow=[...document.querySelectorAll("body *")].some(el=>{const overflow=getComputedStyle(el).overflowX;return el.clientWidth>0&&el.scrollWidth>el.clientWidth+1&&!["hidden","clip","auto","scroll"].includes(overflow)});document.documentElement.dataset.previewReady=$("consent-panel").classList.contains("hidden")?"error":"true";document.documentElement.dataset.previewViewport=innerWidth+"x"+innerHeight;document.documentElement.dataset.previewHorizontalOverflow=String(width>innerWidth||childOverflow);document.documentElement.dataset.previewScrollWidth=String(width)},100)</script></body>');
  res.writeHead(200,{'Content-Type':path.extname(file)==='.html'?'text/html; charset=utf-8':path.extname(file)==='.css'?'text/css':'text/javascript','Cache-Control':'no-store'});res.end(content);
 }catch{res.writeHead(404);res.end('Not found')}
}).listen(Number(process.argv[2]||4185),'127.0.0.1',()=>console.log('Layout review: http://127.0.0.1:'+(process.argv[2]||4185)+'/layout-fixture'));
