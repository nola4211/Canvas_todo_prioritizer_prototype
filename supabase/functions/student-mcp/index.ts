import { createMcpHandler } from '@modelcontextprotocol/server'
import { authenticatedPipeline, identityValid, RESOURCE } from './auth.ts'
import { type AgentContext } from './database.ts'
import { createStudentMcpServer } from './tools.ts'

const BODY_LIMIT = 64 * 1024
const ORIGINS = new Set((Deno.env.get('ALLOWED_ORIGINS') || 'https://nola4211.github.io,http://127.0.0.1:4183,http://localhost:4183').split(',').map(x => x.trim()).filter(Boolean))

const handler = authenticatedPipeline((request:Request,context:object)=>{
  const ctx=context as AgentContext
  if(!identityValid(ctx.jwtClaims))return Promise.resolve(new Response('Unauthorized',{status:401,headers:{
    'Cache-Control':'no-store','WWW-Authenticate':'Bearer resource_metadata="'+RESOURCE+'/oauth-protected-resource"',
  }}))
  return createMcpHandler(()=>createStudentMcpServer(ctx)).fetch(request)
})

function cors(response:Response,origin:string|null){
  const headers=new Headers(response.headers);headers.set('Cache-Control','no-store')
  if(origin&&ORIGINS.has(origin)){
    headers.set('Access-Control-Allow-Origin',origin);headers.set('Access-Control-Allow-Credentials','true')
    headers.set('Access-Control-Expose-Headers','WWW-Authenticate, Mcp-Session-Id');headers.append('Vary','Origin')
  }
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers})
}

async function bounded(request:Request):Promise<Request|Response>{
  if(['GET','HEAD','OPTIONS'].includes(request.method)||!request.body)return request
  if(Number(request.headers.get('content-length')||0)>BODY_LIMIT)return new Response('Request body too large',{status:413})
  const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0
  while(true){
    const {done,value}=await reader.read();if(done)break
    size+=value.byteLength
    if(size>BODY_LIMIT){await reader.cancel();return new Response('Request body too large',{status:413})}
    chunks.push(value)
  }
  const body=new Uint8Array(size);let offset=0
  for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.byteLength}
  const headers=new Headers(request.headers);headers.delete('content-length')
  return new Request(request.url,{method:request.method,headers,body,signal:request.signal})
}

Deno.serve(async(request:Request)=>{
  const origin=request.headers.get('origin')
  if(origin&&!ORIGINS.has(origin))return new Response('Origin is not allowed',{status:403,headers:{'Cache-Control':'no-store'}})
  if(request.method==='OPTIONS'){
    if(!origin)return new Response(null,{status:204})
    return new Response(null,{status:204,headers:{
      'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Credentials':'true',
      'Access-Control-Allow-Methods':'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info, mcp-protocol-version, last-event-id',
      'Access-Control-Expose-Headers':'WWW-Authenticate, Mcp-Session-Id','Access-Control-Max-Age':'600','Vary':'Origin',
    }})
  }
  const requestOrResponse=await bounded(request)
  if(requestOrResponse instanceof Response)return cors(requestOrResponse,origin)
  return cors(await handler(requestOrResponse),origin)
})
