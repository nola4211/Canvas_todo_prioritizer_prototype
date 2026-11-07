import { pipeline } from '@supabase/middleware'
import { withOAuthProtectedResource, withSupabase } from '@supabase/server'
import type { AgentContext } from './database.ts'

export const RESOURCE = Deno.env.get('MCP_RESOURCE_URL') || 'https://uowlwdwrqceklbqjcnmc.supabase.co/functions/v1/student-mcp'
export const ISSUER = Deno.env.get('MCP_AUTH_ISSUER') || 'https://uowlwdwrqceklbqjcnmc.supabase.co/auth/v1'
export type PipelineHandler = (request:Request,context:object)=>Promise<Response>

export function authenticatedPipeline(handler:PipelineHandler){
  return pipeline([
    withOAuthProtectedResource({resourceServer:RESOURCE,authorizationServer:ISSUER}),
    withSupabase({auth:'user',cors:'disabled'}),
  ],handler)
}

export function identityValid(claims:AgentContext['jwtClaims']){
  return typeof claims.sub==='string'&&claims.sub.length>0&&claims.iss===ISSUER&&
    typeof claims.exp==='number'&&claims.exp>Math.floor(Date.now()/1000)&&claims.role==='authenticated'&&
    typeof claims.client_id==='string'&&claims.client_id.length>0&&claims.aud===RESOURCE
}
