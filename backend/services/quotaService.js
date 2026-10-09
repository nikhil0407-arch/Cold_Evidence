function validApiKey(){
  const key=String(process.env.GEMINI_API_KEY||'').trim();
  return Boolean(key&&key!=='replace_with_your_key'&&!key.includes('YOUR_'));
}

export function canUseGemini(session){
  if(String(process.env.GEMINI_ENABLED||'true').toLowerCase()==='false'||!validApiKey())return false;
  const max=Number(process.env.GEMINI_CALLS_PER_SESSION||100);
  const perMin=Number(process.env.GEMINI_CALLS_PER_MINUTE||15);
  const now=Date.now();
  session.gemini.timestamps=session.gemini.timestamps.filter(t=>now-t<60000);
  return session.gemini.calls<max&&session.gemini.timestamps.length<perMin;
}
export function recordCall(session){session.gemini.calls++;session.gemini.timestamps.push(Date.now());}
export function recordFailure(session){session.gemini.failed++;}
export {validApiKey};
