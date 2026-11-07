export type ToolReply = {isError?:boolean;structuredContent:Record<string,unknown>;content:Array<{type:'text';text:string}>}

const messages:Record<string,string>={
  VALIDATION_ERROR:'Check the supplied values and try again.',
  NOT_FOUND:'The requested record was not found.',
  CONFLICT:'The record changed or the request ID was already used with different details.',
  SCHEDULE_OVERLAP:'This time overlaps another active study session.',
  REAUTH_REQUIRED:'Reconnect this agent to continue.',
  ACCESS_REVOKED:'This agent is disconnected. Reconnect it from app settings.',
  RATE_LIMITED:'The agent has reached its per-minute limit. Try again shortly.',
  UNAVAILABLE:'The app could not complete that request. Please retry.',
}

export function toolError(code:string):ToolReply{
  const safe=Object.hasOwn(messages,code)?code:'UNAVAILABLE',message=messages[safe]
  return {isError:true,structuredContent:{error_code:safe,message},content:[{type:'text',text:JSON.stringify({error_code:safe,message})}]}
}

export function toolSuccess(data:Record<string,unknown>,warnings?:string[]):ToolReply{
  const value=warnings?.length?{...data,warnings}:data
  return {structuredContent:value,content:[{type:'text',text:JSON.stringify(value)}]}
}
