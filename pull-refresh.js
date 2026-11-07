(function(root){
 'use strict';
 function attach(list,{canRefresh,onRefresh,onStatus,onSwipe}){
  const doc=list.ownerDocument;let gesture=null,refreshing=false;
  function start(x,y,target){
   gesture={x,y,lastX:x,lastY:y,pull:list.scrollTop<=0&&canRefresh()&&!refreshing&&!target?.closest?.('button,input,select,textarea,a'),vertical:false};
  }
  function move(x,y,event){
   if(!gesture)return;
   gesture.lastX=x;gesture.lastY=y;
   const dy=y-gesture.y,dx=x-gesture.x;
   if(!gesture.pull)return;
   if(dy<=8||Math.abs(dx)>dy){if(gesture.vertical)onStatus('');return;}
   gesture.vertical=true;
   if(event.cancelable)event.preventDefault();
   onStatus(dy>=64?'Release to refresh':'Pull down to refresh',Math.min(1,Math.max(0,dy/64)));
  }
  function end(x,y){
   if(!gesture)return;
   const current=gesture;gesture=null;
   const dy=y-current.y,dx=x-current.x;
   if(current.vertical){
    if(dy>=64&&Math.abs(dx)<dy&&canRefresh()&&!refreshing){
     refreshing=true;Promise.resolve().then(onRefresh).finally(()=>{refreshing=false}).catch(()=>onStatus('Could not refresh assignments. Please try again.'));
    }else onStatus('');
   }else if(Math.abs(dx)>Math.abs(dy))onSwipe(current.x,x);
  }
  list.addEventListener('touchstart',event=>{if(event.touches.length===1){const p=event.touches[0];start(p.clientX,p.clientY,event.target)}else{gesture=null;onStatus('')}},{passive:true});
  list.addEventListener('touchmove',event=>{if(event.touches.length!==1){gesture=null;onStatus('');return}const p=event.touches[0];move(p.clientX,p.clientY,event)},{passive:false});
  list.addEventListener('touchend',event=>{const p=event.changedTouches[0];if(p)end(p.clientX,p.clientY)},{passive:true});
  list.addEventListener('touchcancel',()=>{gesture=null;if(!refreshing)onStatus('')},{passive:true});
  list.addEventListener('mousedown',event=>{if(event.button===0)start(event.clientX,event.clientY,event.target)});
  doc.addEventListener('mousemove',event=>move(event.clientX,event.clientY,event));
  doc.addEventListener('mouseup',event=>end(event.clientX,event.clientY));
 }
 root.CanvasPullRefresh={attach};
})(typeof window==='undefined'?globalThis:window);
