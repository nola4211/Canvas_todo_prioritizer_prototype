import { createClient } from 'npm:@supabase/supabase-js@2'

const allowedOrigins = new Set((Deno.env.get('ALLOWED_ORIGINS') ||
  'https://nola4211.github.io,http://127.0.0.1:4183,http://localhost:4183')
  .split(',').map(value => value.trim()).filter(Boolean))

function response(origin:string|null,status:number,body:object){
  const headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'}
  if(origin&&allowedOrigins.has(origin))headers['Access-Control-Allow-Origin']=origin
  return new Response(JSON.stringify(body),{status,headers})
}

// User administration stays in this server function because the service-role
// key must never be included in the public website.
Deno.serve(async request=>{
  const origin=request.headers.get('origin')
  if(origin&&!allowedOrigins.has(origin))return response(origin,403,{error:'This website is not allowed.'})
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{
    'Access-Control-Allow-Origin':origin||'','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',
    'Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Max-Age':'600','Vary':'Origin'
  }})
  if(request.method!=='POST')return response(origin,405,{error:'Use POST.'})
  const url=Deno.env.get('SUPABASE_URL'),serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if(!url||!serviceKey)return response(origin,503,{error:'User maintenance is not configured.'})
  const authorization=request.headers.get('authorization')||''
  if(!authorization.startsWith('Bearer '))return response(origin,401,{error:'Sign in as an administrator.'})
  const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}})
  const {data:callerData,error:callerError}=await admin.auth.getUser(authorization.slice(7))
  const caller=callerData.user
  if(callerError||!caller)return response(origin,401,{error:'Sign in again.'})
  if(caller.app_metadata?.role!=='admin')return response(origin,403,{error:'Administrator access is required.'})
  let body:any
  try{body=await request.json()}catch{return response(origin,400,{error:'Invalid request.'})}
  const action=String(body?.action||'')
  try{
    if(action==='list'){
      const {data,error}=await admin.auth.admin.listUsers({page:1,perPage:1000})
      if(error)throw error
      const users=data.users.map(user=>({id:user.id,email:user.email||'',created_at:user.created_at,last_sign_in_at:user.last_sign_in_at||null,is_admin:user.app_metadata?.role==='admin'}))
      return response(origin,200,{users})
    }
    if(action==='create'){
      const email=String(body.email||'').trim().toLowerCase(),password=String(body.password||'')
      if(!/^\S+@\S+\.\S+$/.test(email))return response(origin,400,{error:'Enter a valid email address.'})
      if(password.length<8)return response(origin,400,{error:'Use a password with at least 8 characters.'})
      const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true})
      if(error)throw error
      return response(origin,200,{user:{id:data.user.id,email:data.user.email||'',created_at:data.user.created_at,last_sign_in_at:null,is_admin:false}})
    }
    if(action==='update'){
      const id=String(body.id||''),email=String(body.email||'').trim().toLowerCase(),password=String(body.password||'')
      if(!id)return response(origin,400,{error:'Choose a user.'})
      if(!/^\S+@\S+\.\S+$/.test(email))return response(origin,400,{error:'Enter a valid email address.'})
      if(password&&password.length<8)return response(origin,400,{error:'New passwords need at least 8 characters.'})
      const changes:any={email,email_confirm:true};if(password)changes.password=password
      const {data,error}=await admin.auth.admin.updateUserById(id,changes)
      if(error)throw error
      return response(origin,200,{user:{id:data.user.id,email:data.user.email||'',created_at:data.user.created_at,last_sign_in_at:data.user.last_sign_in_at||null,is_admin:data.user.app_metadata?.role==='admin'}})
    }
    if(action==='delete'){
      const id=String(body.id||'')
      if(!id)return response(origin,400,{error:'Choose a user.'})
      if(id===caller.id)return response(origin,400,{error:'You cannot delete the account you are using.'})
      const {error}=await admin.auth.admin.deleteUser(id)
      if(error)throw error
      return response(origin,200,{deleted:true})
    }
    return response(origin,400,{error:'Choose a supported user action.'})
  }catch(error){
    console.warn('Admin user action failed:',action)
    return response(origin,400,{error:error instanceof Error?error.message:'The user action could not be completed.'})
  }
})
