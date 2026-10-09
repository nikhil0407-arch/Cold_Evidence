import crypto from 'node:crypto';
import caseData from '../data/case.json' with {type:'json'};

const sessions = new Map();

function fresh(id) {
  return {
    id,
    createdAt: Date.now(),
    // The body and the red wine bottle are visible at the scene from the start.
    clues: new Set(['body', 'red_wine_bottle']),
    discussed: { emma: new Set(), victor: new Set(), sarah: new Set(), ethan: new Set() },
    questions: { emma: new Set(), victor: new Set(), sarah: new Set(), ethan: new Set() },
    recent: { emma: [], victor: [], sarah: [], ethan: [] },
    trust: { emma: 0, victor: 0, sarah: 0, ethan: 0 },
    emotion: {
      emma: 'neutral',
      victor: 'defensive',
      sarah: 'frightened',
      ethan: 'calm'
    },
    contradictions: { emma: 0, victor: 0, sarah: 0, ethan: 0 },
    witnessedWrappedBottle: new Set(),
    gemini: { calls: 0, failed: 0, timestamps: [] },
    cache: new Map(),
    ending: null
  };
}

export function createSession(requested) {
  const id = (requested && /^[a-zA-Z0-9_-]{3,80}$/.test(requested)) ? requested : crypto.randomUUID();
  if (!sessions.has(id)) sessions.set(id, fresh(id));
  return sessions.get(id);
}

export function getSession(id) { return sessions.get(id) || null; }
export function requireSession(id) { return getSession(id) || createSession(id); }
export function resetSession(id) { const s = fresh(id); sessions.set(id, s); return s; }

export function publicState(s) {
  const required = caseData.requiredForTrueAccusation || [];
  const accusationAvailable = required.every(id => s.clues.has(id));
  return {
    sessionId: s.id,
    collectedClues: [...s.clues],
    trust: s.trust,
    emotion: s.emotion,
    ending: s.ending,
    accusationAvailable
  };
}
