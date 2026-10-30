// This adapter reads the Supabase schema; the grade table is created by its migration.
(function (root) {
  'use strict';
  const columns = 'assignment_id,name,percentage_of_grade,completed,priority,due_date,est_time,deleted';
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
    return { id: id(row.assignment_id), n: String(row.name ?? ''), c: 'Shared demo', d: due || '9999-12-31', dueAt: row.due_date ? new Date(row.due_date).toISOString() : null, noDue: !due,
      t: minutes(row.est_time), g: Number(row.percentage_of_grade) || 0,
      p: Math.max(0, Math.min(3, Math.round(Number(row.priority) || 0))), l: null, completed: row.completed, persisted: true };
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
    if (!allowed.length) throw new Error('Configure the synthetic assignment IDs first.');
    return {
      async loadLists() {
        const { data, error } = await client.from('lists').select('id,name').order('created_at').order('id');
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
        if (!allowed.includes(key)) throw new Error('This assignment is outside the demo.');
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
        const { data, error } = await client.from('assignments').select(columns).in('assignment_id', allowed).eq('deleted', false).order('assignment_id');
        if (error) throw new Error(error.message || 'Database load failed.');
        if (!Array.isArray(data)) throw new Error('The database returned no assignment list.');
        return data.map(record);
      },
      async loadGrades() {
        const { data, error } = await client.from('assignment_grades').select('assignment_id,grade,graded_at').in('assignment_id', allowed).order('assignment_id');
        if (error) throw new Error(error.message || 'Grade load failed.');
        if (!Array.isArray(data)) throw new Error('The database returned no grade list.');
        return data.map(row => ({ assignment_id: id(row.assignment_id), grade: row.grade, graded_at: row.graded_at }));
      },
      async save(assignmentId, previous, next) {
        const key = id(assignmentId);
        if (!allowed.includes(key)) throw new Error('This assignment is outside the demo.');
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
