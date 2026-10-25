import { COUNTRIES_64, CountrySpec } from '../data/countries';

export type MatchPhase =
  | 'READY'
  | 'INTRO'
  | 'ACTIVE_MATCH'
  | 'HAZARD_WARNING'
  | 'HATCH_OPEN'
  | 'ELIMINATION_CONFIRMED'
  | 'ANNOUNCEMENT'
  | 'FINALISTS'
  | 'WINNER_REVEAL'
  | 'NEXT_MATCH';

export type OperatingMode = 'DEMO' | 'LIVE';
export type BroadcastFormat = '16:9' | '9:16';

export interface ArenaSettings {
  channelTitle: string; // default 'LAST FLAG STANDING'
  cycleDurationSec: number; // default 5.0 (4.0 closed + 1.0 open)
  openDurationSec: number; // default 1.0
  warningLeadSec: number; // default 2.0
  maxTokenSpeed: number; // default 3.15
  minTokenSpeed: number; // default 2.15
  deflectorRotSpeed: number; // rad/sec default 0.2618
  tokenRestitution: number; // default 0.98
  supportShieldThreshold: number; // default 20
  supportReviveThreshold: number; // default 40
  viewerCooldownMs: number; // default 2500
  winnerRevealDurationSec: number; // default 7.0
  targetStreamDurationHours: number; // default 11.5 hours for Oracle VM marathon
  commentaryStyle: 'ENERGETIC_BROADCAST' | 'DRAMATIC_STADIUM' | 'CONCISE_ESPORTS';
  voiceName: 'Aria' | 'Sonia' | 'Natasha' | 'Kore' | 'Fenrir' | 'Puck' | 'Charon' | 'Zephyr';
  useGeminiContextualCommentary: boolean;
}

export const DEFAULT_ARENA_SETTINGS: ArenaSettings = {
  channelTitle: 'LAST FLAG STANDING',
  cycleDurationSec: 5.0,
  openDurationSec: 1.0,
  warningLeadSec: 2.0,
  maxTokenSpeed: 3.15,
  minTokenSpeed: 2.15,
  deflectorRotSpeed: 0.2618, // Exactly 15 deg/sec (Math.PI / 12) counter-clockwise as in the reference video
  tokenRestitution: 0.98,
  supportShieldThreshold: 20,
  supportReviveThreshold: 50,
  viewerCooldownMs: 2500,
  winnerRevealDurationSec: 7.0,
  targetStreamDurationHours: 11.5,
  commentaryStyle: 'ENERGETIC_BROADCAST',
  voiceName: 'Aria',
  useGeminiContextualCommentary: true,
};

export interface EliminationRecord {
  eventId: string;
  countryCode: string;
  countryName: string;
  countryAbbr: string;
  remainingAfter: number;
  placement: number; // e.g., 64 down to 2
  timestamp: number;
  matchNumber: number;
}

export interface CommunityEventPayload {
  id: string;
  source: 'DEMO' | 'YOUTUBE_LIVE';
  type:
    | 'CHAT_SUPPORT'
    | 'SUPER_CHAT'
    | 'SUPER_STICKER'
    | 'NEW_MEMBER'
    | 'GIFT_MEMBERSHIP'
    | 'NEW_SUBSCRIBER';
  authorName: string;
  authorId: string;
  countryCode?: string;
  countryName?: string;
  amountDisplay?: string;
  tierName?: string;
  messageText?: string;
  timestamp: number;
  matchNumber: number;
  triggeredEffect?: 'SHIELD_GRANTED' | 'REVIVE_GRANTED' | 'BOOST_IMPULSE' | 'NONE';
}

export interface CountrySupportState {
  countryCode: string;
  countryName: string;
  supportCount: number;
  hasShield: boolean;
  shieldsAwarded: number;
  revivesAwarded: number;
  shieldCooldownUntil: number; // Timestamp (ms) until which this country cannot earn another shield (1 min cooldown)
  lastSupporter?: string;
}

export const SHIELD_COOLDOWN_MS = 60_000; // 1 minute cooldown between shields for the same country

/**
 * Dynamically scales flag speed UP and elimination chamber opening cooldown DOWN
 * as the number of remaining flags decreases from 64 down to 2.
 */
export function computeDynamicArenaPacing(
  remainingCount: number,
  baseSettings: ArenaSettings
): {
  speedMultiplier: number;
  effectiveMinSpeed: number;
  effectiveMaxSpeed: number;
  effectiveDeflectorRotSpeed: number;
  effectiveCycleDurationSec: number;
  effectiveOpenDurationSec: number;
  effectiveWarningLeadSec: number;
} {
  const clampedRemaining = Math.max(2, Math.min(64, remainingCount));
  // 0.0 at 64 flags remaining -> 1.0 at 2 flags remaining
  const eliminationProgress = (64 - clampedRemaining) / 62;

  // Increase flag speed smoothly up to +52% faster as flags decrease
  const speedMultiplier = 1 + eliminationProgress * 0.52;
  const effectiveMinSpeed = Number((baseSettings.minTokenSpeed * speedMultiplier).toFixed(2));
  const effectiveMaxSpeed = Number((baseSettings.maxTokenSpeed * speedMultiplier).toFixed(2));
  const effectiveDeflectorRotSpeed = Number(
    (baseSettings.deflectorRotSpeed * (1 + eliminationProgress * 0.35)).toFixed(4)
  );

  // Decrease elimination chamber opening cooldown time as flags decrease so matches stay fast-paced
  const baseOpen = Math.max(0.5, baseSettings.openDurationSec);
  const baseClosed = Math.max(1.5, baseSettings.cycleDurationSec - baseOpen);
  // Scales closed countdown from 4.0s (at 64 flags) down to ~1.6s (when <= 4 flags remain)
  const effectiveClosed = Math.max(1.5, baseClosed * (1 - eliminationProgress * 0.58));
  const effectiveCycleDurationSec = Number((effectiveClosed + baseOpen).toFixed(2));
  const effectiveWarningLeadSec = Math.min(baseSettings.warningLeadSec, effectiveClosed * 0.65);

  return {
    speedMultiplier,
    effectiveMinSpeed,
    effectiveMaxSpeed,
    effectiveDeflectorRotSpeed,
    effectiveCycleDurationSec,
    effectiveOpenDurationSec: baseOpen,
    effectiveWarningLeadSec,
  };
}

/**
 * Exact aperture fall rule from specification:
 * If token radius is r, opening radius is R, and centre distance from the opening is d:
 * require d + r <= R.
 * Partial rim overlap (d + r > R) must NEVER cause elimination.
 */
export function isEligibleForHatchFall(
  tokenX: number,
  tokenY: number,
  tokenRadius: number,
  hatchX: number,
  hatchY: number,
  hatchRadius: number
): boolean {
  if (tokenRadius <= 0 || hatchRadius <= 0 || tokenRadius > hatchRadius) {
    return false;
  }
  const d = Math.hypot(tokenX - hatchX, tokenY - hatchY);
  // Add small epsilon tolerance (1e-6) for IEEE-754 floating point boundary
  return d + tokenRadius <= hatchRadius + 1e-6;
}

/**
 * Computes normalized proximity danger [0..1] when a token approaches the aperture rim.
 * Only highlights a token as in danger when its center is within 1.45 * hatchRadius.
 */
export function computeApertureDangerLevel(
  tokenX: number,
  tokenY: number,
  hatchX: number,
  hatchY: number,
  hatchRadius: number
): number {
  const d = Math.hypot(tokenX - hatchX, tokenY - hatchY);
  const outerThreshold = hatchRadius * 1.45;
  if (d >= outerThreshold) return 0;
  if (d <= hatchRadius * 0.65) return 1;
  return Math.max(0, Math.min(1, 1 - (d - hatchRadius * 0.65) / (outerThreshold - hatchRadius * 0.65)));
}

/**
 * Clamps 2D velocity vector between minSpeed and maxSpeed so tokens stay readable
 * and never stall or tunnel through barriers.
 */
export function clampTokenVelocity(
  vx: number,
  vy: number,
  minSpeed: number,
  maxSpeed: number
): { vx: number; vy: number } {
  const speed = Math.hypot(vx, vy);
  if (speed < 1e-5) {
    return { vx: minSpeed, vy: 0 };
  }
  if (speed > maxSpeed) {
    const scale = maxSpeed / speed;
    return { vx: vx * scale, vy: vy * scale };
  }
  if (speed < minSpeed) {
    const scale = minSpeed / speed;
    return { vx: vx * scale, vy: vy * scale };
  }
  return { vx, vy };
}

/**
 * Prevents numerical instability from allowing any token to escape the circular boundary.
 * Returns corrected position and inward-reflected velocity if outside (arenaRadius - tokenRadius).
 */
export function enforceCircularBoundary(
  x: number,
  y: number,
  vx: number,
  vy: number,
  centerX: number,
  centerY: number,
  arenaRadius: number,
  tokenRadius: number,
  restitution = 0.92
): { x: number; y: number; vx: number; vy: number; collided: boolean } {
  const dx = x - centerX;
  const dy = y - centerY;
  const dist = Math.hypot(dx, dy);
  const maxDist = arenaRadius - tokenRadius;

  if (dist <= maxDist || dist < 1e-5) {
    return { x, y, vx, vy, collided: false };
  }

  const nx = dx / dist;
  const ny = dy / dist;
  const clampedX = centerX + nx * maxDist;
  const clampedY = centerY + ny * maxDist;

  // Reflect velocity along outward normal if moving outward
  const dot = vx * nx + vy * ny;
  let rvx = vx;
  let rvy = vy;
  if (dot > 0) {
    rvx = (vx - 2 * dot * nx) * restitution;
    rvy = (vy - 2 * dot * ny) * restitution;
  }

  return { x: clampedX, y: clampedY, vx: rvx, vy: rvy, collided: true };
}

/**
 * Deterministic Hatch Timing Calculator within a cycle.
 */
export function evaluateHatchCycleState(
  cycleElapsedSec: number,
  settings: Pick<ArenaSettings, 'cycleDurationSec' | 'openDurationSec' | 'warningLeadSec'>
): {
  isHatchOpen: boolean;
  isWarning: boolean;
  secondsUntilOpen: number;
  secondsRemainingOpen: number;
  cycleProgress: number;
} {
  const total = Math.max(2.0, settings.cycleDurationSec);
  const openDur = Math.max(0.4, Math.min(total - 0.8, settings.openDurationSec));
  const closedDur = total - openDur;
  const warningLead = Math.max(0.4, Math.min(closedDur - 0.15, settings.warningLeadSec));

  const t = ((cycleElapsedSec % total) + total) % total;

  if (t < closedDur) {
    const secondsUntilOpen = closedDur - t;
    const isWarning = secondsUntilOpen <= warningLead;
    return {
      isHatchOpen: false,
      isWarning,
      secondsUntilOpen,
      secondsRemainingOpen: 0,
      cycleProgress: t / total,
    };
  } else {
    const secondsRemainingOpen = total - t;
    return {
      isHatchOpen: true,
      isWarning: false,
      secondsUntilOpen: 0,
      secondsRemainingOpen,
      cycleProgress: t / total,
    };
  }
}

/**
 * Match lifecycle transition guard:
 * Never declare a winner while contestants are spawning or if remainingCount !== 1.
 */
export function computeNextMatchPhase(params: {
  currentPhase: MatchPhase;
  spawnedCount: number;
  remainingCount: number;
  isHatchOpen: boolean;
  isWarning: boolean;
  hasRecentElimination: boolean;
  hasActiveAnnouncement: boolean;
}): MatchPhase {
  const {
    currentPhase,
    spawnedCount,
    remainingCount,
    isHatchOpen,
    isWarning,
    hasRecentElimination,
    hasActiveAnnouncement,
  } = params;

  if (currentPhase === 'READY' || currentPhase === 'INTRO') {
    if (spawnedCount < 64) return currentPhase;
  }

  // Winner check: strictly requires all 64 spawned and exactly 1 country remaining
  if (spawnedCount === 64 && remainingCount === 1) {
    if (currentPhase === 'NEXT_MATCH') return 'NEXT_MATCH';
    return 'WINNER_REVEAL';
  }

  if (hasRecentElimination) {
    return 'ELIMINATION_CONFIRMED';
  }

  if (hasActiveAnnouncement) {
    return 'ANNOUNCEMENT';
  }

  if (isHatchOpen) {
    return 'HATCH_OPEN';
  }

  if (isWarning) {
    return 'HAZARD_WARNING';
  }

  if (remainingCount <= 5 && remainingCount > 1) {
    return 'FINALISTS';
  }

  return 'ACTIVE_MATCH';
}

/**
 * Parses viewer chat support commands (`!support <country>`, `!vote <country>`),
 * and optionally direct country name replies in live chat when `allowDirectCountryName = true`.
 */
export function parseChatSupportCommand(
  rawMessage: string,
  roster: CountrySpec[] = COUNTRIES_64,
  allowDirectCountryName = false
): CountrySpec | null {
  if (!rawMessage || typeof rawMessage !== 'string') return null;
  const trimmed = rawMessage.trim();

  // Match explicit !support, !vote, !flag, or /support command prefix
  const cmdMatch = trimmed.match(/^(?:!support|!vote|!flag|\/support)\s+([a-zA-Z\s.'-]{2,32})$/i);
  let query = cmdMatch ? cmdMatch[1].trim().toLowerCase() : '';

  if (!query && allowDirectCountryName) {
    // Allow direct short country replies in live stream chat (e.g., "India", "Brazil", "Costa Rica", "from Philippines")
    const cleaned = trimmed
      .replace(/^(?:i am from|i'm from|im from|from|team|go)\s+/i, '')
      .replace(/[!?.❤️🔥🛡️👏👍]+$/g, '')
      .trim();
    if (cleaned.length >= 2 && cleaned.length <= 28) {
      query = cleaned.toLowerCase();
    }
  }

  if (!query) return null;

  // Match against name, ISO-2 code, ISO-3 abbr, or common aliases
  const aliases: Record<string, string> = {
    usa: 'US',
    'u.s.a.': 'US',
    'united states of america': 'US',
    'united states': 'US',
    america: 'US',
    uk: 'GB',
    britain: 'GB',
    england: 'GB',
    korea: 'KR',
    'south korea': 'KR',
    uae: 'SA',
    ksa: 'SA',
    czech: 'CZ',
    'czech republic': 'CZ',
    holland: 'NL',
  };

  const aliasCode = aliases[query];
  if (aliasCode) {
    const found = roster.find((c) => c.code.toLowerCase() === aliasCode.toLowerCase());
    if (found) return found;
  }

  for (const country of roster) {
    if (
      country.name.toLowerCase() === query ||
      country.code.toLowerCase() === query ||
      country.abbr.toLowerCase() === query
    ) {
      return country;
    }
  }

  return null;
}

/**
 * Event deduplication, per-viewer rate limiting, and 1-minute per-country shield cooldown tracker.
 */
export class SupportArenaTracker {
  private processedEventIds = new Set<string>();
  private viewerLastSupportAt = new Map<string, number>();
  private supportByCountry = new Map<string, CountrySupportState>();

  constructor(roster: CountrySpec[] = COUNTRIES_64) {
    for (const c of roster) {
      this.supportByCountry.set(c.code, {
        countryCode: c.code,
        countryName: c.name,
        supportCount: 0,
        hasShield: false,
        shieldsAwarded: 0,
        revivesAwarded: 0,
        shieldCooldownUntil: 0,
      });
    }
  }

  public resetForNewMatch(roster: CountrySpec[] = COUNTRIES_64) {
    this.viewerLastSupportAt.clear();
    for (const c of roster) {
      this.supportByCountry.set(c.code, {
        countryCode: c.code,
        countryName: c.name,
        supportCount: 0,
        hasShield: false,
        shieldsAwarded: 0,
        revivesAwarded: 0,
        shieldCooldownUntil: 0,
      });
    }
  }

  public processSupportEvent(params: {
    eventId: string;
    viewerId: string;
    viewerName: string;
    country: CountrySpec;
    timestamp: number;
    cooldownMs: number;
    shieldThreshold: number;
    reviveThreshold: number;
    isCountryEliminated: boolean;
    remainingCount: number;
    weight?: number;
    shieldCooldownMs?: number;
  }): {
    accepted: boolean;
    reason?: 'DUPLICATE_EVENT' | 'RATE_LIMITED' | 'INVALID_COUNTRY' | 'SHIELD_COOLDOWN';
    state?: CountrySupportState;
    effect: 'SHIELD_GRANTED' | 'REVIVE_GRANTED' | 'BOOST_IMPULSE' | 'NONE';
  } {
    const {
      eventId,
      viewerId,
      viewerName,
      country,
      timestamp,
      cooldownMs,
      shieldThreshold,
      reviveThreshold,
      isCountryEliminated,
      remainingCount,
      weight = 1,
      shieldCooldownMs = SHIELD_COOLDOWN_MS,
    } = params;

    if (this.processedEventIds.has(eventId)) {
      return { accepted: false, reason: 'DUPLICATE_EVENT', effect: 'NONE' };
    }

    const lastAt = this.viewerLastSupportAt.get(viewerId);
    if (lastAt !== undefined && timestamp - lastAt < cooldownMs) {
      return { accepted: false, reason: 'RATE_LIMITED', effect: 'NONE' };
    }

    const state = this.supportByCountry.get(country.code);
    if (!state) {
      return { accepted: false, reason: 'INVALID_COUNTRY', effect: 'NONE' };
    }

    this.processedEventIds.add(eventId);
    this.viewerLastSupportAt.set(viewerId, timestamp);

    const prevCount = state.supportCount;
    const isOnShieldCooldown = !isCountryEliminated && timestamp < state.shieldCooldownUntil;

    // If a country is alive and currently on its 1-minute shield cooldown (or already has an active shield),
    // do not let it accumulate unlimited extra shields; cap progress just below the next shield threshold
    if (!isCountryEliminated && (state.hasShield || isOnShieldCooldown)) {
      const nextShieldCap = (state.shieldsAwarded + 1) * shieldThreshold - 1;
      state.supportCount = Math.min(nextShieldCap, state.supportCount + Math.max(1, weight));
    } else {
      state.supportCount += Math.max(1, weight);
    }
    state.lastSupporter = viewerName;

    let effect: 'SHIELD_GRANTED' | 'REVIVE_GRANTED' | 'BOOST_IMPULSE' | 'NONE' = 'BOOST_IMPULSE';

    // Check if wild card revive threshold crossed for an eliminated country:
    // If chat comments > 50 times, country gets 1 wild card entry per match (before Final 5)
    if (
      isCountryEliminated &&
      remainingCount > 5 &&
      state.revivesAwarded === 0 &&
      state.supportCount > reviveThreshold
    ) {
      state.revivesAwarded = 1;
      effect = 'REVIVE_GRANTED';
    } else if (
      !isCountryEliminated &&
      !state.hasShield &&
      !isOnShieldCooldown &&
      shieldThreshold > 0 &&
      Math.floor(state.supportCount / shieldThreshold) > state.shieldsAwarded &&
      prevCount < state.supportCount
    ) {
      state.hasShield = true;
      state.shieldsAwarded += 1;
      state.shieldCooldownUntil = timestamp + shieldCooldownMs;
      effect = 'SHIELD_GRANTED';
    }

    return {
      accepted: true,
      state: { ...state },
      effect,
    };
  }

  public grantDirectShieldOrRevive(
    countryCode: string,
    supporterName: string,
    isEliminated: boolean,
    remainingCount: number,
    timestamp = Date.now(),
    shieldCooldownMs = SHIELD_COOLDOWN_MS
  ): 'SHIELD_GRANTED' | 'REVIVE_GRANTED' | 'BOOST_IMPULSE' {
    const state = this.supportByCountry.get(countryCode);
    if (!state) return 'BOOST_IMPULSE';
    state.lastSupporter = supporterName;
    if (isEliminated && remainingCount > 5 && state.revivesAwarded === 0) {
      state.revivesAwarded = 1;
      return 'REVIVE_GRANTED';
    }
    if (state.hasShield || timestamp < state.shieldCooldownUntil) {
      return 'BOOST_IMPULSE';
    }
    state.hasShield = true;
    state.shieldsAwarded += 1;
    state.shieldCooldownUntil = timestamp + shieldCooldownMs;
    return 'SHIELD_GRANTED';
  }

  public consumeShield(
    countryCode: string,
    timestamp = Date.now(),
    shieldCooldownMs = SHIELD_COOLDOWN_MS
  ): boolean {
    const state = this.supportByCountry.get(countryCode);
    if (!state || !state.hasShield) return false;
    state.hasShield = false;
    // Enforce 1-minute cooldown from the moment a shield is granted/broken before the next shield can be earned
    state.shieldCooldownUntil = Math.max(state.shieldCooldownUntil, timestamp + shieldCooldownMs);
    return true;
  }

  public getShieldCooldownRemainingMs(countryCode: string, timestamp = Date.now()): number {
    const state = this.supportByCountry.get(countryCode);
    if (!state) return 0;
    return Math.max(0, state.shieldCooldownUntil - timestamp);
  }

  public hasShield(countryCode: string): boolean {
    return this.supportByCountry.get(countryCode)?.hasShield ?? false;
  }

  public getLeaderboard(limit = 5): CountrySupportState[] {
    return Array.from(this.supportByCountry.values())
      .filter((s) => s.supportCount > 0)
      .sort((a, b) => b.supportCount - a.supportCount)
      .slice(0, limit);
  }

  public getAllStates(): Record<string, CountrySupportState> {
    const out: Record<string, CountrySupportState> = {};
    for (const [k, v] of this.supportByCountry.entries()) {
      out[k] = { ...v };
    }
    return out;
  }
}

/**
 * Subscriber monitoring deduplication helper:
 * Compares retrieved YouTube public subscriber IDs with previously seen IDs.
 * On initial baseline sync (`isBaselineSync = true`), records existing IDs without announcing them
 * as new broadcast subscribers.
 */
export function diffNewSubscribers<T extends { subscriptionId: string }>(
  fetchedSubscriptions: T[],
  seenSubscriptionIds: Set<string>,
  isBaselineSync: boolean
): { newlyDetected: T[]; updatedSeenIds: string[] } {
  const newlyDetected: T[] = [];

  for (const sub of fetchedSubscriptions) {
    if (!sub.subscriptionId) continue;
    if (!seenSubscriptionIds.has(sub.subscriptionId)) {
      seenSubscriptionIds.add(sub.subscriptionId);
      if (!isBaselineSync) {
        newlyDetected.push(sub);
      }
    }
  }

  return {
    newlyDetected,
    updatedSeenIds: Array.from(seenSubscriptionIds),
  };
}

/**
 * Deterministic, varied commentary line builder for eliminations, finalists, winners, and community events.
 * Ensures the eliminated country's exact name and remaining count are always spoken accurately.
 */
export function buildEliminationCommentary(params: {
  countryName: string;
  remainingAfter: number;
  matchNumber: number;
  sequenceIndex: number;
  style?: ArenaSettings['commentaryStyle'];
}): string {
  const { countryName, remainingAfter, sequenceIndex, style = 'ENERGETIC_BROADCAST' } = params;
  const upper = countryName.toUpperCase();

  if (remainingAfter === 5) {
    return `${upper} is out! Final 5 countries remain!`;
  }

  if (remainingAfter === 2) {
    return `${upper} is out! Down to the final 2!`;
  }

  if (style === 'CONCISE_ESPORTS') {
    return `${upper} is out! ${remainingAfter} remain.`;
  }

  const templates = [
    `${upper} is out! ${remainingAfter} countries remain!`,
    `${upper} is out! ${remainingAfter} remain!`,
    `${upper} has fallen! ${remainingAfter} countries left!`,
    `${upper} is out! ${remainingAfter} left in the arena!`,
  ];

  return templates[sequenceIndex % templates.length];
}

export function buildWinnerCommentary(params: {
  countryName: string;
  totalWins: number;
  matchNumber: number;
}): string {
  const { countryName, totalWins, matchNumber } = params;
  const upper = countryName.toUpperCase();
  const winLabel = totalWins === 1 ? 'their first victory today' : `daily victory number ${totalWins}`;
  return `INCREDIBLE! ${upper} WINS LAST FLAG STANDING! ${countryName} survives all 63 rivals in Cycle ${matchNumber} to claim ${winLabel}!`;
}

export function buildCommunityCommentary(event: CommunityEventPayload): string | null {
  switch (event.type) {
    case 'SUPER_CHAT':
    case 'SUPER_STICKER':
      if (event.triggeredEffect === 'REVIVE_GRANTED' && event.countryName) {
        return `Super Chat from ${event.authorName}! ${event.countryName.toUpperCase()} IS BACK IN!`;
      }
      if (event.triggeredEffect === 'SHIELD_GRANTED' && event.countryName) {
        return `Super Chat from ${event.authorName}! Shield granted to ${event.countryName.toUpperCase()}!`;
      }
      return `Super Chat from ${event.authorName}${event.countryName ? ` backing ${event.countryName}` : ''}!`;
    case 'NEW_MEMBER':
    case 'GIFT_MEMBERSHIP':
      if (event.triggeredEffect === 'REVIVE_GRANTED' && event.countryName) {
        return `${event.countryName.toUpperCase()} IS BACK IN!`;
      }
      if (event.triggeredEffect === 'SHIELD_GRANTED' && event.countryName) {
        return `Shield activated for ${event.countryName.toUpperCase()}!`;
      }
      return null;
    case 'NEW_SUBSCRIBER':
      // Subscribers are celebrated with temporary visual pop-up animations + chime only (no TTS voice announcement)
      return null;
    case 'CHAT_SUPPORT':
      if (event.triggeredEffect === 'REVIVE_GRANTED' && event.countryName) {
        return `${event.countryName.toUpperCase()} IS BACK IN!`;
      }
      if (event.triggeredEffect === 'SHIELD_GRANTED' && event.countryName) {
        return `Shield activated for ${event.countryName.toUpperCase()}!`;
      }
      return null;
    default:
      return null;
  }
}


