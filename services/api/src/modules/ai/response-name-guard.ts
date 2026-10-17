const OPENING_ADDRESS = /^(\s*)([\p{L}][\p{L}'’-]{1,39})(,|\s+[—–-])\s+(?=(?:the|when|if|you|your|we|i|this|it|in|as|because|though|while|after|before|since|whenever|today|right|here)\b)/iu;

function normalizeName(name: string): string {
  return name.trim().toLocaleLowerCase().replace(/[.’’-]/g, '');
}

/** Removes only an unverified name used as the answer's opening form of address. */
export function removeUnverifiedOpeningAddress(
  response: string,
  authorizedName?: string,
  knownSourceNames: string[] = [],
): string {
  const match = response.match(OPENING_ADDRESS);
  if (!match) return response;

  const candidate = match[2];
  if (authorizedName && normalizeName(candidate) === normalizeName(authorizedName)) return response;

  const continuation = response.slice(match[0].length).trimStart();
  const knownName = knownSourceNames.some(name => normalizeName(name) === normalizeName(candidate));
  const isNarrativeApposition = knownName && /^(?:the|who|whose|was|is|known|called)\b/i.test(continuation);
  if (isNarrativeApposition) return response;

  if (!continuation) return response;
  return `${match[1]}${continuation[0].toLocaleUpperCase()}${continuation.slice(1)}`;
}
