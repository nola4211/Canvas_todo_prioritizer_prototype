// The manual form, chat review, and server use the same field rules.
(function(root){
  function today(){return new Date().toLocaleDateString('sv-SE',{timeZone:'America/Denver'})}
  function validate(input){
    const n=typeof input.n==='string'?input.n.trim():'';
    const c=typeof input.c==='string'?input.c.trim():'';
    if(!n||n.length>200)throw new Error('Use an assignment name between 1 and 200 characters.');
    if(!c||c.length>100)throw new Error('Enter a class name between 1 and 100 characters.');
    const date=new Date(input.d+'T12:00:00Z');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(input.d)||Number.isNaN(date.valueOf())||date.toISOString().slice(0,10)!==input.d)throw new Error('Choose a valid due date.');
    if(input.d<today())throw new Error("Due date can't be in the past.");
    if(!Number.isSafeInteger(input.t)||input.t<1||input.t>10080)throw new Error('Estimated time must be between 1 minute and 7 days.');
    if(typeof input.o!=='boolean')throw new Error('Choose whether this assignment is optional.');
    if(input.g!==null&&(typeof input.g!=='number'||!Number.isFinite(input.g)||input.g<0||input.g>100))throw new Error('Enter a grade weight from 0 to 100, or choose unknown.');
    return {n,c,d:input.d,t:input.t,o:input.o,g:input.g,p:input.o?0:2};
  }
  root.AssignmentFields={today,validate};
})(globalThis);
