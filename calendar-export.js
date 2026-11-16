(function (root) {
  'use strict';

  const encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
  const utf8Length = value => encoder
    ? encoder.encode(value).length
    : unescape(encodeURIComponent(value)).length;

  function foldLine(line) {
    const folded = [];
    let current = '';
    let octets = 0;
    for (const character of line) {
      const size = utf8Length(character);
      if (octets + size > 75) {
        folded.push(current);
        current = ' ' + character;
        octets = 1 + size;
      } else {
        current += character;
        octets += size;
      }
    }
    folded.push(current);
    return folded.join('\r\n');
  }

  function escapeText(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
  }

  function validDate(value, label) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new Error(`${label} must be a valid YYYY-MM-DD date.`);
    }
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(0);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCFullYear(year, month - 1, day);
    if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) {
      throw new Error(`${label} must be a valid YYYY-MM-DD date.`);
    }
    return value.replace(/-/g, '');
  }

  function nextDate(value) {
    const date = new Date(0);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCFullYear(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10)) + 1);
    if (date.getUTCFullYear() > 9999) throw new Error(`Assignment due date ${value} cannot be represented as an all-day calendar event.`);
    return date.toISOString().slice(0, 10).replace(/-/g, '');
  }

  function uid(kind, id) {
    const hex = Array.from(new TextEncoder().encode(String(id)), byte => byte.toString(16).padStart(2, '0')).join('');
    return `${kind}-${hex}@canvas-todo`;
  }

  function requiredText(value, label) {
    if ((typeof value !== 'string' && typeof value !== 'number') || String(value).trim() === '') {
      throw new Error(`${label} is required for calendar export.`);
    }
    return String(value);
  }

  function utcDateTime(value, label) {
    const match = typeof value === 'string' && value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|([+-])(\d{2}):(\d{2}))$/);
    const hour = match ? Number(match[2]) : NaN;
    const minute = match ? Number(match[3]) : NaN;
    const second = match ? Number(match[4]) : NaN;
    const offsetHour = match && match[6] ? Number(match[7]) : 0;
    const offsetMinute = match && match[6] ? Number(match[8]) : 0;
    if (!match || !validDate(match[1], label) || hour > 23 || minute > 59 || second > 59 || offsetHour > 23 || offsetMinute > 59 || !Number.isFinite(Date.parse(value))) {
      throw new Error(`${label} must be a valid ISO 8601 timestamp with a timezone.`);
    }
    return new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  }

  function build({ assignments = [], sessions = [], now = new Date() } = {}) {
    if (!Array.isArray(assignments) || !Array.isArray(sessions)) throw new Error('Assignments and sessions must be arrays.');
    const stamp = now instanceof Date ? now : new Date(now);
    if (!Number.isFinite(stamp.getTime())) throw new Error('now must be a valid date or timestamp.');
    const dtstamp = stamp.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const events = [];

    for (const assignment of assignments) {
      if (!assignment || typeof assignment !== 'object') throw new Error('Each assignment must be an object.');
      const id = requiredText(assignment.id, 'Assignment ID');
      const title = requiredText(assignment.n, `Assignment ${id} title`);
      const className = assignment.c == null ? '' : String(assignment.c);
      if (assignment.completed || assignment.noDue) continue;
      const due = validDate(assignment.d, `Assignment ${id} due date`);
      const summary = className ? `${className}: ${title}` : title;
      events.push([
        'BEGIN:VEVENT', `UID:${uid('assignment', id)}`, `DTSTAMP:${dtstamp}`,
        `DTSTART;VALUE=DATE:${due}`, `DTEND;VALUE=DATE:${nextDate(assignment.d)}`,
        `SUMMARY:${escapeText(summary)}`, 'END:VEVENT',
      ]);
    }

    for (const session of sessions) {
      if (!session || typeof session !== 'object') throw new Error('Each study session must be an object.');
      if (session.cancelled_at) continue;
      const id = requiredText(session.id, 'Study session ID');
      const title = requiredText(session.assignment_title, `Study session ${id} assignment title`);
      const start = utcDateTime(session.starts_at, `Study session ${id} start`);
      const end = utcDateTime(session.ends_at, `Study session ${id} end`);
      if (Date.parse(session.ends_at) <= Date.parse(session.starts_at)) throw new Error(`Study session ${id} end must be after its start.`);
      const className = session.c == null ? '' : String(session.c);
      const summary = className ? `Study: ${className}: ${title}` : `Study: ${title}`;
      events.push([
        'BEGIN:VEVENT', `UID:${uid('session', id)}`, `DTSTAMP:${dtstamp}`,
        `DTSTART:${start}`, `DTEND:${end}`, `SUMMARY:${escapeText(summary)}`, 'END:VEVENT',
      ]);
    }

    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Canvas To-Do//Calendar Export//EN', 'CALSCALE:GREGORIAN', ...events.flat(), 'END:VCALENDAR'];
    return lines.map(foldLine).join('\r\n') + '\r\n';
  }

  root.CanvasCalendarExport = { build, escapeText, foldLine };
})(typeof window === 'undefined' ? globalThis : window);
