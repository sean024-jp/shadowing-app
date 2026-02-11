"use client";

import { useAudioRecorder } from "@/hooks/useAudioRecorder"; // Type definition only if needed, but we pass props

type PlaybackControlsProps = {
  // Playback State
  isPlaying: boolean;
  onTogglePlay: () => void;
  onRestart: () => void;
  playBackRate: number;
  onSpeedChange: (speed: number) => void;

  // Loop State
  loop: boolean;
  onLoopToggle: () => void;
  loopRange: { start: number; end: number } | null;
  onSetLoopStart: () => void;
  onSetLoopEnd: () => void;
  onClearLoop: () => void;

  // Display State
  showScript: boolean;
  onScriptToggle: () => void;
  showJapanese: boolean;
  onJapaneseToggle: () => void;
  hasJapanese: boolean;

  // Recording State (from hook)
  recorder: {
    isRecording: boolean;
    isUploading: boolean;
    audioPath: string | null;
    startRecording: () => void;
    stopRecording: () => void;
    playRecording: () => void;
    deleteRecording: () => void;
  };
};

const Icon = ({ path, className = "w-6 h-6", fill = "currentColor", stroke = "none" }: { path: string, className?: string, fill?: string, stroke?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth={stroke === "none" ? 0 : 2} strokeLinecap="round" strokeLinejoin="round">
    <path d={path} />
  </svg>
);

export function PlaybackControls({
  isPlaying,
  onTogglePlay,
  onRestart,
  playBackRate,
  onSpeedChange,
  loop,
  onLoopToggle,
  loopRange,
  onSetLoopStart,
  onSetLoopEnd,
  onClearLoop,
  showScript,
  onScriptToggle,
  showJapanese,
  onJapaneseToggle,
  hasJapanese,
  recorder,
}: PlaybackControlsProps) {

  // Icons paths (Material Symbols / Phosphor style)
  const icons = {
    play: "M8 5v14l11-7z",
    pause: "M6 19h4V5H6v14zm8-14v14h4V5h-4z",
    restart: "M11 19l-9-7 9-7v14z M20 5h-4v14h4V5z", // Skip back + Bar? Simplified: standard skip back
    loop: "M17 17l5-5-5-5M7 7l-5 5 5 5M7 7h10M17 17H7", // Custom loop-ish
    // Better loop: 
    loopRounded: "M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z",
    record: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z", // Circle outline? Actually we want filled circle for Rec.
    recordFilled: "M12 12m-8 0a8 8 0 1 0 16 0a8 8 0 1 0 -16 0", // SVGs varies.
    trash: "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z",
    script: "M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z",
    translate: "M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0014.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"
  };

  return (
    <div className="flex flex-col gap-2 w-full max-w-2xl mx-auto">
      {/* Top Row: Playback & Loop & Rec */}
      <div className="flex items-center justify-between bg-gray-100 dark:bg-gray-800 rounded-full px-4 py-2 shadow-sm">

        {/* Left: Playback Controls */}
        <div className="flex items-center gap-4">
          {/* Restart */}
          <button onClick={onRestart} className="text-gray-600 dark:text-gray-300 hover:text-blue-600">
            <Icon path="M6 6h2v12H6zm3.5 6l8.5 6V6z" /> {/* Skip Previous / Restart */}
          </button>

          {/* Play/Pause */}
          <button onClick={onTogglePlay} className="text-blue-600 dark:text-blue-400 hover:scale-110 transition">
            {isPlaying ? (
              <Icon path={icons.pause} className="w-10 h-10" />
            ) : (
              <Icon path={icons.play} className="w-10 h-10" />
            )}
          </button>

          {/* Speed Popover/Toggle? Just simple cycle for now or 2 buttons? 
                 Let's do a simple cycle or compact display. 
                 User asked for "Playback, Restart, Pause only" mentioned? 
                 User: "動画エリアがなくなったので、再生アイコン、最初に戻るアイコン、一時停止アイコンなど追加して"
                 Let's keep Speed small text.
             */}
          <button
            onClick={() => {
              const idx = SPEEDS.indexOf(playBackRate);
              const next = SPEEDS[(idx + 1) % SPEEDS.length];
              onSpeedChange(next);
            }}
            className="text-xs font-bold w-8 h-8 rounded-full border border-gray-300 dark:border-gray-600 flex items-center justify-center text-gray-600 dark:text-gray-300"
          >
            {playBackRate}x
          </button>
        </div>

        {/* Center: A-B Loop */}
        <div className="flex items-center gap-2">
          <button
            onClick={onLoopToggle}
            className={`p-1.5 rounded-full transition ${loop ? "text-purple-600 bg-purple-100 dark:text-purple-300 dark:bg-purple-900/50" : "text-gray-400"}`}
          >
            <Icon path={icons.loopRounded} className="w-6 h-6" />
          </button>
          <div className="flex gap-1 bg-gray-200 dark:bg-gray-700 rounded-full p-1">
            <button
              onClick={onSetLoopStart}
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition ${loopRange
                  ? "bg-purple-600 text-white"
                  : "bg-white dark:bg-gray-600 text-gray-600 dark:text-gray-300 hover:bg-purple-100"
                }`}
            >
              A
            </button>
            <button
              onClick={onSetLoopEnd}
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition ${loopRange
                  ? "bg-purple-600 text-white"
                  : "bg-white dark:bg-gray-600 text-gray-600 dark:text-gray-300 hover:bg-purple-100"
                }`}
            >
              B
            </button>
          </div>
          {loopRange && (
            <button onClick={onClearLoop} className="text-gray-400 hover:text-red-500">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" /></svg>
            </button>
          )}
        </div>

        {/* Right: Recorder & Display */}
        <div className="flex items-center gap-3">
          {/* Display Toggles */}
          <button
            onClick={onScriptToggle}
            className={`p-1.5 rounded transition ${showScript ? "text-blue-600 bg-blue-50 dark:bg-blue-900/30" : "text-gray-400"}`}
            title="英文表示"
          >
            <span className="font-serif font-bold text-lg">Aa</span>
          </button>
          {hasJapanese && (
            <button
              onClick={onJapaneseToggle}
              className={`p-1.5 rounded transition ${showJapanese ? "text-green-600 bg-green-50 dark:bg-green-900/30" : "text-gray-400"}`}
              title="日本語表示"
            >
              <span className="font-sans font-bold text-xs">訳</span>
            </button>
          )}

          <div className="w-px h-6 bg-gray-300 dark:bg-gray-600" />

          {/* Recording Controls */}
          {recorder.isRecording ? (
            <button
              onClick={recorder.stopRecording}
              className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/50 flex items-center justify-center text-red-600 animate-pulse"
            >
              <div className="w-4 h-4 bg-red-600 rounded-sm" />
            </button>
          ) : recorder.isUploading ? (
            <div className="w-10 h-10 flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={recorder.startRecording}
                className="w-10 h-10 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center transition shadow-md"
                title="録音開始"
              >
                <div className="w-4 h-4 bg-white rounded-full" />
              </button>

              {recorder.audioPath && (
                <div className="flex flex-col gap-1 -ml-1">
                  <button
                    onClick={recorder.playRecording}
                    className="text-gray-600 dark:text-gray-300 hover:text-blue-500 p-1"
                    title="自分の録音を再生"
                  >
                    <Icon path="M8 5v14l11-7z" className="w-5 h-5" />
                  </button>
                  <button
                    onClick={recorder.deleteRecording}
                    className="text-gray-400 hover:text-red-500 p-1"
                    title="録音削除"
                  >
                    <Icon path="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )}

        </div>

      </div>
    </div>
  );
}

const SPEEDS = [0.5, 0.75, 0.9, 1.0];
