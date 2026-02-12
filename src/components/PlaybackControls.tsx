"use client";

type PlaybackControlsProps = {
  // Mode State
  practiceMode: "practice" | "recording";
  onModeToggle: () => void;
  recordingState: "idle" | "recording" | "review";

  // Playback State
  playerUnlocked: boolean;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onRestart: () => void;
  playBackRate: number;
  onSpeedChange: (speed: number) => void;

  // Loop State
  loop: boolean;
  onLoopToggle: () => void;
  loopA: number | null;
  loopB: number | null;
  onToggleLoopA: () => void;
  onToggleLoopB: () => void;

  // Display State
  showScript: boolean;
  onScriptToggle: () => void;
  showJapanese: boolean;
  onJapaneseToggle: () => void;
  hasJapanese: boolean;

  // Recording Actions (Page level handlers)
  onStartRecording: () => void;
  onStopRecording: (shouldSave: boolean) => void;

  // Recorder Hook Data
  recorder: {
    isRecording: boolean;
    isUploading: boolean;
    audioPath: string | null;
    saveRecording: () => void;
    discardRecording: () => void;
    previewUrl: string | null;
    previewIsPlaying: boolean;
    togglePreviewPlayback: () => void;
    playRecording: () => void;
    deleteRecording: () => void;
    error: string;
  };
};

const Icon = ({ path, className = "w-6 h-6", fill = "currentColor", stroke = "none" }: { path: string, className?: string, fill?: string, stroke?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth={stroke === "none" ? 0 : 2} strokeLinecap="round" strokeLinejoin="round">
    <path d={path} />
  </svg>
);

export function PlaybackControls({
  practiceMode,
  onModeToggle,
  recordingState,
  playerUnlocked,
  isPlaying,
  onTogglePlay,
  onRestart,
  playBackRate,
  onSpeedChange,
  loop,
  onLoopToggle,
  loopA,
  loopB,
  onToggleLoopA,
  onToggleLoopB,
  showScript,
  onScriptToggle,
  showJapanese,
  onJapaneseToggle,
  hasJapanese,
  onStartRecording,
  onStopRecording,
  recorder,
}: PlaybackControlsProps) {

  // Icons paths
  const icons = {
    play: "M8 5v14l11-7z",
    pause: "M6 19h4V5H6v14zm8-14v14h4V5h-4z",
    restart: "M6 6h2v12H6zm3.5 6l8.5 6V6z",
    loopRounded: "M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z",
    trash: "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z",
    save: "M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z",
    retry: "M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"
  };

  return (
    <div className="flex flex-col gap-3 w-full max-w-2xl mx-auto">
      {/* Mode Switcher */}
      <div className="flex justify-center">
        <div className="bg-gray-100 dark:bg-gray-800 p-1 rounded-full flex gap-1 shadow-inner">
          <button
            onClick={() => onModeToggle()}
            className={`px-4 py-1 rounded-full text-xs font-bold transition ${practiceMode === "practice" ? "bg-white dark:bg-gray-700 shadow-sm text-blue-600" : "text-gray-500"}`}
          >
            練習モード
          </button>
          <button
            onClick={() => { if (playerUnlocked || practiceMode === "recording") onModeToggle(); }}
            className={`px-4 py-1 rounded-full text-xs font-bold transition ${
              practiceMode === "recording"
                ? "bg-white dark:bg-gray-700 shadow-sm text-red-600"
                : !playerUnlocked
                  ? "text-gray-300 dark:text-gray-600 cursor-not-allowed"
                  : "text-gray-500"
            }`}
          >
            録音モード
          </button>
        </div>
      </div>

      {recordingState === "review" && practiceMode === "recording" ? (
        /* Review UI */
        <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/50 rounded-2xl px-6 py-4 shadow-sm animate-in fade-in slide-in-from-bottom-2">
          <div className="flex flex-col">
            <span className="text-xs font-bold text-blue-600 dark:text-blue-400 mb-1">録音を確認中</span>
            <div className="flex items-center gap-3">
              <button
                onClick={recorder.togglePreviewPlayback}
                className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition"
              >
                {recorder.previewIsPlaying ? (
                  <Icon path={icons.pause} className="w-6 h-6" />
                ) : (
                  <Icon path={icons.play} className="w-6 h-6 translate-x-0.5" />
                )}
              </button>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">自分の声を聞く</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={recorder.discardRecording}
              className="flex flex-col items-center gap-1 p-2 text-gray-500 hover:text-red-500 transition"
            >
              <div className="w-10 h-10 rounded-full border border-gray-300 dark:border-gray-600 flex items-center justify-center">
                <Icon path={icons.retry} className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-bold">録り直し</span>
            </button>
            <button
              onClick={recorder.saveRecording}
              disabled={recorder.isUploading}
              className="flex flex-col items-center gap-1 p-2 text-blue-600 hover:text-blue-700 transition"
            >
              <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-md">
                {recorder.isUploading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Icon path={icons.save} className="w-5 h-5" />
                )}
              </div>
              <span className="text-[10px] font-bold">保存する</span>
            </button>
          </div>
        </div>
      ) : !playerUnlocked ? (
        /* Pre-unlock: Guide user to tap video first */
        <div className="flex items-center justify-between bg-gray-100 dark:bg-gray-800 rounded-full px-4 py-3 shadow-sm">
          <span className="text-sm font-bold text-blue-600 dark:text-blue-400 flex-1 text-center">
            {practiceMode === "recording"
              ? "▶ 動画をタップしてから録音開始"
              : "▶ 動画をタップして再生開始"}
          </span>
          <div className="flex items-center gap-3 shrink-0">
            <button onClick={onScriptToggle} className={`p-1.5 rounded transition ${showScript ? "text-blue-600 bg-blue-50 dark:bg-blue-900/30" : "text-gray-400"}`}>
              <span className="font-serif font-bold text-lg">Aa</span>
            </button>
            {hasJapanese && (
              <button onClick={onJapaneseToggle} className={`p-1.5 rounded transition ${showJapanese ? "text-green-600 bg-green-50 dark:bg-green-900/30" : "text-gray-400"}`}>
                <span className="font-sans font-bold text-xs">訳</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        /* Standard Controls (Practice or Idle/Recording) — player unlocked */
        <div className={`flex items-center justify-between bg-gray-100 dark:bg-gray-800 rounded-full px-4 py-2 shadow-sm transition-all duration-300 ${practiceMode === 'recording' && recordingState === 'recording' ? 'ring-2 ring-red-500 animate-pulse' : ''}`}>

          {/* Left: Playback Controls */}
          <div className="flex items-center gap-4">
            <button
              onClick={onRestart}
              disabled={practiceMode === "recording"}
              className={`text-gray-600 dark:text-gray-300 hover:text-blue-600 disabled:opacity-30`}
            >
              <Icon path={icons.restart} />
            </button>

            <button
              onClick={onTogglePlay}
              disabled={practiceMode === "recording"}
              className={`text-blue-600 dark:text-blue-400 hover:scale-110 transition disabled:opacity-30`}
            >
              {isPlaying ? (
                <Icon path={icons.pause} className="w-10 h-10" />
              ) : (
                <Icon path={icons.play} className="w-10 h-10" />
              )}
            </button>

            <button
              onClick={() => {
                const idx = SPEEDS.indexOf(playBackRate);
                const next = SPEEDS[(idx + 1) % SPEEDS.length];
                onSpeedChange(next);
              }}
              disabled={practiceMode === "recording"}
              className="text-xs font-bold w-8 h-8 rounded-full border border-gray-300 dark:border-gray-600 flex items-center justify-center text-gray-600 dark:text-gray-300 disabled:opacity-30"
            >
              {playBackRate}x
            </button>
          </div>

          {/* Center: A-B Loop (Only practice mode) */}
          {practiceMode === "practice" ? (
            <div className="flex items-center gap-2">
              <button
                onClick={onLoopToggle}
                className={`p-1.5 rounded-full transition ${loop ? "text-purple-600 bg-purple-100 dark:text-purple-300 dark:bg-purple-900/50" : "text-gray-400"}`}
              >
                <Icon path={icons.loopRounded} className="w-6 h-6" />
              </button>
              <div className="flex gap-1 bg-gray-200 dark:bg-gray-700 rounded-full p-1">
                <button onClick={onToggleLoopA} className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition ${loopA !== null ? "bg-purple-600 text-white" : "bg-white dark:bg-gray-600 text-gray-600 dark:text-gray-300 hover:bg-purple-100"}`}>A</button>
                <button onClick={onToggleLoopB} className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition ${loopB !== null ? "bg-purple-600 text-white" : "bg-white dark:bg-gray-600 text-gray-600 dark:text-gray-300 hover:bg-purple-100"}`}>B</button>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex justify-center">
              {recordingState === "recording" && (
                <div className="flex items-center gap-2 text-red-600 font-bold animate-pulse">
                  <div className="w-2 h-2 rounded-full bg-red-600" />
                  <span className="text-sm">録音中...</span>
                </div>
              )}
            </div>
          )}

          {/* Right: Recorder & Display */}
          <div className="flex items-center gap-3">
            <button onClick={onScriptToggle} className={`p-1.5 rounded transition ${showScript ? "text-blue-600 bg-blue-50 dark:bg-blue-900/30" : "text-gray-400"}`}>
              <span className="font-serif font-bold text-lg">Aa</span>
            </button>
            {hasJapanese && (
              <button onClick={onJapaneseToggle} className={`p-1.5 rounded transition ${showJapanese ? "text-green-600 bg-green-50 dark:bg-green-900/30" : "text-gray-400"}`}>
                <span className="font-sans font-bold text-xs">訳</span>
              </button>
            )}

            <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />

            {/* Main Action Button (Mode dependent) */}
            {practiceMode === "recording" ? (
              recordingState === "recording" ? (
                <button
                  onClick={() => onStopRecording(false)}
                  className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-red-50"
                  title="ギブアップ（中止）"
                >
                  <Icon path={icons.trash} className="w-5 h-5" />
                </button>
              ) : (
                <button
                  onClick={onStartRecording}
                  className="w-10 h-10 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center transition shadow-md"
                  title="録音開始"
                >
                  <div className="w-4 h-4 bg-white rounded-full" />
                </button>
              )
            ) : (
              <div className="flex items-center gap-2">
                {recorder.audioPath && (
                  <button
                    onClick={recorder.playRecording}
                    className="text-gray-600 dark:text-gray-300 hover:text-blue-500 p-1"
                    title="自分の録音を再生"
                  >
                    <Icon path="M8 5v14l11-7z" className="w-5 h-5" />
                  </button>
                )}
                <div className="w-10 h-10 rounded-full border-2 border-red-200 dark:border-red-900/30 flex items-center justify-center text-red-500 opacity-50">
                  <div className="w-3 h-3 bg-red-500 rounded-full" />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {recorder.error && <p className="text-[10px] text-red-500 text-center">{recorder.error}</p>}
    </div>
  );
}

const SPEEDS = [0.5, 0.75, 0.9, 1.0];
