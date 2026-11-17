// Browser-to-Supabase adapter. It translates the page's short assignment fields
// into database requests and checks the returned rows before reporting success.
// It uses the existing schema; it never creates tables or sample rows.
(function (root) {
  'use strict';
  const columns = 'assignment_id,name,description,percentage_of_grade,grade_earned_percent,completed,completed_at,priority,due_date,est_time,deleted,optional,client_request_id,class_name';
  const columnsWithoutDescription = 'assignment_id,name,percentage_of_grade,grade_earned_percent,completed,completed_at,priority,due_date,est_time,deleted,optional,client_request_id,class_name';
  const legacyColumns = 'assignment_id,name,percentage_of_grade,completed,priority,due_date,est_time,deleted';
  const missingCreationColumns = error => error && (error.code === '42703' ||
    /(?:optional|client_request_id|class_name).*(?:does not exist|schema cache)|could not find.*(?:optional|client_request_id|class_name)/i.test(error.message || ''));
  const missingCompletedAt = error => error && /completed_at.*(?:does not exist|schema cache)|could not find.*completed_at/i.test(error.message || '');
  function id(value) {
    // Keep database IDs as strings: PostgreSQL bigint values can exceed the
    // largest integer JavaScript can represent exactly.
    if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new Error('Assignment ID exceeds the browser safe integer range.');
    const result = String(value);
    if (!/^\d+$/.test(result)) throw new Error('Invalid assignment ID.');
    return result;
  }
  function minutes(value) {
    if (!value) return null;
    const match = String(value).match(/^(?:(\d+) days?\s+)?(\d+):(\d+):(\d+(?:\.\d+)?)$/);
    return match ? Math.round((+match[1] || 0) * 1440 + +match[2] * 60 + +match[3] + +match[4] / 60) : null;
  }
  function record(row) {
    if (typeof row.completed !== 'boolean') throw new Error('Assignment is missing a boolean completion value.');
    let due = null;
    if (row.due_date) {
      const date = new Date(row.due_date);
      if (Number.isNaN(date.getTime())) throw new Error('Assignment has an invalid due date.');
      // Due dates are displayed as Denver calendar dates even if the browser
      // itself is set to another timezone.
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
      const part = type => parts.find(p => p.type === type).value;
      due = `${part('year')}-${part('month')}-${part('day')}`;
    }
    return { id: id(row.assignment_id), n: String(row.name ?? ''), description: String(row.description ?? ''), c: row.class_name || 'Shared demo', d: due || '9999-12-31', noDue: !due,
      t: minutes(row.est_time), g: row.percentage_of_grade == null ? null : Number(row.percentage_of_grade), earnedGrade: row.grade_earned_percent == null ? null : Number(row.grade_earned_percent),
      p: Math.max(0, Math.min(3, Math.round(Number(row.priority) || 0))), o: !!row.optional, l: null,
      completed: row.completed, completedAt: row.completed_at == null ? null : new Date(row.completed_at).toISOString(), requestId: row.client_request_id || null, persisted: true };
  }
  function listName(value) {
    const name = String(value).trim();
    if (!name || [...name].length > 100) throw new Error('Use a list name between 1 and 100 characters.');
    return name;
  }
  function listError(error) {
    if (error.code === '23505') return new Error('That list name or assignment entry already exists.');
    return new Error(error.message || 'The list change could not be saved.');
  }
  function userSettings(value) {
    const input = value || {};
    const settings = {
      push_notifications: input.push_notifications ?? true,
      sync_with_canvas: input.sync_with_canvas ?? true,
      dark_mode: input.dark_mode ?? false
    };
    if (Object.values(settings).some(item => typeof item !== 'boolean')) throw new Error('Settings must be turned on or off.');
    return settings;
  }
  function create(client, assignmentIds) {
    const allowed = [...new Set(assignmentIds.map(id))];
    // This client-side set mirrors the small demo allowlist. Database policies
    // remain the authority; the set also prevents UI requests for unknown IDs.
    let visible = new Set(allowed);
    if (!allowed.length) throw new Error('Configure the synthetic assignment IDs first.');
    return {
      async createAccount(email, password) {
        const normalizedEmail=String(email||'').trim().toLowerCase();
        if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail))throw new Error('Enter a valid email address.');
        if(typeof password!=='string'||password.length<8)throw new Error('Use a password with at least 8 characters.');
        const {data,error}=await client.auth.signUp({email:normalizedEmail,password});
        if(error)throw new Error(error.message || 'Could not create the account.');
        if(!data?.user)throw new Error('The account was not confirmed. Please try again.');
        return {user:data.user,session:data.session||null};
      },
      async recordAppOpen() {
        const {data,error}=await client.rpc('record_app_open');
        if(error)throw new Error(error.message || 'Could not record app activity.');
        return data;
      },
      async recordAppUsage(seconds) {
        if(!Number.isInteger(seconds)||seconds<1||seconds>120)throw new Error('Usage update must be between 1 and 120 seconds.');
        const {data,error}=await client.rpc('record_app_usage',{p_seconds:seconds});
        if(error)throw new Error(error.message || 'Could not record active app time.');
        return Number(data);
      },
      async loadWeeklyEngagementOKR() {
        const {data,error}=await client.rpc('get_weekly_engagement_okr');
        if(error)throw new Error(error.message || 'Could not load the weekly engagement tracker.');
        return data;
      },
      async createAssignment(input) {
        // The database RPC performs the insert and idempotency check together;
        // a request ID makes a retry safe if the first response was lost.
        const fields=globalThis.AssignmentFields.validate({n:input.n,c:input.c||'Shared demo',description:input.description,d:input.d,t:input.t,o:input.o,g:input.g===undefined?null:input.g,p:input.p});
        const args={
          p_name:fields.n,p_class_name:fields.c,p_due_date:fields.d,p_estimated_minutes:fields.t,
          p_optional:fields.o,p_percentage_of_grade:fields.g,p_request_id:input.requestId,
          p_completed:!!input.completed,p_confirm_long:!!input.confirmLong,p_priority:fields.p
        };
        if(fields.description)args.p_description=fields.description;
        const {data,error}=await client.rpc('create_saved_assignment',args);
        if(error){
          if(fields.description && (error.code==='PGRST202'||/Could not find the function public\.create_saved_assignment.*p_description/i.test(error.message||'')))
            throw new Error('Description saving is not available on the server yet. Ask the project owner to apply the pending database update.');
          throw new Error(error.message || 'Could not save assignment.');
        }
        if(!data)throw new Error('The assignment save was not confirmed. Reload assignments before retrying.');
        const saved=record(data);visible.add(saved.id);return saved;
      },
      async loadAssignmentDrafts() {
        const selected='assignment_id,name,description,class_name,due_date,est_time,optional,percentage_of_grade,priority,owner_id';
        const {data,error}=await client.from('assignments_draft').select(selected).order('assignment_id');
        if(error)throw new Error(error.message || 'Could not load saved drafts.');
        return (data||[]).filter(row=>row.owner_id).map(row=>{
          let due='';if(row.due_date){const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Denver',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(row.due_date));const part=type=>parts.find(item=>item.type===type).value;due=`${part('year')}-${part('month')}-${part('day')}`}
          const minutesValue=minutes(row.est_time);
          return {id:String(row.assignment_id),n:String(row.name||''),description:String(row.description||''),c:String(row.class_name||''),d:due,t:minutesValue?`${minutesValue}m`:'',o:!!row.optional,g:row.percentage_of_grade==null?null:Number(row.percentage_of_grade),gUnknown:row.percentage_of_grade==null,p:row.priority==null?null:Number(row.priority)};
        });
      },
      async saveAssignmentDraft(input,draftId) {
        // Draft rows belong to the signed-in account and can be incomplete.
        // Convert the form's friendly time text into PostgreSQL interval text.
        const draft={
          n:String(input.n||''),description:String(input.description||''),c:String(input.c||''),
          d:String(input.d||''),t:String(input.t||''),o:!!input.o,gUnknown:!!input.gUnknown,p:input.p==null?null:Number(input.p),
          g:input.g==null||input.g===''?null:Number(input.g)
        };
        if(draft.n.length>200||draft.description.length>2000||draft.c.length>100)throw new Error('Some draft details are longer than the allowed limits.');
        if(draft.p!==null&&(!Number.isInteger(draft.p)||draft.p<0||draft.p>3))throw new Error('Choose a valid draft priority.');
        const date=/^\d{4}-\d{2}-\d{2}$/.test(draft.d)&&!Number.isNaN(new Date(draft.d+'T12:00:00Z').valueOf())?new Date(draft.d+'T12:00:00Z').toISOString():null;
        const parsed=String(draft.t).trim().toLowerCase().match(/^(?:(\d+)\s*h(?:rs?|ours?)?)?\s*(?:(\d+)\s*m(?:ins?)?)?$/);
        const mins=parsed&&(parsed[1]||parsed[2])?(Number(parsed[1]||0)*60+Number(parsed[2]||0)):null;
        const {data:userData,error:userError}=await client.auth.getUser();
        if(userError||!userData?.user)throw new Error('Sign in again before saving a draft.');
        const row={
          owner_id:userData.user.id,name:draft.n.trim(),description:draft.description.trim()||null,
          class_name:draft.c.trim()||null,due_date:date,est_time:mins==null?null:`${Math.floor(mins/60)}:${String(mins%60).padStart(2,'0')}:00`,
          optional:draft.o,percentage_of_grade:Number.isFinite(draft.g)?draft.g:null,priority:draft.p,
          completed:false,deleted:false,client_request_id:crypto.randomUUID()
        };
        const selected='assignment_id,name,description,class_name,due_date,est_time,optional,percentage_of_grade,priority,owner_id';
        const query=draftId
          ?client.from('assignments_draft').update(row).eq('assignment_id',draftId).select(selected).single()
          :client.from('assignments_draft').insert(row).select(selected).single();
        const {data,error}=await query;
        if(error)throw new Error(error.message || 'Could not save this draft.');
        if(!data)throw new Error('The draft save was not confirmed.');
        let due='';if(data.due_date){const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Denver',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(data.due_date));const part=type=>parts.find(item=>item.type===type).value;due=`${part('year')}-${part('month')}-${part('day')}`}
        const minutesValue=minutes(data.est_time);
        return {id:String(data.assignment_id),n:String(data.name||''),description:String(data.description||''),c:String(data.class_name||''),d:due,t:minutesValue?`${minutesValue}m`:'',o:!!data.optional,g:data.percentage_of_grade==null?null:Number(data.percentage_of_grade),gUnknown:data.percentage_of_grade==null,p:data.priority==null?null:Number(data.priority)};
      },
      async deleteAssignmentDraft(draftId) {
        const {data,error}=await client.from('assignments_draft').delete().eq('assignment_id',draftId).select('assignment_id').single();
        if(error)throw new Error(error.message || 'Could not remove the saved draft.');
        if(!data)throw new Error('The draft removal was not confirmed.');
      },
      async updateAssignment(assignmentId, input) {
        const key = id(assignmentId);
        if (!visible.has(key)) throw new Error('This assignment is not available to this account.');
        const fields = globalThis.AssignmentFields.validate({n:input.n,c:input.c,description:input.description,d:input.d,t:input.t,o:input.o,g:input.g,earned:input.earned,p:input.p,allowPast:true,originalDueDate:input.originalDueDate});
        const patch={name:fields.n,description:fields.description,class_name:fields.c,est_time:fields.t,optional:fields.o,percentage_of_grade:fields.g,grade_earned_percent:fields.earned,priority:fields.p};
        // Leave an unchanged stored instant intact; changed dates use Denver's end of day.
        if(fields.d!==input.originalDueDate)patch.due_date=root.CanvasStudySessions.dueDeadline(fields.d,'America/Denver');
        const {data,error}=await client.from('assignments').update(patch)
          .eq('assignment_id',key).eq('deleted',false).select(columns).single();
        if(error)throw new Error(error.message || 'Could not save assignment changes.');
        if(!data)throw new Error('The assignment update was not confirmed. Reload assignments before retrying.');
        return record(data);
      },
      async updateAssignmentPriority(assignmentId, priority) {
        const key = id(assignmentId);
        if (!visible.has(key)) throw new Error('This assignment is not available to this account.');
        if (!Number.isInteger(priority) || priority < 0 || priority > 3) throw new Error('Choose a valid priority.');
        const {data,error}=await client.from('assignments').update({priority}).eq('assignment_id',key).eq('deleted',false)
          .select('assignment_id,name,description,percentage_of_grade,grade_earned_percent,completed,priority,due_date,est_time,deleted,optional,client_request_id,class_name').single();
        if(error)throw new Error(error.message || 'Could not save priority.');
        if(!data)throw new Error('The priority update was not confirmed. Reload assignments before retrying.');
        return record(data);
      },
      async loadAssignmentDraft(chatId) {
        const {data,error}=await client.from('chat').select('assignment_draft').eq('chat_ID',chatId).single();
        if(error)throw new Error(error.message || 'Could not load the assignment draft.');
        return data.assignment_draft;
      },
      async confirmAssignmentDraft(chatId,requestId,confirmLong) {
        const {data,error}=await client.rpc('confirm_ai_assignment',{p_chat_id:chatId,p_request_id:requestId,p_confirm_long:!!confirmLong});
        if(error)throw new Error(error.message || 'Could not create assignment.');
        if(!data)throw new Error('The assignment save was not confirmed. Reload before retrying.');
        const saved=record(data);visible.add(saved.id);return saved;
      },
      async changeAssignmentDraft(chatId,requestId,action) {
        const {error}=await client.rpc('change_ai_assignment_draft',{p_chat_id:chatId,p_request_id:requestId,p_action:action});
        if(error)throw new Error(error.message || 'Could not change the draft.');
      },
      async loadLists() {
        const { data, error } = await client.from('lists').select('id,name,priority_rules,ignore_user_rules').order('created_at').order('id');
        if (error) throw listError(error);
        return data;
      },
      async loadUserPriorities() {
        const { data, error } = await client.from('user_priorities').select('scope,rules,ignore_user_rules');
        if (error) throw listError(error);
        return data;
      },
      async loadUserSettings() {
        const { data, error } = await client.from('user_settings').select('push_notifications,sync_with_canvas,dark_mode');
        if (error) throw new Error(error.message || 'Could not load settings.');
        if (!Array.isArray(data) || data.length > 1) throw new Error('The database returned invalid settings.');
        return userSettings(data[0]);
      },
      async saveUserSettings(value) {
        const patch = userSettings(value);
        const { data, error } = await client.from('user_settings').upsert(patch, { onConflict: 'owner_id' })
          .select('push_notifications,sync_with_canvas,dark_mode').single();
        if (error) throw new Error(error.message || 'Could not save settings.');
        return userSettings(data);
      },
      async saveUserPriorities(scope, rules, ignoreUserRules = false) {
        if (!['settings', 'main', 'classes'].includes(scope)) throw new Error('Unknown priority settings.');
        if (typeof ignoreUserRules !== 'boolean' || (scope === 'settings' && ignoreUserRules)) throw new Error('Invalid priority override.');
        const patch = { scope, rules: root.CanvasPriorities.validateRules(rules), ignore_user_rules: ignoreUserRules };
        const { data, error } = await client.from('user_priorities').upsert(patch, { onConflict: 'owner_id,scope' })
          .select('scope,rules,ignore_user_rules').single();
        if (error) throw listError(error);
        return data;
      },
      async saveListPriorities(listId, rules, ignoreUserRules) {
        if (typeof ignoreUserRules !== 'boolean') throw new Error('Invalid priority override.');
        const patch = { priority_rules: root.CanvasPriorities.validateRules(rules), ignore_user_rules: ignoreUserRules };
        const { data, error } = await client.from('lists').update(patch).eq('id', listId)
          .select('id,priority_rules,ignore_user_rules').single();
        if (error) throw listError(error);
        return data;
      },
      async loadListAssignments() {
        const { data, error } = await client.from('list_assignments').select('list_id,assignment_id');
        if (error) throw listError(error);
        return data.map(row => ({ list_id: row.list_id, assignment_id: id(row.assignment_id) }));
      },
      async createList(name) {
        const { data, error } = await client.from('lists').insert({ name: listName(name) }).select('id,name').single();
        if (error) throw listError(error);
        return data;
      },
      async renameList(listId, name) {
        const { data, error } = await client.from('lists').update({ name: listName(name) }).eq('id', listId).select('id,name').single();
        if (error) throw listError(error);
        return data;
      },
      async deleteList(listId) {
        const { data, error } = await client.from('lists').delete().eq('id', listId).select('id').single();
        if (error) throw listError(error);
        return data;
      },
      async addAssignmentToList(listId, assignmentId) {
        const key = id(assignmentId);
        if (!visible.has(key)) throw new Error('This assignment is not available to this account.');
        const { data, error } = await client.from('list_assignments').insert({ list_id: listId, assignment_id: key })
          .select('list_id,assignment_id').single();
        if (error) throw listError(error);
        return { list_id: data.list_id, assignment_id: id(data.assignment_id) };
      },
      async removeAssignmentFromList(listId, assignmentId) {
        const { data, error } = await client.from('list_assignments').delete().eq('list_id', listId).eq('assignment_id', id(assignmentId))
          .select('list_id,assignment_id').single();
        if (error) throw listError(error);
        return data;
      },
      async load() {
        const query = selected => client.from('assignments').select(selected).eq('deleted', false).order('assignment_id');
        let { data, error } = await query(columns);
        if (missingCompletedAt(error)) throw new Error('The completed assignments archive needs its database update. Apply the completed archive migration, then reload.');
        if (missingCreationColumns(error)) ({ data, error } = await client.from('assignments').select(legacyColumns).eq('deleted', false).order('assignment_id'));
        // Older deployments may not yet grant SELECT on description. Keep the
        // rest of the assignment list usable until its additive migration lands.
        if (error?.code === '42501') ({ data, error } = await query(columnsWithoutDescription));
        if (error) throw new Error(error.message || 'Database load failed.');
        if (!Array.isArray(data)) throw new Error('The database returned no assignment list.');
        const tasks = data.map(record);
        visible = new Set(tasks.map(task => task.id));
        return tasks;
      },
      async save(assignmentId, previous, next) {
        const key = id(assignmentId);
        if (!visible.has(key)) throw new Error('This assignment is not available to this account.');
        // Compare the old value as well as the ID so a stale tab cannot silently
        // overwrite a completion change made elsewhere.
        const { data, error } = await client.from('assignments').update({ completed: next })
          .eq('assignment_id', key).eq('deleted', false).eq('completed', previous)
          .select('assignment_id,completed').single();
        if (error) throw new Error('Save was not confirmed. Reload assignments and try again.');
        if (!data || id(data.assignment_id) !== key || data.completed !== next) throw new Error('The database did not confirm the requested completion value. Reload to check its state.');
        return data.completed;
      },
      async removeAssignment(assignmentId) {
        const key = id(assignmentId);
        if (!visible.has(key)) throw new Error('This assignment is not available to this account.');
        const { data, error } = await client.rpc('remove_saved_assignment', { p_assignment_id: key });
        if (error) throw new Error(error.message || 'Could not remove assignment.');
        if (id(data) !== key) throw new Error('Removal was not confirmed. Reload assignments to check its state.');
        visible.delete(key);
        return key;
      }
    };
  }
  root.CanvasBackend = { create, record, minutes, id, listName, userSettings };
})(typeof window === 'undefined' ? globalThis : window);
