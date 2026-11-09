const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/index.html','utf8').match(/async function disconnectAgent\(id\)\{[\s\S]*?\n\}/)?.[0];
assert.ok(source,'the actual app disconnect handler is available');
function fixture(options={}){
 const calls=[],messages=[],status={textContent:''};
 const grant={id:'grant-1',client_id:'registered-client',client_name:'Test agent'};
 const context=vm.createContext({
  S:{agentGrants:[grant],agentSaving:null},confirm:()=>options.confirm!==false,
  renderAgentGrants(){},toast:message=>messages.push(message),$:()=>status,
  sessionBackend:{async revokeAgentGrant(id){calls.push(['app',id]);if(options.wait)await options.wait;if(options.appError)throw Error('App revoke failed');}},
  db:{auth:{oauth:{async revokeGrant(input){
   calls.push(['provider',input]);assert.equal(typeof input,'object');assert.equal(input.clientId,'registered-client');
   if(options.providerThrow)throw Error('Network failure');
   return options.providerError?{error:{message:'Provider unavailable'}}:{error:null};
  }}}},
 });
 vm.runInContext(source,context);
 return {context,calls,messages,status};
}
(async()=>{
 const success=fixture();await success.context.disconnectAgent('grant-1');
 assert.deepEqual(success.calls.map(call=>call[0]),['app','provider'],'app access must be revoked before provider cleanup');
 assert.equal(success.context.S.agentGrants.length,0);assert.deepEqual(success.messages,['Agent disconnected']);assert.equal(success.context.S.agentSaving,null);
 const partial=fixture({providerError:true});await partial.context.disconnectAgent('grant-1');
 assert.equal(partial.context.S.agentGrants.length,0,'provider failure must not restore app access');assert.match(partial.messages[0],/disconnected in the app.*could not revoke/);
 const thrown=fixture({providerThrow:true});await thrown.context.disconnectAgent('grant-1');
 assert.equal(thrown.context.S.agentGrants.length,0);assert.match(thrown.messages[0],/Network failure/);
 const failed=fixture({appError:true});await failed.context.disconnectAgent('grant-1');
 assert.equal(failed.context.S.agentGrants.length,1);assert.equal(failed.calls.length,1,'provider revoke is not attempted after an app-revoke failure');assert.match(failed.status.textContent,/Could not disconnect/);assert.equal(failed.context.S.agentSaving,null);
 const cancelled=fixture({confirm:false});await cancelled.context.disconnectAgent('grant-1');assert.equal(cancelled.calls.length,0);
 let release;const wait=new Promise(resolve=>{release=resolve});const repeated=fixture({wait});
 const first=repeated.context.disconnectAgent('grant-1');await repeated.context.disconnectAgent('grant-1');assert.equal(repeated.calls.length,1,'repeated clicks cannot duplicate in-flight revocations');release();await first;assert.equal(repeated.calls.length,2);
 console.log('PASS: actual disconnect handler uses the current SDK options, revokes app access first, handles partial failures and cancellation, and prevents duplicate requests.');
})().catch(error=>{console.error(error);process.exitCode=1});
