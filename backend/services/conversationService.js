import suspects from '../data/suspects.json' with {type:'json'};
import {normalizeText} from '../utils/normalizeText.js';
import {detectIntent} from './intentDetector.js';
import {localReply} from './questionRouter.js';
import {applyProgress} from './clueService.js';
import {buildSystemInstruction} from './promptBuilder.js';
import {canUseGemini,recordCall,recordFailure} from './quotaService.js';
import {generateWithGemini,generateWithGeminiStream} from './geminiService.js';

function fallbackAnswer(suspect, normalized, reason) {
	const fallback = suspect.fallback[normalized.length % suspect.fallback.length];
	return { dialogue: fallback, source: `fallback-${reason}` };
}

// Shared bookkeeping for every turn regardless of source (local/gemini/fallback).
// Emotion is intentionally NOT taken from the model anymore — see clueService.js,
// which already updates session.emotion on story-beat triggers (clue unlocks).
// This function just reads whatever the current emotion is; it doesn't set it
// from the model's own judgement each turn (that field was unused by the
// frontend anyway, and asking for it forced structured JSON output, which is
// what blocked real token streaming).
function finalizeTurn(session, suspectId, question, normalized, intent, answer, geminiError) {
	const isNewQuestion = !session.questions[suspectId].has(normalized);
	session.questions[suspectId].add(normalized);
	session.discussed[suspectId].add(intent.topic);
	if (isNewQuestion && intent.category !== 'PROMPT_INJECTION' && intent.category !== 'META_GAME') {
		const evidenceBonus = Math.min(4, Math.max(0, session.clues.size - 2));
		session.trust[suspectId] = Math.min(100, (session.trust[suspectId] || 0) + 10 + evidenceBonus);
	}
	const clueUnlocked = applyProgress(session, suspectId, intent.topic);
	session.recent[suspectId].push(
		{role:'detective', text: question.slice(0, 300)},
		{role:'suspect', text: answer.dialogue}
	);
	session.recent[suspectId] = session.recent[suspectId].slice(-10);

	return {
		dialogue: answer.dialogue,
		emotion: session.emotion[suspectId],
		source: answer.source,
		topic: intent.topic,
		clueUnlocked,
		...(process.env.NODE_ENV !== 'production' && geminiError ? {debugError: geminiError} : {}),
	};
}

// Non-streaming path — kept for tests and any future non-streaming caller.
export async function interrogate(session, suspectId, question) {
	const suspect = suspects[suspectId];
	const normalized = normalizeText(question);
	const intent = detectIntent(normalized);
	const local = localReply({session, suspectId, intent, normalized});
	if (local) return finalizeTurn(session, suspectId, question, normalized, intent, local);

	if (!canUseGemini(session)) {
		return finalizeTurn(session, suspectId, question, normalized, intent, fallbackAnswer(suspect, normalized, 'offline'));
	}

	try {
		recordCall(session);
		const systemInstruction = buildSystemInstruction({suspect, session, intent});
		const dialogue = (await generateWithGemini({
			systemInstruction,
			history: session.recent[suspectId],
			question
		})).slice(0, 500);
		if (!dialogue) throw new Error('Empty model response');
		return finalizeTurn(session, suspectId, question, normalized, intent, {dialogue, source:'gemini'});
	} catch (error) {
		recordFailure(session);
		const geminiError = error?.message || String(error);
		console.error('[Gemini interrogation error]', geminiError);
		return finalizeTurn(session, suspectId, question, normalized, intent, fallbackAnswer(suspect, normalized, 'error'), geminiError);
	}
}

// Streaming path. `onChunk(text)` is called for every piece of text as it
// arrives; the returned promise resolves with the same shape `interrogate()`
// returns, once the full turn (streaming + bookkeeping) is done.
export async function interrogateStream(session, suspectId, question, onChunk) {
	const suspect = suspects[suspectId];
	const normalized = normalizeText(question);
	const intent = detectIntent(normalized);

	const local = localReply({session, suspectId, intent, normalized});
	if (local) {
		onChunk(local.dialogue);
		return finalizeTurn(session, suspectId, question, normalized, intent, local);
	}

	if (!canUseGemini(session)) {
		const fallback = fallbackAnswer(suspect, normalized, 'offline');
		onChunk(fallback.dialogue);
		return finalizeTurn(session, suspectId, question, normalized, intent, fallback);
	}

	recordCall(session);
	let dialogue = '';
	try {
		const systemInstruction = buildSystemInstruction({suspect, session, intent});
		for await (const piece of generateWithGeminiStream({
			systemInstruction,
			history: session.recent[suspectId],
			question
		})) {
			dialogue += piece;
			onChunk(piece);
		}
		dialogue = dialogue.trim().slice(0, 500);
		if (!dialogue) throw new Error('Empty model response');
	} catch (error) {
		recordFailure(session);
		const geminiError = error?.message || String(error);
		console.error('[Gemini interrogation error]', geminiError);

		if (!dialogue.trim()) {
			// Nothing streamed yet — safe to fully replace with a fallback line.
			const fallback = fallbackAnswer(suspect, normalized, 'error');
			onChunk(fallback.dialogue);
			return finalizeTurn(session, suspectId, question, normalized, intent, fallback, geminiError);
		}
		// Partial text already reached the client — keep it rather than
		// contradicting what the player already saw on screen.
		dialogue = dialogue.trim().slice(0, 500);
		return finalizeTurn(session, suspectId, question, normalized, intent, {dialogue, source:'gemini-partial'}, geminiError);
	}

	return finalizeTurn(session, suspectId, question, normalized, intent, {dialogue, source:'gemini'});
}
