const assert=require('node:assert/strict');
require('./pull-refresh.js');
const handlers={},docHandlers={},messages=[],swipes=[];
let allowed=true,requests=0,release,fail=false;
const list={scrollTop:0,ownerDocument:{addEventListener:(key,fn)=>docHandlers[key]=fn},addEventListener:(key,fn)=>handlers[key]=fn};
CanvasPullRefresh.attach(list,{canRefresh:()=>allowed,onStatus:value=>messages.push(value),onSwipe:(a,b)=>swipes.push([a,b]),onRefresh:()=>{requests++;if(fail)return Promise.reject(Error('Offline'));return new Promise(resolve=>release=resolve)}});
const target={closest:()=>null};
function touch(key,x,y,extra={}){let prevented=false;handlers[key]({target,touches:[{clientX:x,clientY:y}],changedTouches:[{clientX:x,clientY:y}],cancelable:true,preventDefault(){prevented=true},...extra});return prevented}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
 touch('touchstart',100,100);assert.equal(touch('touchmove',100,130),true);touch('touchend',100,130);await tick();assert.equal(requests,0);assert.equal(messages.at(-1),'');
 touch('touchstart',100,100);touch('touchmove',100,180);assert.equal(messages.at(-1),'Release to refresh');touch('touchend',100,180);await tick();assert.equal(requests,1);
 // A second gesture cannot start another request while the first is in flight.
 touch('touchstart',100,100);touch('touchmove',100,190);touch('touchend',100,190);await tick();assert.equal(requests,1);release();await tick();
 list.scrollTop=40;touch('touchstart',100,100);assert.equal(touch('touchmove',100,200),false);touch('touchend',100,200);await tick();assert.equal(requests,1);list.scrollTop=0;
 allowed=false;touch('touchstart',100,100);touch('touchmove',100,200);touch('touchend',100,200);await tick();assert.equal(requests,1);allowed=true;
 touch('touchstart',100,100);assert.equal(touch('touchmove',210,105),false);touch('touchend',210,105);assert.deepEqual(swipes.at(-1),[100,210]);assert.equal(requests,1);
 touch('touchstart',100,100);touch('touchmove',100,200);handlers.touchcancel();touch('touchend',100,200);await tick();assert.equal(requests,1);
 touch('touchstart',100,100);touch('touchmove',100,200,{touches:[{},{}]});touch('touchend',100,200);await tick();assert.equal(requests,1);
 touch('touchstart',100,100,{target:{closest:()=>({})}});touch('touchmove',100,200);touch('touchend',100,200);await tick();assert.equal(requests,1);
 handlers.mousedown({button:0,clientX:100,clientY:100,target});docHandlers.mousemove({clientX:100,clientY:200,cancelable:true,preventDefault(){}});docHandlers.mouseup({clientX:100,clientY:200});await tick();assert.equal(requests,2);release();await tick();
 fail=true;touch('touchstart',100,100);touch('touchmove',100,200);touch('touchend',100,200);await tick();assert.equal(requests,3);assert.match(messages.at(-1),/Could not refresh/);
 fail=false;touch('touchstart',100,100);touch('touchmove',100,200);touch('touchend',100,200);await tick();assert.equal(requests,4);release();await tick();
 console.log('PASS: short pull, release threshold, request lock, scrolled/busy/interactive exclusions, horizontal swipe, cancellation, multi-touch, and mouse drag.');
})().catch(error=>{console.error(error);process.exitCode=1});
