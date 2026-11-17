// Shared assignment rules for the manual form and chat review. The database
// checks them again when saving, so browser validation is only the first layer.
(function(root){
  function today(){return new Date().toLocaleDateString('sv-SE',{timeZone:'America/Denver'})}
  function maxDueDate(reference=today()){
    const [year,month,day]=reference.split('-').map(Number);
    const lastDay=new Date(Date.UTC(year+1,month,0)).getUTCDate();
    return `${year+1}-${String(month).padStart(2,'0')}-${String(Math.min(day,lastDay)).padStart(2,'0')}`;
  }
  function validate(input){
    const n=typeof input.n==='string'?input.n.trim():'';
    const c=typeof input.c==='string'?input.c.trim():'';
    const description=typeof input.description==='string'?input.description.trim():'';
    if(!n||n.length>200)throw new Error('Use an assignment name between 1 and 200 characters.');
    if(!c||c.length>100)throw new Error('Enter a class name between 1 and 100 characters.');
    if(description.length>2000)throw new Error('Keep the description under 2,000 characters.');
    // Parse at noon UTC to validate the calendar date without midnight
    // timezone shifts, then compare against today's Denver date.
    const date=new Date(input.d+'T12:00:00Z');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(input.d)||Number.isNaN(date.valueOf())||date.toISOString().slice(0,10)!==input.d)throw new Error('Choose a valid due date.');
    if(input.d<today()&&!input.allowPast)throw new Error("Due date can't be in the past.");
    if(input.d>maxDueDate()&&!(input.allowPast&&input.d===input.originalDueDate))throw new Error('Choose a due date within one year from today.');
    if(!Number.isSafeInteger(input.t)||input.t<1||input.t>10080)throw new Error('Estimated time must be between 1 minute and 7 days.');
    if(typeof input.o!=='boolean')throw new Error('Choose whether this assignment is optional.');
    if(input.g!==null&&(typeof input.g!=='number'||!Number.isFinite(input.g)||input.g<0||input.g>100))throw new Error('Enter a grade weight from 0 to 100, or choose unknown.');
    const earned=input.earned===undefined||input.earned===null||input.earned===''?null:Number(input.earned);
    if(earned!==null&&(!Number.isFinite(earned)||earned<0||earned>100))throw new Error('Enter an earned grade from 0 to 100, or leave it blank.');
    const p=input.p===undefined?(input.o?0:2):Number(input.p);
    if(!Number.isInteger(p)||p<0||p>3)throw new Error('Choose Low, Normal, High, or Urgent priority.');
    return {n,c,description,d:input.d,t:input.t,o:input.o,g:input.g,earned,p};
  }
  root.AssignmentFields={today,maxDueDate,validate};
})(globalThis);
