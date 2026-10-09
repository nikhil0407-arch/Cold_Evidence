import { GoogleGenAI } from '@google/genai';

const GEN_CONFIG = { temperature: 0.65, maxOutputTokens: 800 };
const STREAM_TIMEOUT_MS = 15000; // full-response timeout; streaming still starts emitting chunks well before this

function toContents(history, question) {
	return [
		...(history || []).map(turn => ({
			role: turn.role === 'detective' ? 'user' : 'model',
			parts: [{ text: turn.text }]
		})),
		{ role: 'user', parts: [{ text: question }] }
	];
}

// Real multi-turn: prior turns go in `contents` with roles, dynamic per-turn
// game state (trust/stage/evidence) goes in `systemInstruction`, rebuilt fresh
// every call since it changes turn to turn.
export async function* generateWithGeminiStream({ systemInstruction, history, question }) {
	const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS);
	try {
		const stream = await ai.models.generateContentStream({
			model: process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite',
			contents: toContents(history, question),
			config: { ...GEN_CONFIG, systemInstruction },
			signal: controller.signal
		});
		for await (const chunk of stream) {
			const text = chunk.text;
			if (text) yield text;
		}
	} finally {
		clearTimeout(timer);
	}
}

// Non-streamed convenience wrapper — kept for tests/scripts/any future
// non-streaming caller. Just drains the stream and joins it.
export async function generateWithGemini(args) {
	let full = '';
	for await (const piece of generateWithGeminiStream(args)) full += piece;
	return full.trim();
}
