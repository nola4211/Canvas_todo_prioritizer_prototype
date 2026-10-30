// Browser-side chat state. The OpenAI key is never used here.
(function(root){
  function create(client){
    let conversations=[],selected=null,messages=[],loading=false,sending=false,version=0,retry=null;
    const el=id=>document.getElementById(id);
    function message(text,role){const node=document.createElement('div');node.className='msg '+(role==='user'?'me':'bot');node.textContent=text;return node}
    function status(text){el('chat-status').textContent=text}
    function render(){
      const select=el('chat-history');select.replaceChildren();
      const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='Choose a conversation';select.append(placeholder);
      for(const chat of conversations){const option=document.createElement('option');option.value=chat.id;option.textContent=chat.title;select.append(option)}
      select.value=selected || '';select.disabled=loading||sending;
      el('chat-new').disabled=loading||sending;el('chat-send').disabled=loading||sending||!selected;el('ci').disabled=loading||sending||!selected;
      el('chat-retry').hidden=!retry;el('chat-retry').disabled=sending||loading;
      const area=el('cb');area.replaceChildren();
      if(!selected)area.append(message('Start a new conversation to ask about your saved assignments, lists, and priorities.','assistant'));
      for(const item of messages){
        const node=message(item.message,item.role);
        if(item.status==='failed')node.append(document.createTextNode('\nReply failed. You can retry this message.'));
        if(item.status==='pending')node.append(document.createTextNode('\nReply pending. Reload or wait before retrying.'));
        area.append(node);
      }
      area.scrollTop=area.scrollHeight;
    }
    async function query(result){const {data,error}=await result;if(error)throw new Error(error.message || 'Chat database request failed.');return data}
    function reset(){version++;conversations=[];selected=null;messages=[];loading=false;sending=false;retry=null;status('');el('ci').value='';render()}
    async function selectChat(id){
      if(sending)return;
      const current=++version;selected=id || null;messages=[];retry=null;loading=true;render();status('Loading conversation…');
      try{
        if(selected){
          const rows=await query(client.from('message').select('message_ID,role,message,status,request_id,sent_at').eq('chat_ID',selected).order('message_ID',{ascending:false}).limit(100));
          if(current!==version)return;
          messages=rows.reverse();
          const last=messages[messages.length-1];
          if(last&&last.role==='user'&&last.status!=='complete')retry={requestId:last.request_id,message:last.message};
        }
        if(current===version)status('History saved in Supabase. Advice only; tasks will not be changed.');
      }catch(error){if(current===version){messages=[];status('Could not load this conversation: '+error.message)}}
      finally{if(current===version){loading=false;render()}}
    }
    async function open(){
      if(sending)return;
      const current=++version;loading=true;render();status('Loading saved conversations…');
      try{
        const rows=await query(client.from('chat').select('chat_ID,title,created_at,updated_at').order('updated_at',{ascending:false}).limit(50));
        if(current!==version)return;
        conversations=rows.map(row=>({...row,id:root.CanvasBackend.id(row.chat_ID)}));
        loading=false;
        await selectChat(conversations.some(chat=>chat.id===selected)?selected:conversations[0]?.id || null);
      }catch(error){if(current===version){loading=false;status('Could not load chat history: '+error.message);render()}}
    }
    async function newChat(){
      if(loading||sending)return;
      const current=version;loading=true;render();status('Creating conversation…');
      try{
        const title='Conversation '+new Date().toLocaleString();
        const chat=await query(client.rpc('create_ai_chat',{p_title:title}));
        if(current!==version)return;
        conversations.unshift(chat);loading=false;await selectChat(chat.id);
      }catch(error){if(current===version){loading=false;status('Could not create conversation: '+error.message);render()}}
    }
    async function send(useRetry=false){
      if(loading||sending||!selected)return;
      if(retry&&!useRetry){status('Retry the unanswered message first, or start a new conversation.');return}
      const text=useRetry?retry?.message:el('ci').value.trim();
      if(!text||text.length>2000){status('Enter a message between 1 and 2000 characters.');return}
      const turn=useRetry?retry:{requestId:crypto.randomUUID(),message:text};
      const current=version;const chatId=selected;sending=true;retry=turn;render();status('Thinking…');
      try{
        const {data:sessionData,error:sessionError}=await client.auth.getSession();
        if(sessionError||!sessionData.session)throw new Error('Sign in again before sending.');
        const {data,error}=await client.functions.invoke('study-assistant',{body:{chatId,requestId:turn.requestId,message:turn.message},headers:{Authorization:'Bearer '+sessionData.session.access_token}});
        if(error){
          let detail='The assistant could not answer. Reload or retry.';
          if(error.context){try{const body=await error.context.json();detail=body.error || detail}catch{}}
          throw new Error(detail);
        }
        if(!data||typeof data.reply!=='string'||!data.reply.trim())throw new Error('No confirmed reply was returned. Reload the conversation.');
        if(current!==version)return;
        retry=null;el('ci').value='';sending=false;
        await selectChat(chatId);
      }catch(error){if(current===version){status(error.message);sending=false;render()}}
    }
    return {open,newChat,selectChat,send,reset};
  }
  root.CanvasChat={create};
})(typeof window==='undefined'?globalThis:window);
