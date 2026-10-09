// Story-stage progression for "The Last Toast".
//
// The detective can only unlock the four load-bearing testimonial clues by
// asking the right suspect once the correct evidence is in play. This matches
// the six-stage investigation described in the case brief:
//   Stage 1 - basic answers only
//   Stage 2 - poison sachets discovered -> Sarah/Emma admit the kitchen visit
//   Stage 3 - drinks asked about -> Sarah/Victor confirm white wine, Emma insists on red
//   Stage 4 - multiple witnesses corroborate the wrapped bottle
//   Stage 5 - CCTV watched -> shoe-size line of questioning becomes possible
//   Stage 6 - all four combined -> Emma can be broken (handled by accusation logic)

function ensureWitnessTracker(session) {
  if (!session.witnessedWrappedBottle) session.witnessedWrappedBottle = new Set();
}

export function applyProgress(session, suspectId, topic) {
  let unlocked = null;
  ensureWitnessTracker(session);

  // Stage 2 - kitchen entry (needs sachets already discovered)
  if (
    session.clues.has('poison_sachets') &&
    !session.clues.has('kitchen_entry') &&
    topic === 'kitchen' &&
    (suspectId === 'sarah' || suspectId === 'emma')
  ) {
    unlocked = 'kitchen_entry';
  }

  // Stage 3 - white wine testimony (Sarah remembers, Victor confirms Adrian refused red)
  if (
    !session.clues.has('white_wine') &&
    (topic === 'drinks' || topic === 'white_wine' || topic === 'red_wine') &&
    (suspectId === 'sarah' || suspectId === 'victor')
  ) {
    unlocked = unlocked || 'white_wine';
  }

  // Stage 4 - wrapped bottle needs BOTH Sarah and Ethan to independently corroborate
  if (
    !session.clues.has('wrapped_bottle') &&
    (topic === 'wrapped_bottle' || topic === 'emma' || topic === 'library') &&
    (suspectId === 'sarah' || suspectId === 'ethan') &&
    ((session.trust?.[suspectId] || 0) >= 40 || session.clues.size >= 6)
  ) {
    session.witnessedWrappedBottle.add(suspectId);
    if (
      session.witnessedWrappedBottle.has('sarah') &&
      session.witnessedWrappedBottle.has('ethan')
    ) {
      unlocked = unlocked || 'wrapped_bottle';
    }
  }

  // Stage 5 - CCTV must already be discovered, then shoe questioning unlocks the match
  if (
    session.clues.has('cctv') &&
    !session.clues.has('shoe_match') &&
    topic === 'shoes'
  ) {
    unlocked = unlocked || 'shoe_match';
  }

  if (unlocked) {
    session.clues.add(unlocked);
    applyEmotionalEffects(session, unlocked);
  }
  return unlocked;
}

// Environmental clues are discovered by walking to specific rooms in the
// frontend (evidence room, CCTV room). The controller calls this with a clueId
// and we only accept the ones that make sense for that route.
export function discoverEnvironmental(session, clueId) {
  const allowed = new Set([
    'poison_sachets',
    'fingerprint',
    'handwritten_note',
    'cctv',
    'footprints'
  ]);
  if (!allowed.has(clueId)) return null;
  if (session.clues.has(clueId)) return null;
  session.clues.add(clueId);
  applyEmotionalEffects(session, clueId);
  return clueId;
}

function applyEmotionalEffects(session, clueId) {
  const effects = {
    poison_sachets: { sarah: 'frightened' },
    handwritten_note: { victor: 'defensive' },
    white_wine: { emma: 'guarded' },
    kitchen_entry: { emma: 'defensive' },
    wrapped_bottle: { emma: 'nervous' },
    shoe_match: { emma: 'nervous' }
  };
  const map = effects[clueId];
  if (!map) return;
  for (const [suspect, emotion] of Object.entries(map)) {
    session.emotion[suspect] = emotion;
  }
}
