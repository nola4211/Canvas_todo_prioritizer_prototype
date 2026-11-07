export type DbResult = {ok:boolean;data?:Record<string,unknown>;error_code?:string;warnings?:string[]}
export type DbClient = {rpc:(name:string,args?:Record<string,unknown>)=>Promise<{data:DbResult|null;error:{code?:string}|null}>}
export type AgentContext = {supabase:DbClient;jwtClaims:Record<string,unknown>}

export async function invoke(client:DbClient,name:string,args:Record<string,unknown>={}){
  let timer:ReturnType<typeof setTimeout>|undefined
  try{
    const call=client.rpc(name,args)
    const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('UNAVAILABLE')),15000)})
    const {data,error}=await Promise.race([call,timeout])
    if(error)throw new Error(['401','403','PGRST301','PGRST302'].includes(error.code||'')?'REAUTH_REQUIRED':'UNAVAILABLE')
    if(!data||!data.ok)throw new Error(data?.error_code||'UNAVAILABLE')
    if(!data.data||typeof data.data!=='object')throw new Error('UNAVAILABLE')
    return {data:data.data,warnings:data.warnings}
  }finally{if(timer!==undefined)clearTimeout(timer)}
}

export function sessionCursor(value:unknown){
  if(value==null||value==='')return {p_cursor_start:null,p_cursor_id:null}
  if(typeof value!=='string')throw new Error('VALIDATION_ERROR')
  const at=value.lastIndexOf('|'),start=value.slice(0,at),id=value.slice(at+1)
  if(at<1||!Number.isFinite(Date.parse(start))||!/^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.test(id))throw new Error('VALIDATION_ERROR')
  return {p_cursor_start:start,p_cursor_id:id}
}
