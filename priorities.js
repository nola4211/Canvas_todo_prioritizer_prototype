// Plain functions shared by the page, database adapter, and tests.
(function (root) {
  'use strict';
  const labels = {
    grade: 'Assignment % of grade — highest first',
    due: 'Due date — earliest first',
    title: 'Words in title — matches first',
    time: 'Estimated time — longest first',
    class: 'Class name — A to Z'
  };

  function validateRules(rules) {
    if (!Array.isArray(rules) || rules.length > 10) throw new Error('Use up to 10 priority rules.');
    const used = new Set();
    return rules.map(rule => {
      if (!rule || !Object.hasOwn(labels, rule.type)) throw new Error('Choose a supported priority rule.');
      const result = { type: rule.type };
      let key = rule.type;
      if (rule.type === 'title') {
        if (typeof rule.text !== 'string') throw new Error('Enter words to match in the title.');
        result.text = rule.text.trim();
        if (!result.text || [...result.text].length > 80) throw new Error('Title words must be between 1 and 80 characters.');
        key += ':' + result.text.toLowerCase();
      }
      if (used.has(key)) throw new Error('Remove the duplicate priority rule.');
      used.add(key);
      return result;
    });
  }

  function effectiveRules(userRules, listRules, ignoreUserRules) {
    return ignoreUserRules ? [...listRules] : [...userRules, ...listRules];
  }

  function compareNumber(a, b) {
    // Missing values go last, including when the order is highest first.
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    return b - a;
  }

  function compareRule(a, b, rule) {
    if (rule.type === 'grade') return compareNumber(a.g, b.g);
    if (rule.type === 'due') return String(a.d || '9999-12-31').localeCompare(String(b.d || '9999-12-31'));
    if (rule.type === 'time') return compareNumber(a.t, b.t);
    if (rule.type === 'class') return String(a.c || '').localeCompare(String(b.c || ''));
    if (rule.type === 'priority') return compareNumber(a.p, b.p); // Existing calendar control.
    if (rule.type === 'title') {
      const text = rule.text.toLowerCase();
      const aMatches = String(a.n || '').toLowerCase().includes(text);
      const bMatches = String(b.n || '').toLowerCase().includes(text);
      return Number(bMatches) - Number(aMatches);
    }
    return 0;
  }

  function sortAssignments(assignments, userRules, listRules = [], ignoreUserRules = false) {
    const rules = effectiveRules(userRules, listRules, ignoreUserRules);
    return [...assignments].sort((a, b) => {
      for (const rule of rules) {
        const difference = compareRule(a, b, rule);
        if (difference) return difference;
      }
      // A predictable fallback when there are no rules or all rules tie.
      return compareRule(a, b, { type: 'due' }) || String(a.id).localeCompare(String(b.id));
    });
  }
  root.CanvasPriorities = { labels, validateRules, effectiveRules, sortAssignments };
})(typeof window === 'undefined' ? globalThis : window);
