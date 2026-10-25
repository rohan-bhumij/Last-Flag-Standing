import React, { useEffect, useRef } from 'react';
import Matter from 'matter-js';
import { COUNTRIES_64, CountrySpec, drawCountryFlagOnContext } from '../data/countries';
import {
  ArenaSettings,
  clampTokenVelocity,
  computeApertureDangerLevel,
  computeDynamicArenaPacing,
  enforceCircularBoundary,
  evaluateHatchCycleState,
  isEligibleForHatchFall,
} from './rules';
import { soundEngine } from '../audio/soundEngine';

export interface TelemetrySnapshot {
  remainingCount: number;
  eliminatedCount: number;
  isHatchOpen: boolean;
  isWarning: boolean;
  secondsUntilOpen: number;
  secondsRemainingOpen: number;
  cycleProgress: number;
  dangerCountries: string[];
  fps: number;
  effectiveCycleDurationSec?: number;
  speedMultiplier?: number;
  isDoubleDraw?: boolean;
  drawQuota?: number;
  eliminatedThisCycle?: number;
}

export interface ArenaSimulationHandle {
  forceHatchOpen: (doubleDraw?: boolean) => void;
  restartMatch: () => void;
  reviveCountry: (countryCode: string) => boolean;
  impulseCountry: (countryCode: string) => void;
}

export interface PersistedArenaSimState {
  matchNumber: number;
  cycleElapsedSec: number;
  deflectorOrbitAngle: number;
  eliminatedCodes: string[];
  tokens: Array<{
    code: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
    angle: number;
  }>;
}

interface FallingTokenState {
  country: CountrySpec;
  x: number;
  y: number;
  vx: number;
  vy: number;
  zDepth: number; // 0 = floor surface, 1.0 = elimination plane
  vz: number;
  radius: number;
  confirmed: boolean;
}

interface PooledParticle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

interface ArenaCanvasProps {
  paused: boolean;
  settings: ArenaSettings;
  matchNumber: number;
  shieldedCodes: Set<string>;
  onEliminationConfirmed: (country: CountrySpec, remainingCount: number) => void;
  onShieldConsumed: (country: CountrySpec) => void;
  onMatchWinnerConfirmed: (winner: CountrySpec) => void;
  onTelemetryUpdate: (snapshot: TelemetrySnapshot) => void;
  simRef?: React.MutableRefObject<ArenaSimulationHandle | null>;
  persistedStateRef?: React.MutableRefObject<PersistedArenaSimState | null>;
}

const ARENA_LOGICAL_SIZE = 760;
const ARENA_CENTER = ARENA_LOGICAL_SIZE / 2; // 380
const ARENA_RADIUS = 372; // Edge-to-edge across the 760px canvas (diameter 744px, leaving 8px for neon glow)
const HATCH_RADIUS = 58; // Central pink chamber ring matching reference broadcast
const PIT_OPEN_RADIUS = 52; // Circular opening expanding from exact center to swallow circular flags
const BASE_TOKEN_RADIUS = 23.8; // Crisp circular flags matching reference video & screenshot
const DEFLECTOR_COUNT = 6;

export const ArenaCanvas: React.FC<ArenaCanvasProps> = ({
  paused,
  settings,
  matchNumber,
  shieldedCodes,
  onEliminationConfirmed,
  onShieldConsumed,
  onMatchWinnerConfirmed,
  onTelemetryUpdate,
  simRef,
  persistedStateRef,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const shieldedRef = useRef(shieldedCodes);
  shieldedRef.current = shieldedCodes;

  const callbacksRef = useRef({
    onEliminationConfirmed,
    onShieldConsumed,
    onMatchWinnerConfirmed,
    onTelemetryUpdate,
  });
  callbacksRef.current = {
    onEliminationConfirmed,
    onShieldConsumed,
    onMatchWinnerConfirmed,
    onTelemetryUpdate,
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    // 1. Pre-render all 64 country flag sprites onto offscreen high-DPI canvases
    const spriteSize = 96;
    const flagSprites = new Map<string, HTMLCanvasElement>();
    for (const country of COUNTRIES_64) {
      const off = document.createElement('canvas');
      off.width = spriteSize;
      off.height = spriteSize;
      const octx = off.getContext('2d');
      if (octx) {
        drawCountryFlagOnContext(octx, country, spriteSize / 2, spriteSize / 2, spriteSize / 2 - 2);
      }
      flagSprites.set(country.code, off);
    }

    // 2. Pre-allocate Zero-GC Particle Ring Buffer (100 slots)
    const PARTICLE_POOL_SIZE = 100;
    const particles: PooledParticle[] = Array.from({ length: PARTICLE_POOL_SIZE }, () => ({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      maxLife: 1,
      size: 2.5,
      color: '#ff1f8e',
    }));
    let particleCursor = 0;

    const spawnParticles = (x: number, y: number, count: number, color: string, speedScale = 1) => {
      for (let i = 0; i < count; i++) {
        const p = particles[particleCursor];
        particleCursor = (particleCursor + 1) % PARTICLE_POOL_SIZE;
        const ang = Math.random() * Math.PI * 2;
        const spd = (25 + Math.random() * 80) * speedScale;
        p.active = true;
        p.x = x;
        p.y = y;
        p.vx = Math.cos(ang) * spd;
        p.vy = Math.sin(ang) * spd;
        p.life = 0;
        p.maxLife = 0.2 + Math.random() * 0.22;
        p.size = 1.8 + Math.random() * 2.4;
        p.color = color;
      }
    };

    // 3. Setup Matter.js Physics Engine
    const engine = Matter.Engine.create({
      gravity: { x: 0, y: 0, scale: 0 },
      positionIterations: 8,
      velocityIterations: 6,
    });

    // Build 64-segment circular outer boundary
    const wallSegments: Matter.Body[] = [];
    const segCount = 64;
    const wallThickness = 28;
    for (let i = 0; i < segCount; i++) {
      const a1 = (i / segCount) * Math.PI * 2;
      const a2 = ((i + 1) / segCount) * Math.PI * 2;
      const midA = (a1 + a2) / 2;
      const r = ARENA_RADIUS + wallThickness / 2 - 2;
      const wx = ARENA_CENTER + Math.cos(midA) * r;
      const wy = ARENA_CENTER + Math.sin(midA) * r;
      const segLen = 2 * ARENA_RADIUS * Math.sin(Math.PI / segCount) + 8;

      const seg = Matter.Bodies.rectangle(wx, wy, wallThickness, segLen, {
        isStatic: true,
        angle: midA,
        restitution: 0.98,
        friction: 0.0005,
        label: 'ARENA_WALL',
      });
      wallSegments.push(seg);
    }
    Matter.Composite.add(engine.world, wallSegments);

    // Build 6 Purple Radial Deflector Bars anchored to the inner edge of the cyan ring
    // Rotates counter-clockwise together with the circle
    const deflectors: Matter.Body[] = [];
    const deflectorLength = 156; // Longer radial purple lines reaching further inward
    const deflectorWidth = 15.0;
    const deflectorCenterDist = ARENA_RADIUS - deflectorLength / 2 - 3; // Attached right inside the cyan rim
    let pinwheelAngle = 0;

    for (let i = 0; i < DEFLECTOR_COUNT; i++) {
      const angle = (i / DEFLECTOR_COUNT) * Math.PI * 2;
      const bx = ARENA_CENTER + Math.cos(angle) * deflectorCenterDist;
      const by = ARENA_CENTER + Math.sin(angle) * deflectorCenterDist;
      const bar = Matter.Bodies.rectangle(bx, by, deflectorLength, deflectorWidth, {
        isStatic: true,
        angle,
        restitution: 1.0,
        friction: 0.0,
        chamfer: { radius: 7 },
        label: 'DEFLECTOR_BAR',
      });
      deflectors.push(bar);
    }
    Matter.Composite.add(engine.world, deflectors);

    // State tracking for tokens
    const tokenBodies = new Map<string, { body: Matter.Body; country: CountrySpec }>();
    const fallingTokens: FallingTokenState[] = [];
    const eliminatedCodes = new Set<string>();
    let spawnedCount = 0;
    let winnerDeclared = false;
    let cycleElapsedSec = 0;
    let lastEffectiveCycleDuration = settingsRef.current.cycleDurationSec;
    let hitstopTimer = 0;
    let cameraTrauma = 0;
    let lastCountdownBeepSec = -1;
    let wasHatchOpen = false;
    let hatchCycleCount = 0;
    let currentDrawQuota = 1; // 1 = Single Draw, 2 = Double Draw (every 4th cycle or operator triggered)
    let eliminationsThisOpen = 0; // Tracks how many flags have entered the pit during the current opening

    const shortestAngleDiff = (a: number, b: number) => {
      let diff = ((a - b) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
      return diff;
    };

    const spawnSingleCountryToken = (country: CountrySpec, ringIndex: number, slotAngle: number) => {
      const ringRadii = [92, 142, 194, 246, 298];
      const baseR = ringRadii[Math.min(ringIndex, ringRadii.length - 1)];
      const rDist = baseR + (Math.random() * 6 - 3);
      const x = ARENA_CENTER + Math.cos(slotAngle) * rDist;
      const y = ARENA_CENTER + Math.sin(slotAngle) * rDist;

      const body = Matter.Bodies.circle(x, y, BASE_TOKEN_RADIUS, {
        restitution: 1.0,
        friction: 0.0,
        frictionAir: 0.0,
        slop: 0.01,
        density: 0.002,
        label: `TOKEN_${country.code}`,
      });

      // Start with a blend of counter-clockwise rotation (slotAngle - PI/2) and slight radial bounce
      const ccwAngle = slotAngle - Math.PI / 2 + (Math.random() * 0.9 - 0.45);
      const speed = 2.35 + Math.random() * 0.55;
      Matter.Body.setVelocity(body, {
        x: Math.cos(ccwAngle) * speed,
        y: Math.sin(ccwAngle) * speed,
      });

      Matter.Composite.add(engine.world, body);
      tokenBodies.set(country.code, { body, country });
    };

    const initializeAll64Tokens = (ignorePersisted = false) => {
      for (const { body } of tokenBodies.values()) {
        Matter.Composite.remove(engine.world, body);
      }
      tokenBodies.clear();
      fallingTokens.length = 0;
      eliminatedCodes.clear();
      spawnedCount = 0;
      winnerDeclared = false;
      cycleElapsedSec = 0;
      wasHatchOpen = false;
      hatchCycleCount = 0;
      currentDrawQuota = 1;
      eliminationsThisOpen = 0;
      lastCountdownBeepSec = -1;

      const saved = !ignorePersisted ? persistedStateRef?.current : null;
      if (saved && saved.matchNumber === matchNumber && saved.tokens.length > 0) {
        cycleElapsedSec = saved.cycleElapsedSec;
        pinwheelAngle = saved.deflectorOrbitAngle;
        for (const ec of saved.eliminatedCodes) eliminatedCodes.add(ec);
        spawnedCount = 64;

        for (const t of saved.tokens) {
          const country = COUNTRIES_64.find((c) => c.code === t.code);
          if (!country) continue;
          const body = Matter.Bodies.circle(t.x, t.y, BASE_TOKEN_RADIUS, {
            restitution: settingsRef.current.tokenRestitution,
            friction: 0.0002,
            frictionAir: 0.0001,
            density: 0.002,
            angle: t.angle,
            label: `TOKEN_${country.code}`,
          });
          Matter.Body.setVelocity(body, { x: t.vx, y: t.vy });
          Matter.Composite.add(engine.world, body);
          tokenBodies.set(country.code, { body, country });
        }
        return;
      }

      // Distribute all 64 countries across 5 concentric rings outside the central pink chamber ring
      const ringCapacities = [7, 12, 17, 16, 12];
      let cIdx = 0;
      for (let ring = 0; ring < ringCapacities.length; ring++) {
        const cap = ringCapacities[ring];
        for (let s = 0; s < cap && cIdx < COUNTRIES_64.length; s++) {
          const country = COUNTRIES_64[cIdx++];
          let rawAngle = ((s + 0.5) / cap) * Math.PI * 2 + ring * 0.19;
          // Keep outer rings away from multiples of 60 deg (where the 6 radial bars start)
          if (ring >= 3) {
            const sector = Math.PI / 3;
            const rem = ((rawAngle % sector) + sector) % sector;
            if (rem < 0.22) rawAngle += 0.24;
            else if (rem > sector - 0.22) rawAngle -= 0.24;
          }
          spawnSingleCountryToken(country, ring, rawAngle);
          spawnedCount += 1;
        }
      }
    };

    initializeAll64Tokens(false);

    // Collision event listener for subtle audio & spark feedback
    Matter.Events.on(engine, 'collisionStart', (event) => {
      for (const pair of event.pairs) {
        const { bodyA, bodyB } = pair;
        const relVx = (bodyA.velocity?.x || 0) - (bodyB.velocity?.x || 0);
        const relVy = (bodyA.velocity?.y || 0) - (bodyB.velocity?.y || 0);
        const relSpeed = Math.hypot(relVx, relVy);
        if (relSpeed < 1.5) continue;

        const intensity = Math.min(1, relSpeed / 9.5);
        const labels = `${bodyA.label}|${bodyB.label}`;
        if (labels.includes('DEFLECTOR_BAR')) {
          soundEngine.playDeflectorContact(intensity);
        } else if (labels.includes('ARENA_WALL')) {
          soundEngine.playPerimeterContact(intensity);
        } else {
          soundEngine.playTokenCollision(intensity);
        }
      }
    });

    if (simRef) {
      simRef.current = {
        forceHatchOpen: (doubleDraw = false) => {
          const pacing = computeDynamicArenaPacing(tokenBodies.size, settingsRef.current);
          const closedDur = Math.max(1.2, pacing.effectiveCycleDurationSec - pacing.effectiveOpenDurationSec);
          eliminationsThisOpen = 0;
          if (doubleDraw && tokenBodies.size > 2) {
            currentDrawQuota = 2;
          }
          cycleElapsedSec = closedDur + 0.02;
        },
        restartMatch: () => {
          if (persistedStateRef) persistedStateRef.current = null;
          initializeAll64Tokens(true);
        },
        reviveCountry: (countryCode: string) => {
          if (tokenBodies.has(countryCode)) return false;
          const country = COUNTRIES_64.find((c) => c.code === countryCode);
          if (!country) return false;
          eliminatedCodes.delete(countryCode);
          const angle = Math.random() * Math.PI * 2;
          spawnSingleCountryToken(country, 2, angle);
          const spawned = tokenBodies.get(countryCode);
          if (spawned) {
            spawnParticles(spawned.body.position.x, spawned.body.position.y, 16, '#00f5ff', 1.3);
          }
          return true;
        },
        impulseCountry: (countryCode: string) => {
          const entry = tokenBodies.get(countryCode);
          if (!entry) return;
          const dx = entry.body.position.x - ARENA_CENTER;
          const dy = entry.body.position.y - ARENA_CENTER;
          const dist = Math.max(1, Math.hypot(dx, dy));
          const speed = settingsRef.current.maxTokenSpeed * 0.9;
          Matter.Body.setVelocity(entry.body, {
            x: (dx / dist) * speed - (dy / dist) * 2.0,
            y: (dy / dist) * speed + (dx / dist) * 2.0,
          });
        },
      };
    }

    // 4. High-DPI ResizeObserver (Transform-safe for scaled 540x960 -> 1080x1920 broadcast stage)
    let displayScale = 1;
    const updateCanvasSize = () => {
      const container = containerRef.current;
      if (!container || !canvas) return;
      const layoutW = container.clientWidth || container.offsetWidth;
      const layoutH = container.clientHeight || container.offsetHeight;
      const rect = container.getBoundingClientRect();
      const cssSize = Math.max(
        200,
        Math.min(layoutW || rect.width, layoutH || rect.height)
      );
      const visualScale = cssSize > 0 ? Math.max(1, rect.width / cssSize) : 1;
      const dpr = Math.min(2.25, Math.max(window.devicePixelRatio || 1, visualScale));
      canvas.width = Math.round(ARENA_LOGICAL_SIZE * dpr);
      canvas.height = Math.round(ARENA_LOGICAL_SIZE * dpr);
      canvas.style.width = `${Math.floor(cssSize)}px`;
      canvas.style.height = `${Math.floor(cssSize)}px`;
      displayScale = dpr;
    };

    updateCanvasSize();
    const ro = new ResizeObserver(updateCanvasSize);
    if (containerRef.current) ro.observe(containerRef.current);

    // 5. Main 60Hz Simulation & Render Loop
    let rafId = 0;
    let lastTime = performance.now();
    let frameCounter = 0;
    let fpsAccum = 0;
    let currentFps = 60;
    let lastTelemetryPushAt = 0;
    let hatchOpenAnim = 0; // 0 = closed ring, 1 = partial gate arc retracted open
    let hatchOpenShockwave = 0; // 1 -> 0 expanding ring when chamber gate opens

    const tick = (now: number) => {
      rafId = requestAnimationFrame(tick);

      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

      frameCounter += 1;
      fpsAccum += rawDt;
      if (fpsAccum >= 0.5) {
        currentFps = Math.round(frameCounter / fpsAccum);
        frameCounter = 0;
        fpsAccum = 0;
      }

      const curSettings = settingsRef.current;
      const isPaused = pausedRef.current;
      const survivingCount = tokenBodies.size;

      // Dynamically scale speed UP and elimination chamber cooldown DOWN as survivingCount decreases
      const dynamicPacing = computeDynamicArenaPacing(survivingCount, curSettings);
      if (Math.abs(dynamicPacing.effectiveCycleDurationSec - lastEffectiveCycleDuration) > 0.01) {
        const ratio = dynamicPacing.effectiveCycleDurationSec / Math.max(1, lastEffectiveCycleDuration);
        cycleElapsedSec *= ratio;
        lastEffectiveCycleDuration = dynamicPacing.effectiveCycleDurationSec;
      }

      const dynamicCycleSettings = {
        cycleDurationSec: dynamicPacing.effectiveCycleDurationSec,
        openDurationSec: dynamicPacing.effectiveOpenDurationSec,
        warningLeadSec: dynamicPacing.effectiveWarningLeadSec,
      };

      cameraTrauma = Math.max(0, cameraTrauma - dt * 3.6);
      if (hitstopTimer > 0) {
        hitstopTimer = Math.max(0, hitstopTimer - dt);
      }

      const dangerCountries: string[] = [];

      if (!isPaused && hitstopTimer <= 0) {
        if (survivingCount > 1) {
          cycleElapsedSec += dt;
        }

        const hatchState = evaluateHatchCycleState(cycleElapsedSec, dynamicCycleSettings);

        if (hatchState.isWarning) {
          const secCeil = Math.ceil(hatchState.secondsUntilOpen);
          if (secCeil !== lastCountdownBeepSec) {
            lastCountdownBeepSec = secCeil;
            soundEngine.playCountdownTick(hatchState.secondsUntilOpen);
          }
        } else {
          lastCountdownBeepSec = -1;
        }

        if (hatchState.isHatchOpen && !wasHatchOpen) {
          wasHatchOpen = true;
          hatchCycleCount += 1;
          eliminationsThisOpen = 0;
          // Every 4th cycle (when > 6 flags survive) is a DOUBLE DRAW (2 eliminations max), otherwise SINGLE DRAW (1 max)
          currentDrawQuota = survivingCount > 6 && hatchCycleCount % 4 === 0 ? 2 : 1;
          hatchOpenShockwave = 1.0;

          // Spawn rim sparks around the circular chamber opening for crisp visual feedback
          for (let sp = 0; sp < 8; sp++) {
            const spAng = (sp / 8) * Math.PI * 2;
            spawnParticles(
              ARENA_CENTER + Math.cos(spAng) * HATCH_RADIUS,
              ARENA_CENTER + Math.sin(spAng) * HATCH_RADIUS,
              2,
              sp % 2 === 0 ? '#ff1f8e' : '#facc15',
              0.85
            );
          }
          soundEngine.playHatchOpen();
        } else if (!hatchState.isHatchOpen && wasHatchOpen) {
          wasHatchOpen = false;
          soundEngine.playHatchClose();
        }

        // Rotate the arena circle's 6 purple bars and central partial chamber gate counter-clockwise
        const omega = -dynamicPacing.effectiveDeflectorRotSpeed;
        pinwheelAngle += omega * dt;

        for (let i = 0; i < DEFLECTOR_COUNT; i++) {
          const bar = deflectors[i];
          const angle = pinwheelAngle + (i / DEFLECTOR_COUNT) * Math.PI * 2;
          const bx = ARENA_CENTER + Math.cos(angle) * deflectorCenterDist;
          const by = ARENA_CENTER + Math.sin(angle) * deflectorCenterDist;
          Matter.Body.setPosition(bar, { x: bx, y: by });
          Matter.Body.setAngle(bar, angle);
        }

        // Step Matter.js physics with sub-stepping <= 16.5ms
        const totalMs = dt * 1000;
        const substeps = Math.max(1, Math.ceil(totalMs / 16.5));
        const stepMs = totalMs / substeps;
        for (let s = 0; s < substeps; s++) {
          Matter.Engine.update(engine, stepMs);
        }

        const dynamicScale =
          survivingCount <= 2
            ? 1.18
            : survivingCount <= 5
              ? 1.12
              : survivingCount <= 15
                ? 1.06
                : 1.0;
        const effectiveTokenRadius = BASE_TOKEN_RADIUS * dynamicScale;

        // Pass 1: Explicit Pairwise Elastic Flag-to-Flag Bounce & Reflection
        // Guarantees that whenever any two flags touch, they immediately separate (never clumping!)
        // and reflect away from each other while maintaining a steady speed.
        const allEntries = Array.from(tokenBodies.values());
        const minFlagDist = effectiveTokenRadius * 2 + 1.8;
        const midTargetSpd = (dynamicPacing.effectiveMinSpeed + dynamicPacing.effectiveMaxSpeed) * 0.5;
        for (let i = 0; i < allEntries.length; i++) {
          const bodyA = allEntries[i].body;
          for (let j = i + 1; j < allEntries.length; j++) {
            const bodyB = allEntries[j].body;
            const dx = bodyB.position.x - bodyA.position.x;
            const dy = bodyB.position.y - bodyA.position.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 0.001 && dist < minFlagDist) {
              const nx = dx / dist;
              const ny = dy / dist;

              const overlap = (minFlagDist - dist) * 0.54;
              Matter.Body.setPosition(bodyA, {
                x: bodyA.position.x - nx * overlap,
                y: bodyA.position.y - ny * overlap,
              });
              Matter.Body.setPosition(bodyB, {
                x: bodyB.position.x + nx * overlap,
                y: bodyB.position.y + ny * overlap,
              });

              const rvx = bodyB.velocity.x - bodyA.velocity.x;
              const rvy = bodyB.velocity.y - bodyA.velocity.y;
              const vn = rvx * nx + rvy * ny;

              const targetSpdA = Math.max(
                dynamicPacing.effectiveMinSpeed,
                Math.min(
                  dynamicPacing.effectiveMaxSpeed,
                  Math.hypot(bodyA.velocity.x, bodyA.velocity.y) || midTargetSpd
                )
              );
              const targetSpdB = Math.max(
                dynamicPacing.effectiveMinSpeed,
                Math.min(
                  dynamicPacing.effectiveMaxSpeed,
                  Math.hypot(bodyB.velocity.x, bodyB.velocity.y) || midTargetSpd
                )
              );

              const bounceImpulse = vn < 0 ? -vn * 1.05 : 1.35;
              const nvxA = bodyA.velocity.x - nx * Math.max(bounceImpulse, 1.25);
              const nvyA = bodyA.velocity.y - ny * Math.max(bounceImpulse, 1.25);
              const nvxB = bodyB.velocity.x + nx * Math.max(bounceImpulse, 1.25);
              const nvyB = bodyB.velocity.y + ny * Math.max(bounceImpulse, 1.25);

              const magA = Math.max(0.01, Math.hypot(nvxA, nvyA));
              const magB = Math.max(0.01, Math.hypot(nvxB, nvyB));

              Matter.Body.setVelocity(bodyA, {
                x: (nvxA / magA) * targetSpdA,
                y: (nvyA / magA) * targetSpdA,
              });
              Matter.Body.setVelocity(bodyB, {
                x: (nvxB / magB) * targetSpdB,
                y: (nvyB / magB) * targetSpdB,
              });
            }
          }
        }

        // Pass 2: Purple Radial Line Bounce + Central Circular Chamber Opening + Fair Tiebreaker Capture
        const rInnerLine = ARENA_RADIUS - deflectorLength - 3;
        const rOuterLine = ARENA_RADIUS - 2;
        const minLineDist = effectiveTokenRadius + deflectorWidth * 0.5 + 1.5;

        // Is the central circular chamber currently open from the center?
        // The moment `eliminationsThisOpen >= currentDrawQuota`, the circular chamber immediately snaps shut!
        const isChamberOpenNow =
          hatchState.isHatchOpen &&
          eliminationsThisOpen < currentDrawQuota &&
          tokenBodies.size > 1;

        // Identify the single closest flag to the center circular opening
        let closestToCenterCode: string | null = null;
        let closestToCenterDist = Infinity;
        if (isChamberOpenNow) {
          for (const [cCode, cEntry] of tokenBodies.entries()) {
            const dCenter = Math.hypot(
              cEntry.body.position.x - ARENA_CENTER,
              cEntry.body.position.y - ARENA_CENTER
            );
            if (dCenter < closestToCenterDist) {
              closestToCenterDist = dCenter;
              closestToCenterCode = cCode;
            }
          }
        }

        const eligibleCandidates: Array<{
          code: string;
          body: Matter.Body;
          country: CountrySpec;
          distCenter: number;
        }> = [];

        for (const [code, entry] of Array.from(tokenBodies.entries())) {
          const { body, country } = entry;
          let { x, y } = body.position;
          let { x: vx, y: vy } = body.velocity;

          // 1. Check collision against each of the 6 rotating purple radial lines
          for (let i = 0; i < DEFLECTOR_COUNT; i++) {
            const lineAngle = pinwheelAngle + (i / DEFLECTOR_COUNT) * Math.PI * 2;
            const cosA = Math.cos(lineAngle);
            const sinA = Math.sin(lineAngle);
            const x1 = ARENA_CENTER + cosA * rInnerLine;
            const y1 = ARENA_CENTER + sinA * rInnerLine;
            const x2 = ARENA_CENTER + cosA * rOuterLine;
            const y2 = ARENA_CENTER + sinA * rOuterLine;

            const segDx = x2 - x1;
            const segDy = y2 - y1;
            const segLenSq = segDx * segDx + segDy * segDy;
            const proj = Math.max(0, Math.min(1, ((x - x1) * segDx + (y - y1) * segDy) / segLenSq));
            const closestX = x1 + proj * segDx;
            const closestY = y1 + proj * segDy;

            const distToLine = Math.hypot(x - closestX, y - closestY);
            if (distToLine > 0.001 && distToLine < minLineDist) {
              const lnx = (x - closestX) / distToLine;
              const lny = (y - closestY) / distToLine;
              x = closestX + lnx * (minLineDist + 1.0);
              y = closestY + lny * (minLineDist + 1.0);

              const dot = vx * lnx + vy * lny;
              if (dot < 0) {
                vx -= 2 * dot * lnx;
                vy -= 2 * dot * lny;
              } else {
                vx += lnx * 1.4;
                vy += lny * 1.4;
              }
              vx += sinA * 0.45;
              vy -= cosA * 0.45;
            }
          }

          let rx = x - ARENA_CENTER;
          let ry = y - ARENA_CENTER;
          let distCenter = Math.max(1, Math.hypot(rx, ry));

          // 2. Central Circular Chamber Barrier (`HATCH_RADIUS = 58`)
          // - When CLOSED: solid circular barrier reflects all flags outward.
          // - When OPEN: opens radially from the center as an expanding circle, allowing circular flags to enter the pit!
          const minChamberOuterDist = HATCH_RADIUS + effectiveTokenRadius * 0.90;
          if (!isChamberOpenNow && distCenter < minChamberOuterDist) {
            const outNx = rx / distCenter;
            const outNy = ry / distCenter;
            x = ARENA_CENTER + outNx * (minChamberOuterDist + 1.2);
            y = ARENA_CENTER + outNy * (minChamberOuterDist + 1.2);
            const dotOut = vx * outNx + vy * outNy;
            if (dotOut < 0) {
              vx -= 2 * dotOut * outNx;
              vy -= 2 * dotOut * outNy;
            } else {
              vx += outNx * 1.6;
              vy += outNy * 1.6;
            }
            rx = x - ARENA_CENTER;
            ry = y - ARENA_CENTER;
            distCenter = Math.max(1, Math.hypot(rx, ry));
          }

          // 3. Subtle counter-clockwise rotational flow so flags rotate naturally with the circle
          const ccwTx = ry / distCenter;
          const ccwTy = -rx / distCenter;
          if (distCenter > HATCH_RADIUS * 1.25 && code !== closestToCenterCode) {
            const swirlBlend = 0.28 * dt;
            vx = vx * (1 - swirlBlend) + ccwTx * midTargetSpd * swirlBlend;
            vy = vy * (1 - swirlBlend) + ccwTy * midTargetSpd * swirlBlend;
          }

          // 4. Outer wall chord bounce so flags traverse both the center chamber and outer lanes
          if (distCenter > ARENA_RADIUS - effectiveTokenRadius - 6) {
            const inwardX = -rx / distCenter;
            const inwardY = -ry / distCenter;
            const vInward = vx * inwardX + vy * inwardY;
            const spd = Math.hypot(vx, vy) || midTargetSpd;
            if (vInward < spd * 0.48) {
              const codeHash = code.charCodeAt(0) + code.charCodeAt(1) * 3;
              const tangentWeight = ((codeHash % 5) - 1) * 0.16;
              const mixX = inwardX * 0.92 + ccwTx * tangentWeight;
              const mixY = inwardY * 0.92 + ccwTy * tangentWeight;
              const mixMag = Math.max(0.01, Math.hypot(mixX, mixY));
              vx = (mixX / mixMag) * spd;
              vy = (mixY / mixMag) * spd;
            }
          }

          // 5. Central Circular Pit Suction when open:
          // Guides the closest flag directly toward the center circular opening
          if (isChamberOpenNow && distCenter > 2) {
            if (code === closestToCenterCode && distCenter < HATCH_RADIUS * 2.8) {
              const pull = 1.6 * dynamicPacing.speedMultiplier;
              vx += (-rx / distCenter) * pull;
              vy += (-ry / distCenter) * pull;
              x += (-rx / distCenter) * (2.0 * dynamicPacing.speedMultiplier);
              y += (-ry / distCenter) * (2.0 * dynamicPacing.speedMultiplier);
            } else if (distCenter < HATCH_RADIUS * 1.35) {
              const pull = 0.65 * dynamicPacing.speedMultiplier;
              vx += (-rx / distCenter) * pull;
              vy += (-ry / distCenter) * pull;
            }
          }

          // 6. Enforce outer circular boundary containment
          const bounded = enforceCircularBoundary(
            x,
            y,
            vx,
            vy,
            ARENA_CENTER,
            ARENA_CENTER,
            ARENA_RADIUS - 2,
            effectiveTokenRadius,
            curSettings.tokenRestitution
          );
          x = bounded.x;
          y = bounded.y;
          vx = bounded.vx;
          vy = bounded.vy;

          const clamped = clampTokenVelocity(
            vx,
            vy,
            dynamicPacing.effectiveMinSpeed,
            dynamicPacing.effectiveMaxSpeed
          );
          Matter.Body.setPosition(body, { x, y });
          Matter.Body.setVelocity(body, { x: clamped.vx, y: clamped.vy });

          const danger = computeApertureDangerLevel(x, y, ARENA_CENTER, ARENA_CENTER, HATCH_RADIUS);
          if (danger > 0.25) {
            dangerCountries.push(code);
          }

          const updatedDistCenter = Math.hypot(x - ARENA_CENTER, y - ARENA_CENTER);
          // Fair Elimination Eligibility:
          // Token enters the central circular pit
          if (
            isChamberOpenNow &&
            tokenBodies.size > 1 &&
            updatedDistCenter <= PIT_OPEN_RADIUS + effectiveTokenRadius * 0.45
          ) {
            eligibleCandidates.push({
              code,
              body,
              country,
              distCenter: updatedDistCenter,
            });
          }
        }

        // FAIR TIEBREAKER SYSTEM:
        // Sort candidates by exact distance to center (closest center to (380, 380) wins the tiebreaker!).
        // Process strictly up to the remaining quota for this cycle (1 for Single Draw, 2 for Double Draw),
        // then immediately snap the circular chamber shut and push any runner-up flag safely outside!
        if (eligibleCandidates.length > 0) {
          eligibleCandidates.sort((a, b) => a.distCenter - b.distCenter);

          for (const candidate of eligibleCandidates) {
            if (eliminationsThisOpen >= currentDrawQuota || tokenBodies.size <= 1) {
              // Quota reached! Push any runner-up flag back outside so it is never unfairly eliminated
              const { body } = candidate;
              const outAngle =
                Math.atan2(body.position.y - ARENA_CENTER, body.position.x - ARENA_CENTER) ||
                (Math.random() * Math.PI * 2);
              const safeOuterR = HATCH_RADIUS + effectiveTokenRadius + 8;
              Matter.Body.setPosition(body, {
                x: ARENA_CENTER + Math.cos(outAngle) * safeOuterR,
                y: ARENA_CENTER + Math.sin(outAngle) * safeOuterR,
              });
              Matter.Body.setVelocity(body, {
                x: Math.cos(outAngle) * dynamicPacing.effectiveMaxSpeed * 0.85,
                y: Math.sin(outAngle) * dynamicPacing.effectiveMaxSpeed * 0.85,
              });
              continue;
            }

            const { code, body, country } = candidate;
            const { x, y } = body.position;

            if (shieldedRef.current.has(code)) {
              callbacksRef.current.onShieldConsumed(country);
              soundEngine.playShieldBlock();
              spawnParticles(x, y, 16, '#00f5d4', 1.2);
              cameraTrauma = Math.max(cameraTrauma, 0.55);

              const outAngle =
                Math.atan2(y - ARENA_CENTER, x - ARENA_CENTER) || (Math.random() * Math.PI * 2);
              const safeDist = HATCH_RADIUS + effectiveTokenRadius + 14;
              Matter.Body.setPosition(body, {
                x: ARENA_CENTER + Math.cos(outAngle) * safeDist,
                y: ARENA_CENTER + Math.sin(outAngle) * safeDist,
              });
              Matter.Body.setVelocity(body, {
                x: Math.cos(outAngle) * dynamicPacing.effectiveMaxSpeed * 0.95,
                y: Math.sin(outAngle) * dynamicPacing.effectiveMaxSpeed * 0.95,
              });
            } else {
              eliminationsThisOpen += 1;
              cameraTrauma = 1.0;
              soundEngine.playEliminationSting();

              Matter.Composite.remove(engine.world, body);
              tokenBodies.delete(code);
              eliminatedCodes.add(code);

              fallingTokens.push({
                country,
                x,
                y,
                vx: 0,
                vy: 0,
                zDepth: 0.02,
                vz: 2.3,
                radius: effectiveTokenRadius,
                confirmed: false,
              });

              spawnParticles(ARENA_CENTER, ARENA_CENTER, 18, '#ff1f8e', 1.15);
            }
          }
        }

        // Advance falling token: centers smoothly inside the dark pit as it scales down and drops
        for (let i = fallingTokens.length - 1; i >= 0; i--) {
          const ft = fallingTokens[i];
          ft.vz += 3.2 * dt;
          ft.zDepth += ft.vz * dt;
          ft.x += (ARENA_CENTER - ft.x) * Math.min(1, 14 * dt);
          ft.y += (ARENA_CENTER - ft.y) * Math.min(1, 14 * dt);

          if (!ft.confirmed && ft.zDepth >= 0.85) {
            ft.confirmed = true;
            cameraTrauma = Math.max(cameraTrauma, 0.75);
            const remainingNow = tokenBodies.size;
            callbacksRef.current.onEliminationConfirmed(ft.country, remainingNow);

            if (remainingNow === 1 && spawnedCount === 64 && !winnerDeclared) {
              const lastSurvivor = Array.from(tokenBodies.values())[0];
              if (lastSurvivor) {
                winnerDeclared = true;
                soundEngine.playWinnerFanfare();
                callbacksRef.current.onMatchWinnerConfirmed(lastSurvivor.country);
              }
            }
          }

          if (ft.zDepth >= 1.35) {
            fallingTokens.splice(i, 1);
          }
        }

        for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
          const p = particles[i];
          if (!p.active) continue;
          p.life += dt;
          if (p.life >= p.maxLife) {
            p.active = false;
            continue;
          }
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vx *= 0.93;
          p.vy *= 0.93;
        }

        if (persistedStateRef) {
          persistedStateRef.current = {
            matchNumber,
            cycleElapsedSec,
            deflectorOrbitAngle: pinwheelAngle,
            eliminatedCodes: Array.from(eliminatedCodes),
            tokens: Array.from(tokenBodies.values()).map(({ body, country }) => ({
              code: country.code,
              x: body.position.x,
              y: body.position.y,
              vx: body.velocity.x,
              vy: body.velocity.y,
              angle: body.angle,
            })),
          };
        }

        if (now - lastTelemetryPushAt >= 85) {
          lastTelemetryPushAt = now;
          callbacksRef.current.onTelemetryUpdate({
            remainingCount: tokenBodies.size,
            eliminatedCount: 64 - tokenBodies.size,
            isHatchOpen: hatchState.isHatchOpen && eliminationsThisOpen < currentDrawQuota,
            isWarning: hatchState.isWarning,
            secondsUntilOpen: hatchState.secondsUntilOpen,
            secondsRemainingOpen: hatchState.secondsRemainingOpen,
            cycleProgress: hatchState.cycleProgress,
            dangerCountries,
            fps: currentFps,
            effectiveCycleDurationSec: dynamicPacing.effectiveCycleDurationSec,
            speedMultiplier: dynamicPacing.speedMultiplier,
            isDoubleDraw: currentDrawQuota === 2 && hatchState.isHatchOpen,
            drawQuota: currentDrawQuota,
            eliminatedThisCycle: eliminationsThisOpen,
          });
        }
      }

      // ========================================================================
      // RENDERING PIPELINE (Matching Reference Video & Screenshot image_5e8759ce.png)
      // ========================================================================
      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.scale(displayScale, displayScale);

      // Crisp damped visual vibration when an elimination occurs (exact match to reference video!)
      if (cameraTrauma > 0.001) {
        const vibAmp = Math.pow(cameraTrauma, 1.35) * 4.4;
        const vibX = Math.sin(now * 0.095) * vibAmp;
        const vibY = Math.cos(now * 0.122) * vibAmp * 0.88;
        ctx.translate(vibX, vibY);
      }

      // 1. Deep Midnight Translucent Circular Playfield (allows subtle Messi vs Ronaldo stadium glow behind)
      ctx.save();
      ctx.beginPath();
      ctx.arc(ARENA_CENTER, ARENA_CENTER, ARENA_RADIUS, 0, Math.PI * 2);
      ctx.clip();

      const floorGrad = ctx.createRadialGradient(
        ARENA_CENTER,
        ARENA_CENTER,
        HATCH_RADIUS * 0.35,
        ARENA_CENTER,
        ARENA_CENTER,
        ARENA_RADIUS
      );
      floorGrad.addColorStop(0, 'rgba(18, 25, 58, 0.85)');
      floorGrad.addColorStop(0.65, 'rgba(11, 17, 42, 0.88)');
      floorGrad.addColorStop(1, 'rgba(7, 11, 30, 0.92)');
      ctx.fillStyle = floorGrad;
      ctx.fillRect(0, 0, ARENA_LOGICAL_SIZE, ARENA_LOGICAL_SIZE);

      // 2. Central Elimination Chamber: Circular Opening from Center!
      // When closed: solid glowing pink circular chamber with sealed mechanical iris hatch.
      // When open: circular aperture expands outward from the exact center (380, 380) revealing the black hole pit!
      const hatchStateNow = evaluateHatchCycleState(cycleElapsedSec, dynamicCycleSettings);
      const isChamberVisuallyOpen =
        hatchStateNow.isHatchOpen && eliminationsThisOpen < currentDrawQuota;

      const targetOpen = isChamberVisuallyOpen ? 1 : 0;
      const openSpeed = isChamberVisuallyOpen ? 9.5 : 8.5;
      hatchOpenAnim += (targetOpen - hatchOpenAnim) * Math.min(1, openSpeed * dt);
      if (Math.abs(targetOpen - hatchOpenAnim) < 0.005) hatchOpenAnim = targetOpen;
      if (hatchOpenShockwave > 0) {
        hatchOpenShockwave = Math.max(0, hatchOpenShockwave - dt * 1.45);
      }

      const openFraction = 1 - Math.pow(1 - hatchOpenAnim, 2.2);
      const openRadius = openFraction * (HATCH_RADIUS - 4);

      // 2A. Render Circular Chamber Base & Concentric Expanding Pit
      ctx.save();
      // Chamber floor
      ctx.beginPath();
      ctx.arc(ARENA_CENTER, ARENA_CENTER, HATCH_RADIUS, 0, Math.PI * 2);
      const chamberBaseGrad = ctx.createRadialGradient(
        ARENA_CENTER,
        ARENA_CENTER,
        8,
        ARENA_CENTER,
        ARENA_CENTER,
        HATCH_RADIUS
      );
      chamberBaseGrad.addColorStop(0, '#020308');
      chamberBaseGrad.addColorStop(0.6, '#0b0f24');
      chamberBaseGrad.addColorStop(1, '#2b194d');
      ctx.fillStyle = chamberBaseGrad;
      ctx.fill();

      // If opening: render the expanding circular void / black hole pit from center
      if (openRadius > 1.0) {
        ctx.beginPath();
        ctx.arc(ARENA_CENTER, ARENA_CENTER, openRadius, 0, Math.PI * 2);
        const pitGrad = ctx.createRadialGradient(
          ARENA_CENTER,
          ARENA_CENTER,
          0,
          ARENA_CENTER,
          ARENA_CENTER,
          openRadius
        );
        pitGrad.addColorStop(0, '#000000');
        pitGrad.addColorStop(0.7, '#070514');
        pitGrad.addColorStop(1, '#ff1f8e');
        ctx.fillStyle = pitGrad;
        ctx.fill();

        // Glowing circular event horizon rim expanding from center
        ctx.strokeStyle = '#ff1f8e';
        ctx.lineWidth = 2.2;
        ctx.shadowColor = '#ff1f8e';
        ctx.shadowBlur = 12;
        ctx.stroke();

        // Swirling internal gravity spirals inside the circular opening
        ctx.save();
        ctx.translate(ARENA_CENTER, ARENA_CENTER);
        ctx.rotate(pinwheelAngle * 2.5);
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(3, openRadius * 0.55), 0, Math.PI * 1.5);
        ctx.strokeStyle = 'rgba(0, 245, 255, 0.45)';
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.restore();
      }

      // If not fully open: render mechanical circular hatch iris petals that meet in center
      if (openFraction < 0.96) {
        ctx.save();
        const bladeCount = 6;
        for (let b = 0; b < bladeCount; b++) {
          const bAngle = pinwheelAngle + (b / bladeCount) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(
            ARENA_CENTER + Math.cos(bAngle) * openRadius,
            ARENA_CENTER + Math.sin(bAngle) * openRadius
          );
          ctx.arc(
            ARENA_CENTER,
            ARENA_CENTER,
            HATCH_RADIUS - 3,
            bAngle,
            bAngle + (Math.PI * 2) / bladeCount
          );
          ctx.closePath();
          ctx.fillStyle = b % 2 === 0 ? '#1b143a' : '#22194a';
          ctx.fill();
          ctx.strokeStyle = '#3d2d78';
          ctx.lineWidth = 1.0;
          ctx.stroke();
        }

        // Center circular lock node when closed
        if (openRadius <= 8) {
          ctx.beginPath();
          ctx.arc(ARENA_CENTER, ARENA_CENTER, 7, 0, Math.PI * 2);
          ctx.fillStyle = hatchStateNow.isWarning ? '#facc15' : '#4c1d95';
          ctx.fill();
          ctx.strokeStyle = hatchStateNow.isWarning ? '#fef08a' : '#8b5cf6';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        ctx.restore();
      }
      ctx.restore();

      // 2B. Render any captured flag shrinking into the dark center circular hole
      for (const ft of fallingTokens) {
        const scale = Math.max(0.15, 1 - ft.zDepth * 0.75);
        const drawR = ft.radius * scale;
        const sprite = flagSprites.get(ft.country.code);
        ctx.save();
        ctx.translate(ft.x, ft.y);
        ctx.globalAlpha = Math.max(0.15, 1 - ft.zDepth * 0.68);
        if (sprite) {
          ctx.drawImage(sprite, -drawR, -drawR, drawR * 2, drawR * 2);
        }
        ctx.beginPath();
        ctx.arc(0, 0, drawR, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
      }

      // 2C. Expanding Shockwave Ring on Opening
      if (hatchOpenShockwave > 0.01) {
        const waveProgress = 1 - hatchOpenShockwave;
        const waveRadius = HATCH_RADIUS * (1 + waveProgress * 0.45);
        ctx.save();
        ctx.beginPath();
        ctx.arc(ARENA_CENTER, ARENA_CENTER, waveRadius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 31, 142, ${hatchOpenShockwave * 0.75})`;
        ctx.lineWidth = 3.2 * hatchOpenShockwave;
        ctx.shadowColor = '#ff1f8e';
        ctx.shadowBlur = 12;
        ctx.stroke();
        ctx.restore();
      }

      // 2D. Glowing Pink/Magenta Circular Outer Rim (Always crisp 360° circle!)
      ctx.save();
      ctx.beginPath();
      ctx.arc(ARENA_CENTER, ARENA_CENTER, HATCH_RADIUS - 3, 0, Math.PI * 2);

      const warnGlow = hatchStateNow.isWarning ? 0.5 + 0.5 * Math.sin(now * 0.022) : 0;
      ctx.strokeStyle =
        openFraction > 0.1
          ? '#ff1f8e'
          : warnGlow > 0.65
            ? '#f472b6'
            : '#ec4899';
      ctx.lineWidth = 8.5;
      ctx.shadowColor = '#ff1f8e';
      ctx.shadowBlur = openFraction > 0.1 ? 20 : 10 + warnGlow * 6;
      ctx.stroke();

      // Inner bright hot-pink neon highlight along the circular ring
      ctx.beginPath();
      ctx.arc(ARENA_CENTER, ARENA_CENTER, HATCH_RADIUS - 3, 0, Math.PI * 2);
      ctx.strokeStyle = openFraction > 0.1 ? '#ffffff' : '#fbcfe8';
      ctx.lineWidth = 1.8;
      ctx.shadowBlur = 0;
      ctx.stroke();
      ctx.restore();

      // 3. Render 6 Purple Radial Deflector Bars anchored to the outer cyan ring (rotating counter-clockwise)
      for (const bar of deflectors) {
        ctx.save();
        ctx.translate(bar.position.x, bar.position.y);
        ctx.rotate(bar.angle);

        ctx.shadowColor = '#7c5cff';
        ctx.shadowBlur = 10;
        ctx.fillStyle = '#6d55cf';
        ctx.beginPath();
        ctx.roundRect(-deflectorLength / 2, -deflectorWidth / 2, deflectorLength, deflectorWidth, 7.5);
        ctx.fill();

        ctx.strokeStyle = '#9d8df1';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.restore();
      }

      // 4. Render Active 64 Country Flag Tokens
      const dynamicDrawScale =
        survivingCount <= 2
          ? 1.18
          : survivingCount <= 5
            ? 1.12
            : survivingCount <= 15
              ? 1.06
              : 1.0;
      const drawRadius = BASE_TOKEN_RADIUS * dynamicDrawScale;

      for (const [code, { body }] of tokenBodies.entries()) {
        const { x, y } = body.position;
        const isShielded = shieldedRef.current.has(code);
        const sprite = flagSprites.get(code);

        ctx.save();
        ctx.translate(x, y);

        // Subtle contact drop shadow
        ctx.beginPath();
        ctx.arc(1.5, 3, drawRadius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(2, 4, 12, 0.55)';
        ctx.fill();

        // Support Shield Cyan Double-Ring (matching Costa Rica & India in reference image/video)
        if (isShielded) {
          ctx.beginPath();
          ctx.arc(0, 0, drawRadius + 4.5, 0, Math.PI * 2);
          ctx.strokeStyle = '#2dd4bf';
          ctx.lineWidth = 2.4;
          ctx.shadowColor = '#2dd4bf';
          ctx.shadowBlur = 8;
          ctx.stroke();
          ctx.shadowBlur = 0;
        }

        // Draw upright country flag artwork
        if (sprite) {
          ctx.drawImage(sprite, -drawRadius, -drawRadius, drawRadius * 2, drawRadius * 2);
        }

        // Clean thin rim around flag disc
        ctx.beginPath();
        ctx.arc(0, 0, drawRadius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.78)';
        ctx.lineWidth = 1.3;
        ctx.stroke();

        ctx.restore();
      }

      // 5. Render Particles
      for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
        const p = particles[i];
        if (!p.active) continue;
        const alpha = Math.max(0, 1 - p.life / p.maxLife);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      ctx.restore(); // End interior clip

      // 6. Luminous Cyan Outer Arena Circumference
      ctx.save();
      ctx.beginPath();
      ctx.arc(ARENA_CENTER, ARENA_CENTER, ARENA_RADIUS, 0, Math.PI * 2);
      ctx.strokeStyle = '#00f2ff';
      ctx.lineWidth = 6;
      ctx.shadowColor = '#00f2ff';
      ctx.shadowBlur = 18;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(ARENA_CENTER, ARENA_CENTER, ARENA_RADIUS, 0, Math.PI * 2);
      ctx.strokeStyle = '#d8fcff';
      ctx.lineWidth = 1.8;
      ctx.shadowBlur = 0;
      ctx.stroke();
      ctx.restore();

      ctx.restore();
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      Matter.World.clear(engine.world, false);
      Matter.Engine.clear(engine);
    };
  }, [matchNumber, simRef, persistedStateRef]);

  return (
    <div
      ref={containerRef}
      data-testid="arena-canvas-container"
      className="relative flex items-center justify-center w-full h-full overflow-visible"
    >
      <canvas
        ref={canvasRef}
        data-testid="arena-physics-canvas"
        className="block rounded-full"
      />
    </div>
  );
};
