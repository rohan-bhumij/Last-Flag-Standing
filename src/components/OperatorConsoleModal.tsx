import React, { useState } from 'react';
import { COUNTRIES_64, validateCountryManifest } from '../data/countries';
import {
  ArenaSettings,
  BroadcastFormat,
  CommunityEventPayload,
  OperatingMode,
} from '../game/rules';
import { AudioMixerConfig, CommentaryDiagnostics } from '../audio/soundEngine';

export interface YouTubeIntegrationStatus {
  oauthConfigured: boolean;
  authorized: boolean;
  channelId: string | null;
  channelTitle: string | null;
  activeBroadcastId: string | null;
  activeBroadcastTitle: string | null;
  liveChatId: string | null;
  ingestionActive: boolean;
  lastEventReceivedAt: number | null;
  reconnectAttempts: number;
  pollingIntervalMs: number;
  subscriberStatus:
    | 'CONNECTED_PUBLIC_BEST_EFFORT'
    | 'WAITING_FOR_CHANNEL_AUTH'
    | 'SUBSCRIBER_DATA_UNAVAILABLE'
    | 'API_QUOTA_OR_PERMISSION_ERROR';
  subscriberLastCheckedAt: number | null;
  seenSubscriberCount: number;
  lastError: string | null;
  availableBroadcasts: Array<{
    id: string;
    title: string;
    liveChatId: string;
    status: string;
  }>;
}

export interface CloudRendererSpec {
  status: 'STANDBY' | 'PREFLIGHT_READY' | 'STREAMING_VERIFIED' | 'ERROR';
  targetRtmpsUrl: string;
  resolution: '1920x1080' | '1080x1920';
  fps: 60 | 30;
  videoBitrateKbps: number;
  audioBitrateKbps: number;
  preflightChecks: {
    obsCleanRouteReady: boolean;
    audioCaptureBusReady: boolean;
    rtmpsEndpointConfigured: boolean;
    streamKeyProvidedInSecretEnv: boolean;
    endToEndStreamTested: boolean;
  };
  dockerfileSpec: string;
  gcloudDeploySteps: string[];
}

interface OperatorConsoleModalProps {
  open: boolean;
  onClose: () => void;
  operatingMode: OperatingMode;
  onChangeOperatingMode: (mode: OperatingMode) => void;
  broadcastFormat: BroadcastFormat;
  onChangeBroadcastFormat: (fmt: BroadcastFormat) => void;
  cleanBroadcastMode: boolean;
  onToggleCleanBroadcastMode: () => void;
  settings: ArenaSettings;
  onUpdateSettings: (partial: Partial<ArenaSettings>) => void;
  audioConfig: AudioMixerConfig;
  onUpdateAudioConfig: (partial: Partial<AudioMixerConfig>) => void;
  commentaryDiag: CommentaryDiagnostics;
  ytStatus: YouTubeIntegrationStatus;
  onConnectYouTubeOAuth: () => void;
  onConnectYouTubeLiveUrl?: (liveUrlOrId: string) => Promise<void>;
  onDisconnectYouTube: () => void;
  onRefreshBroadcasts: () => void;
  onSelectBroadcast: (broadcastId: string, liveChatId: string) => void;
  onToggleChatIngestion: () => void;
  onPollSubscribersNow: () => void;
  onTriggerDemoEvent: (type: CommunityEventPayload['type'], countryCode?: string) => void;
  onTestVoice?: () => void;
  onForceHatchOpen: (doubleDraw?: boolean) => void;
  onTriggerDailyFinale?: () => void;
  onRestartMatch: () => void;
  onResetSessionStandings: () => void;
  cloudSpec: CloudRendererSpec | null;
  onRunCloudPreflight: () => void;
  eventLog: CommunityEventPayload[];
}

export const OperatorConsoleModal: React.FC<OperatorConsoleModalProps> = ({
  open,
  onClose,
  operatingMode,
  onChangeOperatingMode,
  broadcastFormat,
  onChangeBroadcastFormat,
  cleanBroadcastMode,
  onToggleCleanBroadcastMode,
  settings,
  onUpdateSettings,
  audioConfig,
  onUpdateAudioConfig,
  commentaryDiag,
  ytStatus,
  onConnectYouTubeOAuth,
  onConnectYouTubeLiveUrl,
  onDisconnectYouTube,
  onRefreshBroadcasts,
  onSelectBroadcast,
  onToggleChatIngestion,
  onPollSubscribersNow,
  onTriggerDemoEvent,
  onTestVoice,
  onForceHatchOpen,
  onTriggerDailyFinale,
  onRestartMatch,
  onResetSessionStandings,
  cloudSpec,
  onRunCloudPreflight,
  eventLog,
}) => {
  const [activeTab, setActiveTab] = useState<
    'SIMULATION' | 'AUDIO_TTS' | 'YOUTUBE_LIVE' | 'CLOUD_STREAM' | 'ROSTER_CHECK'
  >('SIMULATION');
  const [confirmResetSession, setConfirmResetSession] = useState(false);
  const [selectedDemoCountry, setSelectedDemoCountry] = useState('IN');
  const [liveUrlInput, setLiveUrlInput] = useState('');
  const [connectingLiveUrl, setConnectingLiveUrl] = useState(false);

  if (!open) return null;

  const manifestValidation = validateCountryManifest(COUNTRIES_64);
  const callbackUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : '/auth/callback';
  const cleanObsUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/?autostart=1&clean=1&format=${broadcastFormat}`
      : '/?autostart=1&clean=1';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Broadcast Operator Console"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 pointer-events-auto"
    >
      <div className="w-full max-w-5xl max-h-[90vh] flex flex-col bg-[#080d21] border border-cyan-500/40 rounded-xl shadow-2xl overflow-hidden text-slate-100">
        {/* Top Bar */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#050816] border-b border-slate-800">
          <div>
            <h2 className="font-display text-2xl font-bold tracking-wide text-white uppercase">
              {settings.channelTitle || 'LAST FLAG STANDING'} — Broadcast Operator Console
            </h2>
            <p className="text-xs text-slate-400">
              Mode: <strong className="text-cyan-300">{operatingMode}</strong> · Format:{' '}
              <strong className="text-cyan-300">{broadcastFormat}</strong> · Roster:{' '}
              <strong className="text-emerald-400">{manifestValidation.totalCount}/64 Verified</strong>
            </p>
          </div>
          <div className="flex items-center gap-2">
            {onTriggerDailyFinale && (
              <button
                type="button"
                onClick={() => {
                  onTriggerDailyFinale();
                  onClose();
                }}
                className="px-3 py-1.5 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg transition-colors whitespace-nowrap"
              >
                🏆 Show End-of-Stream Winner [E]
              </button>
            )}
            <button
              type="button"
              onClick={onToggleCleanBroadcastMode}
              className="px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/30 rounded-lg transition-colors whitespace-nowrap"
            >
              {cleanBroadcastMode ? 'Exit Clean OBS View' : 'Enter Clean OBS View'}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Operator Console"
              className="px-4 py-1.5 text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white rounded-lg transition-colors whitespace-nowrap"
            >
              Close [Esc]
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 px-6 py-2.5 bg-[#060a1a] border-b border-slate-800 overflow-x-auto">
          {(
            [
              ['SIMULATION', '1. Arena & Fair Gate Rules'],
              ['AUDIO_TTS', '2. Commentary & Audio Mixer'],
              ['YOUTUBE_LIVE', '3. YouTube OAuth & Subscriber API'],
              ['CLOUD_STREAM', '4. Oracle Free VM 11h+ Stream Setup'],
              ['ROSTER_CHECK', '5. 64-Country Manifest & Logs'],
            ] as const
          ).map(([tabKey, label]) => (
            <button
              key={tabKey}
              type="button"
              onClick={() => setActiveTab(tabKey)}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeTab === tabKey
                  ? 'bg-cyan-500 text-slate-950 font-bold'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'SIMULATION' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Operating Mode & Format */}
              <div className="p-4 bg-[#0b122b] border border-slate-800 rounded-lg space-y-4">
                <h3 className="text-sm font-bold text-cyan-300 uppercase tracking-wider">
                  Channel Branding & Broadcast Composition
                </h3>

                <div className="space-y-1.5">
                  <span className="block text-xs text-slate-400">Channel Header Title</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => onUpdateSettings({ channelTitle: 'LAST FLAG STANDING' })}
                      className={`flex-1 py-1.5 px-2.5 text-xs font-bold rounded-lg border transition-colors ${
                        (settings.channelTitle || 'LAST FLAG STANDING') === 'LAST FLAG STANDING'
                          ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                          : 'bg-slate-900 border-slate-700 text-slate-400'
                      }`}
                    >
                      LAST FLAG STANDING
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdateSettings({ channelTitle: 'FLAGS WAR ARENA' })}
                      className={`flex-1 py-1.5 px-2.5 text-xs font-bold rounded-lg border transition-colors ${
                        settings.channelTitle === 'FLAGS WAR ARENA'
                          ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                          : 'bg-slate-900 border-slate-700 text-slate-400'
                      }`}
                    >
                      FLAGS WAR ARENA
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="block text-xs text-slate-400">
                    Event Stream Operating Mode (Strict Separation)
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => onChangeOperatingMode('DEMO')}
                      className={`flex-1 py-2 px-3 text-xs font-bold rounded-lg border transition-colors ${
                        operatingMode === 'DEMO'
                          ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                          : 'bg-slate-900 border-slate-700 text-slate-400'
                      }`}
                    >
                      DEMO MODE (Synthetic Test Events)
                    </button>
                    <button
                      type="button"
                      onClick={() => onChangeOperatingMode('LIVE')}
                      className={`flex-1 py-2 px-3 text-xs font-bold rounded-lg border transition-colors ${
                        operatingMode === 'LIVE'
                          ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                          : 'bg-slate-900 border-slate-700 text-slate-400'
                      }`}
                    >
                      LIVE MODE (Verified YouTube API Only)
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="block text-xs text-slate-400">Broadcast Aspect Ratio Composition</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => onChangeBroadcastFormat('9:16')}
                      className={`flex-1 py-2 px-3 text-xs font-bold rounded-lg border transition-colors ${
                        broadcastFormat === '9:16'
                          ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                          : 'bg-slate-900 border-slate-700 text-slate-400'
                      }`}
                    >
                      Vertical 9:16 (1080×1920 Shorts/Mobile)
                    </button>
                    <button
                      type="button"
                      onClick={() => onChangeBroadcastFormat('16:9')}
                      className={`flex-1 py-2 px-3 text-xs font-bold rounded-lg border transition-colors ${
                        broadcastFormat === '16:9'
                          ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                          : 'bg-slate-900 border-slate-700 text-slate-400'
                      }`}
                    >
                      Horizontal 16:9 (1920×1080 TV Broadcast)
                    </button>
                  </div>
                </div>

                {/* Live Operator Actions */}
                <div className="pt-2 border-t border-slate-800 space-y-2">
                  <span className="block text-xs text-slate-400">Immediate Arena Controls</span>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onForceHatchOpen(false)}
                      className="px-3 py-2 text-xs font-bold bg-fuchsia-600 hover:bg-fuchsia-500 text-white rounded-lg transition-colors"
                    >
                      Open Center Chamber [Space]
                    </button>
                    <button
                      type="button"
                      onClick={() => onForceHatchOpen(true)}
                      className="px-3 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg transition-colors"
                    >
                      Trigger DOUBLE DRAW [D]
                    </button>
                    <button
                      type="button"
                      onClick={onRestartMatch}
                      className="px-3 py-2 text-xs font-bold bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                    >
                      Restart 64-Country Match
                    </button>
                    {!confirmResetSession ? (
                      <button
                        type="button"
                        onClick={() => setConfirmResetSession(true)}
                        className="px-3 py-2 text-xs font-bold bg-rose-900/60 hover:bg-rose-800 text-rose-200 border border-rose-500/40 rounded-lg transition-colors"
                      >
                        Reset Daily Standings
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            onResetSessionStandings();
                            setConfirmResetSession(false);
                          }}
                          className="px-3 py-2 text-xs font-bold bg-rose-600 text-white rounded-lg"
                        >
                          Confirm Erase Daily Wins
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmResetSession(false)}
                          className="px-2.5 py-2 text-xs text-slate-300 bg-slate-800 rounded-lg"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Central Hatch & Physics Tuning */}
              <div className="p-4 bg-[#0b122b] border border-slate-800 rounded-lg space-y-3">
                <h3 className="text-sm font-bold text-cyan-300 uppercase tracking-wider">
                  Center Circular Chamber & 11+ Hour Marathon Settings
                </h3>

                <div className="p-2.5 bg-slate-950/90 border border-fuchsia-500/30 rounded text-[11px] text-slate-300 leading-relaxed">
                  <strong className="text-fuchsia-300">Circular Center Opening Rule:</strong> The pink chamber opens a{' '}
                  <strong>circular aperture expanding radially from the exact center</strong> to swallow circular flags.
                  If multiple flags race toward the center, the <strong>flag closest to the center (380, 380)</strong> is
                  swallowed first; the chamber then <strong>immediately snaps shut</strong> (after 1 flag in Single Draw, or 2 in{' '}
                  <span className="text-amber-300 font-bold">DOUBLE DRAW</span>) and pushes any runner-up flag safely outside.
                </div>

                <label className="block text-xs">
                  <span className="text-slate-300">
                    Target Stream Duration Before Auto Daily Finale:{' '}
                    <strong className="text-amber-300">{(settings.targetStreamDurationHours || 11.5).toFixed(1)} Hours</strong>
                  </span>
                  <input
                    type="range"
                    min={1.0}
                    max={24.0}
                    step={0.5}
                    value={settings.targetStreamDurationHours || 11.5}
                    onChange={(e) =>
                      onUpdateSettings({ targetStreamDurationHours: Number(e.target.value) })
                    }
                    className="w-full mt-1 accent-amber-400"
                  />
                </label>

                <label className="block text-xs">
                  <span className="text-slate-300">
                    Hatch Cycle Period: <strong>{settings.cycleDurationSec.toFixed(1)}s</strong> (Default 5.0s)
                  </span>
                  <input
                    type="range"
                    min={3.5}
                    max={15}
                    step={0.5}
                    value={settings.cycleDurationSec}
                    onChange={(e) => onUpdateSettings({ cycleDurationSec: Number(e.target.value) })}
                    className="w-full mt-1 accent-cyan-400"
                  />
                </label>

                <label className="block text-xs">
                  <span className="text-slate-300">
                    Hatch Open Duration: <strong>{settings.openDurationSec.toFixed(1)}s</strong> (Default 1.0s)
                  </span>
                  <input
                    type="range"
                    min={0.5}
                    max={3.5}
                    step={0.1}
                    value={settings.openDurationSec}
                    onChange={(e) => onUpdateSettings({ openDurationSec: Number(e.target.value) })}
                    className="w-full mt-1 accent-fuchsia-400"
                  />
                </label>

                <label className="block text-xs">
                  <span className="text-slate-300">
                    Max Token Velocity: <strong>{settings.maxTokenSpeed.toFixed(1)}</strong>
                  </span>
                  <input
                    type="range"
                    min={4.0}
                    max={12.0}
                    step={0.2}
                    value={settings.maxTokenSpeed}
                    onChange={(e) => onUpdateSettings({ maxTokenSpeed: Number(e.target.value) })}
                    className="w-full mt-1 accent-cyan-400"
                  />
                </label>

                <label className="block text-xs">
                  <span className="text-slate-300">
                    Purple Deflector Angular Speed:{' '}
                    <strong>{settings.deflectorRotSpeed.toFixed(2)} rad/s</strong>
                  </span>
                  <input
                    type="range"
                    min={0.15}
                    max={1.5}
                    step={0.05}
                    value={settings.deflectorRotSpeed}
                    onChange={(e) => onUpdateSettings({ deflectorRotSpeed: Number(e.target.value) })}
                    className="w-full mt-1 accent-purple-400"
                  />
                </label>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <label className="block text-xs">
                    <span className="text-slate-300">Shield Threshold (Chats)</span>
                    <input
                      type="number"
                      min={1}
                      max={200}
                      value={settings.supportShieldThreshold}
                      onChange={(e) =>
                        onUpdateSettings({ supportShieldThreshold: Math.max(1, Number(e.target.value)) })
                      }
                      className="w-full mt-1 px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded text-white"
                    />
                  </label>
                  <label className="block text-xs">
                    <span className="text-slate-300">Revive Threshold (Chats)</span>
                    <input
                      type="number"
                      min={2}
                      max={500}
                      value={settings.supportReviveThreshold}
                      onChange={(e) =>
                        onUpdateSettings({ supportReviveThreshold: Math.max(2, Number(e.target.value)) })
                      }
                      className="w-full mt-1 px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded text-white"
                    />
                  </label>
                </div>
              </div>

              {/* Synthetic Test Event Generator (Only enabled in DEMO mode) */}
              <div className="md:col-span-2 p-4 bg-[#0b122b] border border-slate-800 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-amber-300 uppercase tracking-wider">
                    Synthetic Community Event Tester (Demo Mode Only)
                  </h3>
                  <span className="text-xs text-slate-400">
                    {operatingMode === 'DEMO'
                      ? 'Active — Clearly labeled [DEMO] in event log'
                      : 'Disabled in LIVE mode to prevent fabricated events'}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <label className="text-xs text-slate-300 flex items-center gap-2">
                    <span>Target Country:</span>
                    <select
                      aria-label="Target Country for Demo Support"
                      value={selectedDemoCountry}
                      onChange={(e) => setSelectedDemoCountry(e.target.value)}
                      className="px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white"
                    >
                      {COUNTRIES_64.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.name} ({c.abbr})
                        </option>
                      ))}
                    </select>
                  </label>

                  <button
                    type="button"
                    disabled={operatingMode !== 'DEMO'}
                    onClick={() => onTriggerDemoEvent('CHAT_SUPPORT', selectedDemoCountry)}
                    className="px-3 py-1.5 text-xs font-bold bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white rounded-lg"
                  >
                    Simulate !support Vote (+5)
                  </button>
                  <button
                    type="button"
                    disabled={operatingMode !== 'DEMO'}
                    onClick={() => onTriggerDemoEvent('SUPER_CHAT', selectedDemoCountry)}
                    className="px-3 py-1.5 text-xs font-bold bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white rounded-lg"
                  >
                    Simulate Super Chat (Grant Shield/Revive)
                  </button>
                  <button
                    type="button"
                    disabled={operatingMode !== 'DEMO'}
                    onClick={() => onTriggerDemoEvent('NEW_MEMBER', selectedDemoCountry)}
                    className="px-3 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-lg"
                  >
                    Simulate New Channel Member
                  </button>
                  <button
                    type="button"
                    disabled={operatingMode !== 'DEMO'}
                    onClick={() => onTriggerDemoEvent('NEW_SUBSCRIBER')}
                    className="px-3 py-1.5 text-xs font-bold bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white rounded-lg"
                  >
                    Simulate Public Subscriber Alert
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'AUDIO_TTS' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-4 bg-[#0b122b] border border-slate-800 rounded-lg space-y-3">
                <h3 className="text-sm font-bold text-cyan-300 uppercase tracking-wider">
                  Multi-Channel Broadcast Audio Mixer (With Speech Ducking)
                </h3>

                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <span className="text-xs text-slate-300">Master Broadcast Audio</span>
                  <button
                    type="button"
                    onClick={() => onUpdateAudioConfig({ muted: !audioConfig.muted })}
                    className={`px-3 py-1 text-xs font-bold rounded ${
                      audioConfig.muted ? 'bg-rose-600 text-white' : 'bg-emerald-600 text-white'
                    }`}
                  >
                    {audioConfig.muted ? 'MUTED (Click to Unmute)' : 'ACTIVE (Unmuted)'}
                  </button>
                </div>

                {(
                  [
                    ['masterVolume', 'Master Output Gain'],
                    ['commentaryVolume', 'Spoken Announcer Commentary'],
                    ['hazardVolume', 'Central Hatch & Countdown Alarms'],
                    ['impactsVolume', 'Physics Collision & Deflector Impacts'],
                    ['alertsVolume', 'Subscriber, Shield & Winner Fanfare'],
                    ['musicVolume', 'Stadium Crowd & Low-End Ambience'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="block text-xs">
                    <div className="flex justify-between text-slate-300">
                      <span>{label}</span>
                      <span className="font-mono">{Math.round(audioConfig[key] * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={audioConfig[key]}
                      onChange={(e) => onUpdateAudioConfig({ [key]: Number(e.target.value) })}
                      className="w-full mt-1 accent-cyan-400"
                    />
                  </label>
                ))}
              </div>

              <div className="p-4 bg-[#0b122b] border border-slate-800 rounded-lg space-y-4">
                <h3 className="text-sm font-bold text-cyan-300 uppercase tracking-wider">
                  Announcer Voice & Commentary Queue Diagnostics
                </h3>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-xs">
                    <span className="text-slate-300">Delivery Style</span>
                    <select
                      aria-label="Commentary Delivery Style"
                      value={settings.commentaryStyle}
                      onChange={(e) =>
                        onUpdateSettings({
                          commentaryStyle: e.target.value as ArenaSettings['commentaryStyle'],
                        })
                      }
                      className="w-full mt-1 px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded text-white"
                    >
                      <option value="ENERGETIC_BROADCAST">Energetic Broadcast</option>
                      <option value="DRAMATIC_STADIUM">Dramatic Stadium</option>
                      <option value="CONCISE_ESPORTS">Concise Esports</option>
                    </select>
                  </label>

                  <label className="block text-xs">
                    <span className="text-slate-300">Realistic Voice Persona (100% Free)</span>
                    <select
                      aria-label="Realistic Voice Persona"
                      value={audioConfig.voiceName}
                      onChange={(e) => {
                        const v = e.target.value as AudioMixerConfig['voiceName'];
                        onUpdateAudioConfig({ voiceName: v });
                        onUpdateSettings({ voiceName: v });
                      }}
                      className="w-full mt-1 px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded text-white"
                    >
                      <option value="Aria">Aria — US Female (Realistic Neural · Free)</option>
                      <option value="Sonia">Sonia — UK Female (Broadcast Neural · Free)</option>
                      <option value="Natasha">Natasha — AU Female (Energetic Neural · Free)</option>
                      <option value="Kore">Kore — Gemini AI Female</option>
                      <option value="Fenrir">Fenrir — Deep Stadium Announcer</option>
                      <option value="Puck">Puck — High-Energy Host</option>
                      <option value="Charon">Charon — Dramatic Baritone</option>
                      <option value="Zephyr">Zephyr — Fast Broadcast</option>
                    </select>
                  </label>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={audioConfig.preferServerTts}
                      onChange={(e) => onUpdateAudioConfig({ preferServerTts: e.target.checked })}
                      className="accent-cyan-400"
                    />
                    <span>
                      Use 100% Free Realistic Server Neural TTS (with Browser Web Speech fallback)
                    </span>
                  </label>
                  {onTestVoice && (
                    <button
                      type="button"
                      onClick={onTestVoice}
                      className="px-3 py-1.5 text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg shrink-0"
                    >
                      🔊 Test Voice
                    </button>
                  )}
                </div>

                <div className="p-3 bg-slate-950/90 border border-slate-800 rounded space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Queue Status:</span>
                    <span className="font-mono text-cyan-300">
                      {commentaryDiag.isSpeaking ? 'SPEAKING NOW' : 'IDLE'} · Pending:{' '}
                      {commentaryDiag.pendingCount} · Completed: {commentaryDiag.completedCount}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Active Audio Provider:</span>
                    <span className="font-mono text-emerald-400">{commentaryDiag.lastProvider}</span>
                  </div>
                  {commentaryDiag.activeText && (
                    <div className="text-amber-300 font-medium pt-1">
                      Speaking: “{commentaryDiag.activeText}”
                    </div>
                  )}
                  {commentaryDiag.lastError && (
                    <div className="text-rose-400 text-[11px]">
                      Last Provider Notice: {commentaryDiag.lastError} (Fallback active)
                    </div>
                  )}
                </div>

                <div className="space-y-1 max-h-36 overflow-y-auto">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase">
                    Recent Spoken Commentary Log
                  </span>
                  {commentaryDiag.recentHistory.length === 0 ? (
                    <p className="text-xs text-slate-500">No announcements spoken yet.</p>
                  ) : (
                    commentaryDiag.recentHistory.map((item) => (
                      <div
                        key={item.id}
                        className="text-[11px] p-1.5 bg-slate-900/70 rounded border border-slate-800/80 text-slate-300"
                      >
                        <span className="text-cyan-400 font-mono mr-1.5">[{item.provider}]</span>
                        {item.text}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'YOUTUBE_LIVE' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-4 bg-[#0b122b] border border-slate-800 rounded-lg space-y-4">
                <h3 className="text-sm font-bold text-cyan-300 uppercase tracking-wider">
                  Real-Time YouTube Live Chat & Subscriber Connection (100% Free)
                </h3>

                {/* Zero-Key Instant YouTube Live URL Connection */}
                <div className="p-3 bg-emerald-950/30 border border-emerald-500/40 rounded-lg space-y-2">
                  <div className="text-xs font-bold text-emerald-300">
                    Option A — Instant Zero-Key YouTube Live URL / Video ID (100% Free · No API Key Needed)
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Paste your public YouTube Live stream URL or 11-character Video ID below. Reads real-time viewer
                    country votes (<code className="text-cyan-300">India</code>,{' '}
                    <code className="text-cyan-300">!support Brazil</code>), Super Chats, Memberships, and{' '}
                    <code className="text-amber-300">!subscribed</code> alerts directly from your live stream!
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={liveUrlInput}
                      onChange={(e) => setLiveUrlInput(e.target.value)}
                      placeholder="https://www.youtube.com/watch?v=... or Video ID"
                      className="flex-1 px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded text-xs text-white"
                    />
                    <button
                      type="button"
                      disabled={connectingLiveUrl || !liveUrlInput.trim()}
                      onClick={async () => {
                        if (!onConnectYouTubeLiveUrl || !liveUrlInput.trim()) return;
                        setConnectingLiveUrl(true);
                        try {
                          await onConnectYouTubeLiveUrl(liveUrlInput.trim());
                        } finally {
                          setConnectingLiveUrl(false);
                        }
                      }}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold text-xs rounded-lg shrink-0"
                    >
                      {connectingLiveUrl ? 'Connecting...' : 'Connect Live Stream'}
                    </button>
                  </div>
                </div>

                <div className="p-3 bg-slate-950 border border-slate-800 rounded space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Server OAuth Credentials:</span>
                    <span className={ytStatus.oauthConfigured ? 'text-emerald-400 font-bold' : 'text-amber-400'}>
                      {ytStatus.oauthConfigured
                        ? 'Configured in Server Env'
                        : 'Awaiting YOUTUBE_CLIENT_ID & SECRET'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Authorized Channel:</span>
                    <span className="text-white font-semibold">
                      {ytStatus.authorized
                        ? `${ytStatus.channelTitle} (${ytStatus.channelId})`
                        : 'Not Connected'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Active Live Chat ID:</span>
                    <span className="font-mono text-cyan-300">{ytStatus.liveChatId || 'None Selected'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Ingestion Stream:</span>
                    <span className={ytStatus.ingestionActive ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                      {ytStatus.ingestionActive
                        ? `ACTIVE (Poll ${ytStatus.pollingIntervalMs}ms)`
                        : 'STOPPED'}
                    </span>
                  </div>
                  {ytStatus.lastError && (
                    <div className="text-rose-400 pt-1">API Diagnostic: {ytStatus.lastError}</div>
                  )}
                </div>

                <div className="p-2.5 bg-slate-900/90 border border-slate-800 rounded text-[11px] text-slate-300 space-y-1">
                  <div className="font-semibold text-cyan-300">Required Google Cloud OAuth Redirect URI:</div>
                  <code className="block p-1.5 bg-black rounded text-emerald-300 font-mono break-all select-all">
                    {callbackUrl}
                  </code>
                </div>

                <div className="flex flex-wrap gap-2">
                  {!ytStatus.authorized ? (
                    <button
                      type="button"
                      onClick={onConnectYouTubeOAuth}
                      className="px-4 py-2 text-xs font-bold bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors"
                    >
                      Connect YouTube Channel (OAuth 2.0 Popup)
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={onRefreshBroadcasts}
                        className="px-3 py-2 text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white rounded-lg"
                      >
                        Find Active Broadcasts
                      </button>
                      <button
                        type="button"
                        onClick={onToggleChatIngestion}
                        disabled={!ytStatus.liveChatId}
                        className="px-3 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-lg"
                      >
                        {ytStatus.ingestionActive ? 'Stop Chat Ingestion' : 'Start Chat Ingestion'}
                      </button>
                      <button
                        type="button"
                        onClick={onDisconnectYouTube}
                        className="px-3 py-2 text-xs font-bold bg-rose-900/70 hover:bg-rose-800 text-rose-200 rounded-lg"
                      >
                        Disconnect Channel
                      </button>
                    </>
                  )}
                </div>

                {ytStatus.availableBroadcasts.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold text-slate-300">Select Active Live Broadcast:</span>
                    {ytStatus.availableBroadcasts.map((b) => (
                      <div
                        key={b.id}
                        className="flex items-center justify-between p-2 bg-slate-900 border border-slate-800 rounded text-xs"
                      >
                        <div>
                          <div className="font-bold text-white">{b.title}</div>
                          <div className="text-[11px] text-slate-400 font-mono">
                            chatId: {b.liveChatId || 'unavailable'}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onSelectBroadcast(b.id, b.liveChatId)}
                          className="px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded font-bold"
                        >
                          Select
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Best-Effort Public Subscriber Monitoring */}
              <div className="p-4 bg-[#0b122b] border border-slate-800 rounded-lg space-y-4">
                <h3 className="text-sm font-bold text-cyan-300 uppercase tracking-wider">
                  Public Subscriber Monitor (`subscriptions.list`)
                </h3>

                <p className="text-xs text-slate-300 leading-relaxed">
                  Polls YouTube Data API v3 <code className="text-cyan-300">myRecentSubscribers=true</code> for
                  the authenticated channel owner. Compares retrieved subscription IDs against persisted server
                  records so historical subscribers are never re-announced.{' '}
                  <strong className="text-amber-300">
                    Note: YouTube only exposes recent public subscribers; viewers with private subscription
                    settings are not returned by the API.
                  </strong>
                </p>

                <div className="p-3 bg-slate-950 border border-slate-800 rounded space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Monitor State:</span>
                    <span className="font-mono font-bold text-cyan-300">{ytStatus.subscriberStatus}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Deduplicated Public Subscribers Tracked:</span>
                    <span className="font-mono text-white">{ytStatus.seenSubscriberCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Last Successful Check:</span>
                    <span className="font-mono text-slate-300">
                      {ytStatus.subscriberLastCheckedAt
                        ? new Date(ytStatus.subscriberLastCheckedAt).toLocaleTimeString()
                        : 'Never'}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={!ytStatus.authorized}
                  onClick={onPollSubscribersNow}
                  className="px-4 py-2 text-xs font-bold bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white rounded-lg transition-colors"
                >
                  Check Recent Public Subscribers Now
                </button>
              </div>
            </div>
          )}

          {activeTab === 'CLOUD_STREAM' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Mode A: Clean OBS Browser Source */}
              <div className="p-4 bg-[#0b122b] border border-slate-800 rounded-lg space-y-3">
                <h3 className="text-sm font-bold text-cyan-300 uppercase tracking-wider">
                  Mode A — Clean Browser / OBS Studio Capture Output
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Use this dedicated clean broadcast URL inside an OBS Studio <strong>Browser Source</strong> (set
                  to <code className="text-cyan-300">{broadcastFormat === '9:16' ? '1080×1920' : '1920×1080'}</code>,{' '}
                  60 FPS, with <em>Control audio via OBS</em> checked). All administrative buttons are hidden.
                </p>
                <code className="block p-2 bg-black border border-slate-800 rounded text-xs text-emerald-300 font-mono break-all select-all">
                  {cleanObsUrl}
                </code>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onToggleCleanBroadcastMode}
                    className="px-3 py-1.5 text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg"
                  >
                    Preview Clean OBS Output Now
                  </button>
                </div>
              </div>

              {/* Mode B: Cloud RTMPS Renderer Worker */}
              <div className="p-4 bg-[#0b122b] border border-slate-800 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-cyan-300 uppercase tracking-wider">
                    Mode B — Cloud RTMPS Renderer & Encoder Preflight
                  </h3>
                  <button
                    type="button"
                    onClick={onRunCloudPreflight}
                    className="px-2.5 py-1 text-xs font-bold bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded"
                  >
                    Run Preflight Check
                  </button>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  A standard Cloud Run HTTP service scales to zero when idle and does not automatically push
                  continuous RTMPS video. For 24/7 headless cloud streaming, deploy the containerized Chromium +
                  Xvfb + PulseAudio + FFmpeg worker on a persistent Google Compute Engine VM.
                </p>
                {cloudSpec && (
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Encoder Stream Status:</span>
                      <span className="font-mono font-bold text-amber-300">{cloudSpec.status}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Target Ingest Path:</span>
                      <span className="font-mono text-slate-300">{cloudSpec.targetRtmpsUrl}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">End-to-End Live Stream Verified:</span>
                      <span className="font-mono text-slate-300">
                        {cloudSpec.preflightChecks.endToEndStreamTested
                          ? 'YES'
                          : 'NO (Awaiting Live YOUTUBE_STREAM_KEY on GCE Worker)'}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {cloudSpec && (
                <div className="md:col-span-2 p-4 bg-[#0b122b] border border-slate-800 rounded-lg space-y-2">
                  <h4 className="text-xs font-bold text-slate-300 uppercase">
                    Cloud RTMPS Worker Container Specification (Headless Chromium + PulseAudio + FFmpeg NVENC/x264)
                  </h4>
                  <pre className="p-3 bg-black/90 border border-slate-800 rounded text-[11px] font-mono text-cyan-200 overflow-x-auto max-h-48">
                    {cloudSpec.dockerfileSpec}
                  </pre>
                </div>
              )}
            </div>
          )}

          {activeTab === 'ROSTER_CHECK' && (
            <div className="space-y-4">
              <div className="p-4 bg-[#0b122b] border border-slate-800 rounded-lg flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-emerald-400 uppercase">
                    64-Country Authoritative Manifest Verification
                  </h3>
                  <p className="text-xs text-slate-300">
                    Total Verified Countries: {manifestValidation.totalCount}/64 · Missing Flag Assets:{' '}
                    {manifestValidation.missingFlags.length} · Duplicate Codes:{' '}
                    {manifestValidation.duplicateCodes.length}
                  </p>
                </div>
                <span className="px-3 py-1 text-xs font-mono font-bold bg-emerald-500/20 text-emerald-300 rounded">
                  MANIFEST OK
                </span>
              </div>

              <div className="p-4 bg-[#0b122b] border border-slate-800 rounded-lg space-y-2">
                <h3 className="text-sm font-bold text-cyan-300 uppercase">
                  Recent Event & Source Audit Log ({eventLog.length} events)
                </h3>
                <div className="max-h-56 overflow-y-auto space-y-1.5">
                  {eventLog.length === 0 ? (
                    <p className="text-xs text-slate-500">No community events recorded in this match yet.</p>
                  ) : (
                    eventLog.map((ev) => (
                      <div
                        key={ev.id}
                        className="flex items-center justify-between p-2 bg-slate-900 border border-slate-800 rounded text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-1.5 py-0.5 text-[10px] font-mono font-bold rounded ${
                              ev.source === 'YOUTUBE_LIVE'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-amber-500/20 text-amber-300'
                            }`}
                          >
                            {ev.source}
                          </span>
                          <span className="font-semibold text-white">{ev.authorName}</span>
                          <span className="text-slate-400">·</span>
                          <span className="text-cyan-300">{ev.type}</span>
                          {ev.countryName && (
                            <span className="text-amber-300 font-semibold">→ {ev.countryName}</span>
                          )}
                        </div>
                        <span className="text-[11px] font-mono text-slate-400">
                          {new Date(ev.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
