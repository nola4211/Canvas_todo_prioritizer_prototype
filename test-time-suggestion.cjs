const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const source=fs.readFileSync(__dirname+'/supabase/functions/study-assistant/index.ts','utf8');
 const {createAIHandler}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 let providerCalls=0,reservations=0,rateLimited=false;
 const fetchRequest=async(url,options)=>{
  if(url.endsWith('/auth/v1/user'))return Response.json({id:'a527cc80-a8d6-43d6-9a04-b62650a0d621'});
  if(url.endsWith('/rest/v1/rpc/reserve_ai_time_suggestion')){reservations++;return rateLimited?Response.json({message:'Hourly AI estimate limit reached. Try again later.'},{status:400}):new Response(null,{status:204})}
  assert.equal(url,'https://api.openai.com/v1/responses');providerCalls++;
  const payload=JSON.parse(options.body);assert.equal(payload.store,false);assert.equal(payload.text.format.name,'assignment_time_suggestion');
  return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'{"minutes":90}'}]}]});
 };
 const handle=createAIHandler({SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'public-key',SUPABASE_SERVICE_ROLE_KEY:'private-key',OPENAI_API_KEY:'server-only-key'},fetchRequest);
 const request=(body,token='demo-token')=>new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Origin:'http://127.0.0.1:4183'},body:JSON.stringify(body)});
 let response=await handle(request({action:'suggest_time',title:'Lab report'}));assert.equal(response.status,200);assert.deepEqual(await response.json(),{minutes:90});assert.equal(providerCalls,1);assert.equal(reservations,1);
 response=await handle(request({action:'suggest_time',title:'  '}));assert.equal(response.status,400);assert.equal(providerCalls,1);assert.equal(reservations,1);
 response=await handle(new Request('https://example.test',{method:'POST',body:JSON.stringify({action:'suggest_time',title:'Lab report'})}));assert.equal(response.status,401);assert.equal(providerCalls,1);
 rateLimited=true;response=await handle(request({action:'suggest_time',title:'Essay'}));assert.equal(response.status,429);assert.equal(providerCalls,1);
 console.log('PASS: authenticated AI time suggestions, bounded input, server-side rate reservation, and limit handling.');
})().catch(error=>{console.error(error);process.exitCode=1});
