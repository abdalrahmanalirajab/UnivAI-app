import type { DemoLectureManifest } from "./demo-media-contract";

export type DemoLectureIntent =
  | { kind: "seek"; cueIndex: number; message: string }
  | { kind: "resume"; cueIndex: number }
  | { kind: "clarify_previous"; previousSlideCue: number | null; previousWeekAvailable: boolean }
  | { kind: "confirm_previous_week"; previousWeekAvailable: boolean }
  | { kind: "message"; message: string }
  | { kind: "question"; contextCue: number; contextSlide: number };

function normalized(value: string): string {
  return value.toLocaleLowerCase().replace(/[“”"'`.,!?;:،؟]/gu, " ").replace(/\s+/gu, " ").trim();
}

function previousDistinctSlide(manifest: DemoLectureManifest, cueIndex: number): number | null {
  const currentSlide = manifest.cues[cueIndex]?.slide;
  for (let index = Math.min(cueIndex - 1, manifest.cues.length - 1); index >= 0; index -= 1) {
    if (manifest.cues[index].slide !== currentSlide) return manifest.cues[index].slide;
  }
  return null;
}

function firstCueForSlide(manifest: DemoLectureManifest, slide: number | null): number | null {
  if (slide === null) return null;
  const cue = manifest.cues.find((candidate) => candidate.slide === slide);
  return cue?.flatCueIndex ?? null;
}

export function classifyDemoLectureIntent(input: {
  question: string;
  manifest: DemoLectureManifest;
  currentCue: number;
  furthestCompletedCue: number;
  previousWeekAvailable: boolean;
}): DemoLectureIntent {
  const phrase = normalized(input.question);
  const currentCue = Math.min(Math.max(0, input.currentCue), input.manifest.cues.length - 1);
  const lastCompleted = Math.max(0, Math.min(input.manifest.cues.length - 1, input.furthestCompletedCue - 1));
  const previousSlide = previousDistinctSlide(input.manifest, currentCue);
  const previousSlideCue = firstCueForSlide(input.manifest, previousSlide);

  if (/^(can you )?(please )?(repeat|replay) (the )?previous lecture( please)?$/.test(phrase)) {
    return { kind: "clarify_previous", previousSlideCue, previousWeekAvailable: input.previousWeekAvailable };
  }
  if (/\b(open|replay|play|show) (the )?(last|previous) week/.test(phrase)) {
    return { kind: "confirm_previous_week", previousWeekAvailable: input.previousWeekAvailable };
  }
  if (/\b(repeat|replay|say) (the )?(last|previous) three (sentences|lines)\b/.test(phrase) || /كرر.*(ثلاث|3).*جمل/u.test(phrase)) {
    return { kind: "seek", cueIndex: Math.max(0, input.furthestCompletedCue - 3), message: "Replaying the last three sentences." };
  }
  if (/\b(repeat|replay|say) (what you just said|that again|the last sentence|the previous sentence)\b/.test(phrase) || /^(say that again|repeat that)$/.test(phrase) || /كرر.*(الجملة|اللي قلته)/u.test(phrase)) {
    return { kind: "seek", cueIndex: lastCompleted, message: "Replaying the last sentence." };
  }
  if (/^(continue|resume|go on|carry on|تابع|استمر)$/u.test(phrase)) {
    return { kind: "resume", cueIndex: Math.min(input.manifest.cues.length - 1, input.furthestCompletedCue) };
  }
  if (/\b(show|go|take me|move|repeat|replay) (back )?(to )?(the )?(previous|last) slide(?: again)?\b/.test(phrase) || /(?:اعرض|ارجع|كرر).*الشريحة السابقة/u.test(phrase)) {
    return previousSlideCue === null
      ? { kind: "message", message: "There is no previous slide in this lecture yet." }
      : { kind: "seek", cueIndex: previousSlideCue, message: `Returning to slide ${previousSlide}.` };
  }
  if (/\b(show|go to|move to) (the )?(next|following) slide\b/.test(phrase) || /(?:اعرض|اذهب).*الشريحة التالية/u.test(phrase)) {
    return { kind: "message", message: "I will keep the future slide hidden until the narration reaches it." };
  }

  const numbered = /\b(?:slide|page)\s*(?:number|no)?\s*#?\s*(\d{1,4})\b/.exec(phrase) ?? /(?:الشريحة|السلايد)\s*(?:رقم)?\s*(\d{1,4})/u.exec(phrase);
  if (numbered) {
    const slide = Number(numbered[1]);
    const target = firstCueForSlide(input.manifest, slide);
    if (target === null) return { kind: "message", message: `Slide ${slide} is not available in this lecture.` };
    if (target > Math.max(currentCue, lastCompleted)) return { kind: "message", message: `Slide ${slide} stays hidden until the narration reaches it.` };
    if (/\b(show|go|move|open)\b/.test(phrase) || /(?:اعرض|اذهب|افتح)/u.test(phrase)) {
      return { kind: "seek", cueIndex: target, message: `Returning to slide ${slide}.` };
    }
    return { kind: "question", contextCue: target, contextSlide: slide };
  }

  if (/\b(previous|last) slide\b/.test(phrase) || /الشريحة السابقة/u.test(phrase)) {
    if (previousSlideCue === null || previousSlide === null) return { kind: "message", message: "There is no previous slide to explain yet." };
    return { kind: "question", contextCue: previousSlideCue, contextSlide: previousSlide };
  }
  return { kind: "question", contextCue: currentCue, contextSlide: input.manifest.cues[currentCue].slide };
}
