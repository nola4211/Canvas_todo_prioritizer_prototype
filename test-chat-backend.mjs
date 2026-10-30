import assert from 'node:assert/strict';
import {createAIHandler,prepareDraft,assignmentResponseFormat} from './supabase/functions/study-assistant/index.ts';
const env={SUPABASE_URL:'https://database.test',SUPABASE_ANON_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'server',OPENAI_API_KEY:'secret'};
const turn={chatId:'1',requestId:'11111111-1111-4111-8111-111111111111',message:'What should I study?'};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status});
function setup(options={}){
 const calls=[];
 const handler=createAIHandler({...env,...options.env},async(url,init={})=>{
  calls.push({url,init});
  if(url.endsWith('/auth/v1/user'))return json({id:'owner'},options.authStatus||200);
  if(url.includes('begin_ai_turn'))return options.beginError?json({message:options.beginError},400):json(options.cached?{cached:true,reply:'Already saved'}:{cached:false});
  if(url.includes('finish_ai_turn'))return options.saveError&&JSON.parse(init.body).p_reply?json({message:'private database details'},500):new Response(null,{status:204});
  if(url==='https://api.openai.com/v1/responses')return options.providerError?json({error:{code:options.providerError==='credits'?'credit_balance_exhausted':'rate_limit_exceeded',message:'secret diagnostic'}},429):json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({reply:'Study the exam first.',draft:options.draft||null})}]}]});
  if(url.includes('/message?'))return json([{role:'assistant',message:'Earlier advice'},{role:'user',message:'Earlier question'}]);
  if(url.includes('/assignments?'))return json([{name:'Exam',percentage_of_grade:25}]);
  return json([]);
 });
 const request=(body=turn,headers={})=>handler(new Request('https://edge.test',{method:'POST',headers:{origin:'http://127.0.0.1:4183',authorization:'Bearer user-token',...headers},body:JSON.stringify(body)}));
 return {calls,request};
}
{
 const s=setup();const result=await s.request();assert.equal(result.status,200);assert.equal((await result.json()).reply,'Study the exam first.');
 const ai=s.calls.find(c=>c.url.includes('api.openai.com'));const payload=JSON.parse(ai.init.body);
 assert.equal(payload.store,false);assert.equal(payload.model,'gpt-6-luna');assert.match(payload.instructions,/Exam/);assert.deepEqual(payload.input.map(x=>x.content),['Earlier question','Earlier advice',turn.message]);
 for(const c of s.calls.filter(c=>c.url.includes('/rest/v1/'))){assert.equal(c.init.headers.Authorization,c.url.includes('finish_ai_turn')?'Bearer server':'Bearer user-token')}
 assert.equal(JSON.parse(s.calls.at(-1).init.body).p_reply,'Study the exam first.');
}
for(const [options,body,headers,status] of [
 [{authStatus:401},turn,{},401],[{env:{OPENAI_API_KEY:''}},turn,{},503],[{}, {...turn,message:' '},{},400],
 [{},turn,{origin:'https://evil.test'},403],[{},turn,{authorization:''},401],
 [{beginError:'Conversation unavailable'},turn,{},409],[{beginError:'Hourly message limit reached. Try again later.'},turn,{},429]
]){const s=setup(options);assert.equal((await s.request(body,headers)).status,status);assert.ok(!s.calls.some(c=>c.url.includes('api.openai.com')))}
{
 const s=setup({cached:true});assert.equal((await s.request()).status,200);assert.ok(!s.calls.some(c=>c.url.includes('api.openai.com')));
}
for(const options of [{providerError:true},{providerError:'credits'},{saveError:true}]){
 const s=setup(options);const r=await s.request();assert.equal(r.status,502);const text=await r.text();assert.doesNotMatch(text,/private database|secret diagnostic/);if(options.providerError==='credits')assert.match(text,/usage credit/);assert.equal(JSON.parse(s.calls.at(-1).init.body).p_reply,null);
}
console.log('Chat backend checks passed: auth, privacy headers, context, history, caching, limits, provider failure, and save failure.');

const today=new Date().toLocaleDateString('sv-SE',{timeZone:'America/Denver'});
const complete={name:'Exam',class_name:'IS 401',due_date:today,estimated_minutes:60,time_source:'student',estimate_allowed:false,optional:false,percentage_of_grade:null,grade_weight_answered:true};
assert.equal(prepareDraft(complete,today).draft.status,'review');
for(const patch of [{name:null},{class_name:null},{due_date:'2026-02-30'},{estimated_minutes:null},{optional:null},{grade_weight_answered:false},{percentage_of_grade:101},{time_source:'ai_estimate',estimate_allowed:false}])assert.equal(prepareDraft({...complete,...patch},today).draft.status,'collecting');
assert.equal(prepareDraft({...complete,time_source:'ai_estimate',estimate_allowed:true},today).draft.status,'review');
assert.match(prepareDraft({...complete,grade_weight_answered:false},today).reply,/I don’t know/);
assert.equal(assignmentResponseFormat.strict,true);
{
 const s=setup({draft:complete});const r=await s.request();assert.equal(r.status,200);
 const finish=JSON.parse(s.calls.at(-1).init.body);assert.equal(finish.p_draft.status,'review');assert.equal(finish.p_draft.percentage_of_grade,null);
 assert.ok(!s.calls.some(c=>c.url.includes('create_saved_assignment')||c.url.includes('confirm_ai_assignment')));
}
console.log('PASS: complete/partial drafts, permission to estimate, unknown grade weight, strict output, and no AI-side assignment writes.');
