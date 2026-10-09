const emotions=new Set(['neutral','nervous','defensive','angry','frightened','sad','guarded']);
const categories=new Set(['CASE_RELEVANT','SMALL_TALK','IRRELEVANT','REPEATED','META_GAME','PROMPT_INJECTION','ABUSIVE','UNKNOWN']);
export function validateModelResponse(v) {
	if (!v || typeof v !== 'object'|| typeof v.dialogue !== 'string' || !v.dialogue.trim()) return null;
	return {dialogue:v.dialogue.trim().slice(0,500), emotion:emotions.has(v.emotion) ? v.emotion : 'neutral', category:categories.has(v.category) ? v.category : 'UNKNOWN', topic:typeof v.topic === 'string' ? v.topic.slice(0,60) : 'unknown', confidence:Number.isFinite(v.confidence) ? Math.max(0,Math.min(1,v.confidence)) : 0.5,suggestedClueId : typeof v.suggestedClueId === 'string' ? v.suggestedClueId:null};
}
