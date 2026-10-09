import endings from '../data/endings.json' with {type:'json'};
import {requireSession,createSession,resetSession,publicState} from '../state/gameStateManager.js';
import {interrogateStream} from '../services/conversationService.js';
import {discoverEnvironmental} from '../services/clueService.js';

export function startSession(req,res){const s=createSession(req.body?.playerId);res.json(publicState(s));}
export function sessionState(req,res){res.json(publicState(requireSession(req.params.sessionId)));}
export function reset(req,res){res.json(publicState(resetSession(req.params.sessionId)));}

// Streams NDJSON lines: {"type":"chunk","text":"..."} as dialogue arrives,
// then one final {"type":"done", dialogue, emotion, source, topic, clueUnlocked, state}.
export async function ask(req,res){
	const {sessionId,suspectId,question}=req.safe;
	const s=requireSession(sessionId);

	res.setHeader('Content-Type','application/x-ndjson');
	res.setHeader('Cache-Control','no-cache');
	res.setHeader('X-Accel-Buffering','no'); // disable reverse-proxy buffering (nginx etc.) so chunks flush immediately

	try{
		const result=await interrogateStream(s,suspectId,question,(text)=>{
			res.write(JSON.stringify({type:'chunk',text})+'\n');
		});
		res.write(JSON.stringify({type:'done',...result,state:publicState(s)})+'\n');
	}catch(err){
		console.error('[interrogate stream error]',err);
		res.write(JSON.stringify({type:'error',error:'Something went wrong.'})+'\n');
	}finally{
		res.end();
	}
}

export function discover(req,res){const s=requireSession(req.body?.sessionId);const clue=discoverEnvironmental(s,req.body?.clueId);if(!clue)return res.status(400).json({error:'This clue cannot be unlocked here.'});res.json({clueUnlocked:clue,state:publicState(s)});}
export async function accuse(req,res){
	const s=requireSession(req.body?.sessionId);
	const suspectId=String(req.body?.suspectId||'').trim().toLowerCase();
	if(!endings[suspectId])return res.status(400).json({error:'Choose a valid suspect.'});
	const ending=suspectId==='emma'?endings.emma:endings[suspectId];
	s.ending=ending;

	if(ending.type==='true'&&req.user){
		const supabaseAdmin=req.app.locals.supabaseAdmin;
		const {error}=await supabaseAdmin
			.from('profiles')
			.update({changenamelater:1})
			.eq('id',req.user.id);
		if(error)console.error('[profile changenamelater update error]',error);
	}

	res.json({ending,state:publicState(s)});
}
