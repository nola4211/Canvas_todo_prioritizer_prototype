(function(root){
  'use strict';
  const zonedParts=(date,timeZone)=>{
    const parts=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
    const value=type=>parts.find(part=>part.type===type)?.value||'';
    return {year:+value('year'),month:+value('month'),day:+value('day'),hour:+value('hour'),minute:+value('minute')};
  };
  const localText=parts=>String(parts.year)+'-'+String(parts.month).padStart(2,'0')+'-'+String(parts.day).padStart(2,'0')+'T'+String(parts.hour).padStart(2,'0')+':'+String(parts.minute).padStart(2,'0');
  const parseLocal=value=>{
    const match=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
    if(!match)throw new Error('Choose a valid date and time.');
    const [year,month,day,hour,minute]=match.slice(1).map(Number),stamp=Date.UTC(year,month-1,day,hour,minute),check=new Date(stamp);
    if(check.getUTCFullYear()!==year||check.getUTCMonth()+1!==month||check.getUTCDate()!==day||check.getUTCHours()!==hour||check.getUTCMinutes()!==minute)
      throw new Error('Choose a valid date and time.');
    return {year,month,day,hour,minute,stamp};
  };
  const offsetAt=(stamp,timeZone)=>{
    const p=zonedParts(new Date(stamp),timeZone),shown=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute);
    return Math.round((shown-Math.floor(stamp/60000)*60000)/60000);
  };
  function offsetOptions(local,timeZone){
    const parsed=parseLocal(local),offsets=new Set([-36,-24,-6,0,6,24,36].map(hours=>offsetAt(parsed.stamp+hours*3600000,timeZone)));
    return [...offsets].filter(offset=>{
      const shown=zonedParts(new Date(parsed.stamp-offset*60000),timeZone);
      return localText(shown)===local;
    }).sort((a,b)=>b-a);
  }
  const offsetLabel=minutes=>{
    const sign=minutes<0?'-':'+',abs=Math.abs(minutes);
    return 'UTC'+sign+String(Math.floor(abs/60)).padStart(2,'0')+':'+String(abs%60).padStart(2,'0');
  };
  function toIso(local,timeZone,offset){
    if(offset==null||offset==='')throw new Error('Choose the UTC offset for this time.');
    const parsed=parseLocal(local),value=Number(offset),candidate=parsed.stamp-value*60000;
    if(!Number.isFinite(value)||localText(zonedParts(new Date(candidate),timeZone))!==local)
      throw new Error('That UTC offset does not match the selected time in this timezone.');
    return new Date(candidate).toISOString();
  }
  function localFields(iso,timeZone){
    const date=new Date(iso);if(Number.isNaN(date.getTime()))throw new Error('This saved session has an invalid time.');
    return {local:localText(zonedParts(date,timeZone)),offset:offsetAt(date.getTime(),timeZone)};
  }
  function dueDeadline(date,timeZone='America/Denver'){
    const local=String(date)+'T23:59',offset=offsetOptions(local,timeZone)[0];
    if(offset==null)throw new Error('This due date has no valid local deadline.');
    return toIso(local,timeZone,offset);
  }
  function endsAfterDue(end,date,timeZone='America/Denver'){
    if(!end||!date)return false;
    const deadline=dueDeadline(date,timeZone);
    return Date.parse(end)>Date.parse(deadline);
  }
  function dayBounds(date,timeZone='America/Denver'){
    const start=toIso(date+'T00:00',timeZone,offsetOptions(date+'T00:00',timeZone)[0]);
    const next=new Date(date+'T12:00:00Z');next.setUTCDate(next.getUTCDate()+1);
    const nextDate=next.toISOString().slice(0,10),local=nextDate+'T00:00';
    return {start,end:toIso(local,timeZone,offsetOptions(local,timeZone)[0])};
  }
  function monthBounds(year,month,timeZone='America/Denver'){
    const startDate=String(year)+'-'+String(month+1).padStart(2,'0')+'-01';
    const next=new Date(Date.UTC(year,month+1,1,12)),endDate=next.toISOString().slice(0,10);
    const startLocal=startDate+'T00:00',endLocal=endDate+'T00:00';
    return {start:toIso(startLocal,timeZone,offsetOptions(startLocal,timeZone)[0]),end:toIso(endLocal,timeZone,offsetOptions(endLocal,timeZone)[0])};
  }
  function overlapsDay(session,date,timeZone='America/Denver'){
    const bounds=dayBounds(date,timeZone);
    return new Date(session.starts_at).getTime()<Date.parse(bounds.end)&&new Date(session.ends_at).getTime()>Date.parse(bounds.start);
  }
  function formatTime(value,timeZone){
    return new Intl.DateTimeFormat('en-US',{timeZone,hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(value));
  }
  function createBackend(client){
    function check(result,message){
      if(result.error)throw new Error(result.error.message||message);
      if(!result.data?.ok)throw Object.assign(new Error(result.data?.message||message),{code:result.data?.error_code||'UNAVAILABLE'});
      return result.data.data;
    }
    return {
      async loadStudySessions(start,end){
        const {data,error}=await client.from('study_sessions').select('id,assignment_id,starts_at,ends_at,timezone,version,cancelled_at')
          .lt('starts_at',end).gt('ends_at',start).order('starts_at').order('id');
        if(error)throw new Error(error.message||'Could not load study sessions.');
        const ids=[...new Set((data||[]).map(row=>String(row.assignment_id)))];let names={};
        if(ids.length){
          const response=await client.from('assignments').select('assignment_id,name').in('assignment_id',ids).eq('deleted',false);
          if(response.error)throw new Error(response.error.message||'Could not load linked assignments.');
          names=Object.fromEntries((response.data||[]).map(row=>[String(row.assignment_id),String(row.name||'Assignment')]));
        }
        return (data||[]).map(row=>({...row,id:String(row.id),assignment_id:String(row.assignment_id),assignment_title:names[String(row.assignment_id)]||'Assignment'}));
      },
      async saveStudySession(input){
        const rpcName=input.id?'student_sessions_update_browser':'student_sessions_create_browser';
        const args=input.id?{
          p_session_id:input.id,p_expected_version:input.expectedVersion,p_assignment_id:input.assignment_id,
          p_starts_at:input.starts_at,p_ends_at:input.ends_at,p_timezone:input.timezone,p_allow_after_due:!!input.allow_after_due,
        }:{
          p_assignment_id:input.assignment_id,p_starts_at:input.starts_at,p_ends_at:input.ends_at,p_timezone:input.timezone,
          p_client_request_id:input.request_id||crypto.randomUUID(),p_allow_after_due:!!input.allow_after_due,
        };
        return check(await client.rpc(rpcName,args),'Could not save the study session.');
      },
      async cancelStudySession(id,expectedVersion){
        return check(await client.rpc('student_sessions_cancel_browser',{p_session_id:id,p_expected_version:expectedVersion}),'Could not cancel the study session.');
      },
      async listAgentGrants(){
        const data=check(await client.rpc('student_agent_list_browser'),'Could not load connected agents.');
        if(!Array.isArray(data))throw new Error('The connected-agent list is unavailable.');
        return data;
      },
      async revokeAgentGrant(id){
        return check(await client.rpc('student_agent_revoke_browser',{p_grant_id:id}),'Could not disconnect the agent.');
      },
    };
  }
  root.CanvasStudySessions={createBackend,offsetOptions,offsetLabel,toIso,localFields,dayBounds,monthBounds,overlapsDay,formatTime,dueDeadline,endsAfterDue};
})(typeof window==='undefined'?globalThis:window);
