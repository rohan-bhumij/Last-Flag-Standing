import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { COUNTRIES_64, CountrySpec } from './data/countries';
import {
  ArenaSettings,
  BroadcastFormat,
  buildCommunityCommentary,
  buildEliminationCommentary,
  buildWinnerCommentary,
  CommunityEventPayload,
  CountrySupportState,
  DEFAULT_ARENA_SETTINGS,
  EliminationRecord,
  MatchPhase,
  OperatingMode,
  SupportArenaTracker,
} from './game/rules';
import {
  ArenaCanvas,
  ArenaSimulationHandle,
  PersistedArenaSimState,
  TelemetrySnapshot,
} from './game/ArenaCanvas';
import { CountryFlagBadge } from './components/CountryFlagBadge';
import {
  CloudRendererSpec,
  OperatorConsoleModal,
  YouTubeIntegrationStatus,
} from './components/OperatorConsoleModal';
import { soundEngine } from './audio/soundEngine';

interface SessionStandingsResponse {
  sessionStartedAt?: number;
  totalMatchesToday?: number;
  matchNumber: number;
  winsByCountry: Record<string, number>;
  recentWinners: Array<{
    matchNumber: number;
    countryCode: string;
    countryName: string;
    timestamp: number;
  }>;
  settings?: Partial<ArenaSettings>;
}

const DEMO_VIEWER_NAMES = [
  'David Taylor',
  'Mateo_CR',
  'AaravSharma',
  'PinoyPride_PH',
  'LucasBrasil',
  'Sakura_JP',
  'Kofi_GH',
  'Elena_GR',
  'Tunde_NG',
  'Sofia_AR',
];

export function App() {
  const initialParams = useMemo(() => {
    if (typeof window === 'undefined') {
      return { autostart: true, clean: false, format: '9:16' as BroadcastFormat };
    }
    const sp = new URLSearchParams(window.location.search);
    const titleMode = sp.get('screen') === 'title';
    const clean = sp.get('clean') === '1' || sp.get('mode') === 'obs';
    const fmtParam = sp.get('format');
    const format: BroadcastFormat = fmtParam === '16:9' ? '16:9' : '9:16';
    return { autostart: !titleMode, clean, format };
  }, []);

  const [shellState, setShellState] = useState<'title' | 'playing' | 'paused' | 'gameover'>(
    initialParams.autostart ? 'playing' : 'title'
  );
  const [broadcastFormat, setBroadcastFormat] = useState<BroadcastFormat>(initialParams.format);
  const [cleanBroadcastMode, setCleanBroadcastMode] = useState<boolean>(initialParams.clean);
  const [operatingMode, setOperatingMode] = useState<OperatingMode>('DEMO');
  const [operatorModalOpen, setOperatorModalOpen] = useState(false);
  const [showDailyFinale, setShowDailyFinale] = useState(false);
  const [rapidFireCount, setRapidFireCount] = useState<number>(0);

  const [settings, setSettings] = useState<ArenaSettings>(DEFAULT_ARENA_SETTINGS);
  const [sessionStartedAt, setSessionStartedAt] = useState<number>(() => Date.now() - 4 * 3600 * 1000);
  const [totalMatchesToday, setTotalMatchesToday] = useState<number>(68);
  const [matchNumber, setMatchNumber] = useState<number>(149);
  const [matchPhase, setMatchPhase] = useState<MatchPhase>('ACTIVE_MATCH');
  const [winsByCountry, setWinsByCountry] = useState<Record<string, number>>({
    IN: 14,
    CR: 11,
    BR: 9,
    PH: 8,
    JP: 7,
    US: 6,
    AR: 5,
    PT: 4,
    MX: 2,
    DE: 2,
  });

  const [telemetry, setTelemetry] = useState<TelemetrySnapshot>({
    remainingCount: 64,
    eliminatedCount: 0,
    isHatchOpen: false,
    isWarning: false,
    secondsUntilOpen: 3.5,
    secondsRemainingOpen: 0,
    cycleProgress: 0,
    dangerCountries: [],
    fps: 60,
  });

  const [eliminatedList, setEliminatedList] = useState<EliminationRecord[]>([]);
  const [latestElimination, setLatestElimination] = useState<EliminationRecord | null>(null);
  const [comebackCountry, setComebackCountry] = useState<CountrySpec | null>(null);
  const [shieldSavedCountry, setShieldSavedCountry] = useState<CountrySpec | null>(null);
  const [activeWinner, setActiveWinner] = useState<CountrySpec | null>(null);
  const [nextMatchCountdown, setNextMatchCountdown] = useState<number | null>(null);

  const supportTrackerRef = useRef<SupportArenaTracker>(new SupportArenaTracker(COUNTRIES_64));
  const [supportLeaderboard, setSupportLeaderboard] = useState<CountrySupportState[]>([]);
  const [shieldedCodes, setShieldedCodes] = useState<Set<string>>(new Set());
  const [eventLog, setEventLog] = useState<CommunityEventPayload[]>([]);
  const [activeCommunityBanner, setActiveCommunityBanner] = useState<CommunityEventPayload | null>(null);
  const [activeSubscriberPopup, setActiveSubscriberPopup] = useState<CommunityEventPayload | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const [audioConfig, setAudioConfig] = useState(soundEngine.getConfig());
  const [commentaryDiag, setCommentaryDiag] = useState(soundEngine.getDiagnostics());

  const [ytStatus, setYtStatus] = useState<YouTubeIntegrationStatus>({
    oauthConfigured: false,
    authorized: false,
    channelId: null,
    channelTitle: null,
    activeBroadcastId: null,
    activeBroadcastTitle: null,
    liveChatId: null,
    ingestionActive: false,
    lastEventReceivedAt: null,
    reconnectAttempts: 0,
    pollingIntervalMs: 5000,
    subscriberStatus: 'WAITING_FOR_CHANNEL_AUTH',
    subscriberLastCheckedAt: null,
    seenSubscriberCount: 0,
    lastError: null,
    availableBroadcasts: [],
  });
  const [cloudSpec, setCloudSpec] = useState<CloudRendererSpec | null>(null);

  const simRef = useRef<ArenaSimulationHandle | null>(null);
  const persistedSimStateRef = useRef<PersistedArenaSimState | null>(null);
  const eliminationSeqRef = useRef(0);

  // Seed initial Demo Support leaderboard with zero pre-formed shields (shields ONLY form from live comments!)
  const seedInitialDemoLeaderboard = useCallback(() => {
    const tracker = supportTrackerRef.current;
    tracker.resetForNewMatch(COUNTRIES_64);
    const cr = COUNTRIES_64.find((c) => c.code === 'CR')!;
    const ind = COUNTRIES_64.find((c) => c.code === 'IN')!;
    const bra = COUNTRIES_64.find((c) => c.code === 'BR')!;

    tracker.processSupportEvent({
      eventId: `seed-cr-${Date.now()}`,
      viewerId: 'seed-1',
      viewerName: 'Mateo_CR',
      country: cr,
      timestamp: Date.now(),
      cooldownMs: 0,
      shieldThreshold: 20,
      reviveThreshold: 50,
      isCountryEliminated: false,
      remainingCount: 64,
      weight: 14,
    });
    tracker.processSupportEvent({
      eventId: `seed-in-${Date.now()}`,
      viewerId: 'seed-2',
      viewerName: 'Aarav_IN',
      country: ind,
      timestamp: Date.now(),
      cooldownMs: 0,
      shieldThreshold: 20,
      reviveThreshold: 50,
      isCountryEliminated: false,
      remainingCount: 64,
      weight: 11,
    });
    tracker.processSupportEvent({
      eventId: `seed-br-${Date.now()}`,
      viewerId: 'seed-3',
      viewerName: 'Lucas_BR',
      country: bra,
      timestamp: Date.now(),
      cooldownMs: 0,
      shieldThreshold: 20,
      reviveThreshold: 50,
      isCountryEliminated: false,
      remainingCount: 64,
      weight: 8,
    });

    setSupportLeaderboard(tracker.getLeaderboard(5));
    setShieldedCodes(new Set()); // Zero shields at match start: 100% fair!
  }, []);

  useEffect(() => {
    seedInitialDemoLeaderboard();
  }, [seedInitialDemoLeaderboard]);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.body.dataset.state = shellState;
    }
  }, [shellState]);

  useEffect(() => {
    return soundEngine.subscribe(() => {
      setAudioConfig(soundEngine.getConfig());
      setCommentaryDiag(soundEngine.getDiagnostics());
    });
  }, []);

  // 1-second clock for updating 1-minute per-country shield cooldown timers in the UI
  useEffect(() => {
    const t = setInterval(() => {
      setNowMs(Date.now());
      setSupportLeaderboard(supportTrackerRef.current.getLeaderboard(5));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    fetch('/api/session/state')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: SessionStandingsResponse | null) => {
        if (!data) return;
        if (data.sessionStartedAt) setSessionStartedAt(data.sessionStartedAt);
        if (typeof data.totalMatchesToday === 'number') setTotalMatchesToday(data.totalMatchesToday);
        if (data.matchNumber) setMatchNumber(data.matchNumber);
        if (data.winsByCountry) setWinsByCountry(data.winsByCountry);
        if (data.settings) setSettings((prev) => ({ ...prev, ...data.settings }));
      })
      .catch(() => {});

    fetch('/api/youtube/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((st) => {
        if (st) setYtStatus(st);
      })
      .catch(() => {});

    fetch('/api/renderer/spec')
      .then((r) => (r.ok ? r.json() : null))
      .then((spec) => {
        if (spec) setCloudSpec(spec);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        fetch('/api/youtube/status')
          .then((r) => r.json())
          .then((st) => setYtStatus(st))
          .catch(() => {});
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const handleProcessCommunityEvent = useCallback(
    (payload: CommunityEventPayload) => {
      const tracker = supportTrackerRef.current;
      const isEliminated = payload.countryCode
        ? eliminatedList.some((e) => e.countryCode === payload.countryCode)
        : false;

      if (payload.type === 'CHAT_SUPPORT' && payload.countryCode) {
        const country = COUNTRIES_64.find((c) => c.code === payload.countryCode);
        if (!country) return;
        const res = tracker.processSupportEvent({
          eventId: payload.id,
          viewerId: payload.authorId,
          viewerName: payload.authorName,
          country,
          timestamp: payload.timestamp,
          cooldownMs: payload.source === 'DEMO' ? 200 : settings.viewerCooldownMs,
          shieldThreshold: settings.supportShieldThreshold,
          reviveThreshold: settings.supportReviveThreshold,
          isCountryEliminated: isEliminated,
          remainingCount: telemetry.remainingCount,
          weight: payload.source === 'DEMO' ? 5 : 1,
        });
        if (!res.accepted) return;

        payload.triggeredEffect = res.effect;
        if (res.effect === 'SHIELD_GRANTED') {
          setShieldedCodes((prev) => new Set(prev).add(country.code));
          soundEngine.playShieldBlock();
        } else if (res.effect === 'REVIVE_GRANTED') {
          const revived = simRef.current?.reviveCountry(country.code);
          if (revived) {
            setEliminatedList((prev) => prev.filter((e) => e.countryCode !== country.code));
            setComebackCountry(country);
            soundEngine.playSubscriberAlert();
          }
        } else {
          simRef.current?.impulseCountry(country.code);
        }
        setSupportLeaderboard(tracker.getLeaderboard(5));
      } else if (
        (payload.type === 'SUPER_CHAT' || payload.type === 'SUPER_STICKER') &&
        payload.countryCode
      ) {
        const effect = tracker.grantDirectShieldOrRevive(
          payload.countryCode,
          payload.authorName,
          isEliminated,
          telemetry.remainingCount
        );
        payload.triggeredEffect = effect;
        if (effect === 'REVIVE_GRANTED') {
          const revived = simRef.current?.reviveCountry(payload.countryCode);
          if (revived) {
            const c = COUNTRIES_64.find((x) => x.code === payload.countryCode) || null;
            setComebackCountry(c);
            setEliminatedList((prev) => prev.filter((e) => e.countryCode !== payload.countryCode));
          }
        } else if (effect === 'SHIELD_GRANTED') {
          setShieldedCodes((prev) => new Set(prev).add(payload.countryCode!));
        }
        setSupportLeaderboard(tracker.getLeaderboard(5));
        soundEngine.playSubscriberAlert();
      } else if (
        payload.type === 'NEW_MEMBER' ||
        payload.type === 'GIFT_MEMBERSHIP' ||
        payload.type === 'NEW_SUBSCRIBER'
      ) {
        if (payload.countryCode) {
          const effect = tracker.grantDirectShieldOrRevive(
            payload.countryCode,
            payload.authorName,
            isEliminated,
            telemetry.remainingCount,
            payload.timestamp
          );
          payload.triggeredEffect = effect;
          if (effect === 'SHIELD_GRANTED') {
            setShieldedCodes((prev) => new Set(prev).add(payload.countryCode!));
          } else if (effect === 'REVIVE_GRANTED') {
            const revived = simRef.current?.reviveCountry(payload.countryCode);
            if (revived) {
              const c = COUNTRIES_64.find((x) => x.code === payload.countryCode) || null;
              setComebackCountry(c);
              setEliminatedList((prev) => prev.filter((e) => e.countryCode !== payload.countryCode));
            }
          }
          setSupportLeaderboard(tracker.getLeaderboard(5));
        }
        setActiveSubscriberPopup(payload);
        soundEngine.playSubscriberAlert();
      }

      setEventLog((prev) => [payload, ...prev.slice(0, 39)]);
      setActiveCommunityBanner(payload);

      const line = buildCommunityCommentary(payload);
      if (line) {
        soundEngine.enqueueSpeech({
          id: `comm-${payload.id}`,
          text: line,
          priority: 'COMMUNITY',
          createdAt: Date.now(),
        });
      }
    },
    [
      eliminatedList,
      settings.supportReviveThreshold,
      settings.supportShieldThreshold,
      settings.viewerCooldownMs,
      telemetry.remainingCount,
    ]
  );

  useEffect(() => {
    if (operatingMode !== 'LIVE' || !ytStatus.ingestionActive) return;
    const interval = setInterval(() => {
      fetch('/api/youtube/events/poll')
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { events?: CommunityEventPayload[]; status?: YouTubeIntegrationStatus } | null) => {
          if (!data) return;
          if (data.status) setYtStatus(data.status);
          if (data.events && data.events.length > 0) {
            for (const ev of data.events) {
              handleProcessCommunityEvent(ev);
            }
          }
        })
        .catch(() => {});
    }, Math.max(3000, ytStatus.pollingIntervalMs || 5000));

    return () => clearInterval(interval);
  }, [operatingMode, ytStatus.ingestionActive, ytStatus.pollingIntervalMs, handleProcessCommunityEvent]);

  const handleTriggerDemoEvent = useCallback(
    (type: CommunityEventPayload['type'], targetCountryCode?: string) => {
      if (operatingMode !== 'DEMO') return;
      const viewer = DEMO_VIEWER_NAMES[Math.floor(Math.random() * DEMO_VIEWER_NAMES.length)];
      const isSub = type === 'NEW_SUBSCRIBER';
      const country = targetCountryCode
        ? COUNTRIES_64.find((c) => c.code === targetCountryCode)
        : isSub
          ? undefined
          : COUNTRIES_64[Math.floor(Math.random() * COUNTRIES_64.length)];

      const evt: CommunityEventPayload = {
        id: `demo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        source: 'DEMO',
        type,
        authorName: viewer,
        authorId: `demo-user-${viewer}`,
        countryCode: country?.code,
        countryName: country?.name,
        amountDisplay: type === 'SUPER_CHAT' ? '$10.00' : undefined,
        messageText:
          type === 'CHAT_SUPPORT'
            ? `!support ${country?.name}`
            : isSub
              ? 'Just subscribed!'
              : `Supporting ${country?.name}!`,
        timestamp: Date.now(),
        matchNumber,
      };
      handleProcessCommunityEvent(evt);
    },
    [operatingMode, matchNumber, handleProcessCommunityEvent]
  );

  const handleTriggerComeback = useCallback(() => {
    if (eliminatedList.length === 0) return;
    const targetRec = eliminatedList[0];
    const country = COUNTRIES_64.find((c) => c.code === targetRec.countryCode);
    if (!country) return;
    const ok = simRef.current?.reviveCountry(country.code);
    if (ok) {
      setEliminatedList((prev) => prev.filter((e) => e.countryCode !== country.code));
      setComebackCountry(country);
      soundEngine.playSubscriberAlert();
      soundEngine.enqueueSpeech({
        id: `comeback-${Date.now()}`,
        text: `${country.name} is back in!`,
        priority: 'COMMUNITY',
        countryName: country.name,
        createdAt: Date.now(),
      });
    }
  }, [eliminatedList]);

  const handleStartBroadcast = useCallback(() => {
    soundEngine.ensureContext();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setShellState('playing');
  }, []);

  const handleRestartMatch = useCallback(
    (advanceCycle = false) => {
      persistedSimStateRef.current = null;
      setEliminatedList([]);
      setLatestElimination(null);
      setComebackCountry(null);
      setActiveWinner(null);
      setNextMatchCountdown(null);
      setRapidFireCount(0);
      setMatchPhase('ACTIVE_MATCH');
      if (advanceCycle) {
        setMatchNumber((prev) => prev + 1);
      } else {
        simRef.current?.restartMatch();
      }
      if (operatingMode === 'DEMO') {
        seedInitialDemoLeaderboard();
      } else {
        supportTrackerRef.current.resetForNewMatch(COUNTRIES_64);
        setSupportLeaderboard([]);
        setShieldedCodes(new Set());
      }
      setShellState('playing');
    },
    [operatingMode, seedInitialDemoLeaderboard]
  );

  const handleEliminationConfirmed = useCallback(
    (country: CountrySpec, remainingAfter: number) => {
      eliminationSeqRef.current += 1;
      const seq = eliminationSeqRef.current;
      const record: EliminationRecord = {
        eventId: `elim-${matchNumber}-${country.code}-${Date.now()}`,
        countryCode: country.code,
        countryName: country.name,
        countryAbbr: country.abbr,
        remainingAfter,
        placement: remainingAfter + 1,
        timestamp: Date.now(),
        matchNumber,
      };

      setEliminatedList((prev) => {
        if (prev.some((e) => e.countryCode === country.code)) return prev;
        return [record, ...prev];
      });
      setLatestElimination(record);
      setRapidFireCount((prev) => (prev > 0 ? prev - 1 : 0));
      setMatchPhase(remainingAfter <= 5 ? 'FINALISTS' : 'ELIMINATION_CONFIRMED');

      const commentaryLine = buildEliminationCommentary({
        countryName: country.name,
        remainingAfter,
        matchNumber,
        sequenceIndex: seq,
        style: settings.commentaryStyle,
      });

      soundEngine.enqueueSpeech({
        id: record.eventId,
        text: commentaryLine,
        priority: 'ELIMINATION',
        countryName: country.name,
        remainingAfter,
        createdAt: Date.now(),
      });
    },
    [matchNumber, settings.commentaryStyle]
  );

  const handleShieldConsumed = useCallback(
    (country: CountrySpec) => {
      supportTrackerRef.current.consumeShield(country.code);
      setShieldedCodes((prev) => {
        const next = new Set(prev);
        next.delete(country.code);
        return next;
      });
      setShieldSavedCountry(country);
      setSupportLeaderboard(supportTrackerRef.current.getLeaderboard(5));
      soundEngine.enqueueSpeech({
        id: `shield-save-${matchNumber}-${country.code}-${Date.now()}`,
        text: `${country.name.toUpperCase()} saved by a shield!`,
        priority: 'ELIMINATION',
        countryName: country.name,
        createdAt: Date.now(),
      });
    },
    [matchNumber]
  );

  const handleTriggerDailyFinale = useCallback(() => {
    setShowDailyFinale(true);
    setNextMatchCountdown(null);
    soundEngine.playWinnerFanfare();
    const sorted = Object.entries(winsByCountry)
      .map(([code, wins]) => ({
        country: COUNTRIES_64.find((c) => c.code === code)!,
        wins,
      }))
      .filter((x) => x.country && x.wins > 0)
      .sort((a, b) => b.wins - a.wins);
    const dayChampion = sorted[0];
    if (dayChampion) {
      soundEngine.enqueueSpeech({
        id: `daily-finale-${Date.now()}`,
        text: `Today's Last Flag Standing marathon is complete! With ${dayChampion.wins} match victories today, ${dayChampion.country.name} is crowned Champion of the Day!`,
        priority: 'WINNER',
        countryName: dayChampion.country.name,
        createdAt: Date.now(),
      });
    }
  }, [winsByCountry]);

  const handleMatchWinnerConfirmed = useCallback(
    (winner: CountrySpec) => {
      setActiveWinner(winner);
      setMatchPhase('WINNER_REVEAL');
      setShellState('gameover');

      const newTotalWins = (winsByCountry[winner.code] || 0) + 1;
      const nextWinsMap = {
        ...winsByCountry,
        [winner.code]: newTotalWins,
      };
      setWinsByCountry(nextWinsMap);
      setTotalMatchesToday((prev) => prev + 1);

      fetch('/api/session/record-win', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchNumber,
          countryCode: winner.code,
          countryName: winner.name,
        }),
      }).catch(() => {});

      const winLine = buildWinnerCommentary({
        countryName: winner.name,
        totalWins: newTotalWins,
        matchNumber,
      });
      soundEngine.enqueueSpeech({
        id: `win-${matchNumber}-${winner.code}`,
        text: winLine,
        priority: 'WINNER',
        countryName: winner.name,
        remainingAfter: 1,
        createdAt: Date.now(),
      });

      // Check if 11+ hour target stream duration has been reached; if so, transition to Daily Finale after reveal
      const elapsedHours = (Date.now() - sessionStartedAt) / 3_600_000;
      const targetHours = settings.targetStreamDurationHours || 11.5;
      if (elapsedHours >= targetHours) {
        setTimeout(() => {
          setShowDailyFinale(true);
        }, Math.round(settings.winnerRevealDurationSec * 1000));
      } else {
        setNextMatchCountdown(Math.round(settings.winnerRevealDurationSec));
      }
    },
    [
      matchNumber,
      sessionStartedAt,
      settings.targetStreamDurationHours,
      settings.winnerRevealDurationSec,
      winsByCountry,
    ]
  );

  useEffect(() => {
    if (nextMatchCountdown === null || showDailyFinale) return;
    if (nextMatchCountdown <= 0) {
      handleRestartMatch(true);
      return;
    }
    const timer = setTimeout(() => {
      setNextMatchCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);
    return () => clearTimeout(timer);
  }, [nextMatchCountdown, showDailyFinale, handleRestartMatch]);

  // Keep latest elimination card visible at bottom-left for 3.6s (just like the reference video)
  useEffect(() => {
    if (!latestElimination) return;
    const t = setTimeout(() => setLatestElimination(null), 3600);
    return () => clearTimeout(t);
  }, [latestElimination]);

  useEffect(() => {
    if (!comebackCountry) return;
    const t = setTimeout(() => setComebackCountry(null), 2800);
    return () => clearTimeout(t);
  }, [comebackCountry]);

  useEffect(() => {
    if (!shieldSavedCountry) return;
    const t = setTimeout(() => setShieldSavedCountry(null), 2600);
    return () => clearTimeout(t);
  }, [shieldSavedCountry]);

  useEffect(() => {
    if (!activeCommunityBanner) return;
    const t = setTimeout(() => setActiveCommunityBanner(null), 3200);
    return () => clearTimeout(t);
  }, [activeCommunityBanner]);

  // Temporary subscriber alert + golden diamond lifecycle: pops in with animation, stays ~2.7s, animates out, and unmounts at 3.2s
  useEffect(() => {
    if (!activeSubscriberPopup) return;
    const t = setTimeout(() => setActiveSubscriberPopup(null), 3200);
    return () => clearTimeout(t);
  }, [activeSubscriberPopup]);

  // Live Match Start Game Announcement so game commentary begins synced with match start
  useEffect(() => {
    if (shellState !== 'playing') return;
    const introTimer = setTimeout(() => {
      soundEngine.enqueueSpeech({
        id: `match-intro-${matchNumber}`,
        text: `New Match! Cycle ${matchNumber} begins now! 64 countries enter — who will survive?`,
        priority: 'COMMUNITY',
        createdAt: Date.now(),
      });
    }, 450);
    return () => clearTimeout(introTimer);
  }, [shellState, matchNumber]);

  // Periodic subscriber simulation in DEMO mode (celebrates subscriber without giving biased shields to random flags)
  useEffect(() => {
    if (operatingMode !== 'DEMO' || shellState !== 'playing' || showDailyFinale) return;
    const initialSubTimer = setTimeout(() => {
      handleTriggerDemoEvent('NEW_SUBSCRIBER');
    }, 6500);
    const periodicSubTimer = setInterval(() => {
      handleTriggerDemoEvent('NEW_SUBSCRIBER');
    }, 18000);
    return () => {
      clearTimeout(initialSubTimer);
      clearInterval(periodicSubTimer);
    };
  }, [operatingMode, shellState, showDailyFinale, handleTriggerDemoEvent]);

  // Trigger Rapid Fire mode (like "RAPID FIRE x4" in the reference video)
  const handleTriggerRapidFire = useCallback(() => {
    setRapidFireCount(4);
    simRef.current?.forceHatchOpen(false);
    soundEngine.enqueueSpeech({
      id: `rapid-fire-${Date.now()}`,
      text: 'Rapid fire! Things are moving fast!',
      priority: 'ELIMINATION',
      createdAt: Date.now(),
    });
  }, []);

  // Trigger Double Draw mode (matching "DOUBLE DRAW" gold box in screenshot image_5e8759ce.png)
  const handleTriggerDoubleDraw = useCallback(() => {
    simRef.current?.forceHatchOpen(true);
    soundEngine.enqueueSpeech({
      id: `double-draw-${Date.now()}`,
      text: 'Double draw! Two flags can fall this cycle!',
      priority: 'ELIMINATION',
      createdAt: Date.now(),
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;

      if (shellState === 'title' && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        handleStartBroadcast();
        return;
      }

      if (e.key === 'Escape') {
        if (operatorModalOpen) {
          setOperatorModalOpen(false);
          return;
        }
        if (showDailyFinale) {
          setShowDailyFinale(false);
          return;
        }
        setShellState((prev) => (prev === 'playing' ? 'paused' : prev === 'paused' ? 'playing' : prev));
        return;
      }

      if (e.key.toLowerCase() === 'p' && !operatorModalOpen) {
        setShellState((prev) => (prev === 'playing' ? 'paused' : prev === 'paused' ? 'playing' : prev));
      } else if (e.key.toLowerCase() === 'm') {
        soundEngine.updateConfig({ muted: !soundEngine.getConfig().muted });
      } else if (e.key.toLowerCase() === 'v' || e.key.toLowerCase() === 'h') {
        setBroadcastFormat((prev) => (prev === '9:16' ? '16:9' : '9:16'));
      } else if (e.key.toLowerCase() === 'o') {
        setOperatorModalOpen((prev) => !prev);
      } else if (e.key.toLowerCase() === 'e' && !operatorModalOpen) {
        if (showDailyFinale) {
          setShowDailyFinale(false);
        } else {
          handleTriggerDailyFinale();
        }
      } else if (e.key.toLowerCase() === 'd' && shellState === 'playing' && !operatorModalOpen) {
        handleTriggerDoubleDraw();
      } else if (e.key.toLowerCase() === 'r' && shellState === 'playing' && !operatorModalOpen) {
        handleTriggerRapidFire();
      } else if (e.key.toLowerCase() === 'b' && shellState === 'playing' && !operatorModalOpen) {
        handleTriggerComeback();
      } else if (e.key.toLowerCase() === 'c' && operatingMode === 'DEMO') {
        handleTriggerDemoEvent('NEW_SUBSCRIBER');
      } else if (e.key === ' ' && shellState === 'playing' && !operatorModalOpen) {
        e.preventDefault();
        simRef.current?.forceHatchOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    shellState,
    operatorModalOpen,
    showDailyFinale,
    operatingMode,
    handleStartBroadcast,
    handleTriggerDemoEvent,
    handleTriggerRapidFire,
    handleTriggerDoubleDraw,
    handleTriggerDailyFinale,
    handleTriggerComeback,
  ]);

  const handleConnectYouTubeOAuth = async () => {
    try {
      const resp = await fetch('/api/youtube/auth-url');
      const data = await resp.json();
      if (data.url) {
        window.open(data.url, 'youtube_oauth_popup', 'width=620,height=720');
      } else if (data.error) {
        setYtStatus((prev) => ({ ...prev, lastError: data.error }));
      }
    } catch (e) {
      setYtStatus((prev) => ({
        ...prev,
        lastError: e instanceof Error ? e.message : 'Failed to fetch OAuth URL',
      }));
    }
  };

  const handleConnectYouTubeLiveUrl = async (liveUrlOrId: string) => {
    try {
      const resp = await fetch('/api/youtube/connect-live-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ liveUrlOrId }),
      });
      const st = await resp.json();
      if (st && typeof st === 'object') {
        setYtStatus((prev) => ({ ...prev, ...st }));
        if (st.ingestionActive) {
          setOperatingMode('LIVE');
        }
      }
    } catch (e) {
      setYtStatus((prev) => ({
        ...prev,
        lastError: e instanceof Error ? e.message : 'Failed to connect Live URL',
      }));
    }
  };

  const handleTestVoice = useCallback(() => {
    soundEngine.ensureContext();
    soundEngine.enqueueSpeech({
      id: `voice-test-${Date.now()}`,
      text: 'Welcome to Last Flag Standing! Type your country in the live chat and subscribe for free shield power!',
      priority: 'COMMUNITY',
      createdAt: Date.now(),
    });
  }, []);

  const handleDisconnectYouTube = async () => {
    await fetch('/api/youtube/disconnect', { method: 'POST' });
    const st = await fetch('/api/youtube/status').then((r) => r.json());
    setYtStatus(st);
  };

  const handleRefreshBroadcasts = async () => {
    const st = await fetch('/api/youtube/broadcasts').then((r) => r.json());
    setYtStatus(st);
  };

  const handleSelectBroadcast = async (broadcastId: string, liveChatId: string) => {
    const st = await fetch('/api/youtube/select-broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ broadcastId, liveChatId }),
    }).then((r) => r.json());
    setYtStatus(st);
  };

  const handleToggleChatIngestion = async () => {
    const endpoint = ytStatus.ingestionActive ? '/api/youtube/chat/stop' : '/api/youtube/chat/start';
    const st = await fetch(endpoint, { method: 'POST' }).then((r) => r.json());
    setYtStatus(st);
  };

  const handlePollSubscribersNow = async () => {
    const res = await fetch('/api/youtube/subscribers/check', { method: 'POST' }).then((r) => r.json());
    if (res.status) setYtStatus(res.status);
    if (res.newEvents && Array.isArray(res.newEvents)) {
      for (const ev of res.newEvents) {
        handleProcessCommunityEvent(ev);
      }
    }
  };

  const handleUpdateSettings = (partial: Partial<ArenaSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      fetch('/api/session/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: next }),
      }).catch(() => {});
      return next;
    });
  };

  const handleResetSessionStandings = async () => {
    const resp = await fetch('/api/session/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: true }),
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data.sessionStartedAt) setSessionStartedAt(data.sessionStartedAt);
      setTotalMatchesToday(data.totalMatchesToday || 0);
      setWinsByCountry(data.winsByCountry || {});
      setMatchNumber(data.matchNumber || 1);
      setShowDailyFinale(false);
    }
  };

  const handleRunCloudPreflight = async () => {
    const spec = await fetch('/api/renderer/preflight', { method: 'POST' }).then((r) => r.json());
    setCloudSpec(spec);
  };

  const effectiveCycleSec = telemetry.effectiveCycleDurationSec || settings.cycleDurationSec;
  const closedDuration = Math.max(1.2, effectiveCycleSec - settings.openDurationSec);
  const maxCountdownDigits = Math.max(2, Math.min(4, Math.ceil(closedDuration)));
  const countdownNum = Math.max(1, Math.min(maxCountdownDigits, Math.ceil(telemetry.secondsUntilOpen)));
  const countdownDisplay = telemetry.isHatchOpen ? '!' : countdownNum;
  const ringFraction = telemetry.isHatchOpen
    ? 1
    : Math.max(0.15, Math.min(1, (closedDuration - telemetry.secondsUntilOpen) / closedDuration));
  // Matches video: 4 and 3 use yellow/gold arc (#eab308); 2 and 1 use green arc (#10b981); ! uses hot-magenta (#ff1f8e)
  const countdownRingColor = telemetry.isHatchOpen
    ? '#ff1f8e'
    : countdownNum <= 2
      ? '#10b981'
      : '#eab308';

  const dailyStandings = useMemo(() => {
    return Object.entries(winsByCountry)
      .map(([code, wins]) => ({
        country: COUNTRIES_64.find((c) => c.code === code)!,
        wins,
      }))
      .filter((x) => x.country && x.wins > 0)
      .sort((a, b) => b.wins - a.wins);
  }, [winsByCountry]);

  const topChampions = useMemo(() => dailyStandings.slice(0, 6), [dailyStandings]);

  const streamElapsedHours = Math.max(0.1, (nowMs - sessionStartedAt) / 3_600_000);
  const isFlagsWarTitle = settings.channelTitle === 'FLAGS WAR ARENA';

  return (
    <main className="relative w-screen h-screen bg-[#03050e] text-slate-100 overflow-hidden select-none">
      {/* Atmospheric Stadium Backdrop (Left/Right Wings around the 9:16 vertical broadcast) */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_20%_50%,rgba(14,116,144,0.22),transparent_55%),radial-gradient(ellipse_at_80%_50%,rgba(225,29,72,0.22),transparent_55%),radial-gradient(circle_at_50%_50%,#070c22_0%,#03050d_100%)]"
      />

      {/* Discreet Auto-Hiding Operator Drawer in Top-Left Margin (Completely outside the 9:16 stage & hidden in Clean Stream Mode) */}
      {!cleanBroadcastMode && shellState !== 'title' && (
        <div
          data-testid="operator-quick-toolbar"
          className="fixed top-2.5 left-2.5 z-30 flex flex-col gap-1.5 opacity-15 hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200 pointer-events-auto"
        >
          <div className="flex items-center gap-1 bg-[#070b1d]/95 border border-slate-700/80 rounded-lg p-1 shadow-lg">
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                setBroadcastFormat((prev) => (prev === '9:16' ? '16:9' : '9:16'));
              }}
              aria-label={`Switch Broadcast Format (Current ${broadcastFormat})`}
              title="Switch 9:16 / 16:9 Format [V]"
              className="h-7 px-2 flex items-center gap-1 bg-[#0d1536] hover:bg-[#162252] border border-slate-700/80 rounded text-[10px] font-mono font-bold text-cyan-300"
            >
              <span>{broadcastFormat}</span>
            </button>

            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                handleTriggerComeback();
              }}
              aria-label="Trigger Comeback Revive"
              title="Trigger Comeback Revive [B]"
              className="h-7 px-2 flex items-center bg-[#0d1536] hover:bg-[#162252] border border-cyan-500/40 rounded text-[10px] font-bold text-cyan-300"
            >
              <span>Comeback [B]</span>
            </button>

            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                handleTriggerDoubleDraw();
              }}
              aria-label="Trigger Double Draw"
              title="Trigger Double Draw [D]"
              className="h-7 px-2 flex items-center bg-[#0d1536] hover:bg-[#162252] border border-amber-500/40 rounded text-[10px] font-bold text-amber-300"
            >
              <span>Double [D]</span>
            </button>

            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                if (showDailyFinale) {
                  setShowDailyFinale(false);
                } else {
                  handleTriggerDailyFinale();
                }
              }}
              aria-label="Toggle End-of-Stream Daily Winner Screen"
              title="Show End-of-Stream Day's Winner & Standings [E]"
              className="h-7 px-2 flex items-center bg-[#0d1536] hover:bg-[#162252] border border-emerald-500/40 rounded text-[10px] font-bold text-emerald-300"
            >
              <span>{showDailyFinale ? 'Resume [E]' : 'Finale [E]'}</span>
            </button>

            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                soundEngine.updateConfig({ muted: !audioConfig.muted });
              }}
              aria-label={audioConfig.muted ? 'Unmute Audio' : 'Mute Audio'}
              title="Mute / Unmute Audio [M]"
              className="w-7 h-7 flex items-center justify-center bg-[#0d1536] hover:bg-[#162252] border border-slate-700/80 rounded text-slate-200 text-xs"
            >
              {audioConfig.muted ? '🔇' : '🔊'}
            </button>

            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                setOperatorModalOpen(true);
              }}
              aria-label="Open Broadcast Operator Console"
              title="Open Operator Console [O]"
              className="h-7 px-2 flex items-center gap-1 bg-[#0d1536] hover:bg-[#162252] border border-cyan-500/40 text-cyan-200 font-bold text-[10px] rounded"
            >
              <span>Console [O]</span>
            </button>
          </div>
        </div>
      )}

      {/* =====================================================================
          COMPOSITION 1: VERTICAL 9:16 BROADCAST (EXACT MATCH TO REFERENCE VIDEO & SCREENSHOT)
         ===================================================================== */}
      {broadcastFormat === '9:16' ? (
        <div className="w-full h-full flex items-center justify-center">
          <div
            data-testid="vertical-broadcast-stage"
            className="relative h-full aspect-[9/16] max-w-full flex flex-col justify-between bg-[#050816] border-x border-slate-800/70 shadow-[0_0_90px_rgba(0,0,0,0.95)] px-2 py-1.5 overflow-hidden box-border"
          >
            {/* Subtle Messi (Left Electric Blue #10) vs Ronaldo (Right Crimson Red #7) Rivalry Stadium Background matching screenshot image_5e8759ce.png */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
            >
              {/* Left Electric Blue Stadium Smoke & Spotlight */}
              <div className="absolute top-[6%] -left-[22%] w-[72%] h-[74%] rounded-full bg-[radial-gradient(circle,rgba(14,165,233,0.44)_0%,rgba(2,132,199,0.24)_45%,transparent_74%)] blur-xl" />
              {/* Right Crimson Red Stadium Ember Smoke & Spotlight */}
              <div className="absolute top-[8%] -right-[22%] w-[72%] h-[74%] rounded-full bg-[radial-gradient(circle,rgba(225,29,72,0.44)_0%,rgba(159,18,57,0.24)_45%,transparent_74%)] blur-xl" />

              {/* Subtle Messi (Left #10) vs Ronaldo (Right #7) Athletic Rivalry Silhouettes & Stadium Rim Lighting */}
              <svg
                viewBox="0 0 540 960"
                preserveAspectRatio="xMidYMid slice"
                className="absolute inset-0 w-full h-full opacity-35 mix-blend-screen"
              >
                <defs>
                  <linearGradient id="messiBlueRim" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.85" />
                    <stop offset="55%" stopColor="#0284c7" stopOpacity="0.45" />
                    <stop offset="100%" stopColor="#030712" stopOpacity="0" />
                  </linearGradient>
                  <linearGradient id="ronaldoRedRim" x1="100%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#fb7185" stopOpacity="0.85" />
                    <stop offset="55%" stopColor="#e11d48" stopOpacity="0.45" />
                    <stop offset="100%" stopColor="#030712" stopOpacity="0" />
                  </linearGradient>
                </defs>

                {/* Stadium Diagonal Light Beams */}
                <polygon points="0,0 230,0 140,420 0,320" fill="url(#messiBlueRim)" opacity="0.35" />
                <polygon points="540,0 310,0 400,420 540,320" fill="url(#ronaldoRedRim)" opacity="0.35" />

                {/* Left Athlete Silhouette (Messi #10 Profile & Shoulders in Electric Cyan-Blue) */}
                <g transform="translate(14, 155)" opacity="0.78">
                  <circle cx="95" cy="70" r="38" fill="url(#messiBlueRim)" />
                  <path
                    d="M22,250 C26,158 55,118 98,116 C142,118 168,158 176,250 Z"
                    fill="url(#messiBlueRim)"
                  />
                  {/* Subtle Argentina/Blue Vertical Stripes & #10 */}
                  <rect x="70" y="132" width="12" height="95" fill="#bae6fd" opacity="0.22" />
                  <rect x="108" y="132" width="12" height="95" fill="#bae6fd" opacity="0.22" />
                  <text
                    x="96"
                    y="204"
                    textAnchor="middle"
                    fill="#e0f2fe"
                    opacity="0.42"
                    fontSize="52"
                    fontWeight="800"
                    fontFamily="Barlow Condensed, sans-serif"
                  >
                    10
                  </text>
                </g>

                {/* Right Athlete Silhouette (Ronaldo #7 Profile & Shoulders in Crimson-Red) */}
                <g transform="translate(332, 150)" opacity="0.78">
                  <circle cx="98" cy="66" r="40" fill="url(#ronaldoRedRim)" />
                  <path
                    d="M18,255 C28,154 56,114 98,112 C142,114 172,154 182,255 Z"
                    fill="url(#ronaldoRedRim)"
                  />
                  <text
                    x="98"
                    y="204"
                    textAnchor="middle"
                    fill="#ffe4e6"
                    opacity="0.42"
                    fontSize="54"
                    fontWeight="800"
                    fontFamily="Barlow Condensed, sans-serif"
                  >
                    7
                  </text>
                </g>

                {/* Lower Stadium Rivalry Legs/Action Stride & Rising Sparks (Visible below the circle) */}
                <g opacity="0.45">
                  <path d="M55,670 L95,840 L125,840 L102,670 Z" fill="url(#messiBlueRim)" />
                  <path d="M128,675 L155,830 L182,830 L158,675 Z" fill="url(#messiBlueRim)" />
                  <path d="M465,670 L425,840 L395,840 L418,670 Z" fill="url(#ronaldoRedRim)" />
                  <path d="M392,675 L365,830 L338,830 L362,675 Z" fill="url(#ronaldoRedRim)" />
                  {/* Floating Stadium Embers */}
                  <circle cx="72" cy="790" r="2.5" fill="#38bdf8" />
                  <circle cx="145" cy="740" r="2" fill="#7dd3fc" />
                  <circle cx="468" cy="785" r="2.8" fill="#fb7185" />
                  <circle cx="412" cy="735" r="2.2" fill="#fda4af" />
                  <circle cx="445" cy="825" r="1.8" fill="#fbbf24" />
                </g>
              </svg>

              {/* Bottom Stadium Floor Vignette + Ember Glow */}
              <div className="absolute inset-x-0 bottom-0 h-[34%] bg-[radial-gradient(ellipse_at_25%_85%,rgba(56,189,248,0.18),transparent_60%),radial-gradient(ellipse_at_80%_80%,rgba(244,63,94,0.22),transparent_60%),linear-gradient(to_top,#040611_15%,transparent_100%)]" />
            </div>

            {/* 1. TOP HEADER BAR: LAST FLAG STANDING · COUNTRIES 64 · REMAINING · COUNTDOWN RING (Never Cut Off!) */}
            <div className="relative w-full shrink-0 flex items-center justify-between gap-1 px-0.5 z-20 box-border">
              <div
                data-testid="channel-header-title"
                className="font-display font-extrabold text-[15px] tracking-tight leading-none uppercase whitespace-nowrap shrink-0 drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]"
              >
                {isFlagsWarTitle ? (
                  <>
                    <span className="text-white">FLAGS WAR </span>
                    <span className="text-[#facc15]">ARENA</span>
                  </>
                ) : (
                  <>
                    <span className="text-white">LAST FLAG </span>
                    <span className="text-[#facc15]">STANDING</span>
                  </>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {/* COUNTRIES 64 */}
                <div className="px-2 py-0.5 bg-[#0b1026]/90 border border-slate-700/75 rounded-lg text-center min-w-[50px]">
                  <div className="text-[6.5px] font-bold tracking-wider text-slate-300 uppercase leading-tight">
                    COUNTRIES
                  </div>
                  <div
                    data-testid="total-countries-count"
                    className="font-display font-extrabold text-[19px] leading-none text-white tabular-nums"
                  >
                    64
                  </div>
                </div>

                {/* REMAINING */}
                <div className="px-2 py-0.5 bg-[#0b1026]/90 border border-slate-700/75 rounded-lg text-center min-w-[52px]">
                  <div className="text-[6.5px] font-bold tracking-wider text-slate-300 uppercase leading-tight">
                    REMAINING
                  </div>
                  <div
                    data-testid="remaining-countries-count"
                    className="font-display font-extrabold text-[19px] leading-none text-[#facc15] tabular-nums"
                  >
                    {telemetry.remainingCount}
                  </div>
                </div>

                {/* Circular Countdown Ring (4-3 Gold, 2-1 Green, ! Hot-Magenta) — Guaranteed Inside Viewport */}
                <div
                  data-testid="hazard-countdown-ring"
                  className="relative w-8.5 h-8.5 flex items-center justify-center shrink-0"
                >
                  <svg viewBox="0 0 44 44" className="w-8.5 h-8.5 -rotate-90">
                    <circle
                      cx="22"
                      cy="22"
                      r="18"
                      fill="#090d20"
                      stroke="rgba(148,163,184,0.22)"
                      strokeWidth="4"
                    />
                    <circle
                      cx="22"
                      cy="22"
                      r="18"
                      fill="none"
                      stroke={countdownRingColor}
                      strokeWidth="4"
                      strokeDasharray={113.1}
                      strokeDashoffset={
                        telemetry.isHatchOpen ? 0 : 113.1 * (1 - ringFraction)
                      }
                      strokeLinecap="round"
                    />
                  </svg>
                  <span
                    className={`absolute font-display font-extrabold text-base tabular-nums ${
                      telemetry.isHatchOpen ? 'text-[#ff1f8e]' : 'text-white'
                    }`}
                  >
                    {countdownDisplay}
                  </span>
                </div>
              </div>
            </div>

            {/* 2. UPPER-MID HUD ROW: CHAT SUPPORT (Left) · WHERE ARE YOU FROM? (Center) · SAVE YOUR COUNTRY (Right) */}
            <div className="relative grid grid-cols-12 gap-1 items-start px-0.5 z-20 mt-0.5">
              {/* Left Bracketed Box: CHAT SUPPORT */}
              <div className="col-span-4 relative p-1.5 bg-[#080e24]/90 border border-slate-800/85 rounded">
                <span className="pointer-events-none absolute -top-[1px] -left-[1px] w-2.5 h-2.5 border-t-2 border-l-2 border-[#facc15]" />
                <span className="pointer-events-none absolute -top-[1px] -right-[1px] w-2.5 h-2.5 border-t-2 border-r-2 border-[#facc15]" />
                <span className="pointer-events-none absolute -bottom-[1px] -left-[1px] w-2.5 h-2.5 border-b-2 border-l-2 border-[#00f2ff]" />
                <span className="pointer-events-none absolute -bottom-[1px] -right-[1px] w-2.5 h-2.5 border-b-2 border-r-2 border-[#00f2ff]" />

                <div className="flex items-center justify-between border-b border-slate-800/90 pb-0.5 mb-1 whitespace-nowrap">
                  <span className="text-[7px] font-extrabold tracking-tight text-[#facc15] uppercase">
                    CHAT SUPPORT
                  </span>
                  <span className="text-[6.5px] font-bold text-rose-400 uppercase flex items-center gap-0.5">
                    LIVE <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-500" />
                  </span>
                </div>

                <div className="space-y-1">
                  {supportLeaderboard.slice(0, 3).map((item, idx) => {
                    const c = COUNTRIES_64.find((x) => x.code === item.countryCode);
                    if (!c) return null;
                    const cooldownLeftSec = Math.max(
                      0,
                      Math.ceil(((item.shieldCooldownUntil || 0) - nowMs) / 1000)
                    );
                    const pct = Math.min(
                      100,
                      Math.round(
                        ((item.supportCount % settings.supportShieldThreshold) /
                          settings.supportShieldThreshold) *
                          100
                      )
                    );
                    return (
                      <div key={item.countryCode} className="flex items-center gap-1 text-[7.5px]">
                        <span className="font-mono text-[7px] text-slate-400 w-1.5 shrink-0">{idx + 1}</span>
                        <CountryFlagBadge country={c} size={12} shielded={item.hasShield} />
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-center leading-none gap-0.5 whitespace-nowrap">
                            <span className="font-bold text-white truncate uppercase text-[7px]">
                              {c.name}
                            </span>
                            <span className="font-mono font-bold text-slate-100 tabular-nums text-[7px] shrink-0">
                              {item.supportCount} 💬
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[6px] text-cyan-300 leading-none mt-0.5 whitespace-nowrap">
                            <span>
                              {item.hasShield
                                ? '🛡️ SHIELD EARNED'
                                : cooldownLeftSec > 0
                                  ? `⏳ CD ${cooldownLeftSec}s`
                                  : `🛡️ ${item.supportCount % settings.supportShieldThreshold}/${settings.supportShieldThreshold}`}
                            </span>
                          </div>
                          <div className="w-full h-[2.5px] bg-slate-800 rounded-full overflow-hidden mt-0.5">
                            <div
                              className="h-full bg-gradient-to-r from-cyan-400 to-emerald-400"
                              style={{ width: `${item.hasShield ? 100 : pct}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Center Callout: NEW SUBSCRIBER bracketed box (when active) OR CYCLE · LIVE + WHERE ARE YOU FROM? */}
              <div className="col-span-4 flex flex-col items-center justify-start text-center pt-0.5">
                {activeSubscriberPopup ? (
                  <div
                    key={activeSubscriberPopup.id}
                    data-testid="subscriber-popup-banner"
                    className="animate-subscriber-card relative w-full px-1.5 py-1.5 bg-[#080e24]/95 border border-amber-400/50 rounded shadow-[0_0_16px_rgba(250,204,21,0.28)] flex items-center gap-1.5 text-left"
                  >
                    <span className="pointer-events-none absolute -top-[1px] -left-[1px] w-2 h-2 border-t-2 border-l-2 border-[#facc15]" />
                    <span className="pointer-events-none absolute -top-[1px] -right-[1px] w-2 h-2 border-t-2 border-r-2 border-[#facc15]" />
                    <span className="pointer-events-none absolute -bottom-[1px] -left-[1px] w-2 h-2 border-b-2 border-l-2 border-[#facc15]" />
                    <span className="pointer-events-none absolute -bottom-[1px] -right-[1px] w-2 h-2 border-b-2 border-r-2 border-[#facc15]" />

                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-amber-300 via-amber-400 to-yellow-600 border border-amber-100 shadow-[0_0_10px_rgba(251,191,36,0.65)] flex items-center justify-center text-[11px] shrink-0">
                      🔔
                    </div>
                    <div className="min-w-0 flex-1 leading-tight">
                      <div className="font-display font-extrabold text-[9.5px] leading-[1.05] text-[#facc15] uppercase tracking-tight break-words">
                        THANK YOU {activeSubscriberPopup.authorName}!
                      </div>
                      <div className="text-[7.5px] font-sans font-semibold text-slate-100 mt-0.5 flex items-center gap-0.5 whitespace-nowrap">
                        <span>New subscriber</span>
                        <span className="text-[8px]">🔔</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {rapidFireCount > 0 ? (
                      <div className="text-[10px] font-display font-extrabold tracking-wider text-orange-400 uppercase drop-shadow-[0_0_8px_rgba(251,146,60,0.6)] whitespace-nowrap">
                        RAPID FIRE x{rapidFireCount}
                      </div>
                    ) : (
                      <div className="text-[8.5px] font-sans font-semibold tracking-wider text-slate-300 uppercase whitespace-nowrap">
                        CYCLE {matchNumber} · LIVE
                      </div>
                    )}
                    <div className="font-display font-extrabold text-[14px] leading-[1.05] text-white uppercase mt-0.5 drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] whitespace-nowrap">
                      COMMENT WHERE
                      <span className="block text-[#facc15] text-[18px] tracking-wide">ARE YOU FROM?</span>
                    </div>
                  </>
                )}
              </div>

              {/* Right Bracketed Box: SAVE YOUR COUNTRY */}
              <div className="col-span-4 relative">
                <div className="relative p-1.5 bg-[#080e24]/90 border border-slate-800/85 rounded text-[7px]">
                  <span className="pointer-events-none absolute -top-[1px] -left-[1px] w-2.5 h-2.5 border-t-2 border-l-2 border-[#00f2ff]" />
                  <span className="pointer-events-none absolute -top-[1px] -right-[1px] w-2.5 h-2.5 border-t-2 border-r-2 border-[#00f2ff]" />
                  <span className="pointer-events-none absolute -bottom-[1px] -left-[1px] w-2.5 h-2.5 border-b-2 border-l-2 border-[#facc15]" />
                  <span className="pointer-events-none absolute -bottom-[1px] -right-[1px] w-2.5 h-2.5 border-b-2 border-r-2 border-[#facc15]" />

                  <div className="text-[7px] font-extrabold tracking-tight text-[#2dd4bf] uppercase text-center border-b border-slate-800/90 pb-0.5 mb-1 whitespace-nowrap">
                    SAVE YOUR COUNTRY
                  </div>
                  <div className="space-y-[2px] text-slate-200 leading-tight font-medium whitespace-nowrap">
                    <div className="flex justify-between gap-1">
                      <span>💬 {settings.supportShieldThreshold} chats</span>
                      <span className="font-bold text-cyan-300">🛡️ SHIELD</span>
                    </div>
                    <div className="flex justify-between gap-1">
                      <span>💬 &gt;50 chats</span>
                      <span className="font-bold text-rose-400">❤️ WILD CARD</span>
                    </div>
                    <div className="flex justify-between gap-1">
                      <span className="text-amber-200">⭐ Super Chat</span>
                      <span className="font-bold text-amber-300">🛡️/❤️</span>
                    </div>
                    <div className="flex justify-between gap-1">
                      <span className="text-amber-200">🔔 Subscribe</span>
                      <span className="font-bold text-indigo-300">FREE POWER</span>
                    </div>
                    <div className="flex justify-between gap-1">
                      <span className="text-cyan-200">💎 50 Jewels</span>
                      <span className="font-bold text-cyan-300">🛡️/❤️</span>
                    </div>
                  </div>
                  <div className="text-[6px] text-center text-amber-300/90 mt-1 pt-0.5 border-t border-slate-800/80 whitespace-nowrap">
                    ⭐ no limit · 🔔 left 30/30
                  </div>
                </div>

                {/* Temporary Subscriber Text + 3D Golden Diamond Shield Emblem under SAVE YOUR COUNTRY (pops in with animation, then hides!) */}
                {activeSubscriberPopup && (
                  <div
                    key={`diamond-${activeSubscriberPopup.id}`}
                    data-testid="subscriber-diamond-badge"
                    className="animate-subscriber-diamond pointer-events-none absolute -bottom-11 right-0 left-0 flex flex-col items-center z-30"
                  >
                    <span className="text-[8.5px] font-extrabold text-amber-300 drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)] whitespace-nowrap">
                      {activeSubscriberPopup.authorName} just subscribed!
                    </span>
                    <div className="mt-0.5 w-6 h-6 rotate-45 rounded-sm bg-gradient-to-br from-amber-200 via-amber-400 to-yellow-700 border border-amber-100 shadow-[0_0_14px_rgba(251,191,36,0.9)] flex items-center justify-center">
                      <span className="-rotate-45 text-[11px]">🛡️</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 3. EDGE-TO-EDGE CIRCULAR ARENA (Covers Left & Right Space, Top Arc Tucked Under WHERE ARE YOU FROM?, Never Pushes Footer Out!) */}
            <div className="relative w-full flex-1 min-h-0 -my-3 flex items-center justify-center z-10">
              <div className="relative w-full max-h-full aspect-square flex items-center justify-center">
                <ArenaCanvas
                  paused={shellState !== 'playing' || showDailyFinale}
                  settings={settings}
                  matchNumber={matchNumber}
                  shieldedCodes={shieldedCodes}
                  onEliminationConfirmed={handleEliminationConfirmed}
                  onShieldConsumed={handleShieldConsumed}
                  onMatchWinnerConfirmed={handleMatchWinnerConfirmed}
                  onTelemetryUpdate={setTelemetry}
                  simRef={simRef}
                  persistedStateRef={persistedSimStateRef}
                />

                {/* COMEBACK · [COUNTRY] Glowing Cyan Pill inside upper arena (Exact match to video 00:10-00:11!) */}
                {comebackCountry && (
                  <div
                    data-testid="comeback-announcement-banner"
                    className="pointer-events-none absolute top-[19%] left-1/2 -translate-x-1/2 z-30 px-5 py-1.5 bg-[#072638]/95 border-2 border-[#00f5ff] rounded-xl shadow-[0_0_24px_rgba(0,245,255,0.75)] whitespace-nowrap"
                  >
                    <span className="font-display font-extrabold text-xl tracking-wide text-white uppercase drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
                      COMEBACK · {comebackCountry.name}
                    </span>
                  </div>
                )}

                {/* SHIELD SAVED · [COUNTRY] Glowing Emerald-Cyan Pill when a shield blocks elimination */}
                {shieldSavedCountry && !comebackCountry && (
                  <div
                    data-testid="shield-saved-announcement-banner"
                    className="pointer-events-none absolute top-[19%] left-1/2 -translate-x-1/2 z-30 px-4 py-1 bg-[#062925]/95 border-2 border-[#00f5d4] rounded-xl shadow-[0_0_22px_rgba(0,245,212,0.7)] whitespace-nowrap"
                  >
                    <span className="font-display font-extrabold text-lg tracking-wide text-white uppercase drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
                      🛡️ SHIELD SAVED · {shieldSavedCountry.name}
                    </span>
                  </div>
                )}

                {/* DOUBLE DRAW Gold-Bordered Box inside upper arena (Exact match to screenshot image_5e8759ce.png!) */}
                {telemetry.isDoubleDraw && !comebackCountry && !shieldSavedCountry && (
                  <div
                    data-testid="double-draw-announcement-banner"
                    className="pointer-events-none absolute top-[18%] left-1/2 -translate-x-1/2 z-25 px-5 py-1 bg-[#14172b]/95 border-2 border-[#facc15] rounded-xl shadow-[0_0_24px_rgba(250,204,21,0.55)] whitespace-nowrap"
                  >
                    <span className="font-display font-extrabold text-[19px] tracking-wide text-white uppercase drop-shadow-[0_2px_6px_rgba(0,0,0,0.95)]">
                      DOUBLE DRAW
                    </span>
                  </div>
                )}

                {/* RAPID FIRE Pill inside upper arena when active */}
                {rapidFireCount > 0 && !telemetry.isDoubleDraw && !comebackCountry && !shieldSavedCountry && (
                  <div className="pointer-events-none absolute top-[19%] left-1/2 -translate-x-1/2 z-20 px-4 py-1 bg-gradient-to-r from-red-600 to-orange-500 border border-amber-300 rounded-lg shadow-[0_0_18px_rgba(239,68,68,0.7)]">
                    <span className="font-display font-extrabold text-base tracking-wider text-white uppercase">
                      RAPID FIRE
                    </span>
                  </div>
                )}

                {/* Bottom-Left Elimination Card (Exact match to MALAYSIA / SERBIA / EL SALVADOR / SUDAN in screenshot & video!) */}
                {latestElimination && (
                  <div
                    data-testid="elimination-announcement-banner"
                    className="pointer-events-none absolute bottom-1 left-2 z-20 px-3 py-1.5 bg-[#121324]/95 border border-rose-500/75 rounded-xl shadow-[0_0_22px_rgba(244,63,94,0.4)] flex items-center gap-2.5 min-w-[200px]"
                  >
                    <CountryFlagBadge
                      country={
                        COUNTRIES_64.find((c) => c.code === latestElimination.countryCode) ||
                        COUNTRIES_64[0]
                      }
                      size={32}
                    />
                    <div className="leading-tight">
                      <div className="text-[8.5px] font-extrabold tracking-wider text-rose-400 uppercase">
                        ELIMINATED
                      </div>
                      <div className="font-display font-extrabold text-[18px] leading-none text-white uppercase">
                        {latestElimination.countryName}
                      </div>
                    </div>
                  </div>
                )}

                {/* Live Game Commentary Subtitle Pill */}
                {commentaryDiag.isSpeaking && commentaryDiag.activeText && !latestElimination && (
                  <div
                    data-testid="live-commentary-banner"
                    className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 z-20 px-3 py-1 bg-[#080e24]/95 border border-cyan-400/55 rounded-lg shadow-[0_0_14px_rgba(0,242,255,0.28)] flex items-center gap-1.5 max-w-[92%]"
                  >
                    <span className="inline-block w-2 h-2 rounded-full bg-cyan-400 animate-pulse shrink-0" />
                    <span className="text-[10px] font-bold tracking-wide text-cyan-100 uppercase truncate">
                      {commentaryDiag.activeText}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* 4. BOTTOM SECTION: ALL ELIMINATED · BORDERLESS 2-ROW FLAG STRIP · PROGRESS BAR · LIKE BAR (Guaranteed Inside 9:16 Frame!) */}
            <div className="relative z-20 shrink-0 space-y-0.5 px-0.5 pb-0.5 box-border">
              <div className="text-center font-display font-extrabold text-[14px] tracking-wide text-white uppercase leading-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
                ALL ELIMINATED
              </div>

              {/* Clean Borderless 2-Row Eliminated Flag Strip (16 per row, fits 32 flags cleanly inside 38px) */}
              <div
                data-testid="eliminated-flags-grid"
                className="h-[38px] px-0.5 flex flex-wrap items-center justify-start gap-[4px] overflow-hidden"
              >
                {eliminatedList.slice(0, 32).map((rec) => {
                  const c = COUNTRIES_64.find((x) => x.code === rec.countryCode);
                  if (!c) return null;
                  return <CountryFlagBadge key={rec.eventId} country={c} size={17} />;
                })}
              </div>

              {/* Thin Cyan-to-Lime Progress Bar + "29 / 64 ELIMINATED" */}
              <div className="space-y-0.5">
                <div className="w-full h-1.5 bg-slate-800/90 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#00f2ff] via-[#34d399] to-[#bef264] transition-all duration-300"
                    style={{ width: `${Math.round((telemetry.eliminatedCount / 64) * 100)}%` }}
                  />
                </div>
                <div
                  data-testid="eliminated-progress-label"
                  className="text-center text-[9.5px] leading-tight font-sans font-semibold text-slate-300 tabular-nums"
                >
                  {telemetry.eliminatedCount} / 64 ELIMINATED
                </div>
              </div>

              {/* Bottom Callout Box — Guaranteed never to leak or overflow out of the 9:16 stage */}
              <div
                data-testid="bottom-like-subscribe-bar"
                className="w-full box-border py-1 px-2 bg-[#0a0f22]/95 border border-slate-700/75 rounded-lg text-center text-[9.5px] font-extrabold tracking-wide text-slate-100 uppercase truncate shadow-md"
              >
                👍 LIKE AND SUBSCRIBE IF YOU SEE YOUR COUNTRY FLAG!
              </div>
            </div>

            {/* 5. END-OF-STREAM DAILY WINNER & FULL STANDINGS FINALE OVERLAY (Inside 9:16 Broadcast Stage!) */}
            {showDailyFinale && (
              <div
                data-testid="daily-finale-screen"
                className="absolute inset-0 z-40 bg-[#050816]/96 backdrop-blur-md flex flex-col justify-between p-3 text-slate-100 animate-fade-in"
              >
                {/* Top Finale Header */}
                <div className="text-center space-y-0.5 border-b border-amber-400/30 pb-2">
                  <div className="text-[9px] font-mono font-bold tracking-widest text-cyan-300 uppercase">
                    OFFICIAL END-OF-STREAM DAILY STANDINGS · {streamElapsedHours.toFixed(1)}H MARATHON
                  </div>
                  <h2 className="font-display font-extrabold text-2xl tracking-wide text-white uppercase leading-none">
                    LAST FLAG <span className="text-[#facc15]">STANDING</span>
                  </h2>
                  <p className="text-[10px] text-slate-300">
                    {totalMatchesToday} Matches Completed Today · 64 Nations Competed
                  </p>
                </div>

                {/* #1 Day's Overall Winner Card */}
                {dailyStandings[0] && (
                  <div className="relative p-3 bg-gradient-to-b from-[#1a1505]/95 via-[#0e1329]/95 to-[#090d20]/95 border-2 border-[#facc15] rounded-xl shadow-[0_0_35px_rgba(250,204,21,0.35)] text-center space-y-1.5">
                    <div className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-amber-400 text-slate-950 font-display font-extrabold text-[10px] uppercase tracking-wider rounded">
                      <span>👑 CHAMPION OF THE DAY · #1 OVERALL</span>
                    </div>
                    <div className="flex justify-center pt-0.5">
                      <CountryFlagBadge country={dailyStandings[0].country} size={60} shielded />
                    </div>
                    <div>
                      <div className="font-display font-extrabold text-2xl text-white uppercase leading-none">
                        {dailyStandings[0].country.name}
                      </div>
                      <div className="text-xs font-mono font-bold text-[#facc15] mt-0.5">
                        {dailyStandings[0].wins} MATCH VICTORIES TODAY (
                        {Math.round((dailyStandings[0].wins / Math.max(1, totalMatchesToday)) * 100)}% WIN SHARE)
                      </div>
                    </div>
                  </div>
                )}

                {/* #2 Silver & #3 Bronze Podium Row */}
                <div className="grid grid-cols-2 gap-2">
                  {dailyStandings.slice(1, 3).map((item, idx) => (
                    <div
                      key={item.country.code}
                      className="p-2 bg-[#0b122c]/95 border border-slate-700/80 rounded-lg flex items-center gap-2"
                    >
                      <div className="font-display font-extrabold text-lg text-slate-300 w-5 text-center">
                        #{idx + 2}
                      </div>
                      <CountryFlagBadge country={item.country} size={32} />
                      <div className="min-w-0 flex-1">
                        <div className="font-display font-bold text-sm text-white uppercase truncate leading-tight">
                          {item.country.name}
                        </div>
                        <div className="font-mono text-[11px] font-bold text-cyan-300">
                          {item.wins} WINS
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Ranks #4 – #11 Full Daily Leaderboard */}
                <div className="flex-1 min-h-0 bg-[#080d20]/90 border border-slate-800 rounded-xl p-2 flex flex-col justify-between overflow-hidden my-1">
                  <div className="flex items-center justify-between text-[9px] font-mono font-bold text-slate-400 uppercase border-b border-slate-800 pb-1">
                    <span>TODAY&apos;S FULL STANDINGS LEADERBOARD</span>
                    <span>DAILY WINS</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 py-1 overflow-y-auto">
                    {dailyStandings.slice(3, 11).map((item, idx) => (
                      <div
                        key={item.country.code}
                        className="flex items-center justify-between px-2 py-1 bg-slate-900/85 border border-slate-800/80 rounded text-[10px]"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-mono text-[9px] text-slate-400 w-4">#{idx + 4}</span>
                          <CountryFlagBadge country={item.country} size={16} />
                          <span className="font-bold text-white truncate uppercase">
                            {item.country.name}
                          </span>
                        </div>
                        <span className="font-mono font-bold text-amber-300 shrink-0 ml-1">
                          {item.wins}W
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Bottom Finale Actions */}
                <div className="flex gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={() => setShowDailyFinale(false)}
                    className="flex-1 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-display font-extrabold text-xs uppercase tracking-wider rounded-lg"
                  >
                    Resume Broadcast [E]
                  </button>
                  <button
                    type="button"
                    onClick={handleResetSessionStandings}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-[10px] uppercase rounded-lg"
                  >
                    Start New Day
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* =====================================================================
           COMPOSITION 2: HORIZONTAL 16:9 TELEVISION BROADCAST (1920×1080)
           ===================================================================== */
        <div
          data-testid="horizontal-broadcast-stage"
          className="relative w-full h-full grid grid-cols-12 gap-5 p-5 items-stretch"
        >
          {/* Left Column (3 cols) */}
          <div className="col-span-3 flex flex-col justify-between gap-4 z-10">
            <div className="p-4 bg-[#080d22]/90 border border-slate-800 rounded-xl space-y-1">
              <div className="text-xs font-mono font-bold text-cyan-400 uppercase tracking-widest">
                CYCLE {matchNumber} · LIVE
              </div>
              <h1 className="font-display font-extrabold text-3xl tracking-tight text-white uppercase leading-none">
                {isFlagsWarTitle ? (
                  <>
                    FLAGS WAR <span className="text-[#facc15]">ARENA</span>
                  </>
                ) : (
                  <>
                    LAST FLAG <span className="text-[#facc15]">STANDING</span>
                  </>
                )}
              </h1>
              <p className="text-xs text-slate-400">COMMENT WHERE ARE YOU FROM?</p>
            </div>

            <div className="flex-1 p-4 bg-[#080d22]/90 border border-slate-800 rounded-xl flex flex-col justify-between min-h-0">
              <div>
                <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                  <h2 className="font-display font-bold text-lg text-[#facc15] uppercase tracking-wide">
                    CHAT SUPPORT
                  </h2>
                  <span className="text-xs font-mono text-cyan-300">!support [Country]</span>
                </div>

                <div className="space-y-2.5">
                  {supportLeaderboard.slice(0, 5).map((item, idx) => {
                    const c = COUNTRIES_64.find((x) => x.code === item.countryCode);
                    if (!c) return null;
                    const pct = Math.min(
                      100,
                      Math.round(
                        ((item.supportCount % settings.supportShieldThreshold) /
                          settings.supportShieldThreshold) *
                          100
                      )
                    );
                    return (
                      <div key={item.countryCode} className="flex items-center gap-2.5">
                        <span className="font-mono text-xs text-slate-400 w-4">{idx + 1}</span>
                        <CountryFlagBadge country={c} size={22} shielded={item.hasShield} />
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between text-xs font-bold">
                            <span className="text-white truncate">{c.name}</span>
                            <span className="font-mono text-amber-300 tabular-nums">
                              {item.supportCount} 💬
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden mt-1">
                            <div
                              className="h-full bg-gradient-to-r from-cyan-400 to-emerald-400"
                              style={{ width: `${item.hasShield ? 100 : pct}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 space-y-1 text-xs text-slate-300">
                <div className="font-bold text-emerald-300 uppercase">SAVE YOUR COUNTRY</div>
                <div className="flex justify-between">
                  <span>💬 {settings.supportShieldThreshold} chats</span>
                  <span className="font-mono text-cyan-300 font-bold">🛡️ SHIELD</span>
                </div>
                <div className="flex justify-between">
                  <span>💬 &gt;50 chats</span>
                  <span className="font-mono text-rose-400 font-bold">❤️ WILD CARD</span>
                </div>
                <div className="flex justify-between">
                  <span>⭐ Super Chat / 🔔 Subscribe</span>
                  <span className="font-mono text-amber-300 font-bold">FREE POWER</span>
                </div>
              </div>
            </div>
          </div>

          {/* Center Column (6 cols): Large Circular Arena */}
          <div className="col-span-6 relative flex flex-col items-center justify-center min-h-0">
            <div className="relative w-full h-full flex items-center justify-center">
              <ArenaCanvas
                paused={shellState !== 'playing'}
                settings={settings}
                matchNumber={matchNumber}
                shieldedCodes={shieldedCodes}
                onEliminationConfirmed={handleEliminationConfirmed}
                onShieldConsumed={handleShieldConsumed}
                onMatchWinnerConfirmed={handleMatchWinnerConfirmed}
                onTelemetryUpdate={setTelemetry}
                simRef={simRef}
                persistedStateRef={persistedSimStateRef}
              />

              {latestElimination && (
                <div
                  data-testid="elimination-announcement-banner"
                  className="pointer-events-none absolute bottom-4 left-4 z-20 px-4 py-2 bg-[#190d24]/95 border border-rose-500/80 rounded-xl shadow-2xl flex items-center gap-3"
                >
                  <CountryFlagBadge
                    country={
                      COUNTRIES_64.find((c) => c.code === latestElimination.countryCode) ||
                      COUNTRIES_64[0]
                    }
                    size={36}
                  />
                  <div>
                    <div className="text-[10px] font-bold tracking-widest text-slate-300 uppercase">
                      ELIMINATED
                    </div>
                    <div className="font-display font-extrabold text-2xl leading-none text-white uppercase">
                      {latestElimination.countryName}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column (3 cols): Counters, Session Standings & Eliminated Flags */}
          <div className="col-span-3 flex flex-col justify-between gap-4 z-10">
            <div className="flex items-center gap-2.5">
              <div className="flex-1 p-3 bg-[#080d22]/90 border border-slate-800 rounded-xl text-center">
                <div className="text-[10px] font-bold text-slate-400 uppercase">COUNTRIES</div>
                <div
                  data-testid="total-countries-count"
                  className="font-display font-extrabold text-3xl text-white tabular-nums"
                >
                  64
                </div>
              </div>
              <div className="flex-1 p-3 bg-[#080d22]/90 border border-slate-800 rounded-xl text-center">
                <div className="text-[10px] font-bold text-slate-400 uppercase">REMAINING</div>
                <div
                  data-testid="remaining-countries-count"
                  className="font-display font-extrabold text-3xl text-[#facc15] tabular-nums"
                >
                  {telemetry.remainingCount}
                </div>
              </div>
              <div
                data-testid="hazard-countdown-ring"
                className="w-14 h-14 bg-[#080d22]/90 border border-slate-800 rounded-xl flex items-center justify-center font-display font-extrabold text-2xl tabular-nums"
              >
                <span className={telemetry.isHatchOpen ? 'text-[#ff1f8e]' : 'text-[#facc15]'}>
                  {countdownDisplay}
                </span>
              </div>
            </div>

            <div className="p-4 bg-[#080d22]/90 border border-slate-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                <h2 className="font-display font-bold text-base text-cyan-300 uppercase tracking-wide">
                  SESSION STANDINGS
                </h2>
                <span className="text-[10px] font-mono text-slate-400">WINS</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {topChampions.map(({ country, wins }) => (
                  <div
                    key={country.code}
                    className="flex items-center justify-between p-1.5 bg-slate-900/80 border border-slate-800 rounded-lg text-xs"
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <CountryFlagBadge country={country} size={18} />
                      <span className="font-semibold text-white truncate">{country.abbr}</span>
                    </div>
                    <span className="font-mono font-bold text-amber-300 tabular-nums">{wins}W</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex-1 p-4 bg-[#080d22]/90 border border-slate-800 rounded-xl flex flex-col justify-between min-h-0">
              <div>
                <h2 className="font-display font-bold text-base text-white uppercase border-b border-slate-800 pb-1.5 mb-2.5">
                  ALL ELIMINATED
                </h2>
                <div
                  data-testid="eliminated-flags-grid"
                  className="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto"
                >
                  {eliminatedList.map((rec) => {
                    const c = COUNTRIES_64.find((x) => x.code === rec.countryCode);
                    if (!c) return null;
                    return <CountryFlagBadge key={rec.eventId} country={c} size={20} />;
                  })}
                </div>
              </div>

              <div className="pt-2 space-y-1">
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-400 to-emerald-400"
                    style={{ width: `${Math.round((telemetry.eliminatedCount / 64) * 100)}%` }}
                  />
                </div>
                <div
                  data-testid="eliminated-progress-label"
                  className="text-center text-xs font-sans font-semibold text-slate-300 tabular-nums"
                >
                  {telemetry.eliminatedCount} / 64 ELIMINATED
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          PAUSE MODAL (`document.body.dataset.state = 'paused'`)
         ===================================================================== */}
      {shellState === 'paused' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Broadcast Paused"
          className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/75 pointer-events-auto"
        >
          <div className="w-full max-w-md p-6 bg-[#080e24] border border-cyan-500/50 rounded-xl shadow-2xl text-center space-y-5">
            <h2 className="font-display font-extrabold text-3xl text-white uppercase tracking-wide">
              Broadcast Simulation Paused
            </h2>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2.5 bg-[#0d1636] rounded-lg">
                <div className="text-[10px] text-slate-400 uppercase">Cycle</div>
                <div className="font-display font-bold text-2xl text-cyan-300 tabular-nums">
                  #{matchNumber}
                </div>
              </div>
              <div className="p-2.5 bg-[#0d1636] rounded-lg">
                <div className="text-[10px] text-slate-400 uppercase">Surviving</div>
                <div className="font-display font-bold text-2xl text-amber-400 tabular-nums">
                  {telemetry.remainingCount}
                </div>
              </div>
              <div className="p-2.5 bg-[#0d1636] rounded-lg">
                <div className="text-[10px] text-slate-400 uppercase">Eliminated</div>
                <div className="font-display font-bold text-2xl text-rose-400 tabular-nums">
                  {telemetry.eliminatedCount}
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => setShellState('playing')}
                className="w-full py-2.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold text-sm uppercase rounded-lg"
              >
                Resume Match [P]
              </button>
              <button
                type="button"
                onClick={() => handleRestartMatch(false)}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-sm uppercase rounded-lg"
              >
                Restart 64-Country Match
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          WINNER REVEAL MODAL (`document.body.dataset.state = 'gameover'`)
         ===================================================================== */}
      {shellState === 'gameover' && activeWinner && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Match Champion Reveal"
          className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/80 pointer-events-auto"
        >
          <div className="w-full max-w-md p-6 bg-[#080e26] border-2 border-amber-400 rounded-2xl shadow-[0_0_70px_rgba(245,158,11,0.45)] text-center space-y-5">
            <div className="text-xs font-mono font-bold text-amber-300 uppercase tracking-widest">
              CYCLE {matchNumber} CHAMPION CONFIRMED
            </div>

            <div className="flex justify-center">
              <CountryFlagBadge country={activeWinner} size={96} shielded />
            </div>

            <div>
              <h2 className="font-display font-extrabold text-4xl text-white uppercase tracking-wide">
                {activeWinner.name} WINS!
              </h2>
              <p className="text-xs text-slate-300 mt-1">
                Outlasted all 63 rival nations inside Last Flag Standing
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2.5 bg-[#0d1636] rounded-lg">
                <div className="text-[10px] text-slate-400 uppercase">Today&apos;s Wins</div>
                <div className="font-display font-bold text-2xl text-amber-400 tabular-nums">
                  {winsByCountry[activeWinner.code] || 1}
                </div>
              </div>
              <div className="p-2.5 bg-[#0d1636] rounded-lg">
                <div className="text-[10px] text-slate-400 uppercase">Defeated</div>
                <div className="font-display font-bold text-2xl text-cyan-300 tabular-nums">63</div>
              </div>
              <div className="p-2.5 bg-[#0d1636] rounded-lg">
                <div className="text-[10px] text-slate-400 uppercase">Next Match</div>
                <div className="font-display font-bold text-2xl text-emerald-400 tabular-nums">
                  {nextMatchCountdown !== null ? `${nextMatchCountdown}s` : 'Ready'}
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                data-start="true"
                onClick={() => handleRestartMatch(true)}
                className="flex-1 py-3 bg-amber-400 hover:bg-amber-300 text-slate-950 font-display font-extrabold text-base uppercase tracking-wider rounded-lg"
              >
                Next Match (Cycle #{matchNumber + 1})
              </button>
              <button
                type="button"
                onClick={() => {
                  setShellState('playing');
                  handleTriggerDailyFinale();
                }}
                className="px-3 py-3 bg-slate-800 hover:bg-slate-700 border border-amber-400/50 text-amber-300 font-display font-bold text-xs uppercase rounded-lg"
              >
                🏆 Day&apos;s Standings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Operator Console & Admin Settings Modal */}
      <OperatorConsoleModal
        open={operatorModalOpen}
        onClose={() => setOperatorModalOpen(false)}
        operatingMode={operatingMode}
        onChangeOperatingMode={setOperatingMode}
        broadcastFormat={broadcastFormat}
        onChangeBroadcastFormat={setBroadcastFormat}
        cleanBroadcastMode={cleanBroadcastMode}
        onToggleCleanBroadcastMode={() => setCleanBroadcastMode((prev) => !prev)}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        audioConfig={audioConfig}
        onUpdateAudioConfig={(p) => soundEngine.updateConfig(p)}
        commentaryDiag={commentaryDiag}
        ytStatus={ytStatus}
        onConnectYouTubeOAuth={handleConnectYouTubeOAuth}
        onConnectYouTubeLiveUrl={handleConnectYouTubeLiveUrl}
        onDisconnectYouTube={handleDisconnectYouTube}
        onRefreshBroadcasts={handleRefreshBroadcasts}
        onSelectBroadcast={handleSelectBroadcast}
        onToggleChatIngestion={handleToggleChatIngestion}
        onPollSubscribersNow={handlePollSubscribersNow}
        onTriggerDemoEvent={handleTriggerDemoEvent}
        onTestVoice={handleTestVoice}
        onForceHatchOpen={(doubleDraw) => simRef.current?.forceHatchOpen(doubleDraw)}
        onTriggerDailyFinale={handleTriggerDailyFinale}
        onRestartMatch={() => handleRestartMatch(false)}
        onResetSessionStandings={handleResetSessionStandings}
        cloudSpec={cloudSpec}
        onRunCloudPreflight={handleRunCloudPreflight}
        eventLog={eventLog}
      />
    </main>
  );
}

export default App;
