import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type ForwardRefExoticComponent,
  type RefAttributes,
} from "react";
import { ThemeProvider } from "./theme";
import { I18nProvider } from "./i18n";
import { AppHeader } from "@/components/app-header/app-header";
import BottomInstructions from "@/components/bottom-instructions";
import type {
  BulkOffsetDrawerProps,
  BulkOffsetPreviewState,
} from "@/components/bulk-offset/drawer";
import { BulkOffsetDrawer } from "@/components/bulk-offset/drawer";
import CustomControls from "@/components/custom-controls";
import SkipLinks from "@/components/skip-links";
import type { SubtitleListRef } from "@/components/subtitle/subtitle-list";
import TrackTabs from "@/components/subtitle/track-tabs";
import type {
  VideoPlayerHandle,
  VideoPlayerProps,
} from "@/components/video-player";
import VideoPlayerRaw from "@/components/video-player";
import WaveformVisualizerRaw from "@/components/waveform-visualizer";
import {
  SubtitleProvider,
  useSubtitleActionsContext,
  useSubtitleHistory,
  useSubtitleState,
  useSubtitles,
} from "@/context/subtitle-context";
import { useDroppablePanel } from "@/hooks/use-droppable-panel";
import { useSubtitleShortcuts } from "@/hooks/use-subtitle-shortcuts";
import { isMediaFile, isSubtitleFile } from "@/lib/file-utils";
import {
  extractVttPrologue,
  parseSRT,
  parseVTT,
} from "@/lib/subtitle-operations";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { Toaster } from "@/components/ui/toaster";
import { v4 as uuidv4 } from "uuid";

const VideoPlayer = VideoPlayerRaw as ForwardRefExoticComponent<
  VideoPlayerProps & RefAttributes<VideoPlayerHandle>
>;
const WaveformVisualizer = WaveformVisualizerRaw as ForwardRefExoticComponent<
  any & RefAttributes<any>
>;

interface WaveformRef {
  scrollToRegion: (uuid: string) => void;
  setWaveformTime: (time: number) => void;
}

function MainContent() {
  const t = useTranslations();
  const waveformRef = useRef<WaveformRef>(null);
  const subtitleListRef = useRef<SubtitleListRef>(null);
  const videoPlayerRef = useRef<VideoPlayerHandle | null>(null);
  const mediaFileInputRef = useRef<HTMLInputElement | null>(null);

  const { tracks, activeTrackId, setActiveTrackId, playInBackground } =
    useSubtitleState();
  const subtitles = useSubtitles();
  const {
    setInitialSubtitles,
    loadSubtitlesIntoTrack,
    renameTrack,
    bulkShiftSubtitlesAction,
  } = useSubtitleActionsContext();
  const { undoSubtitles, redoSubtitles, canUndoSubtitles, canRedoSubtitles } =
    useSubtitleHistory();

  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaFileName, setMediaFileName] = useState<string>(
    t("buttons.loadMedia"),
  );
  const [playbackTime, setPlaybackTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [duration, setDuration] = useState<number>(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [jumpDuration, setJumpDuration] = useState(5);
  const [editingSubtitleUuid, setEditingSubtitleUuid] = useState<string | null>(
    null,
  );
  const [pendingScrollToUuid, setPendingScrollToUuid] = useState<string | null>(
    null,
  );
  const [pendingScrollInstant, setPendingScrollInstant] =
    useState<boolean>(false);
  const [isBulkOffsetOpen, setIsBulkOffsetOpen] = useState<boolean>(false);
  const [bulkOffsetPreview, setBulkOffsetPreview] = useState<
    Record<string, BulkOffsetPreviewState>
  >({});

  const resumeMediaPlayback = () => {
    videoPlayerRef.current?.resumePlayback();
  };

  const activeTrackIndex = activeTrackId
    ? tracks.findIndex((track) => track.id === activeTrackId)
    : -1;
  const activeTrack =
    activeTrackIndex >= 0 ? (tracks[activeTrackIndex] ?? null) : null;
  const activeTrackIsEmpty =
    activeTrack !== null && activeTrack.subtitles.length === 0;
  const activeTrackSubtitles = activeTrack?.subtitles ?? [];
  const allowSubtitleDrop = tracks.length === 0 || activeTrackIsEmpty;
  const bulkOffsetDisabled = !activeTrack || activeTrackSubtitles.length === 0;

  const loadMediaFile = (file: File) => {
    setMediaFile(null);
    if (mediaFileInputRef.current) mediaFileInputRef.current.value = "";
    setTimeout(() => {
      setMediaFile(file);
      setMediaFileName(file.name);
    }, 0);
  };

  const loadSubtitleFile = async (file: File) => {
    const text = await file.text();
    const firstLine =
      text.split(/\r?\n/).find((l) => l.trim().length > 0) || "";
    const isVtt =
      file.name.toLowerCase().endsWith(".vtt") ||
      /^WEBVTT( |$)/.test(firstLine);
    const parsedSubtitles = isVtt ? parseVTT(text) : parseSRT(text);
    const meta = isVtt ? extractVttPrologue(text) : undefined;
    const safeTrackName = file.name.replace(/\.(srt|vtt)$/i, "") || file.name;

    if (activeTrackId && activeTrackIsEmpty) {
      loadSubtitlesIntoTrack(
        activeTrackId,
        parsedSubtitles,
        meta
          ? { vttHeader: meta.header, vttPrologue: meta.prologue }
          : undefined,
      );
      renameTrack(activeTrackId, safeTrackName);
      return;
    }

    setInitialSubtitles(
      parsedSubtitles,
      safeTrackName,
      meta ? { vttHeader: meta.header, vttPrologue: meta.prologue } : undefined,
    );
  };

  const handleStartFromScratch = () => {
    setInitialSubtitles(
      [
        {
          uuid: uuidv4(),
          id: 1,
          startTime: "00:00:00,000",
          endTime: "00:00:03,000",
          text: t("subtitle.newSubtitle"),
        },
      ],
      t("subtitle.newTrackName", { number: 1 }),
    );
  };

  const {
    isDragActive: isSubtitleDragActive,
    panelProps: baseSubtitleDropHandlers,
  } = useDroppablePanel<HTMLDivElement>({
    acceptFile: (file: File) => allowSubtitleDrop && isSubtitleFile(file),
    onDropFile: loadSubtitleFile,
  });

  const subtitleDropHandlers = {
    onDragEnter: (event: DragEvent<HTMLDivElement>) => {
      if (!allowSubtitleDrop) {
        if (event.dataTransfer) event.dataTransfer.dropEffect = "none";
        return;
      }
      baseSubtitleDropHandlers.onDragEnter(event);
    },
    onDragLeave: (event: DragEvent<HTMLDivElement>) => {
      baseSubtitleDropHandlers.onDragLeave(event);
    },
    onDragOver: (event: DragEvent<HTMLDivElement>) => {
      if (!allowSubtitleDrop) {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "none";
        return;
      }
      baseSubtitleDropHandlers.onDragOver(event);
    },
    onDrop: (event: DragEvent<HTMLDivElement>) => {
      if (!allowSubtitleDrop) {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "none";
        return;
      }
      baseSubtitleDropHandlers.onDrop(event);
    },
  };

  const { isDragActive: isMediaDragActive, panelProps: mediaDropHandlers } =
    useDroppablePanel<HTMLDivElement>({
      acceptFile: isMediaFile,
      onDropFile: loadMediaFile,
    });

  useSubtitleShortcuts({
    subtitles,
    playbackTime,
    setIsPlaying,
    setEditingSubtitleUuid,
    tracks,
    activeTrackId: activeTrackId ?? null,
    setActiveTrackId,
    canUndoSubtitles,
    canRedoSubtitles,
    undoSubtitles,
    redoSubtitles,
  });

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (canUndoSubtitles) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [canUndoSubtitles]);

  useEffect(() => {
    if (playInBackground || typeof document === "undefined") return;
    const handleVisibilityChange = () => {
      if (document.hidden) setIsPlaying(false);
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [playInBackground]);

  useEffect(() => {
    if (!pendingScrollToUuid || !subtitleListRef.current) return;
    const attemptScroll = (retries = 0) => {
      const el = document.getElementById(`subtitle-${pendingScrollToUuid}`);
      if (el) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const ok = subtitleListRef.current?.scrollToSubtitle(
              pendingScrollToUuid,
              {
                instant: pendingScrollInstant,
                center: true,
                focus: pendingScrollInstant,
              },
            );
            if (ok) {
              setPendingScrollToUuid(null);
              setPendingScrollInstant(false);
            } else if (retries < 10) {
              setTimeout(() => attemptScroll(retries + 1), 50);
            } else {
              setPendingScrollToUuid(null);
              setPendingScrollInstant(false);
            }
          });
        });
      } else if (retries < 10) {
        setTimeout(() => attemptScroll(retries + 1), 50);
      } else {
        setPendingScrollToUuid(null);
        setPendingScrollInstant(false);
      }
    };
    attemptScroll();
  }, [pendingScrollToUuid, pendingScrollInstant]);

  useEffect(() => {
    if (tracks.length === 0) setIsBulkOffsetOpen(false);
  }, [tracks.length]);

  useEffect(() => {
    if (bulkOffsetDisabled && isBulkOffsetOpen) setIsBulkOffsetOpen(false);
  }, [bulkOffsetDisabled, isBulkOffsetOpen]);

  return (
    <div className="flex flex-col h-screen">
      <SkipLinks />
      <AppHeader
        canUndo={canUndoSubtitles}
        canRedo={canRedoSubtitles}
        onUndo={undoSubtitles}
        onRedo={redoSubtitles}
        mediaFileInputRef={mediaFileInputRef}
        onSelectMediaFile={loadMediaFile}
        mediaFileName={mediaFileName}
        isBulkOffsetOpen={isBulkOffsetOpen}
        onToggleBulkOffset={() => setIsBulkOffsetOpen((prev) => !prev)}
        bulkOffsetDisabled={bulkOffsetDisabled}
      />

      <div className="flex-1 flex flex-col">
        <div className="flex h-[64vh]">
          <div
            className={cn(
              "relative w-1/2 transition-colors",
              isSubtitleDragActive && allowSubtitleDrop && "bg-yellow-50",
            )}
            {...subtitleDropHandlers}
          >
            <div
              className={cn(
                "h-full transition",
                isBulkOffsetOpen &&
                  "pointer-events-none blur-[1px] opacity-40",
              )}
            >
              <TrackTabs
                tracks={tracks}
                activeTrackId={activeTrackId}
                setActiveTrackId={setActiveTrackId}
                subtitleListRef={subtitleListRef}
                playbackTime={playbackTime}
                isPlaying={isPlaying}
                resumePlayback={resumeMediaPlayback}
                setIsPlaying={setIsPlaying}
                setPlaybackTime={setPlaybackTime}
                editingSubtitleUuid={editingSubtitleUuid}
                setEditingSubtitleUuid={setEditingSubtitleUuid}
                onScrollToRegion={(uuid) => {
                  waveformRef.current?.scrollToRegion(uuid);
                }}
                onTimeJump={(seconds) =>
                  setPlaybackTime(
                    Math.min(duration, Math.max(0, playbackTime + seconds)),
                  )
                }
                jumpDuration={jumpDuration}
                onLoadSubtitleFile={loadSubtitleFile}
                onStartFromScratch={handleStartFromScratch}
              />
            </div>

            {isBulkOffsetOpen && tracks.length > 0 && (
              <BulkOffsetDrawer
                isOpen={isBulkOffsetOpen}
                subtitles={activeTrackSubtitles}
                trackIndex={activeTrackIndex}
                currentTrackName={activeTrack?.name ?? null}
                onPreviewChange={setBulkOffsetPreview}
                onApplyOffset={(selection, offsetSeconds, target) => {
                  bulkShiftSubtitlesAction(selection, offsetSeconds, target);
                }}
              />
            )}
          </div>

          <div
            className={cn(
              "w-1/2 border-l-2 border-black dark:border-white transition-colors",
              isMediaDragActive && "bg-blue-50",
            )}
            {...mediaDropHandlers}
          >
            <VideoPlayer
              ref={videoPlayerRef}
              mediaFile={mediaFile}
              setMediaFile={setMediaFile}
              setMediaFileName={setMediaFileName}
              onProgress={(time) => {
                setPlaybackTime(time);
                waveformRef.current?.setWaveformTime(time);
              }}
              onPlayPause={(playing) => setIsPlaying(playing)}
              onDuration={(d) => setDuration(d)}
              seekTime={playbackTime}
              isPlaying={isPlaying}
              playbackRate={playbackRate}
              playInBackground={playInBackground}
            />
          </div>
        </div>

        <div className="h-[21vh]">
          {mediaFile ? (
            <>
              <CustomControls
                isPlaying={isPlaying}
                playbackTime={playbackTime}
                duration={duration}
                onPlayPause={() => setIsPlaying(!isPlaying)}
                onTimeJump={(seconds) =>
                  setPlaybackTime(
                    Math.min(duration, Math.max(0, playbackTime + seconds)),
                  )
                }
                jumpDuration={jumpDuration}
                onChangeJumpDuration={(seconds) =>
                  setJumpDuration(Number.parseInt(seconds))
                }
                onSeek={(time) => setPlaybackTime(time)}
                playbackRate={playbackRate}
                onChangePlaybackRate={(rate) =>
                  setPlaybackRate(Number.parseFloat(rate))
                }
              />
              <WaveformVisualizer
                ref={waveformRef}
                mediaFile={mediaFile}
                isPlaying={isPlaying}
                playInBackground={playInBackground}
                onSeek={setPlaybackTime}
                onPlayPause={setIsPlaying}
                previewOffsets={bulkOffsetPreview}
                onRegionClick={(uuid: string, opts?: { crossTrack?: boolean }) => {
                  setPendingScrollToUuid(uuid);
                  setPendingScrollInstant(Boolean(opts?.crossTrack));
                }}
              />
            </>
          ) : (
            <BottomInstructions />
          )}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <main id="main-content" className="min-h-screen">
          <SubtitleProvider>
            <MainContent />
          </SubtitleProvider>
        </main>
        <Toaster />
      </I18nProvider>
    </ThemeProvider>
  );
}
