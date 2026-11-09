const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync(__dirname+'/oauth-consent.html','utf8');
const script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)?.[1];
assert.ok(script,'the consent page script exists');
new vm.Script(script);

function page(options={}){
  const {
    details={authorization_id:'authz-test',client:{id:'codex-client',name:'Codex'},scope:'openid email'},
    approve={data:{redirect_url:'https://codex.local/callback?code=private-test-code'},error:null},
    deny={data:{redirect_url:'https://codex.local/callback?error=access_denied'},error:null},
    oauthGrants=[],appGrants=[],
  }=options;
  const elements=new Map(),calls=[],redirects=[];
  let currentAppGrants=appGrants.map(row=>({...row}));
  let appGrantListCalls=0;
  function element(id){
    if(!elements.has(id))elements.set(id,{id,textContent:'',value:'',disabled:false,classList:{add(){},remove(){}},listeners:{},addEventListener(name,fn){this.listeners[name]=fn}});
    return elements.get(id);
  }
  const oauth={
    getAuthorizationDetails:async id=>{calls.push(['details',id]);return options.detailsError?{data:null,error:{message:'unavailable'}}:{data:details,error:null}},
    listGrants:async()=>{calls.push(['listGrants']);if(options.oauthGrantThrow)throw Error('network');return options.oauthGrantError?{data:null,error:{message:'offline'}}:{data:oauthGrants,error:null}},
    approveAuthorization:async(id,settings)=>{calls.push(['approve',id,settings]);if(options.approveThrow)throw Error('response lost');return options.approveError?{data:null,error:{message:'rejected'}}:approve},
    denyAuthorization:async id=>{calls.push(['deny',id]);if(options.denyThrow)throw Error('offline');return options.denyError?{data:null,error:{message:'offline'}}:deny},
    revokeGrant:async optionsArg=>{assert.equal(typeof optionsArg,'object','Supabase revokeGrant requires an options object');assert.equal(typeof optionsArg.clientId,'string','Supabase revokeGrant requires clientId');calls.push(['revokeProvider',optionsArg.clientId]);if(options.revokeThrow)throw Error('offline');return options.revokeError?{data:null,error:{message:'offline'}}:{data:{},error:null}},
  };
  const client={
    auth:{getSession:async()=>({data:{session:options.session===false?null:{access_token:'private-test-session'}},error:null}),oauth,
      signInWithPassword:async()=>({error:null})},
    rpc:async(name,args)=>{
      calls.push([name,args]);
      if(name==='student_agent_list_browser'){
        appGrantListCalls++;
        if(options.appGrantListThrow)throw Error('db unavailable');
        if(options.appGrantListFailAfterFirst&&appGrantListCalls>1)return {data:null,error:{message:'offline'}};
        if(options.appGrantListError)return {data:null,error:{message:'offline'}};
        return {data:{ok:true,data:currentAppGrants.map(row=>({...row}))},error:null};
      }
      if(name==='student_agent_revoke_client_browser'){
        if(options.appCleanupThrow)throw Error('db unavailable');
        if(options.appCleanupError)return {data:null,error:{message:'offline'}};
        currentAppGrants=currentAppGrants.filter(row=>row.client_id!==args.p_client_id);
        return {data:{ok:true,data:{client_id:args.p_client_id,active:false,changed:true}},error:null};
      }
      if(name==='student_agent_approve_browser'){
        if(options.grantLimitReached)return {data:null,error:{message:'AGENT_LIMIT_REACHED: You can connect up to 3 agents.'}};
        if(options.grantCommitOnThrow)currentAppGrants=[{id:'grant-row-new',client_id:args.p_client_id,client_name:args.p_client_name}];
        if(options.grantThrow)throw Error('response lost');
        if(options.grantError)return {data:null,error:{message:'offline'}};
        currentAppGrants=[{id:'grant-row-new',client_id:args.p_client_id,client_name:args.p_client_name}];
        return {data:{ok:true,data:{id:'grant-row-new',client_id:args.p_client_id,client_name:args.p_client_name}},error:null};
      }
      throw new Error('Unexpected RPC: '+name);
    },
  };
  const location={search:'?authorization_id=authz-test',assign:url=>redirects.push(url)};
  const supabase={createClient:()=>client};
  const context=vm.createContext({URLSearchParams,location,window:{APP_CONFIG:{supabaseUrl:'http://supabase.local',publishableKey:'local-public-key'},supabase},document:{getElementById:element},console,Object,String,Promise,Set,Array});
  vm.runInContext(script,context);
  return {elements,calls,redirects,appGrants:()=>currentAppGrants};
}

async function settle(){for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve))}
async function run(pageState,button){await settle();await pageState.elements.get(button).listeners.click();await settle()}
const active=(clientId,name=clientId)=>({id:'existing-'+clientId,client_id:clientId,client_name:name});

(async()=>{
  const allowed=page();
  await settle();
  assert.equal(allowed.elements.get('client-name').textContent,'Codex');
  await allowed.elements.get('allow').listeners.click();
  assert.deepEqual(allowed.calls.map(call=>call[0]),['details','student_agent_list_browser','approve','student_agent_approve_browser']);
  assert.equal(allowed.calls.find(call=>call[0]==='approve')[2].skipBrowserRedirect,true);
  assert.deepEqual(allowed.redirects,['https://codex.local/callback?code=private-test-code']);

  const denied=page();
  await run(denied,'deny');
  assert.deepEqual(denied.calls.map(call=>call[0]),['details','deny']);
  assert.deepEqual(denied.redirects,['https://codex.local/callback?error=access_denied']);

  const atLimit=page({grantLimitReached:true});
  await run(atLimit,'allow');
  assert.deepEqual(atLimit.redirects,[],'a fourth connection never receives a callback');
  assert.match(atLimit.elements.get('error').textContent,/connection limit has been reached/);
  assert.ok(atLimit.calls.some(call=>call[0]==='student_agent_revoke_client_browser'));
  assert.ok(atLimit.calls.some(call=>call[0]==='revokeProvider'),'provider consent is cleaned up when the app connection limit rejects approval');

  for(const failure of [{approveError:true},{approveThrow:true}]){
    const prior=active('codex-client','Codex');
    const failed=page({...failure,appGrants:[prior]});
    await run(failed,'allow');
    assert.ok(!failed.calls.some(call=>call[0]==='student_agent_approve_browser'),'provider rejection/throw never creates or reactivates an app grant');
    assert.ok(!failed.calls.some(call=>call[0]==='revokeProvider'),'provider rejection does not revoke pre-existing provider authorization');
    assert.deepEqual(failed.appGrants(),[prior],'pre-existing active app grant remains untouched');
    assert.deepEqual(failed.redirects,[]);
    assert.match(failed.elements.get('error').textContent,/previous app approval was left unchanged/);
  }

  const providerResponseLost=page({approveThrow:true});
  await run(providerResponseLost,'allow');
  assert.ok(!providerResponseLost.calls.some(call=>call[0]==='student_agent_approve_browser'));
  assert.deepEqual(providerResponseLost.redirects,[]);
  assert.match(providerResponseLost.elements.get('error').textContent,/may have recorded sign-in consent if its response was lost/);

  const grantResponseLost=page({grantThrow:true,grantCommitOnThrow:true});
  await run(grantResponseLost,'allow');
  assert.deepEqual(grantResponseLost.redirects,['https://codex.local/callback?code=private-test-code'],'readback resolves a lost app-grant response before redirecting');
  assert.ok(!grantResponseLost.calls.some(call=>call[0]==='revokeProvider'));

  const cleanupSucceeded=page({grantError:true});
  await run(cleanupSucceeded,'allow');
  assert.ok(cleanupSucceeded.calls.some(call=>call[0]==='student_agent_revoke_client_browser'&&call[1].p_client_id==='codex-client'));
  assert.ok(cleanupSucceeded.calls.some(call=>call[0]==='revokeProvider'&&call[1]==='codex-client'));
  assert.deepEqual(cleanupSucceeded.redirects,[]);
  assert.equal(cleanupSucceeded.appGrants().length,0);
  assert.match(cleanupSucceeded.elements.get('error').textContent,/app grant was confirmed inactive and the provider sign-in grant was revoked/);

  const responseLostCleanupSucceeded=page({grantThrow:true,grantCommitOnThrow:true,appGrantListFailAfterFirst:true});
  await run(responseLostCleanupSucceeded,'allow');
  assert.deepEqual(responseLostCleanupSucceeded.redirects,[]);
  assert.equal(responseLostCleanupSucceeded.appGrants().length,0,'owner-checked client cleanup deactivates a committed grant after readback fails');
  assert.match(responseLostCleanupSucceeded.elements.get('error').textContent,/app grant was confirmed inactive/);

  const cleanupFailed=page({grantThrow:true,grantCommitOnThrow:true,appGrantListFailAfterFirst:true,appCleanupError:true,revokeError:true});
  await run(cleanupFailed,'allow');
  assert.deepEqual(cleanupFailed.redirects,[]);
  assert.ok(cleanupFailed.calls.some(call=>call[0]==='student_agent_revoke_client_browser'));
  assert.ok(cleanupFailed.calls.some(call=>call[0]==='revokeProvider'));
  assert.equal(cleanupFailed.appGrants().length,1,'failed cleanup preserves the unconfirmed row in the test to expose possible active access');
  assert.match(cleanupFailed.elements.get('error').textContent,/app grant may still be active/);
  assert.match(cleanupFailed.elements.get('error').textContent,/App-grant cleanup and provider-grant revocation both failed/);
  assert.doesNotMatch(cleanupFailed.elements.get('error').textContent,/approval was withdrawn/);

  const alreadyAuthorized=page({
    details:{redirect_url:'https://codex.local/callback?code=previously-approved'},
    oauthGrants:[{client_id:'codex-client',client_name:'Codex',scopes:['openid','email']}],
    appGrants:[active('codex-client','Codex')],
  });
  await settle();
  assert.deepEqual(alreadyAuthorized.redirects,['https://codex.local/callback?code=previously-approved'],'pre-existing provider consent redirects only when every current OAuth client has an active app approval');
  assert.ok(!alreadyAuthorized.calls.some(call=>call[0]==='student_agent_approve_browser'));

  const appConsentForPriorAuth=page({
    details:{redirect_url:'https://codex.local/callback?code=previously-approved'},
    oauthGrants:[{client_id:'codex-client',client_name:'Codex',scopes:['openid','email']}],
  });
  await settle();
  assert.deepEqual(appConsentForPriorAuth.redirects,[],'unmatched prior provider authorization does not bypass app consent');
  assert.equal(appConsentForPriorAuth.elements.get('client-name').textContent,'Codex');
  assert.match(appConsentForPriorAuth.elements.get('scope-note').textContent,/already has sign-in consent/);
  await appConsentForPriorAuth.elements.get('allow').listeners.click();
  assert.ok(!appConsentForPriorAuth.calls.some(call=>call[0]==='approve'),'previously approved provider request is not approved a second time');
  assert.ok(appConsentForPriorAuth.calls.some(call=>call[0]==='student_agent_approve_browser'));
  assert.deepEqual(appConsentForPriorAuth.redirects,['https://codex.local/callback?code=previously-approved']);

  // The real Supabase response nests client identity under `client`.
  const nestedAuthorized=page({details:{redirect_url:'https://codex.local/callback?code=nested-client'},oauthGrants:[{client:{id:'codex-client',name:'Codex'},scopes:['email']}],appGrants:[active('codex-client','Codex')]});
  await settle();
  assert.deepEqual(nestedAuthorized.redirects,['https://codex.local/callback?code=nested-client']);
  const nestedUnapproved=page({details:{redirect_url:'https://codex.local/callback?code=nested-client'},oauthGrants:[{client:{id:'codex-client',name:'Codex'},scopes:['email']}]});
  await settle();
  assert.deepEqual(nestedUnapproved.redirects,[],'nested provider identity still requires app consent');
  await run(nestedUnapproved,'allow');
  assert.deepEqual(nestedUnapproved.redirects,['https://codex.local/callback?code=nested-client']);

  const priorCancelled=page({details:{redirect_url:'https://codex.local/callback?code=previously-approved'},oauthGrants:[{client_id:'codex-client',client_name:'Codex'}]});
  await run(priorCancelled,'deny');
  assert.ok(priorCancelled.calls.some(call=>call[0]==='revokeProvider'&&call[1]==='codex-client'));
  assert.deepEqual(priorCancelled.redirects,[]);
  assert.ok(!priorCancelled.calls.some(call=>call[0]==='student_agent_approve_browser'));
  assert.match(priorCancelled.elements.get('status').textContent,/earlier sign-in grant was revoked/);

  const priorCleanupFailed=page({details:{redirect_url:'https://codex.local/callback?code=previously-approved'},oauthGrants:[{client_id:'codex-client',client_name:'Codex'}],revokeError:true});
  await run(priorCleanupFailed,'deny');
  assert.deepEqual(priorCleanupFailed.redirects,[]);
  assert.match(priorCleanupFailed.elements.get('error').textContent,/provider grant may remain/);

  const ambiguousPrior=page({
    details:{redirect_url:'https://client.local/callback?code=previously-approved'},
    oauthGrants:[{client_id:'claude-client',client_name:'Claude'},{client_id:'codex-client',client_name:'Codex'}],
    appGrants:[active('claude-client','Claude')],
  });
  await settle();
  assert.deepEqual(ambiguousPrior.redirects,[],'ambiguous prior provider consent fails closed');
  assert.match(ambiguousPrior.elements.get('error').textContent,/cannot match it to one agent safely/);

  const listFailure=page({appGrantListError:true});
  await run(listFailure,'allow');
  assert.ok(!listFailure.calls.some(call=>call[0]==='approve'),'approval is not sent when existing app permission cannot be checked');
  assert.deepEqual(listFailure.redirects,[]);

  const invalidCallback=page({approve:{data:{redirect_url:''},error:null}});
  await run(invalidCallback,'allow');
  assert.ok(!invalidCallback.calls.some(call=>call[0]==='student_agent_approve_browser'));
  assert.deepEqual(invalidCallback.redirects,[]);
  assert.match(invalidCallback.elements.get('error').textContent,/no callback was sent/);

  const previouslyRevoked=page({approveThrow:true,appGrants:[]});
  await run(previouslyRevoked,'allow');
  assert.ok(!previouslyRevoked.calls.some(call=>call[0]==='student_agent_approve_browser'));
  assert.ok(!previouslyRevoked.calls.some(call=>call[0]==='student_agent_revoke_client_browser'));
  assert.deepEqual(previouslyRevoked.redirects,[],'a revoked client approval is not reactivated when the provider approval fails');

  console.log('PASS: consent behavior preserves existing app grants, completes Supabase approval with browser redirect skipped before app-grant activation, resolves lost responses by readback, checks and reports provider-grant cleanup, and fails closed on unmatched pre-existing authorizations.');
})().catch(error=>{console.error(error);process.exitCode=1});
