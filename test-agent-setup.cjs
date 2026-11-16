const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const source=html.slice(html.indexOf('const agentSetupValues='),html.indexOf('async function loadAgentGrants()'));
assert.ok(source.includes('async function copyAgentSetup'));
const elements=new Map();let copied=[],deny=false,pending;
function element(id){if(!elements.has(id))elements.set(id,{textContent:'',focused:false,selected:false,focus(){this.focused=true},select(){this.selected=true}});return elements.get(id)}
const context=vm.createContext({$:element,esc:s=>String(s).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;'),navigator:{clipboard:{async writeText(value){if(pending)await pending;if(deny)throw Error('Copy denied');copied.push(value)}}}});
vm.runInContext(source,context);
(async()=>{
 const markup=context.agentSettingsMarkup();
 assert.ok(markup.includes('Connect your agent'));assert.ok(markup.includes("copyAgentSetup('url')"));assert.ok(markup.includes('id="agent-list"'));assert.ok(markup.includes('id="agent-status"'));assert.ok(markup.includes('readonly'));
 await context.copyAgentSetup('url');assert.equal(copied[0],'https://uowlwdwrqceklbqjcnmc.supabase.co/functions/v1/student-mcp');assert.equal(element('agent-setup-status').textContent,'Server URL copied.');
 await context.copyAgentSetup('claude');assert.equal(copied[1],'36def8b6-bb91-4f7f-93ac-1543fbc4caf6');
 await context.copyAgentSetup('codex');assert.equal(copied[2],'codex mcp login canvas-todo');
 await context.copyAgentSetup('unknown');assert.equal(copied.length,3);
 deny=true;await context.copyAgentSetup('url');assert.equal(copied.length,3);assert.ok(element('agent-mcp-url').selected);assert.match(element('agent-setup-status').textContent,/Automatic copy is unavailable/);
 deny=false;let resolve;pending=new Promise(r=>resolve=r);const old=element('agent-setup-status');const work=context.copyAgentSetup('codex');elements.delete('agent-setup-status');const current=element('agent-setup-status');resolve();await work;assert.equal(current.textContent,'');assert.notEqual(old,current);
 console.log('PASS: actual setup markup, all three copy values, unknown key, denied clipboard selection fallback, and late feedback after navigation.');
})().catch(e=>{console.error(e);process.exitCode=1});
