// This adapter uses the existing schema; it creates no tables or sample rows.
(function (root) {
  'use strict';
  const columns = 'assignment_id,name,percentage_of_grade,completed,priority,due_date,est_time,deleted,optional,client_request_id';
  const legacyColumns = 'assignment_id,name,percentage_of_grade,completed,priority,due_date,est_time,deleted';
  const missingCreationColumns = error => error && (error.code === '42703' ||
    /(?:optional|client_request_id).*(?:does not exist|schema cache)|could not find.*(?:optional|client_request_id)/i.test(error.message || ''));
  function id(value) {
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
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
      const part = type => parts.find(p => p.type === type).value;
      due = `${part('year')}-${part('month')}-${part('day')}`;
    }
    return { id: id(row.assignment_id), n: String(row.name ?? ''), c: 'Shared demo', d: due || '9999-12-31', noDue: !due,
      t: minutes(row.est_time), g: row.percentage_of_grade == null ? null : Number(row.percentage_of_grade),
      p: Math.max(0, Math.min(3, Math.round(Number(row.priority) || 0))), o: !!row.optional, l: null,
      completed: row.completed, requestId: row.client_request_id || null, persisted: true };
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
  function create(client, assignmentIds) {
    const allowed = [...new Set(assignmentIds.map(id))];
    let visible = new Set(allowed);
    if (!allowed.length) throw new Error('Configure the synthetic assignment IDs first.');
    function dueTimestamp(value) {
      const check = new Date(value+'T12:00:00Z');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(check.valueOf()) || check.toISOString().slice(0, 10) !== value) throw new Error('Choose a valid due date.');
      const offset = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', timeZoneName: 'shortOffset' })
        .formatToParts(new Date(value+'T12:00:00Z')).find(part => part.type === 'timeZoneName')?.value;
      const match = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(offset || '');
      if (!match) throw new Error('Could not determine the due date time zone.');
      const minutes = (match[1] === '-' ? -1 : 1) * (+match[2] * 60 + +(match[3] || 0));
      const [year, month, day] = value.split('-').map(Number);
      return new Date(Date.UTC(year, month - 1, day, 23, 59) - minutes * 60000).toISOString();
    }
    function newAssignment(input) {
      const name = String(input.n || '').trim();
      if (!name || name.length > 200) throw new Error('Use an assignment name between 1 and 200 characters.');
      if (input.t != null && (!Number.isSafeInteger(input.t) || input.t < 1 || input.t > 10080)) throw new Error('Estimated time must be between 1 minute and 7 days.');
      if (!Number.isInteger(input.p) || input.p < 0 || input.p > 3) throw new Error('Invalid priority.');
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId)) throw new Error('Invalid save request ID.');
      return { name, due_date: dueTimestamp(input.d), est_time: input.t == null ? null : input.t+' minutes',
        priority: input.p, optional: !!input.o, percentage_of_grade: null, completed: !!input.completed,
        deleted: false, client_request_id: input.requestId };
    }
    return {
      async createAssignment(input) {
        const patch = newAssignment(input);
        const query = () => client.from('assignments').select(columns).eq('client_request_id', patch.client_request_id).single();
        const { data, error } = await client.from('assignments').insert(patch).select(columns).single();
        let row = data;
        if (error?.code === '23505') {
          const existing = await query();
          if (existing.error || !existing.data) throw new Error('The assignment may have saved. Reload assignments before retrying.');
          row = existing.data;
        } else if (error) throw new Error(missingCreationColumns(error) ? 'Database setup pending: apply the assignment creation migration.' : error.message || 'Could not save assignment.');
        if (!row) throw new Error('The assignment save was not confirmed. Reload assignments before retrying.');
        const saved = record(row);
        visible.add(saved.id);
        return saved;
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
        let { data, error } = await client.from('assignments').select(columns).eq('deleted', false).order('assignment_id');
        if (missingCreationColumns(error)) ({ data, error } = await client.from('assignments').select(legacyColumns).eq('deleted', false).order('assignment_id'));
        if (error) throw new Error(error.message || 'Database load failed.');
        if (!Array.isArray(data)) throw new Error('The database returned no assignment list.');
        const tasks = data.map(record);
        visible = new Set(tasks.map(task => task.id));
        return tasks;
      },
      async save(assignmentId, previous, next) {
        const key = id(assignmentId);
        if (!visible.has(key)) throw new Error('This assignment is not available to this account.');
        const { data, error } = await client.from('assignments').update({ completed: next })
          .eq('assignment_id', key).eq('deleted', false).eq('completed', previous)
          .select('assignment_id,completed').single();
        if (error) throw new Error('Save was not confirmed. Reload assignments and try again.');
        if (!data || id(data.assignment_id) !== key || data.completed !== next) throw new Error('The database did not confirm the requested completion value. Reload to check its state.');
        return data.completed;
      }
    };
  }
  root.CanvasBackend = { create, record, minutes, id, listName };
})(typeof window === 'undefined' ? globalThis : window);
