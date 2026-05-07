"use client";

import { useSubtitles } from "@/context/subtitle-context"; // Import context
import {
  detectBrowserMediaSupport,
  type BrowserMediaSupport,
  type MediaFormatSupport,
} from "@/lib/media-support";
import { timeToSeconds } from "@/lib/utils";
import { useTranslations } from "next-intl";
import {
  Fragment,
  type ForwardedRef,
  type SyntheticEvent,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

export interface VideoPlayerProps {
  mediaFile: File | null;
  setMediaFile: (file: File | null) => void;
  setMediaFileName: (name: string) => void;
  onProgress: (time: number) => void;
  onPlayPause: (playing: boolean) => void;
  onDuration: (duration: number) => void;
  seekTime: number;
  isPlaying: boolean;
  playbackRate: number;
  playInBackground: boolean;
}

export interface VideoPlayerHandle {
  resumePlayback: () => void;
}

const VideoPlayer = forwardRef(function VideoPlayer(
  {
    mediaFile,
    setMediaFile,
    setMediaFileName,
    onProgress,
    onPlayPause,
    onDuration,
    seekTime,
    isPlaying,
    playbackRate,
    playInBackground,
  }: VideoPlayerProps,
  ref: ForwardedRef<VideoPlayerHandle>,
) {
  const t = useTranslations();
  // Get subtitles from context
  const subtitles = useSubtitles();

  const [mediaUrl, setMediaUrl] = useState<string>("");
  const [browserMediaSupport, setBrowserMediaSupport] =
    useState<BrowserMediaSupport | null>(null);
  const playerRef = useRef<HTMLVideoElement | null>(null);
  const textTrackRef = useRef<TextTrack | null>(null);
  const timeToRestore = useRef<number | null>(null);

  const setVideoRef = useCallback((element: HTMLVideoElement | null) => {
    playerRef.current = element;
    if (!element) {
      textTrackRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const audio = document.createElement("audio");
    const video = document.createElement("video");

    setBrowserMediaSupport(
      detectBrowserMediaSupport(
        audio.canPlayType.bind(audio),
        video.canPlayType.bind(video),
      ),
    );
  }, []);

  const resumePlayback = useCallback(() => {
    const playerInstance = playerRef.current;
    if (!playerInstance) return;

    try {
      const playPromise = playerInstance.play?.();
      if (
        playPromise &&
        typeof (playPromise as Promise<void>).catch === "function"
      ) {
        (playPromise as Promise<void>).catch((error) => {
          if (
            error &&
            typeof error === "object" &&
            "name" in error &&
            (error as { name?: string }).name === "AbortError"
          ) {
            return;
          }
          console.warn("Failed to resume media playback:", error);
        });
      }
    } catch (error) {
      console.warn("Failed to resume media playback:", error);
    }
  }, []);

  useImperativeHandle(ref, () => ({
    resumePlayback,
  }));

  useEffect(() => {
    if (playerRef.current && typeof seekTime === "number") {
      const player = playerRef.current;
      const currentTime = player.currentTime ?? 0;
      if (Math.abs(currentTime - seekTime) > 0.5) {
        player.currentTime = seekTime;
        timeToRestore.current = seekTime;
      }
    }
  }, [seekTime]);

  useEffect(() => {
    const node = playerRef.current;
    if (!node) return;
    if (isPlaying) {
      const playPromise = node.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {});
      }
    } else {
      node.pause();
    }
  }, [isPlaying]);

  useEffect(() => {
    if (playerRef.current) {
      playerRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  useEffect(() => {
    if (!playInBackground || typeof document === "undefined") {
      return;
    }

    const handleVisibilityChange = () => {
      if (!document.hidden && isPlaying) {
        resumePlayback();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isPlaying, playInBackground, resumePlayback]);

  useEffect(() => {
    if (!mediaFile) {
      setMediaUrl("");
      return;
    }
    const url = URL.createObjectURL(mediaFile);
    setMediaUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [mediaFile]);

  useEffect(() => {
    const video = playerRef.current;
    if (!video || !mediaUrl) return;

    if (!textTrackRef.current) {
      textTrackRef.current = video.addTextTrack("subtitles", "subtitles", "unknown");
    }

    const track = textTrackRef.current;

    if (track.cues) {
      Array.from(track.cues).forEach((cue) => track.removeCue(cue));
    }

    track.mode = "showing";

    subtitles.forEach((sub) => {
      try {
        const start = timeToSeconds(sub.startTime);
        const end = timeToSeconds(sub.endTime);
        if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) return;
        const cue = new VTTCue(start, end, sub.text);
        cue.id = String(sub.id);
        track.addCue(cue);
      } catch {
        // Skip cues with invalid timing
      }
    });
  }, [subtitles, mediaUrl]);

  const handleLoadedMetadata = useCallback(
    (event: SyntheticEvent<HTMLVideoElement>) => {
      playerRef.current = event.currentTarget;
      if (timeToRestore.current !== null) {
        event.currentTarget.currentTime = timeToRestore.current;
        timeToRestore.current = null;
      }
      if (Number.isFinite(event.currentTarget.duration)) {
        onDuration(event.currentTarget.duration);
      }
    },
    [onDuration],
  );

  const renderSupportedFormats = useCallback(
    (formats: MediaFormatSupport[]) => {
      if (formats.length === 0) {
        return (
          <span className="text-muted-foreground">
            {t("videoPlayer.supportedFormatsNone")}
          </span>
        );
      }

      return formats.map((format, index) => (
        <Fragment key={format.label}>
          {index > 0 ? ", " : null}
          <code>{format.label}</code>
          {format.support === "maybe" ? (
            <span className="text-muted-foreground">
              {" "}
              ({t("videoPlayer.supportedFormatsMaybe")})
            </span>
          ) : null}
        </Fragment>
      ));
    },
    [t],
  );

  if (!mediaUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <Label className="cursor-pointer text-xl hover:text-blue-800 underline">
          {t("videoPlayer.loadFile")}
          <Input
            className="hidden"
            type="file"
            accept="audio/*,video/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setMediaFile(file);
              setMediaFileName(file.name);
            }}
          />
        </Label>
        <div className="my-4 px-8 space-y-1 text-base">
          <p className="font-medium">{t("videoPlayer.supportedFormats")}</p>
          {browserMediaSupport ? (
            <>
              <p>
                <span className="font-semibold">
                  {t("videoPlayer.supportedFormatsAudio")}:
                </span>{" "}
                {renderSupportedFormats(browserMediaSupport.audio)}
              </p>
              <p>
                <span className="font-semibold">
                  {t("videoPlayer.supportedFormatsVideo")}:
                </span>{" "}
                {renderSupportedFormats(browserMediaSupport.video)}
              </p>
            </>
          ) : (
            <p className="text-muted-foreground">
              {t("videoPlayer.supportedFormatsChecking")}
            </p>
          )}
          <p className="text-muted-foreground whitespace-pre-line">
            {t("videoPlayer.supportedFormatsNote")}
          </p>
          <p className="text-muted-foreground">
            {t("videoPlayer.supportedFormatsUnsupported")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex items-center justify-center bg-black overflow-hidden">
      <video
        key={mediaUrl}
        ref={setVideoRef}
        src={mediaUrl}
        className="w-full h-full object-contain"
        playsInline
        preload="metadata"
        controls={false}
        controlsList="nodownload"
        onTimeUpdate={(event) => {
          const player = event.currentTarget;
          if (!player.seeking) {
            onProgress(player.currentTime);
          }
        }}
        onSeeked={(event) => {
          onProgress(event.currentTarget.currentTime);
        }}
        onPlay={() => onPlayPause(true)}
        onPause={() => {
          const isHidden = typeof document !== "undefined" && document.hidden;
          if (playInBackground && isHidden) {
            return;
          }
          onPlayPause(false);
        }}
        onLoadedMetadata={handleLoadedMetadata}
        onLoadedData={handleLoadedMetadata}
        onDurationChange={(event) => onDuration(event.currentTarget.duration)}
      />
    </div>
  );
});

VideoPlayer.displayName = "VideoPlayer";

export default VideoPlayer;
