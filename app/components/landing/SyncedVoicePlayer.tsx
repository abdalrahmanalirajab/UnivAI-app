"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Slider from "@mui/material/Slider";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import Forward5Outlined from "@mui/icons-material/Forward5Outlined";
import PauseRounded from "@mui/icons-material/PauseRounded";
import PlayArrowRounded from "@mui/icons-material/PlayArrowRounded";
import ReplayRounded from "@mui/icons-material/ReplayRounded";
import Replay5Outlined from "@mui/icons-material/Replay5Outlined";
import VolumeUpOutlined from "@mui/icons-material/VolumeUpOutlined";
import audioPayload from "./quadratic-answer-audio.json";
import timing from "./quadratic-answer-timing.json";

const AUDIO_SOURCE = `data:${audioPayload.mimeType};base64,${audioPayload.base64}`;
const FALLBACK_DURATION = timing.at(-1)?.end ?? 0;

function formatTime(value: number) {
  const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;
  const minutes = Math.floor(safeValue / 60);
  const seconds = Math.floor(safeValue % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

type SyncedVoicePlayerProps = {
  answer: string;
};

export default function SyncedVoicePlayer({
  answer,
}: SyncedVoicePlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(FALLBACK_DURATION);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackError, setPlaybackError] = useState("");

  const updateFromAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    setCurrentTime(audio.currentTime);
    if (Number.isFinite(audio.duration)) {
      setDuration(audio.duration);
    }
  }, []);

  const stopAnimationFrame = useCallback(() => {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const followPlayhead = () => {
      updateFromAudio();
      if (!audio.paused && !audio.ended) {
        animationFrameRef.current =
          window.requestAnimationFrame(followPlayhead);
      }
    };
    const handlePlay = () => {
      setIsPlaying(true);
      setPlaybackError("");
      stopAnimationFrame();
      animationFrameRef.current =
        window.requestAnimationFrame(followPlayhead);
    };
    const handlePause = () => {
      setIsPlaying(false);
      stopAnimationFrame();
      updateFromAudio();
    };
    const handleEnded = () => {
      setIsPlaying(false);
      stopAnimationFrame();
      updateFromAudio();
    };
    const handleError = () => {
      setIsPlaying(false);
      setPlaybackError("The saved voice could not be played.");
    };

    audio.addEventListener("loadedmetadata", updateFromAudio);
    audio.addEventListener("durationchange", updateFromAudio);
    audio.addEventListener("timeupdate", updateFromAudio);
    audio.addEventListener("seeking", updateFromAudio);
    audio.addEventListener("seeked", updateFromAudio);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    return () => {
      stopAnimationFrame();
      audio.removeEventListener("loadedmetadata", updateFromAudio);
      audio.removeEventListener("durationchange", updateFromAudio);
      audio.removeEventListener("timeupdate", updateFromAudio);
      audio.removeEventListener("seeking", updateFromAudio);
      audio.removeEventListener("seeked", updateFromAudio);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
    };
  }, [stopAnimationFrame, updateFromAudio]);

  const activeWord = useMemo(
    () =>
      timing.findIndex(
        ({ start, end }) =>
          currentTime >= Math.max(0, start - 0.025) &&
          currentTime < end + 0.04,
      ),
    [currentTime],
  );

  const startPlayback = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    try {
      await audio.play();
    } catch {
      setPlaybackError("Playback needs another click in this browser.");
    }
  };

  const waitForSeek = (audio: HTMLAudioElement) =>
    new Promise<void>((resolve) => {
      if (!audio.seeking) {
        resolve();
        return;
      }

      const finish = () => {
        window.clearTimeout(timeout);
        audio.removeEventListener("seeked", finish);
        resolve();
      };
      const timeout = window.setTimeout(finish, 1500);
      audio.addEventListener("seeked", finish, { once: true });
    });

  const restartAndPlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.pause();
    audio.currentTime = 0;
    updateFromAudio();
    await waitForSeek(audio);
    await startPlayback();
  };

  const play = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.ended || audio.currentTime >= duration - 0.04) {
      await restartAndPlay();
      return;
    }

    await startPlayback();
  };

  const handlePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      void play();
    } else {
      audio.pause();
    }
  };

  const seekTo = (nextTime: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.currentTime = Math.min(Math.max(nextTime, 0), duration);
    updateFromAudio();
  };

  const handleReplay = () => {
    void restartAndPlay();
  };

  const handleSliderChange = (_event: Event, value: number | number[]) => {
    seekTo(Array.isArray(value) ? value[0] : value);
  };

  return (
    <Stack className="synced-voice-player" spacing={1.5}>
      <Box
        component="audio"
        ref={audioRef}
        preload="metadata"
        aria-hidden="true"
        className="voice-audio-element"
      >
        <source src={AUDIO_SOURCE} type={audioPayload.mimeType} />
      </Box>

      <Stack
        direction="row"
        spacing={1}
        className="voice-control-row align-center"
      >
        <Button
          variant="contained"
          color="secondary"
          startIcon={
            isPlaying ? <PauseRounded /> : <PlayArrowRounded />
          }
          onClick={handlePlayPause}
          aria-label={isPlaying ? "Pause spoken answer" : "Play spoken answer"}
        >
          {isPlaying
            ? "Pause"
            : currentTime >= duration - 0.04
              ? "Play again"
              : "Play answer"}
        </Button>

        <Tooltip title="Rewind 5 seconds">
          <IconButton
            onClick={() => seekTo(currentTime - 5)}
            aria-label="Rewind spoken answer 5 seconds"
          >
            <Replay5Outlined />
          </IconButton>
        </Tooltip>
        <Tooltip title="Forward 5 seconds">
          <IconButton
            onClick={() => seekTo(currentTime + 5)}
            aria-label="Forward spoken answer 5 seconds"
          >
            <Forward5Outlined />
          </IconButton>
        </Tooltip>
        <Tooltip title="Replay from the beginning">
          <IconButton
            onClick={handleReplay}
            aria-label="Replay spoken answer from the beginning"
          >
            <ReplayRounded />
          </IconButton>
        </Tooltip>

        <Chip
          size="small"
          icon={<VolumeUpOutlined />}
          color={isPlaying ? "secondary" : "default"}
          label={isPlaying ? "Speaking" : "Premade voice"}
          className="voice-status-chip"
        />
      </Stack>

      <Typography
        variant="body1"
        className="synced-transcript"
        aria-label={answer}
        data-generated-content="true"
        lang="en"
        dir="ltr"
      >
        {timing.map(({ word }, index) => (
          <Box
            component="span"
            key={`${word}-${index}`}
            aria-hidden="true"
            className={
              index === activeWord
                ? "synced-word synced-word-active"
                : "synced-word"
            }
          >
            {word}
            {index < timing.length - 1 ? " " : ""}
          </Box>
        ))}
      </Typography>

      <Stack
        direction="row"
        spacing={1.5}
        className="voice-timeline-row align-center"
      >
        <Typography variant="caption" className="voice-time">
          {formatTime(currentTime)}
        </Typography>
        <Slider
          min={0}
          max={duration || FALLBACK_DURATION}
          step={0.01}
          value={Math.min(currentTime, duration || FALLBACK_DURATION)}
          onChange={handleSliderChange}
          aria-label="Spoken answer position"
          valueLabelDisplay="auto"
          valueLabelFormat={formatTime}
          className="voice-timeline"
        />
        <Typography variant="caption" className="voice-time">
          {formatTime(duration)}
        </Typography>
      </Stack>

      <Typography
        variant="caption"
        color={playbackError ? "error" : "text.secondary"}
        role={playbackError ? "alert" : undefined}
      >
        {playbackError ||
          "The highlighted word follows the saved audio when you play, pause, or seek."}
      </Typography>
    </Stack>
  );
}
