import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

// Public password endpoint (gateway verify_jwt=false). Passwords are handed to
// Supabase Auth; they are never logged, stored in application tables or returned.
const allowedOrigins = new Set([
  'https://kizuna.aleklecaribou.chatgpt.site',
  'http://127.0.0.1:8795',
]);
const confirmationUrl = 'https://kizuna.aleklecaribou.chatgpt.site/?auth=confirmed';
const recoveryUrl = 'https://kizuna.aleklecaribou.chatgpt.site/?auth=recovery';
const usernamePattern = /^[A-Za-z0-9_.-]{2,20}$/;
const maxBodyBytes = 4096;
const burstWindows = new Map<string,{start:number,count:number}>();
const genericSignup = {
  status:'check_email', confirmationSent:null,
  message:'Si ces informations permettent une inscription, consulte ta boîte e-mail pour poursuivre. Tu peux demander un nouvel envoi, te connecter ou récupérer ton compte.',
};
const genericRecovery = {status:'check_email',confirmationSent:null,message:'Si un compte Kizuna correspond à ces informations, consulte ta boîte e-mail pour poursuivre la récupération de ton mot de passe.'};

class RequestError extends Error {
  constructor(public status:number,public code:string,message:string,public retryAfter?:number) {super(message);}
}
function responseHeaders(origin:string|null) {
  const headers=new Headers({'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Pragma':'no-cache','X-Content-Type-Options':'nosniff',Vary:'Origin','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info, traceparent, tracestate, baggage','Access-Control-Expose-Headers':'Retry-After'});
  if(origin&&allowedOrigins.has(origin))headers.set('Access-Control-Allow-Origin',origin);
  return headers;
}
function reply(body:unknown,status:number,headers:Headers) {return new Response(JSON.stringify(body),{status,headers});}
async function readBody(request:Request):Promise<Record<string,unknown>> {
  if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw new RequestError(415,'INVALID_CONTENT_TYPE','Le format de la requête est invalide.');
  const stated=Number(request.headers.get('content-length')||0);
  if(stated>maxBodyBytes)throw new RequestError(413,'BODY_TOO_LARGE','La requête est trop volumineuse.');
  const reader=request.body?.getReader();if(!reader)throw new RequestError(400,'INVALID_BODY','La requête est invalide.');
  let size=0;const chunks:Uint8Array[]=[];
  while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>maxBodyBytes){await reader.cancel();throw new RequestError(413,'BODY_TOO_LARGE','La requête est trop volumineuse.');}chunks.push(part.value);}
  try{const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(!value||typeof value!=='object'||Array.isArray(value))throw 0;return value;}catch{throw new RequestError(400,'INVALID_BODY','La requête est invalide.');}
}
function emailAddress(value:unknown):string|null {
  if(typeof value!=='string')return null;const email=value.trim().toLowerCase();
  if(email.length>254||email.length<5||!/^[-A-Za-z0-9.!#$%&'*+/=?^_`{|}~]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/.test(email))return null;
  const local=email.split('@')[0];return local.length>64||local.startsWith('.')||local.endsWith('.')||local.includes('..')?null:email;
}
function username(value:unknown):string {
  const name=typeof value==='string'?value.trim():'';
  if(!usernamePattern.test(name))throw new RequestError(400,'INVALID_USERNAME','Le pseudo doit contenir de 2 à 20 lettres, chiffres, points, tirets ou tirets bas.');return name;
}
function password(value:unknown,min:number):string {
  if(typeof value!=='string'||value.length<min||value.length>128)throw new RequestError(400,'INVALID_PASSWORD',min===7?'Le mot de passe doit contenir de 7 à 128 caractères.':'Le pseudo ou le mot de passe est incorrect.');return value;
}
function sourceIp(request:Request):string {
  return (request.headers.get('cf-connecting-ip')||request.headers.get('x-real-ip')||request.headers.get('x-forwarded-for')?.split(',')[0]||'unknown').trim().slice(0,100);
}
async function fingerprint(ip:string,secret:string):Promise<string> {
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const hash=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode('kizuna-auth:'+ip));return [...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,'0')).join('');
}
function checkBurst(key:string,action:string) {
  const now=Date.now();if(burstWindows.size>2000)for(const [id,window]of burstWindows){if(now-window.start>=60000)burstWindows.delete(id);}
  if(burstWindows.size>=5000&&!burstWindows.has(key+':'+action))throw new RequestError(429,'RATE_LIMITED','Trop de tentatives. Patiente une minute.',60);
  const id=key+':'+action,old=burstWindows.get(id);const value=old&&now-old.start<60000?old:{start:now,count:0};value.count++;burstWindows.set(id,value);
  if(value.count>(action==='login'?8:3))throw new RequestError(429,'RATE_LIMITED','Trop de tentatives. Patiente une minute.',Math.max(1,Math.ceil((60000-(now-value.start))/1000)));
}
const invalidCredentials=()=>new RequestError(401,'INVALID_CREDENTIALS','Le pseudo ou le mot de passe est incorrect.');
const unavailable=()=>new RequestError(503,'AUTH_UNAVAILABLE','Le service de comptes est momentanément indisponible.');
function duplicateEmail(error:any) {return ['email_exists','user_already_exists','email_address_exists'].includes(error?.code)||/already (?:been )?(?:registered|exists)/i.test(String(error?.message||''));}
function authRateLimited(error:any) {return error?.status===429||/rate.limit|too many/i.test(String(error?.code||''));}

async function profileForUsername(service:any,name:string) {
  // Underscores are valid username characters, so escape their LIKE meaning.
  const result=await service.from('kizuna_profiles').select('id').ilike('username',name.replaceAll('_','\\_')).maybeSingle();
  if(result.error)throw unavailable();return result.data;
}
export async function handler(request:Request):Promise<Response> {
  const origin=request.headers.get('origin'),headers=responseHeaders(origin);
  try{
    if(origin&&!allowedOrigins.has(origin))throw new RequestError(403,'ORIGIN_NOT_ALLOWED','Accès refusé.');
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
    if(request.method!=='POST'){headers.set('Allow','POST, OPTIONS');throw new RequestError(405,'METHOD_NOT_ALLOWED','Méthode non autorisée.');}
    const body=await readBody(request),action=body.action;
    if(!['login','signup','resend','recovery'].includes(String(action)))throw new RequestError(400,'INVALID_ACTION','La requête est invalide.');
    const name=username(body.username);
    const suppliedPassword=action==='resend'||action==='recovery'?'':password(body.password,action==='signup'?7:1);
    const email=action==='login'?null:emailAddress(body.email);
    if(action!=='login'&&!email)throw new RequestError(400,'INVALID_EMAIL','Renseigne une adresse e-mail valide.');
    const supabaseUrl=Deno.env.get('SUPABASE_URL'),serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),anonKey=Deno.env.get('SUPABASE_ANON_KEY');
    if(!supabaseUrl||!serviceKey||!anonKey)throw unavailable();
    const hash=await fingerprint(sourceIp(request),serviceKey);checkBurst(hash,String(action));
    const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(input:any,init:any)=>fetch(input,{...init,signal:AbortSignal.timeout(15000)})}};
    const service=createClient(supabaseUrl,serviceKey,options),auth=createClient(supabaseUrl,anonKey,options);

    if(action==='login'){
      const profile=await profileForUsername(service,name);
      const lookup=profile?.id?await service.auth.admin.getUserById(profile.id):null;
      // Missing names still take the normal Auth password/rate-limit path.
      const privateEmail=lookup&&!lookup.error?lookup.data?.user?.email:null;
      const result=await auth.auth.signInWithPassword({email:privateEmail||'kizuna-unavailable@invalid.invalid',password:suppliedPassword});
      if(authRateLimited(result.error))throw new RequestError(429,'RATE_LIMITED','Trop de tentatives. Patiente quelques minutes.',60);
      if(!profile?.id||!privateEmail||result.error||!result.data?.session||result.data.user?.id!==profile.id)throw invalidCredentials();
      return reply({session:result.data.session},200,headers);
    }
    if(action==='resend'||action==='recovery'){
      const profile=await profileForUsername(service,name);
      const lookup=profile?.id?await service.auth.admin.getUserById(profile.id):null;
      const user=lookup&&!lookup.error?lookup.data?.user:null;
      if(user&&user.email?.toLowerCase()===email){
        // Matching, missing and delivery-failure cases deliberately have the
        // same public response; private e-mail associations are not disclosed.
        try {
          if(action==='recovery')await auth.auth.resetPasswordForEmail(email!,{redirectTo:recoveryUrl});
          else if(!user.email_confirmed_at)await auth.auth.resend({type:'signup',email:email!,options:{emailRedirectTo:confirmationUrl}});
        } catch {/* The generic reply makes no mail-delivery promise. */}
      }
      return reply(action==='recovery'?genericRecovery:genericSignup,200,headers);
    }

    const allowance=await service.rpc('kizuna_take_signup_slot',{p_fingerprint:hash});
    if(allowance.error)throw unavailable();if(!allowance.data)throw new RequestError(429,'RATE_LIMITED','Trop de créations de compte depuis cette connexion. Réessaie dans une heure.',3600);
    const token=crypto.randomUUID();
    const reserved=await service.rpc('kizuna_reserve_username',{p_username:name,p_token:token});
    if(reserved.error)throw unavailable();if(!reserved.data)throw new RequestError(409,'USERNAME_UNAVAILABLE','Ce pseudo est déjà utilisé. Choisis-en un autre.');
    let newUser:any=null,finished=false;
    try{
      // Atomic creation rejects existing e-mails rather than altering any
      // existing Yugen account. Confirmation is intentionally NEVER bypassed.
      const created=await service.auth.admin.createUser({email:email!,password:suppliedPassword,email_confirm:false,user_metadata:{username:name}});
      if(created.error){
        if(duplicateEmail(created.error))return reply(genericSignup,200,headers);
        if(authRateLimited(created.error))throw new RequestError(429,'RATE_LIMITED','Trop de tentatives. Patiente quelques minutes.',60);
        if(created.error.code==='weak_password')throw new RequestError(400,'WEAK_PASSWORD','Choisis un mot de passe plus solide, avec au moins 7 caractères.');
        throw unavailable();
      }
      newUser=created.data?.user;if(!newUser?.id||newUser.email_confirmed_at)throw unavailable();
      const profile=await service.rpc('kizuna_finish_username',{p_username:name,p_token:token,p_user_id:newUser.id});
      if(profile.error||profile.data!==true)throw unavailable();finished=true;
    }catch(error){
      // Cleanup is limited to the NEW, still-unconfirmed account returned by
      // createUser in this request; no pre-existing account can reach this path.
      if(newUser?.id&&!finished){try{const check=await service.auth.admin.getUserById(newUser.id);if(check.data?.user&&!check.data.user.email_confirmed_at)await service.auth.admin.deleteUser(newUser.id);}catch{/* A failed cleanup is not expanded to other users. */}}
      throw error;
    }finally{
      if(!finished){try{await service.rpc('kizuna_release_username',{p_username:name,p_token:token});}catch{/* An unused reservation expires automatically. */}}
    }
    try {await auth.auth.resend({type:'signup',email:email!,options:{emailRedirectTo:confirmationUrl}});}catch{/* Keep the unconfirmed account available for a later resend. */}
    return reply(genericSignup,200,headers);
  }catch(error){
    const known=error instanceof RequestError?error:unavailable();if(known.retryAfter)headers.set('Retry-After',String(known.retryAfter));
    return reply({error:known.message,code:known.code},known.status,headers);
  }
}

Deno.serve(handler);
