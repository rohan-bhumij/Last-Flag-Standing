import test from 'node:test';
import assert from 'node:assert/strict';
import { COUNTRIES_64, validateCountryManifest } from '../data/countries';
import {
  isEligibleForHatchFall,
  enforceCircularBoundary,
  evaluateHatchCycleState,
  computeNextMatchPhase,
  parseChatSupportCommand,
  SupportArenaTracker,
  diffNewSubscribers,
  buildEliminationCommentary,
  buildWinnerCommentary,
} from './rules';

test('64-country manifest validates with 64 unique recognizable countries', () => {
  const result = validateCountryManifest(COUNTRIES_64);
  assert.equal(result.valid, true);
  assert.equal(result.totalCount, 64);
  assert.equal(result.duplicateCodes.length, 0);
  assert.equal(result.missingFlags.length, 0);
});

test('central hatch eligibility strictly enforces d + r <= R', () => {
  const hatchX = 500;
  const hatchY = 500;
  const R = 70;
  const r = 18;

  // Token completely inside aperture (d = 40, d + r = 58 <= 70) -> falls
  assert.equal(isEligibleForHatchFall(540, 500, r, hatchX, hatchY, R), true);

  // Token exactly tangent to inner aperture edge (d = 52, d + r = 70 <= 70) -> falls
  assert.equal(isEligibleForHatchFall(552, 500, r, hatchX, hatchY, R), true);

  // Token overlapping rim (d = 55, d + r = 73 > 70) -> MUST NOT fall
  assert.equal(isEligibleForHatchFall(555, 500, r, hatchX, hatchY, R), false);

  // Token outside aperture (d = 100) -> MUST NOT fall
  assert.equal(isEligibleForHatchFall(600, 500, r, hatchX, hatchY, R), false);
});

test('circular boundary containment prevents token escape and reflects velocity inward', () => {
  const centerX = 400;
  const centerY = 400;
  const arenaRadius = 300;
  const tokenRadius = 20;

  // Token outside boundary at (720, 400) moving outward (+5, 0)
  const res = enforceCircularBoundary(720, 400, 5, 0, centerX, centerY, arenaRadius, tokenRadius, 0.9);
  assert.equal(res.collided, true);
  assert.equal(Math.round(res.x), 400 + (300 - 20));
  assert.equal(res.y, 400);
  assert.ok(res.vx < 0, 'Velocity should reflect inward');
});

test('hatch cycle timing transitions between closed, warning, and open phases', () => {
  const settings = { cycleDurationSec: 6.0, openDurationSec: 1.0, warningLeadSec: 2.0 };

  // At t = 1.5s -> closed, not warning, 3.5s until open
  const s1 = evaluateHatchCycleState(1.5, settings);
  assert.equal(s1.isHatchOpen, false);
  assert.equal(s1.isWarning, false);
  assert.equal(Math.round(s1.secondsUntilOpen * 10) / 10, 3.5);

  // At t = 3.5s -> closed, in warning phase (1.5s until open <= 2.0s lead)
  const s2 = evaluateHatchCycleState(3.5, settings);
  assert.equal(s2.isHatchOpen, false);
  assert.equal(s2.isWarning, true);

  // At t = 5.4s -> hatch is open
  const s3 = evaluateHatchCycleState(5.4, settings);
  assert.equal(s3.isHatchOpen, true);
  assert.equal(s3.isWarning, false);
});

test('match lifecycle never declares a winner prematurely while spawning or >1 remaining', () => {
  // Spawning only 1 token so far -> stays in INTRO, never WINNER_REVEAL
  const p1 = computeNextMatchPhase({
    currentPhase: 'INTRO',
    spawnedCount: 1,
    remainingCount: 1,
    isHatchOpen: false,
    isWarning: false,
    hasRecentElimination: false,
    hasActiveAnnouncement: false,
  });
  assert.equal(p1, 'INTRO');

  // All 64 spawned, 41 remaining, warning active -> HAZARD_WARNING
  const p2 = computeNextMatchPhase({
    currentPhase: 'ACTIVE_MATCH',
    spawnedCount: 64,
    remainingCount: 41,
    isHatchOpen: false,
    isWarning: true,
    hasRecentElimination: false,
    hasActiveAnnouncement: false,
  });
  assert.equal(p2, 'HAZARD_WARNING');

  // All 64 spawned, 1 remaining -> WINNER_REVEAL
  const p3 = computeNextMatchPhase({
    currentPhase: 'FINALISTS',
    spawnedCount: 64,
    remainingCount: 1,
    isHatchOpen: false,
    isWarning: false,
    hasRecentElimination: false,
    hasActiveAnnouncement: false,
  });
  assert.equal(p3, 'WINNER_REVEAL');
});

test('chat support command parser accepts valid commands and rejects ordinary chat', () => {
  const india = parseChatSupportCommand('!support India');
  assert.ok(india);
  assert.equal(india.code, 'IN');

  const japan = parseChatSupportCommand('!vote JPN');
  assert.ok(japan);
  assert.equal(japan.code, 'JP');

  const costaRica = parseChatSupportCommand('!support Costa Rica');
  assert.ok(costaRica);
  assert.equal(costaRica.code, 'CR');

  // Ordinary chat mentioning a country without command prefix must be rejected
  assert.equal(parseChatSupportCommand('I think India or Brazil will win this match!'), null);
  assert.equal(parseChatSupportCommand('!support Wakanda'), null);
});

test('support tracker deduplicates events, rate-limits viewers, and awards shields at threshold', () => {
  const tracker = new SupportArenaTracker(COUNTRIES_64);
  const india = COUNTRIES_64.find((c) => c.code === 'IN')!;

  const r1 = tracker.processSupportEvent({
    eventId: 'evt-1',
    viewerId: 'user-1',
    viewerName: 'Rohan',
    country: india,
    timestamp: 1000,
    cooldownMs: 2000,
    shieldThreshold: 3,
    reviveThreshold: 6,
    isCountryEliminated: false,
    remainingCount: 40,
  });
  assert.equal(r1.accepted, true);
  assert.equal(r1.state?.supportCount, 1);

  // Duplicate eventId rejected
  const dup = tracker.processSupportEvent({
    eventId: 'evt-1',
    viewerId: 'user-2',
    viewerName: 'Alex',
    country: india,
    timestamp: 5000,
    cooldownMs: 2000,
    shieldThreshold: 3,
    reviveThreshold: 6,
    isCountryEliminated: false,
    remainingCount: 40,
  });
  assert.equal(dup.accepted, false);
  assert.equal(dup.reason, 'DUPLICATE_EVENT');

  // Rate limit same viewer within cooldown window
  const rateLimited = tracker.processSupportEvent({
    eventId: 'evt-2',
    viewerId: 'user-1',
    viewerName: 'Rohan',
    country: india,
    timestamp: 2000,
    cooldownMs: 2000,
    shieldThreshold: 3,
    reviveThreshold: 6,
    isCountryEliminated: false,
    remainingCount: 40,
  });
  assert.equal(rateLimited.accepted, false);
  assert.equal(rateLimited.reason, 'RATE_LIMITED');

  // Reach shield threshold (3) using weight=2 from another user
  const shieldEvt = tracker.processSupportEvent({
    eventId: 'evt-3',
    viewerId: 'user-2',
    viewerName: 'Priya',
    country: india,
    timestamp: 4000,
    cooldownMs: 2000,
    shieldThreshold: 3,
    reviveThreshold: 6,
    isCountryEliminated: false,
    remainingCount: 40,
    weight: 2,
  });
  assert.equal(shieldEvt.accepted, true);
  assert.equal(shieldEvt.effect, 'SHIELD_GRANTED');
  assert.equal(tracker.hasShield('IN'), true);
  assert.equal(tracker.consumeShield('IN'), true);
  assert.equal(tracker.hasShield('IN'), false);
});

test('subscriber diffing ignores historical baseline and only announces newly observed public subscribers', () => {
  const seen = new Set<string>();
  const batch1 = [
    { subscriptionId: 'sub-101', title: 'Alice' },
    { subscriptionId: 'sub-102', title: 'Bob' },
  ];

  // Baseline sync should record IDs without announcing historical subscribers
  const res1 = diffNewSubscribers(batch1, seen, true);
  assert.equal(res1.newlyDetected.length, 0);
  assert.equal(res1.updatedSeenIds.length, 2);

  // Subsequent poll with 1 existing and 1 genuinely new subscriber
  const batch2 = [
    { subscriptionId: 'sub-102', title: 'Bob' },
    { subscriptionId: 'sub-103', title: 'Charlie' },
  ];
  const res2 = diffNewSubscribers(batch2, seen, false);
  assert.equal(res2.newlyDetected.length, 1);
  assert.equal(res2.newlyDetected[0].title, 'Charlie');
});

test('commentary builders accurately include country name and remaining count', () => {
  const elimLine = buildEliminationCommentary({
    countryName: 'Nepal',
    remainingAfter: 42,
    matchNumber: 149,
    sequenceIndex: 0,
  });
  assert.ok(elimLine.includes('NEPAL'));
  assert.ok(elimLine.includes('42'));

  const winLine = buildWinnerCommentary({
    countryName: 'India',
    totalWins: 3,
    matchNumber: 149,
  });
  assert.ok(winLine.includes('INDIA WINS LAST FLAG STANDING'));
  assert.ok(winLine.includes('Cycle 149'));
});

test('1-minute shield cooldown prevents unlimited shields until 60s cooldown expires', () => {
  const tracker = new SupportArenaTracker(COUNTRIES_64);
  const brazil = COUNTRIES_64.find((c) => c.code === 'BR')!;

  // Award first shield at t = 1000ms (threshold = 5, weight = 5)
  const firstShield = tracker.processSupportEvent({
    eventId: 'br-1',
    viewerId: 'v-1',
    viewerName: 'Lucas',
    country: brazil,
    timestamp: 1000,
    cooldownMs: 0,
    shieldThreshold: 5,
    reviveThreshold: 10,
    isCountryEliminated: false,
    remainingCount: 50,
    weight: 5,
    shieldCooldownMs: 60_000,
  });
  assert.equal(firstShield.effect, 'SHIELD_GRANTED');
  assert.equal(tracker.hasShield('BR'), true);

  // Shield is consumed at t = 10_000ms
  assert.equal(tracker.consumeShield('BR', 10_000, 60_000), true);
  assert.equal(tracker.hasShield('BR'), false);

  // Attempt to earn another shield at t = 30_000ms (still within 60s cooldown!) -> blocked from granting shield
  const duringCooldown = tracker.processSupportEvent({
    eventId: 'br-2',
    viewerId: 'v-2',
    viewerName: 'Mateo',
    country: brazil,
    timestamp: 30_000,
    cooldownMs: 0,
    shieldThreshold: 5,
    reviveThreshold: 10,
    isCountryEliminated: false,
    remainingCount: 45,
    weight: 10,
    shieldCooldownMs: 60_000,
  });
  assert.equal(duringCooldown.effect, 'BOOST_IMPULSE');
  assert.equal(tracker.hasShield('BR'), false);

  // After 1 minute has passed (t = 75_000ms > 70_000ms cooldown end), country can earn a shield again!
  const afterCooldown = tracker.processSupportEvent({
    eventId: 'br-3',
    viewerId: 'v-3',
    viewerName: 'Ana',
    country: brazil,
    timestamp: 75_000,
    cooldownMs: 0,
    shieldThreshold: 5,
    reviveThreshold: 10,
    isCountryEliminated: false,
    remainingCount: 30,
    weight: 5,
    shieldCooldownMs: 60_000,
  });
  assert.equal(afterCooldown.effect, 'SHIELD_GRANTED');
  assert.equal(tracker.hasShield('BR'), true);
});

