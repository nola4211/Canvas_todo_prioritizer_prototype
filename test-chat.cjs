const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');
function element(){return {value:'',textContent:'',children:[],append(n){this.children.push(n)},replaceChildren(){this.children=[]}}}
const nodes={};const chats=[],messages=[];let fail=false,lastTurn=null,invokeCount=0;
const client={from(table){const q={select(){return q},eq(k,v){q.filter=[k,v];return q},order(){return q},limit(){return q},then(resolve){resolve({data:table==='chat'?[...chats]:messages.filter(m=>String(m.chat_ID)===q.filter[1]).slice().reverse()})}};return q},
 rpc:async()=>{const c={id:String(chats.length+1),chat_ID:chats.length+1,title:'Test chat'};chats.unshift(c);return {data:c}},
 auth:{getSession:async()=>({data:{session:{access_token:'user'}}})},
 functions:{invoke:async(name,{body})=>{invokeCount++;lastTurn=body;if(fail)return {error:{context:{json:async()=>({error:'Quota unavailable'})}}};messages.push({chat_ID:body.chatId,role:'user',message:body.message,status:'complete',request_id:body.requestId},{chat_ID:body.chatId,role:'assistant',message:'<script>untrusted reply</script>',status:'complete',request_id:body.requestId});return {data:{reply:'Saved reply'}}}}
};
const context={document:{getElementById:id=>nodes[id]??=(element()),createElement:element,createTextNode:text=>({textContent:text})},CanvasBackend:{id:String},crypto:{randomUUID:()=> '11111111-1111-4111-8111-111111111111'},Date};vm.createContext(context);vm.runInContext(fs.readFileSync('chat.js','utf8'),context);
(async()=>{
 const ui=context.CanvasChat.create(client);await ui.open();assert.equal(nodes['chat-send'].disabled,true);
 await ui.newChat();assert.equal(chats.length,1);assert.equal(nodes['chat-send'].disabled,false);
 nodes.ci.value='Help';await ui.send();assert.equal(messages.length,2);assert.equal(nodes.ci.value,'');assert.equal(nodes.cb.children[1].textContent,'<script>untrusted reply</script>');
 await ui.open();assert.equal(nodes.cb.children.length,2);
 await ui.newChat();assert.equal(nodes.cb.children.length,0);assert.equal(chats.length,2);
 fail=true;nodes.ci.value='Draft';await ui.send();const requestId=lastTurn.requestId;assert.equal(nodes.ci.value,'Draft');assert.equal(nodes['chat-status'].textContent,'Quota unavailable');assert.equal(nodes['chat-retry'].hidden,false);
 const previous=invokeCount;await ui.send();assert.equal(invokeCount,previous);
 fail=false;await ui.send(true);assert.equal(lastTurn.requestId,requestId);assert.equal(nodes.cb.children.length,2);
 ui.reset();assert.equal(nodes.cb.children.length,1);assert.equal(nodes['chat-history'].value,'');assert.equal(nodes.ci.value,'');assert.equal(nodes['chat-send'].disabled,true);
 console.log('PASS: new chat, saved history, separate conversations, safe text rendering, failed draft preservation, retry ID reuse, and sign-out clearing.');
})().catch(error=>{console.error(error);process.exitCode=1});
