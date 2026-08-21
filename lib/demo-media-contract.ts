export const DEMO_LECTURE_SCHEMA = "univai.demo-media.lecture" as const;
export const DEMO_SECTION_SCHEMA = "univai.demo-media.section" as const;
export const DEMO_MEDIA_VERSION = "1.0.0" as const;

const SHA256 = /^[a-f0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type DemoMediaFile = {
  path: string;
  mimeType: string;
  sha256: string;
  durationMs?: number;
  byteLength: number;
};

export type DemoLectureCue = {
  id: string;
  startMs: number;
  endMs: number;
  slide: number;
  segmentIndex: number;
  sentenceIndex: number;
  flatCueIndex: number;
  text: string;
  pages: number[];
};

export type DemoLectureManifest = {
  schema: typeof DEMO_LECTURE_SCHEMA;
  version: typeof DEMO_MEDIA_VERSION;
  studentId: string | null;
  lecturePublicId: string;
  artifactId: string;
  planVersion: number;
  scriptDigest: string;
  audio: DemoMediaFile & { durationMs: number };
  captions: DemoMediaFile;
  welcomeBack: DemoMediaFile & { durationMs: number };
  firstJoin: DemoMediaFile & { durationMs: number };
  sourcePages: number[];
  slideMapping: number[];
  cues: DemoLectureCue[];
};

export type DemoSectionNode = {
  id: string;
  state: "intro" | "example" | "guided_task" | "todo_recap";
  activityIndex: number | null;
  stepIndex: number | null;
  title: string;
  text: string;
  citations: Array<Record<string, unknown>>;
  audio: DemoMediaFile & { durationMs: number };
};

export type DemoSectionManifest = {
  schema: typeof DEMO_SECTION_SCHEMA;
  version: typeof DEMO_MEDIA_VERSION;
  sectionPackId: string;
  planVersion: number;
  payloadHash: string;
  welcomeBack: DemoMediaFile & { durationMs: number };
  nodes: DemoSectionNode[];
};

export type ParsedVttCue = {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
};

type LectureExpectation = {
  studentId?: string;
  requireStudentId?: boolean;
  lecturePublicId: string;
  artifactId: string;
  planVersion: number;
  scriptDigest: string;
  sentences: Array<{
    text: string;
    slide: number;
    segmentIndex: number;
    sentenceIndex: number;
    pages: number[];
  }>;
  slides: Set<number>;
};

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required`);
  return value;
}

function integer(value: unknown, label: string, minimum = 0): number {
  if (!Number.isInteger(value) || Number(value) < minimum) {
    throw new Error(`${label} must be an integer >= ${minimum}`);
  }
  return Number(value);
}

function finite(value: unknown, label: string, minimum = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) {
    throw new Error(`${label} must be finite and >= ${minimum}`);
  }
  return value;
}

function safePath(value: unknown, label: string): string {
  const result = text(value, label).replaceAll("\\", "/");
  if (result.startsWith("/") || result.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`${label} is unsafe`);
  }
  return result;
}

function mediaFile(value: unknown, label: string, durationRequired: boolean): DemoMediaFile {
  const item = record(value, label);
  const digest = text(item.sha256, `${label}.sha256`);
  if (!SHA256.test(digest)) throw new Error(`${label}.sha256 is invalid`);
  const result: DemoMediaFile = {
    path: safePath(item.path, `${label}.path`),
    mimeType: text(item.mimeType, `${label}.mimeType`),
    sha256: digest,
    byteLength: integer(item.byteLength, `${label}.byteLength`, 1),
  };
  if (durationRequired) result.durationMs = finite(item.durationMs, `${label}.durationMs`, 1);
  return result;
}

export function splitDemoSentences(value: string): string[] {
  return value.trim().split(/(?<=[.!?])\s+/u).map((part) => part.trim()).filter(Boolean);
}

export function validateDemoLectureManifest(
  value: unknown,
  expected?: LectureExpectation,
): DemoLectureManifest {
  const item = record(value, "lecture manifest");
  if (item.schema !== DEMO_LECTURE_SCHEMA || item.version !== DEMO_MEDIA_VERSION) {
    throw new Error("Unsupported lecture demo-media manifest");
  }
  const lecturePublicId = text(item.lecturePublicId, "lecturePublicId");
  const artifactId = text(item.artifactId, "artifactId");
  if (!UUID.test(lecturePublicId) || !UUID.test(artifactId)) throw new Error("Manifest UUID is invalid");
  const planVersion = integer(item.planVersion, "planVersion", 1);
  const scriptDigest = text(item.scriptDigest, "scriptDigest");
  if (!SHA256.test(scriptDigest)) throw new Error("scriptDigest is invalid");
  const rawCues = Array.isArray(item.cues) ? item.cues : [];
  if (!rawCues.length) throw new Error("Lecture manifest has no cues");
  let previousEnd = -1;
  const cueIds = new Set<string>();
  const cues = rawCues.map((raw, index): DemoLectureCue => {
    const cue = record(raw, `cues[${index}]`);
    const slide = integer(cue.slide, `cues[${index}].slide`, 1);
    const segmentIndex = integer(cue.segmentIndex, `cues[${index}].segmentIndex`);
    const sentenceIndex = integer(cue.sentenceIndex, `cues[${index}].sentenceIndex`);
    const flatCueIndex = integer(cue.flatCueIndex, `cues[${index}].flatCueIndex`);
    if (flatCueIndex !== index) throw new Error(`cues[${index}] is out of order`);
    const id = text(cue.id, `cues[${index}].id`);
    if (id !== `slide-${slide}.segment-${segmentIndex}.sentence-${sentenceIndex}` || cueIds.has(id)) {
      throw new Error(`cues[${index}].id is invalid or duplicated`);
    }
    cueIds.add(id);
    const startMs = finite(cue.startMs, `cues[${index}].startMs`);
    const endMs = finite(cue.endMs, `cues[${index}].endMs`, Number.EPSILON);
    if (startMs < previousEnd || endMs <= startMs) throw new Error(`cues[${index}] timing is invalid`);
    previousEnd = endMs;
    const pages = Array.isArray(cue.pages)
      ? cue.pages.map((page, pageIndex) => integer(page, `cues[${index}].pages[${pageIndex}]`, 1))
      : [];
    return { id, startMs, endMs, slide, segmentIndex, sentenceIndex, flatCueIndex, text: text(cue.text, `cues[${index}].text`), pages };
  });
  const audio = mediaFile(item.audio, "audio", true) as DemoLectureManifest["audio"];
  if (cues[cues.length - 1].endMs > audio.durationMs + 2) throw new Error("A cue exceeds the audio duration");
  const manifest: DemoLectureManifest = {
    schema: DEMO_LECTURE_SCHEMA,
    version: DEMO_MEDIA_VERSION,
    studentId: item.studentId === undefined ? null : text(item.studentId, "studentId"),
    lecturePublicId,
    artifactId,
    planVersion,
    scriptDigest,
    audio,
    captions: mediaFile(item.captions, "captions", false),
    welcomeBack: mediaFile(item.welcomeBack, "welcomeBack", true) as DemoLectureManifest["welcomeBack"],
    firstJoin: mediaFile(item.firstJoin, "firstJoin", true) as DemoLectureManifest["firstJoin"],
    sourcePages: Array.isArray(item.sourcePages) ? item.sourcePages.map((page, index) => integer(page, `sourcePages[${index}]`, 1)) : [],
    slideMapping: Array.isArray(item.slideMapping) ? item.slideMapping.map((slide, index) => integer(slide, `slideMapping[${index}]`, 1)) : [],
    cues,
  };
  if (expected) {
    if ((expected.requireStudentId && manifest.studentId !== expected.studentId) || (manifest.studentId !== null && expected.studentId && manifest.studentId !== expected.studentId)) {
      throw new Error("The lecture media belongs to another account");
    }
    if (lecturePublicId !== expected.lecturePublicId || artifactId !== expected.artifactId || planVersion !== expected.planVersion || scriptDigest !== expected.scriptDigest) {
      throw new Error("The demo-media bundle is stale for this lecture artifact");
    }
    if (cues.length !== expected.sentences.length) throw new Error("Cue count does not match the lecture script");
    cues.forEach((cue, index) => {
      const source = expected.sentences[index];
      if (!source || cue.text !== source.text || cue.slide !== source.slide || cue.segmentIndex !== source.segmentIndex || cue.sentenceIndex !== source.sentenceIndex || cue.pages.join(",") !== source.pages.join(",")) {
        throw new Error(`Cue ${index} does not match the current lecture script`);
      }
      if (!expected.slides.has(cue.slide)) throw new Error(`Cue ${index} references a missing slide`);
    });
  }
  return manifest;
}

export function parseDemoVtt(source: string): ParsedVttCue[] {
  const normalized = source.replace(/^\uFEFF/, "").replaceAll("\r\n", "\n").trim();
  if (!normalized.startsWith("WEBVTT")) throw new Error("Captions must start with WEBVTT");
  const blocks = normalized.slice(6).trim().split(/\n{2,}/u).filter(Boolean);
  return blocks.map((block, index) => {
    const lines = block.split("\n");
    if (lines.length < 3) throw new Error(`VTT cue ${index} is incomplete`);
    const timing = /^(\d{2,}):(\d{2}):(\d{2})\.(\d{3}) --> (\d{2,}):(\d{2}):(\d{2})\.(\d{3})$/.exec(lines[1].trim());
    if (!timing) throw new Error(`VTT cue ${index} timing is invalid`);
    const toMs = (offset: number) => (((Number(timing[offset]) * 60 + Number(timing[offset + 1])) * 60 + Number(timing[offset + 2])) * 1_000) + Number(timing[offset + 3]);
    return { id: lines[0].trim(), startMs: toMs(1), endMs: toMs(5), text: lines.slice(2).join("\n").trim() };
  });
}

export function assertVttMatchesManifest(vtt: ParsedVttCue[], manifest: DemoLectureManifest): void {
  if (vtt.length !== manifest.cues.length) throw new Error("VTT cue count does not match the manifest");
  vtt.forEach((cue, index) => {
    const expected = manifest.cues[index];
    if (cue.id !== expected.id || cue.startMs !== expected.startMs || cue.endMs !== expected.endMs || cue.text !== expected.text) {
      throw new Error(`VTT cue ${index} does not match the manifest`);
    }
  });
}

export function validateDemoSectionManifest(value: unknown, expected?: {
  sectionPackId: string;
  planVersion: number;
  payloadHash: string;
}): DemoSectionManifest {
  const item = record(value, "section manifest");
  if (item.schema !== DEMO_SECTION_SCHEMA || item.version !== DEMO_MEDIA_VERSION) throw new Error("Unsupported section demo-media manifest");
  const sectionPackId = text(item.sectionPackId, "sectionPackId");
  const planVersion = integer(item.planVersion, "planVersion", 1);
  const payloadHash = text(item.payloadHash, "payloadHash");
  if (!UUID.test(sectionPackId) || !SHA256.test(payloadHash)) throw new Error("Section manifest identity is invalid");
  const rawNodes = Array.isArray(item.nodes) ? item.nodes : [];
  if (!rawNodes.length) throw new Error("Section manifest has no audio nodes");
  const ids = new Set<string>();
  const nodes = rawNodes.map((raw, index): DemoSectionNode => {
    const node = record(raw, `nodes[${index}]`);
    const id = text(node.id, `nodes[${index}].id`);
    const state = node.state;
    if (!(["intro", "example", "guided_task", "todo_recap"] as unknown[]).includes(state)) throw new Error(`nodes[${index}].state is invalid`);
    if (ids.has(id)) throw new Error(`nodes[${index}].id is duplicated`);
    ids.add(id);
    const optionalIndex = (value: unknown, label: string) => value === null ? null : integer(value, label);
    return {
      id,
      state: state as DemoSectionNode["state"],
      activityIndex: optionalIndex(node.activityIndex, `nodes[${index}].activityIndex`),
      stepIndex: optionalIndex(node.stepIndex, `nodes[${index}].stepIndex`),
      title: text(node.title, `nodes[${index}].title`),
      text: text(node.text, `nodes[${index}].text`),
      citations: Array.isArray(node.citations) ? node.citations.map((citation, citationIndex) => record(citation, `nodes[${index}].citations[${citationIndex}]`)) : [],
      audio: mediaFile(node.audio, `nodes[${index}].audio`, true) as DemoSectionNode["audio"],
    };
  });
  const manifest: DemoSectionManifest = {
    schema: DEMO_SECTION_SCHEMA,
    version: DEMO_MEDIA_VERSION,
    sectionPackId,
    planVersion,
    payloadHash,
    welcomeBack: mediaFile(item.welcomeBack, "welcomeBack", true) as DemoSectionManifest["welcomeBack"],
    nodes,
  };
  if (expected && (sectionPackId !== expected.sectionPackId || planVersion !== expected.planVersion || payloadHash !== expected.payloadHash)) {
    throw new Error("The section demo-media bundle is stale");
  }
  return manifest;
}
