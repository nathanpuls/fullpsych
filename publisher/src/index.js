const enc = new TextEncoder();
const allowedTypes = new Set(["paragraph","heading","link","listItem","timeline","principle","faq"]);
const allowedSlugs = new Set(["home","about","approach","first-visit","medication-guide","faqs"]);

const reply = (body, status=200) => new Response(JSON.stringify(body), {status, headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
const hex = bytes => [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,"0")).join("");
const timingSafe = (a,b) => { if(a.length!==b.length)return false; let out=0; for(let i=0;i<a.length;i++)out|=a.charCodeAt(i)^b.charCodeAt(i); return out===0; };
async function signature(secret,message){const key=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return hex(await crypto.subtle.sign("HMAC",key,enc.encode(message)));}
function validHref(value){try{return ["https:","http:","tel:","mailto:"].includes(new URL(value).protocol)}catch{return false}}
function validate(payload, sourceId){
  if(!payload || payload.schemaVersion!==1 || payload.sourceDocumentId!==sourceId) throw new Error("Unexpected source document");
  if(!Array.isArray(payload.pages) || payload.pages.length!==6) throw new Error("All six source tabs are required");
  const seen=new Set();
  for(const page of payload.pages){if(!allowedSlugs.has(page.slug)||seen.has(page.slug))throw new Error("Unexpected or duplicate page slug");seen.add(page.slug);if(!Array.isArray(page.blocks)||page.blocks.length>200)throw new Error("Invalid page blocks");
    for(const block of page.blocks){if(!allowedTypes.has(block.type))throw new Error("Unsupported block type");for(const span of block.spans||[]){if(typeof span.text!=="string"||span.text.length>10000)throw new Error("Invalid text span");if(span.href&&!validHref(span.href))throw new Error("Unsafe link")}}
  }
}
export default {async fetch(request,env){
  if(request.method==="GET")return reply({ok:true,service:"fullpsych-publisher"});
  if(request.method!=="POST")return reply({error:"Method not allowed"},405);
  const length=Number(request.headers.get("content-length")||0);if(length>300000)return reply({error:"Payload too large"},413);
  const timestamp=request.headers.get("x-fullpsych-timestamp")||"";const provided=(request.headers.get("x-fullpsych-signature")||"").toLowerCase();
  if(!/^\d{10,13}$/.test(timestamp)||Math.abs(Date.now()-Number(timestamp))>5*60*1000)return reply({error:"Expired or invalid timestamp"},401);
  const raw=await request.text();if(raw.length>300000)return reply({error:"Payload too large"},413);
  const expected=await signature(env.PUBLISH_SECRET,`${timestamp}.${raw}`);if(!timingSafe(expected,provided))return reply({error:"Invalid signature"},401);
  let payload;try{payload=JSON.parse(raw);validate(payload,env.SOURCE_DOC_ID)}catch(error){return reply({error:error.message||"Invalid payload"},400)}
  const version=new Date().toISOString().replace(/[-:.TZ]/g,"").slice(0,14)+"-"+crypto.randomUUID().slice(0,8);payload.version=version;payload.publishedAt=new Date().toISOString();const data=JSON.stringify(payload);
  const immutable="public, max-age=31536000, immutable";const current="public, max-age=0, must-revalidate, s-maxage=31536000";
  await env.CONTENT_BUCKET.put(`content/versions/${version}.json`,data,{httpMetadata:{contentType:"application/json; charset=utf-8",cacheControl:immutable},customMetadata:{sourceDocumentId:env.SOURCE_DOC_ID}});
  await env.CONTENT_BUCKET.put("content/current.json",data,{httpMetadata:{contentType:"application/json; charset=utf-8",cacheControl:current},customMetadata:{version,sourceDocumentId:env.SOURCE_DOC_ID}});
  const purge=await fetch(`https://api.cloudflare.com/client/v4/zones/${env.ZONE_ID}/purge_cache`,{method:"POST",headers:{Authorization:`Bearer ${env.CF_API_TOKEN}`,"content-type":"application/json"},body:JSON.stringify({files:[`${env.CONTENT_BASE_URL}/content/current.json`]})});
  if(!purge.ok)return reply({ok:false,version,error:"Content saved, but cache purge failed"},502);
  return reply({ok:true,version,publishedAt:payload.publishedAt});
}};

export { signature, validate };
