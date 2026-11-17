const assert=require('node:assert/strict');
require('./priorities.js');require('./assignment-fields.js');require('./backend.js');

const calls=[];
const client={auth:{async signUp(input){calls.push(input);return {data:{user:{id:'student-1',email:input.email},session:null},error:null}}}};

(async()=>{
 const backend=CanvasBackend.create(client,['1']);
 const pending=await backend.createAccount('  Student@Example.com  ','long-pass');
 assert.equal(pending.user.id,'student-1');assert.equal(pending.session,null);
 assert.deepEqual(calls,[{email:'student@example.com',password:'long-pass'}]);
 await assert.rejects(()=>backend.createAccount('not-an-email','long-pass'),/valid email/i);
 await assert.rejects(()=>backend.createAccount('student@example.com','short'),/8 characters/i);
 client.auth.signUp=async input=>({data:{user:{id:'student-2',email:input.email},session:{access_token:'token'}},error:null});
 const immediate=await backend.createAccount('second@example.com','long-pass');assert.equal(immediate.user.id,'student-2');assert.equal(immediate.session.access_token,'token');
 client.auth.signUp=async()=>({data:null,error:{message:'Signups not allowed for this instance'}});
 await assert.rejects(()=>backend.createAccount('student@example.com','long-pass'),/Signups not allowed/);
 const html=require('node:fs').readFileSync('index.html','utf8');
 assert.match(html,/id="create-account"[^>]*onclick="createAccount\(\)"/);assert.match(html,/backend\.createAccount/);
 assert.match(html,/Account created! Check your email/);assert.match(html,/New account passwords must have at least 8 characters/);
 console.log('PASS: email/password account creation, validation, confirmation messaging, and signup failures.');
})().catch(error=>{console.error(error);process.exitCode=1});
