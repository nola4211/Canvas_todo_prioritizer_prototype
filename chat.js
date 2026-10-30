// Browser-side chat state. The OpenAI key is never used here.
(function(root){
  function create(client,options={}){
    const backend=options.backend;
    let conversations=[],selected=null,messages=[],loading=false,sending=false,version=0,retry=null,draft=null;
    const el=id=>document.getElementById(id);
    const suggestions=['What should I work on first?','Help me plan today','What is due soon?','Create a new assignment'];
    const defaultTitle=title=>/^(New chat|New conversation|Conversation\s+\d)/i.test(String(title||'').trim());
    function shortTitle(text){return String(text||'').trim().replace(/[^\p{L}\p{N}%]+/gu,' ').trim().split(/\s+/).filter(Boolean).slice(0,5).join(' ')||'New chat'}
    function message(text,role){const node=document.createElement('div');node.className='msg '+(role==='user'?'me':'bot');node.textContent=text;return node}
    function status(text){el('chat-status').textContent=text}
    function chatLabel(chat){
      const date=new Date(chat.created_at);
      const dateText=Number.isNaN(date.getTime())?'':date.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
      const storedTitle=String(chat.title||'').trim();
      const title=/^Conversation\s+\d/i.test(storedTitle)?'New chat':storedTitle.split(/\s+/).slice(0,5).join(' ')||'New chat';
      return title+(dateText?' · '+dateText:'');
    }
    async function nameChatFromFirstMessage(chatId){
      const chat=conversations.find(item=>item.id===chatId);
      const first=messages.find(item=>item.role==='user'&&item.message?.trim());
      if(!chat||!first||!defaultTitle(chat.title))return;
      chat.title=shortTitle(first.message);render();
      try{
        const title=await query(client.rpc('name_ai_chat',{p_chat_id:chatId,p_message:first.message}));
        if(typeof title==='string'){chat.title=title;render()}
      }catch{}
    }
    function renderWelcome(area){
      area.append(message('Hi! I can help you plan your work, understand your priorities, or add a new assignment. What would you like to do?','assistant'));
      const choices=document.createElement('div');choices.className='sug';
      for(const text of suggestions){const button=document.createElement('button');button.type='button';button.textContent=text;button.disabled=loading||sending;button.onclick=()=>sendSuggestion(text);choices.append(button)}
      area.append(choices);
    }
    function render(){
      const select=el('chat-history');select.replaceChildren();
      const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='Choose a chat';select.append(placeholder);
      for(const chat of conversations){const option=document.createElement('option');option.value=chat.id;option.textContent=chatLabel(chat);select.append(option)}
      select.value=selected || '';select.disabled=loading||sending;
      el('chat-new').disabled=loading||sending;el('chat-send').disabled=loading||sending||!selected;el('ci').disabled=loading||sending||!selected;
      el('chat-retry').hidden=!retry||sending||loading;el('chat-retry').disabled=sending||loading;
      const area=el('cb');area.replaceChildren();
      if(!selected)area.append(message('Select a saved chat or start a new one.','assistant'));
      else if(!messages.length&&!loading)renderWelcome(area);
      for(const item of messages){
        const friendlyText=item.role==='assistant'&&/^Created assignment: .+\. Saved to Supabase\.$/.test(item.message)?'Assignment successfully saved!':item.message;
        const node=message(friendlyText,item.role);
        if(item.status==='failed'&&!sending)node.append(document.createTextNode('\nI couldn’t finish that reply. Please try again.'));
        if(item.status==='pending'&&!sending)node.append(document.createTextNode('\nThis reply hasn’t finished yet. Please wait a moment before trying again.'));
        area.append(node);
      }
      renderDraft(area);
      area.scrollTop=area.scrollHeight;
    }
    function renderDraft(area){
      if(!draft||!['collecting','review'].includes(draft.status))return;
      const box=document.createElement('div');box.className='card';box.id='assignment-review';
      const heading=document.createElement('strong');heading.textContent=draft.status==='review'?'Review assignment':'Assignment draft';box.append(heading);
      const fields=[['Name',draft.name],['Class',draft.class_name],['Due date',draft.due_date],
        ['Estimated time',draft.estimated_minutes==null?null:draft.estimated_minutes+' minutes'+(draft.time_source==='ai_estimate'?' (AI estimate)':'')],
        ['Optional',draft.optional===null?null:draft.optional?'Yes — lowest priority':'No'],
        ['Grade weight',!draft.grade_weight_answered?null:draft.percentage_of_grade===null?'Unknown':draft.percentage_of_grade+'%']];
      for(const [label,value] of fields){const line=document.createElement('p');line.className='sub';line.textContent=label+': '+(value??'Not answered');box.append(line)}
      function button(id,text,action){const b=document.createElement('button');b.id=id;b.className='btn';b.textContent=text;b.disabled=sending||loading;b.onclick=action;box.append(b)}
      if(draft.status==='review'){
        if(draft.estimated_minutes>600){const label=document.createElement('label');const check=document.createElement('input');check.type='checkbox';check.id='chat-long-confirm';check.disabled=sending||loading;label.append(check,document.createTextNode(' I confirm this estimate is over 10 hours.'));box.append(label)}
        button('chat-create-assignment','Create assignment',confirmDraft);
        button('chat-edit-assignment','Edit details',()=>changeDraft('edit'));
      }
      button('chat-cancel-assignment','Cancel draft',()=>changeDraft('cancel'));
      area.append(box);
    }
    async function confirmDraft(){
      if(sending||loading||draft?.status!=='review'||!backend)return;
      const longConfirmed=draft.estimated_minutes<=600||el('chat-long-confirm')?.checked;
      if(!longConfirmed){status('Confirm the estimate over 10 hours before creating.');return}
      const current=version,chatId=selected,requestId=draft.request_id;
      sending=true;render();status('Saving assignment…');
      try{
        const saved=await backend.confirmAssignmentDraft(chatId,requestId,longConfirmed);
        if(current!==version)return;
        sending=false;await selectChat(chatId);
        if(version!==current+1)return;
        if(options.onSaved)await options.onSaved(saved);
      }catch(error){if(current===version){sending=false;render();status('I couldn’t confirm the save. Please reopen this chat and try again.')}}
    }
    async function changeDraft(action){
      if(sending||loading||!draft||!backend)return;
      const current=version,chatId=selected;sending=true;render();status(action==='cancel'?'Cancelling draft…':'Opening draft for changes…');
      try{
        await backend.changeAssignmentDraft(chatId,draft.request_id,action);
        if(current!==version)return;
        sending=false;await selectChat(chatId);
        if(action==='edit'){status('What would you like to change? I’ll show you the updated details before saving.');el('ci').focus()}
      }catch(error){if(current===version){sending=false;render();status('I couldn’t update your draft right now. Please try again.')}}
    }
    async function query(result){const {data,error}=await result;if(error)throw new Error(error.message || 'I couldn’t reach your saved chats.');return data}
    function reset(){version++;conversations=[];selected=null;messages=[];loading=false;sending=false;retry=null;draft=null;status('');el('ci').value='';render()}
    async function selectChat(id){
      if(sending)return;
      const current=++version;selected=id || null;messages=[];retry=null;draft=null;loading=true;render();status('Loading conversation…');
      try{
        if(selected){
          const rows=await query(client.from('message').select('message_ID,role,message,status,request_id,sent_at').eq('chat_ID',selected).order('message_ID',{ascending:false}).limit(100));
          if(current!==version)return;
          messages=rows.reverse();
          await nameChatFromFirstMessage(selected);
          if(current!==version)return;
          if(backend){const loadedDraft=await backend.loadAssignmentDraft(selected);if(current!==version)return;draft=loadedDraft;}
          const last=messages[messages.length-1];
          if(last&&last.role==='user'&&last.status!=='complete')retry={requestId:last.request_id,message:last.message};
        }
        if(current===version)status('Your chats and drafts are saved. Review the details before creating an assignment.');
      }catch(error){if(current===version){messages=[];draft=null;status('I couldn’t open this chat right now. Please try again.')}}
      finally{if(current===version){loading=false;render()}}
    }
    async function open(){
      if(sending)return;
      const current=++version;loading=true;render();status('Loading saved conversations…');
      try{
        const rows=await query(client.from('chat').select('chat_ID,title,created_at,updated_at').order('updated_at',{ascending:false}).limit(50));
        if(current!==version)return;
        conversations=rows.map(row=>({...row,id:root.CanvasBackend.id(row.chat_ID)}));
        // Older chats may still have the placeholder title. Build their display
        // names from the first student message and save the same title when possible.
        try{
          const firstMessages=await query(client.from('message').select('chat_ID,role,message,message_ID').eq('role','user').order('message_ID',{ascending:true}).limit(500));
          const seen=new Set();
          for(const item of firstMessages){
            const id=root.CanvasBackend.id(item.chat_ID);if(seen.has(id))continue;seen.add(id);
            const chat=conversations.find(value=>value.id===id);if(!chat||!defaultTitle(chat.title))continue;
            chat.title=shortTitle(item.message);
            Promise.resolve(client.rpc('name_ai_chat',{p_chat_id:id,p_message:item.message})).catch(()=>{});
          }
        }catch{}
        loading=false;
        await selectChat(conversations.some(chat=>chat.id===selected)?selected:conversations[0]?.id || null);
      }catch(error){if(current===version){loading=false;status('I couldn’t load your chats right now. Please try again.');render()}}
    }
    async function newChat(){
      if(loading||sending)return;
      const current=version;loading=true;render();status('Creating conversation…');
      try{
        const title='New chat';
        const chat=await query(client.rpc('create_ai_chat',{p_title:title}));
        if(current!==version)return;
        conversations.unshift(chat);loading=false;await selectChat(chat.id);
      }catch(error){if(current===version){loading=false;status(error.message.includes('limit')?'You’ve reached the saved chat limit. Please use an existing chat.':'I couldn’t start a new chat right now. Please try again.');render()}}
    }
    async function send(useRetry=false){
      if(loading||sending||!selected)return;
      if(retry&&!useRetry){status('Please retry your last message first, or start a new chat.');return}
      const text=useRetry?retry?.message:el('ci').value.trim();
      if(!text||text.length>2000){status('Enter a message between 1 and 2000 characters.');return}
      const turn=useRetry?retry:{requestId:crypto.randomUUID(),message:text};
      const firstMessage=!messages.some(item=>item.role==='user');
      const current=version;const chatId=selected;sending=true;retry=turn;render();status('Thinking…');
      try{
        // Name the chat as soon as its first message is sent. The title should not
        // depend on the AI service successfully finishing its reply.
        if(firstMessage){
          const chat=conversations.find(item=>item.id===chatId);if(chat){chat.title=shortTitle(turn.message);render()}
          try{
            const title=await query(client.rpc('name_ai_chat',{p_chat_id:chatId,p_message:turn.message}));
            if(chat&&typeof title==='string'){chat.title=title;render()}
          }catch{}
        }
        const {data:sessionData,error:sessionError}=await client.auth.getSession();
        if(sessionError||!sessionData.session)throw new Error('Sign in again before sending.');
        const {data,error}=await client.functions.invoke('study-assistant',{body:{chatId,requestId:turn.requestId,message:turn.message},headers:{Authorization:'Bearer '+sessionData.session.access_token}});
        if(error){
          let detail='I couldn’t finish that reply. Please try again.';
          if(error.context){try{const body=await error.context.json();detail=body.error || detail}catch{}}
          throw new Error(detail);
        }
        if(!data||typeof data.reply!=='string'||!data.reply.trim())throw new Error('Your reply isn’t ready. Please reopen this chat and try again.');
        if(current!==version)return;
        retry=null;el('ci').value='';sending=false;
        await selectChat(chatId);
      }catch(error){if(current===version){status(error.message);sending=false;render()}}
    }
    function sendSuggestion(text){if(loading||sending||!selected)return;el('ci').value=text;send()}
    return {open,newChat,selectChat,send,confirmDraft,changeDraft,reset};
  }
  root.CanvasChat={create};
})(typeof window==='undefined'?globalThis:window);
