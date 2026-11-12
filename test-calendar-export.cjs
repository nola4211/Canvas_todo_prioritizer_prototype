const assert = require('node:assert/strict');
require('./calendar-export.js');
const api = globalThis.CanvasCalendarExport;
const now = '2026-11-12T19:20:30.000Z';

const calendar = api.build({
  now,
  assignments: [
    { id: 1, n: 'Final, review; \u2603', c: 'IS 401', d: '2028-02-29', description: 'private rubric details', completed: false },
    { id: 2, n: 'Finished', c: 'IS 401', d: '2026-11-01', completed: true },
    { id: 3, n: 'No date', c: 'IS 401', d: '', noDue: true },
  ],
  sessions: [
    { id: 'session/1', assignment_id: 1, assignment_title: 'Final review', starts_at: '2026-11-13T01:30:00-07:00', ends_at: '2026-11-13T02:15:00-07:00', timezone: 'America/Denver', cancelled_at: null },
    { id: 'cancelled', assignment_title: 'Hidden', starts_at: '2026-11-13T01:00:00Z', ends_at: '2026-11-13T02:00:00Z', cancelled_at: '2026-11-12T00:00:00Z' },
  ],
});

assert.ok(calendar.endsWith('\r\n'));
assert.ok(!calendar.replace(/\r\n/g, '').includes('\n'), 'lines use CRLF only');
assert.match(calendar, /DTSTART;VALUE=DATE:20280229\r\nDTEND;VALUE=DATE:20280301/);
assert.match(calendar, /DTSTART:20261113T083000Z\r\nDTEND:20261113T091500Z/, 'session instants export correctly across offsets');
assert.match(calendar, /SUMMARY:IS 401: Final\\, review\\; \u2603/);
assert.ok(!calendar.includes('private rubric details'), 'assignment descriptions are excluded');
assert.ok(!calendar.includes('Finished') && !calendar.includes('No date') && !calendar.includes('Hidden'));
assert.equal((calendar.match(/BEGIN:VEVENT/g) || []).length, 2, 'one assignment and one active session event');
assert.ok(calendar.includes('UID:assignment-31@canvas-todo'));
assert.ok(calendar.includes('UID:session-73657373696f6e2f31@canvas-todo'));
assert.equal(api.build({ now, assignments: [{ id: 1, n: 'x', d: '2028-02-29' }] }).match(/UID:([^\r]+)/)[1], 'assignment-31@canvas-todo', 'UIDs are stable');

const longUnicode = `SUMMARY:${'界'.repeat(35)}`;
const folded = api.foldLine(longUnicode);
for (const physicalLine of folded.split('\r\n')) {
  assert.ok(Buffer.byteLength(physicalLine, 'utf8') <= 75, `folded line is <=75 octets: ${Buffer.byteLength(physicalLine, 'utf8')}`);
}
assert.equal(folded.replace(/\r\n /g, ''), longUnicode, 'folding preserves Unicode content');
assert.equal(api.escapeText('a\\b;c,d\r\ne'), 'a\\\\b\\;c\\,d\\ne');

assert.throws(() => api.build({ assignments: [{ id: 1, n: 'bad date', d: '2026-02-29' }] }), /valid YYYY-MM-DD/);
assert.throws(() => api.build({ sessions: [{ id: 'bad', assignment_title: 'bad', starts_at: '2026-11-13T01:00:00', ends_at: '2026-11-13T02:00:00Z' }] }), /ISO 8601/);
assert.throws(() => api.build({ sessions: [{ id: 'bad', assignment_title: 'bad', starts_at: '2026-02-30T01:00:00Z', ends_at: '2026-03-01T02:00:00Z' }] }), /valid YYYY-MM-DD/, 'rejects timestamps whose invalid date JS would normalize');
assert.throws(() => api.build({ sessions: [{ id: 'bad', assignment_title: 'bad', starts_at: '2026-11-13T24:00:00Z', ends_at: '2026-11-14T02:00:00Z' }] }), /ISO 8601/);
assert.throws(() => api.build({ sessions: [{ id: 'bad', assignment_title: 'bad', starts_at: '2026-11-13T01:00:00+01:60', ends_at: '2026-11-13T02:00:00Z' }] }), /ISO 8601/);
assert.throws(() => api.build({ sessions: [{ id: 'bad', assignment_title: 'bad', starts_at: '2026-11-13T02:00:00Z', ends_at: '2026-11-13T01:00:00Z' }] }), /after its start/);

console.log('PASS: .ics assignment and session events, all-day exclusive end/leap date, UTC sessions, escaping, UTF-8 folding, stable UIDs, skips, and validation.');
