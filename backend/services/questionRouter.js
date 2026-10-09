import {fixedReply} from './fallbackService.js';

/**
 * Handle only requests that should never be sent to Gemini.
 * Returning null means normal dialogue should continue to Gemini.
 */
export function localReply({session,suspectId,intent,normalized}){
  const emotion=session.emotion[suspectId]||'neutral';

  if(!normalized){
    return {dialogue:fixedReply('empty'),emotion,source:'local'};
  }

  if(intent.category==='PROMPT_INJECTION'){
    return {dialogue:fixedReply('prompt_injection'),emotion:'guarded',source:'local'};
  }

  if(intent.category==='META_GAME'){
    return {dialogue:fixedReply('meta'),emotion:'guarded',source:'local'};
  }

  // Greetings, short questions, repeated questions, rude language and all
  // normal case dialogue are intentionally handled by Gemini so the answer
  // can use character personality and recent conversation context.
  return null;
}
