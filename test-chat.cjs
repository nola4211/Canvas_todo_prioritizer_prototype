const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');
function element(){return {value:'',textContent:'',children:[],append(n){this.children.push(n)},replaceChildren(){this.children=[]}}}
const nodes={};const chats=[],messages=[];let fail=false,lastTurn=null,invokeCount=0,holdReply=false,releaseReply;
const client={from(table){const q={select(){return q},eq(k,v){q.filter=[k,v];return q},order(){return q},limit(){return q},then(resolve){resolve({data:table==='chat'?[...chats]:messages.filter(m=>String(m.chat_ID)===q.filter[1]).slice().reverse()})}};return q},
 rpc:async(name,args)=>{
   if(name==='name_ai_chat'){const title=args.p_message.split(/\s+/).slice(0,5).join(' ');const chat=chats.find(item=>String(item.id)===String(args.p_chat_id));if(chat)chat.title=title;return {data:title}}
   const c={id:String(chats.length+1),chat_ID:chats.length+1,title:'New chat',created_at:'2026-10-30T12:00:00Z'};chats.unshift(c);return {data:c};
 },
 auth:{getSession:async()=>({data:{session:{access_token:'user'}}})},
 functions:{invoke:async(name,{body})=>{invokeCount++;lastTurn=body;if(holdReply)await new Promise(resolve=>{releaseReply=resolve});if(fail)return {error:{context:{json:async()=>({error:'Quota unavailable'})}}};messages.push({chat_ID:body.chatId,role:'user',message:body.message,status:'complete',request_id:body.requestId},{chat_ID:body.chatId,role:'assistant',message:'<script>untrusted reply</script>',status:'complete',request_id:body.requestId});return {data:{reply:'Saved reply'}}}}
};
const context={document:{getElementById:id=>nodes[id]??=(element()),createElement:element,createTextNode:text=>({textContent:text})},CanvasBackend:{id:String},crypto:{randomUUID:()=> '11111111-1111-4111-8111-111111111111'},Date};vm.createContext(context);vm.runInContext(fs.readFileSync('chat.js','utf8'),context);
(async()=>{
 const ui=context.CanvasChat.create(client);await ui.open();assert.equal(nodes['chat-send'].disabled,true);
 await ui.newChat();assert.equal(chats.length,1);assert.equal(nodes['chat-send'].disabled,false);assert.equal(nodes.cb.children.length,2);assert.equal(nodes.cb.children[1].className,'sug');assert.equal(nodes.cb.children[1].children.length,4);
 nodes.cb.children[1].children[0].onclick();await new Promise(resolve=>setImmediate(resolve));assert.equal(messages.length,2);assert.equal(nodes.ci.value,'');assert.equal(nodes.cb.children[1].textContent,'<script>untrusted reply</script>');
 assert.equal(lastTurn.message,'What should I work on first?');assert.equal(chats[0].title,'What should I work on');assert.match(nodes['chat-history'].children[1].textContent,/What should I work on · Oct 30, 2026/);
 await ui.open();assert.equal(nodes.cb.children.length,2);
 await ui.newChat();assert.equal(nodes.cb.children.length,2);assert.equal(chats.length,2);
 fail=true;nodes.ci.value='Draft';await ui.send();const requestId=lastTurn.requestId;assert.equal(nodes.ci.value,'Draft');assert.equal(nodes['chat-status'].textContent,'Quota unavailable');assert.equal(nodes['chat-retry'].hidden,false);
 assert.equal(chats[0].title,'Draft');assert.match(nodes['chat-history'].children[1].textContent,/Draft · Oct 30, 2026/);
 const previous=invokeCount;await ui.send();assert.equal(invokeCount,previous);
 fail=false;holdReply=true;const pending=ui.send(true);await new Promise(resolve=>setImmediate(resolve));assert.equal(nodes['chat-retry'].hidden,true);assert.equal(nodes['chat-status'].textContent,'Thinking…');releaseReply();await pending;assert.equal(lastTurn.requestId,requestId);assert.equal(nodes.cb.children.length,2);
 messages.push({chat_ID:lastTurn.chatId,role:'assistant',message:'Created assignment: Test. Saved to Supabase.',status:'complete'});await ui.selectChat(lastTurn.chatId);assert.ok(nodes.cb.children.some(node=>node.textContent==='Assignment successfully saved!'));
 ui.reset();assert.equal(nodes.cb.children.length,1);assert.equal(nodes['chat-history'].value,'');assert.equal(nodes.ci.value,'');assert.equal(nodes['chat-send'].disabled,true);
 console.log('PASS: new chat, saved history, separate conversations, safe text rendering, failed draft preservation, retry ID reuse, and sign-out clearing.');
})().catch(error=>{console.error(error);process.exitCode=1});
