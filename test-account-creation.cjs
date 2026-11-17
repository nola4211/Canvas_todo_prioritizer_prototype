const assert=require('node:assert/strict');
require('./priorities.js');require('./assignment-fields.js');require('./backend.js');

const calls=[];
const client={auth:{async signUp(input){calls.push(input);return {data:{user:{id:'student-1',email:input.email},session:{access_token:'token'}},error:null}}}};

(async()=>{
 const backend=CanvasBackend.create(client,['1']);
 const created=await backend.createAccount('  Student@Example.com  ','long-pass');
 assert.equal(created.user.id,'student-1');assert.equal(created.session.access_token,'token');
 assert.deepEqual(calls,[{email:'student@example.com',password:'long-pass'}]);
 await assert.rejects(()=>backend.createAccount('not-an-email','long-pass'),/valid email/i);
 await assert.rejects(()=>backend.createAccount('student@example.com','short'),/8 characters/i);
 client.auth.signUp=async input=>({data:{user:{id:'student-2',email:input.email},session:null},error:null});
 await assert.rejects(()=>backend.createAccount('second@example.com','long-pass'),/sign-in did not start/i);
 client.auth.signUp=async()=>({data:null,error:{message:'Signups not allowed for this instance'}});
 await assert.rejects(()=>backend.createAccount('student@example.com','long-pass'),/Signups not allowed/);
 const html=require('node:fs').readFileSync('index.html','utf8');
 assert.match(html,/id="create-account"[^>]*onclick="createAccount\(\)"/);assert.match(html,/backend\.createAccount/);
 assert.match(html,/Account created!/);assert.doesNotMatch(html,/Check your email|confirm your email/i);assert.match(html,/New account passwords must have at least 8 characters/);
 console.log('PASS: immediate email/password account creation, validation, and signup failures.');
})().catch(error=>{console.error(error);process.exitCode=1});
