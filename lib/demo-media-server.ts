import "server-only";

import { createHash } from "node:crypto";
import { open, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { env } from "./env";
import { queryOne } from "./db";
import { getSectionPack, type Script, type StoredSectionPack } from "./lectures";
import {
  assertVttMatchesManifest,
  parseDemoVtt,
  splitDemoSentences,
  validateDemoLectureManifest,
  validateDemoSectionManifest,
  type DemoLectureManifest,
  type DemoMediaFile,
  type DemoSectionManifest,
} from "./demo-media-contract";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;

type LectureRow = {
  internal_id: number;
  public_id: string;
  week: number;
  title: string;
  starts_at: Date;
  artifact_id: string;
  script_payload: Script;
  slides_payload: { slides?: Array<{ slide?: number }> };
  programme_id: number;
  plan_version: number;
  joined_at: Date | null;
  completed_at: Date | null;
  last_sentence_index: number | null;
  total_sentences: number | null;
  demo_media_script_digest: string | null;
  demo_media_artifact_id: string | null;
  demo_media_plan_version: number | null;
  demo_media_current_cue: number | null;
  demo_media_checkpoint_version: number | null;
};

export type AuthorizedLectureBundle = {
  row: LectureRow;
  manifest: DemoLectureManifest;
  vtt: string;
  directory: string;
};

export type AuthorizedSectionBundle = {
  section: StoredSectionPack;
  manifest: DemoSectionManifest;
  directory: string;
};

type CachedLecture = {
  key: string;
  manifest: DemoLectureManifest;
  vtt: string;
};
const lectureCache = new Map<string, CachedLecture>();

function mediaRoot(): string {
  return path.resolve(env.DEMO_MEDIA_ROOT);
}

function lecturesRoot(): string {
  return path.resolve(env.LECTURES_ROOT);
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function demoScriptDigest(script: Script): string {
  const spoken = (script.segments ?? []).map((segment) => String(segment.text ?? ""));
  return sha256(JSON.stringify(spoken));
}

function safeChild(root: string, ...parts: string[]): string {
  for (const part of parts) {
    if (!part || part === "." || part === ".." || part.includes("/") || part.includes("\\")) {
      throw new Error("Unsafe demo-media path");
    }
  }
  const candidate = path.resolve(root, ...parts);
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) throw new Error("Unsafe demo-media path");
  return candidate;
}

function bundleFile(directory: string, relative: string): string {
  const candidate = path.resolve(directory, ...relative.replaceAll("\\", "/").split("/"));
  if (!candidate.startsWith(`${directory}${path.sep}`)) throw new Error("Unsafe manifest media path");
  return candidate;
}

async function fileDigest(file: string): Promise<string> {
  return sha256(await readFile(file));
}

function wavDurationMs(buffer: Buffer): number {
  if (buffer.length < 44 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Demo audio is not a valid WAV file");
  }
  let offset = 12;
  let byteRate = 0;
  let dataLength = 0;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (id === "fmt " && size >= 16) byteRate = buffer.readUInt32LE(offset + 16);
    if (id === "data") { dataLength = size; break; }
    offset += 8 + size + (size % 2);
  }
  if (!byteRate || !dataLength || dataLength > buffer.length) throw new Error("Demo WAV metadata is invalid");
  return Math.round((dataLength / byteRate) * 1_000);
}

async function verifyFile(directory: string, file: DemoMediaFile, audio = false): Promise<void> {
  const target = bundleFile(directory, file.path);
  const info = await stat(target);
  if (!info.isFile() || info.size !== file.byteLength || await fileDigest(target) !== file.sha256) {
    throw new Error(`Demo-media integrity check failed for ${file.path}`);
  }
  if (audio) {
    const duration = wavDurationMs(await readFile(target));
    if (Math.abs(duration - Number(file.durationMs)) > 2) throw new Error(`Demo-media duration check failed for ${file.path}`);
  }
}

async function lectureRow(sid: string, lectureId: string): Promise<LectureRow | null> {
  if (!UUID.test(lectureId)) return null;
  return queryOne<LectureRow>(
    `SELECT l.id AS internal_id, l.public_id::text AS public_id, l.week, l.title,
            l.starts_at, la.artifact_id::text AS artifact_id, la.script_payload,
            la.slides_payload, programme.id AS programme_id,
            programme.plan_version, a.joined_at, a.completed_at,
            a.last_sentence_index, a.total_sentences,
            a.demo_media_script_digest, a.demo_media_current_cue,
            a.demo_media_checkpoint_version,
            a.demo_media_artifact_id::text AS demo_media_artifact_id,
            a.demo_media_plan_version
       FROM lectures AS l
       JOIN lecture_artifacts AS la ON la.artifact_id = l.lecture_artifact_id
       JOIN LATERAL (
         SELECT p.id, p.plan_version
           FROM programmes AS p
          WHERE p.student_id = l.student_id AND p.status = 'approved'
          ORDER BY p.id DESC LIMIT 1
       ) AS programme ON TRUE
       LEFT JOIN attendance AS a
         ON a.lecture_id = l.id AND a.student_id = l.student_id
      WHERE l.public_id = $1::uuid AND l.student_id = $2`,
    [lectureId, sid],
  );
}

export async function loadAuthorizedLectureBundle(sid: string, lectureId: string): Promise<AuthorizedLectureBundle | null> {
  const row = await lectureRow(sid, lectureId);
  if (!row) return null;
  const digest = demoScriptDigest(row.script_payload);
  let directory = safeChild(lecturesRoot(), sid, `week-${row.week}`, "demo-media", row.artifact_id, `plan-${row.plan_version}`, digest);
  let accountScoped = true;
  let manifestPath = bundleFile(directory, "manifest.json");
  let manifestStat = await stat(manifestPath).catch(() => null);
  // A generator that was already running during this layout change may finish
  // one legacy bundle. Serve it through the same account-authorized DB gate;
  // every new generation and backfill writes only to the account/week path.
  if (!manifestStat?.isFile()) {
    directory = safeChild(mediaRoot(), "lectures", row.artifact_id, `plan-${row.plan_version}`, digest);
    accountScoped = false;
    manifestPath = bundleFile(directory, "manifest.json");
    manifestStat = await stat(manifestPath).catch(() => null);
  }
  if (!manifestStat?.isFile()) throw new Error("This lecture's demo audio has not been prepared");
  const cacheKey = `${manifestPath}:${manifestStat.size}:${manifestStat.mtimeMs}`;
  let cached = lectureCache.get(cacheKey);
  if (!cached) {
    const rawManifest = JSON.parse(await readFile(manifestPath, "utf8")) as unknown;
    const sentences = row.script_payload.segments.flatMap((segment, segmentIndex) =>
      splitDemoSentences(segment.text).map((sentence, sentenceIndex) => ({
        text: sentence,
        slide: segment.slide,
        segmentIndex,
        sentenceIndex,
        pages: [...new Set((segment.citations ?? []).map((citation) => citation.page).filter((page) => Number.isInteger(page) && page > 0))].sort((a, b) => a - b),
      })),
    );
    // The presentation renderer always creates slide 1 as its cover; the
    // stored teaching-slide payload starts at slide 2.
    const slides = new Set([1, ...(row.slides_payload.slides ?? []).map((slide) => Number(slide.slide)).filter((slide) => Number.isInteger(slide) && slide > 0)]);
    const manifest = validateDemoLectureManifest(rawManifest, {
      studentId: sid,
      requireStudentId: accountScoped,
      lecturePublicId: row.public_id,
      artifactId: row.artifact_id,
      planVersion: row.plan_version,
      scriptDigest: digest,
      sentences,
      slides,
    });
    const vtt = await readFile(bundleFile(directory, manifest.captions.path), "utf8");
    assertVttMatchesManifest(parseDemoVtt(vtt), manifest);
    if (sha256(vtt) !== manifest.captions.sha256) throw new Error("Demo caption hash is invalid");
    await Promise.all([
      verifyFile(directory, manifest.audio, true),
      verifyFile(directory, manifest.welcomeBack, true),
      verifyFile(directory, manifest.firstJoin, true),
    ]);
    cached = { key: cacheKey, manifest, vtt };
    lectureCache.clear();
    lectureCache.set(cacheKey, cached);
  }
  return { row, manifest: cached.manifest, vtt: cached.vtt, directory };
}

export async function loadAuthorizedSectionBundle(sid: string, sectionId: string): Promise<AuthorizedSectionBundle | null> {
  if (!UUID.test(sectionId)) return null;
  const section = await getSectionPack(sid, sectionId);
  if (!section) return null;
  const directory = safeChild(mediaRoot(), "sections", section.id, `plan-${section.planVersion}`, section.payloadHash);
  const manifestPath = bundleFile(directory, "manifest.json");
  const raw = JSON.parse(await readFile(manifestPath, "utf8").catch(() => {
    throw new Error("This section's demo audio has not been prepared");
  })) as unknown;
  const manifest = validateDemoSectionManifest(raw, {
    sectionPackId: section.id,
    planVersion: section.planVersion,
    payloadHash: section.payloadHash,
  });
  const payload = section.payload;
  if (
    payload.schema_name !== "univai.section.pack" ||
    payload.schema_version !== "1.0.0" ||
    payload.session_type !== "section" ||
    payload.user_id !== sid ||
    Number(payload.week_number) !== section.week ||
    String(payload.plan_version) !== String(section.planVersion) ||
    payload.programme_title !== section.programmeTitle
  ) {
    throw new Error("The stored section pack identity is invalid");
  }
  const contentText = (item: Record<string, unknown>, ...keys: string[]) =>
    keys.map((key) => String(item[key] ?? "").trim()).filter(Boolean).join(" ").trim();
  const expectedNodes: Array<{ state: string; activityIndex: number | null; stepIndex: number | null; text: string }> = [];
  const objectives = Array.isArray(payload.objectives) ? payload.objectives.map(String).filter((value) => value.trim()) : [];
  expectedNodes.push({ state: "intro", activityIndex: null, stepIndex: null, text: [String(payload.title || "Section practice"), ...objectives].join(". ") });
  const examples = Array.isArray(payload.examples) ? payload.examples : [];
  examples.forEach((rawExample, activityIndex) => {
    if (!rawExample || typeof rawExample !== "object" || Array.isArray(rawExample)) throw new Error("A section example is invalid");
    const example = rawExample as Record<string, unknown>;
    const prompt = contentText(example, "prompt", "description");
    if (prompt) expectedNodes.push({ state: "example", activityIndex, stepIndex: null, text: prompt });
    const steps = Array.isArray(example.steps) ? example.steps : [];
    steps.forEach((rawStep, stepIndex) => {
      if (!rawStep || typeof rawStep !== "object" || Array.isArray(rawStep)) throw new Error("A section example step is invalid");
      expectedNodes.push({ state: "example", activityIndex, stepIndex, text: contentText(rawStep as Record<string, unknown>, "step", "explanation", "conclusion") });
    });
  });
  const activities = Array.isArray(payload.activities) ? payload.activities : [];
  activities.forEach((rawActivity, activityIndex) => {
    if (!rawActivity || typeof rawActivity !== "object" || Array.isArray(rawActivity)) throw new Error("A section activity is invalid");
    expectedNodes.push({ state: "guided_task", activityIndex, stepIndex: null, text: contentText(rawActivity as Record<string, unknown>, "title", "description", "prompt") });
  });
  const todos = Array.isArray(payload.todos) ? payload.todos : [];
  const recap = todos.filter((todo): todo is Record<string, unknown> => Boolean(todo && typeof todo === "object" && !Array.isArray(todo))).map((todo) => contentText(todo, "text", "title", "description")).filter(Boolean).join(". ");
  if (recap) expectedNodes.push({ state: "todo_recap", activityIndex: null, stepIndex: null, text: recap });
  if (manifest.nodes.length !== expectedNodes.length) throw new Error("The section media does not cover every static pack node");
  manifest.nodes.forEach((node, index) => {
    const expected = expectedNodes[index];
    if (!expected || node.state !== expected.state || node.activityIndex !== expected.activityIndex || node.stepIndex !== expected.stepIndex || node.text !== expected.text) {
      throw new Error(`Section media node ${index} does not match the current pack`);
    }
  });
  await Promise.all([
    verifyFile(directory, manifest.welcomeBack, true),
    ...manifest.nodes.map((node) => verifyFile(directory, node.audio, true)),
  ]);
  return { section, manifest, directory };
}

export function lectureAsset(bundle: AuthorizedLectureBundle, asset: string): { file: string; media: DemoMediaFile } | null {
  const mapping: Record<string, DemoMediaFile> = {
    audio: bundle.manifest.audio,
    vtt: bundle.manifest.captions,
    welcome: bundle.manifest.welcomeBack,
    "first-join": bundle.manifest.firstJoin,
  };
  if (asset === "manifest") {
    return { file: bundleFile(bundle.directory, "manifest.json"), media: { path: "manifest.json", mimeType: "application/json; charset=utf-8", sha256: "", byteLength: 0 } };
  }
  const media = mapping[asset];
  return media ? { file: bundleFile(bundle.directory, media.path), media } : null;
}

export function sectionAsset(bundle: AuthorizedSectionBundle, asset: string): { file: string; media: DemoMediaFile } | null {
  if (asset === "manifest") {
    return { file: bundleFile(bundle.directory, "manifest.json"), media: { path: "manifest.json", mimeType: "application/json; charset=utf-8", sha256: "", byteLength: 0 } };
  }
  if (asset === "welcome") return { file: bundleFile(bundle.directory, bundle.manifest.welcomeBack.path), media: bundle.manifest.welcomeBack };
  const node = bundle.manifest.nodes.find((candidate) => candidate.id === asset);
  return node ? { file: bundleFile(bundle.directory, node.audio.path), media: node.audio } : null;
}

export async function serveDemoMediaFile(request: Request, target: { file: string; media: DemoMediaFile }): Promise<Response> {
  const info = await stat(target.file);
  if (!info.isFile()) return new Response(null, { status: 404 });
  const size = info.size;
  const digest = target.media.sha256 || await fileDigest(target.file);
  const etag = `"${digest}"`;
  const baseHeaders = new Headers({
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=0, must-revalidate",
    "Content-Type": target.media.mimeType,
    ETag: etag,
    Vary: "Cookie",
  });
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: baseHeaders });
  const range = request.headers.get("range");
  let start = 0;
  let end = size - 1;
  let statusCode = 200;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!match || (!match[1] && !match[2])) {
      baseHeaders.set("Content-Range", `bytes */${size}`);
      return new Response(null, { status: 416, headers: baseHeaders });
    }
    if (!match[1]) {
      const suffix = Number(match[2]);
      if (!Number.isInteger(suffix) || suffix <= 0) {
        baseHeaders.set("Content-Range", `bytes */${size}`);
        return new Response(null, { status: 416, headers: baseHeaders });
      }
      start = Math.max(0, size - suffix);
    } else {
      start = Number(match[1]);
      end = match[2] ? Number(match[2]) : end;
    }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) {
      baseHeaders.set("Content-Range", `bytes */${size}`);
      return new Response(null, { status: 416, headers: baseHeaders });
    }
    end = Math.min(end, size - 1);
    statusCode = 206;
    baseHeaders.set("Content-Range", `bytes ${start}-${end}/${size}`);
  }
  const length = end - start + 1;
  baseHeaders.set("Content-Length", String(length));
  if (request.method === "HEAD") return new Response(null, { status: statusCode, headers: baseHeaders });
  const handle = await open(target.file, "r");
  try {
    const body = Buffer.alloc(length);
    let filled = 0;
    while (filled < length) {
      const { bytesRead } = await handle.read(body, filled, length - filled, start + filled);
      if (!bytesRead) break;
      filled += bytesRead;
    }
    if (filled !== length) throw new Error("Demo-media file changed while it was being served");
    return new Response(body, { status: statusCode, headers: baseHeaders });
  } finally {
    await handle.close();
  }
}

export async function demoMediaReadiness(): Promise<{ ready: boolean; lectureBundles: number; sectionBundles: number }> {
  const { readdir } = await import("node:fs/promises");
  const declaredFileExists = async (directory: string, media: DemoMediaFile) => {
    const info = await stat(bundleFile(directory, media.path)).catch(() => null);
    return Boolean(info?.isFile() && info.size === media.byteLength);
  };
  const lectureKeys = new Set<string>();
  const registerLecture = async (directory: string, artifactId: string, planVersion: number, digest: string, sid?: string) => {
    try {
      const raw = JSON.parse(await readFile(bundleFile(directory, "manifest.json"), "utf8")) as unknown;
      const manifest = validateDemoLectureManifest(raw);
      if (manifest.artifactId !== artifactId || manifest.planVersion !== planVersion || manifest.scriptDigest !== digest) return;
      if (sid && manifest.studentId !== sid) return;
      const vtt = await readFile(bundleFile(directory, manifest.captions.path), "utf8");
      assertVttMatchesManifest(parseDemoVtt(vtt), manifest);
      if (sha256(vtt) !== manifest.captions.sha256) return;
      const files = [manifest.audio, manifest.captions, manifest.welcomeBack, manifest.firstJoin];
      if (!(await Promise.all(files.map((media) => declaredFileExists(directory, media)))).every(Boolean)) return;
      lectureKeys.add(manifest.lecturePublicId);
    } catch { /* invalid bundles are not ready */ }
  };
  const countAccountLectures = async () => {
    const accounts = await readdir(lecturesRoot(), { withFileTypes: true }).catch(() => []);
    for (const account of accounts) {
      if (!account.isDirectory()) continue;
      const weeks = await readdir(safeChild(lecturesRoot(), account.name), { withFileTypes: true }).catch(() => []);
      for (const week of weeks) {
        if (!week.isDirectory() || !/^week-[1-9][0-9]*$/.test(week.name)) continue;
        const root = safeChild(lecturesRoot(), account.name, week.name, "demo-media");
        const artifacts = await readdir(root, { withFileTypes: true }).catch(() => []);
        for (const artifact of artifacts) {
          if (!artifact.isDirectory() || !UUID.test(artifact.name)) continue;
          const plans = await readdir(safeChild(root, artifact.name), { withFileTypes: true }).catch(() => []);
          for (const plan of plans) {
            const planMatch = /^plan-([1-9][0-9]*)$/.exec(plan.name);
            if (!plan.isDirectory() || !planMatch) continue;
            const versions = await readdir(safeChild(root, artifact.name, plan.name), { withFileTypes: true }).catch(() => []);
            for (const version of versions) {
              if (!version.isDirectory() || !SHA256.test(version.name)) continue;
              await registerLecture(
                safeChild(root, artifact.name, plan.name, version.name),
                artifact.name,
                Number(planMatch[1]),
                version.name,
                account.name,
              );
            }
          }
        }
      }
    }
  };
  const countLegacyLectures = async () => {
    const root = safeChild(mediaRoot(), "lectures");
    const artifacts = await readdir(root, { withFileTypes: true }).catch(() => []);
    for (const artifact of artifacts) {
      if (!artifact.isDirectory() || !UUID.test(artifact.name)) continue;
      const plans = await readdir(safeChild(root, artifact.name), { withFileTypes: true }).catch(() => []);
      for (const plan of plans) {
        const planMatch = /^plan-([1-9][0-9]*)$/.exec(plan.name);
        if (!plan.isDirectory() || !planMatch) continue;
        const versions = await readdir(safeChild(root, artifact.name, plan.name), { withFileTypes: true }).catch(() => []);
        for (const version of versions) {
          if (!version.isDirectory() || !SHA256.test(version.name)) continue;
          await registerLecture(safeChild(root, artifact.name, plan.name, version.name), artifact.name, Number(planMatch[1]), version.name);
        }
      }
    }
  };
  const countSections = async () => {
    const root = safeChild(mediaRoot(), "sections");
    const owners = await readdir(root, { withFileTypes: true }).catch(() => []);
    let bundles = 0;
    for (const owner of owners) {
      if (!owner.isDirectory() || !UUID.test(owner.name)) continue;
      const plans = await readdir(safeChild(root, owner.name), { withFileTypes: true }).catch(() => []);
      for (const plan of plans) {
        const planMatch = /^plan-([1-9][0-9]*)$/.exec(plan.name);
        if (!plan.isDirectory() || !planMatch) continue;
        const versions = await readdir(safeChild(root, owner.name, plan.name), { withFileTypes: true }).catch(() => []);
        for (const version of versions) {
          if (!version.isDirectory() || !SHA256.test(version.name)) continue;
          const directory = safeChild(root, owner.name, plan.name, version.name);
          try {
            const raw = JSON.parse(await readFile(bundleFile(directory, "manifest.json"), "utf8")) as unknown;
            const manifest = validateDemoSectionManifest(raw);
            if (manifest.sectionPackId !== owner.name || manifest.planVersion !== Number(planMatch[1]) || manifest.payloadHash !== version.name) continue;
            const files = [manifest.welcomeBack, ...manifest.nodes.map((node) => node.audio)];
            if (!(await Promise.all(files.map((media) => declaredFileExists(directory, media)))).every(Boolean)) continue;
            bundles += 1;
          } catch { /* invalid bundles are not ready */ }
        }
      }
    }
    return bundles;
  };
  const [, , sectionBundles] = await Promise.all([countAccountLectures(), countLegacyLectures(), countSections()]);
  const lectureBundles = lectureKeys.size;
  return { ready: lectureBundles > 0 && sectionBundles > 0, lectureBundles, sectionBundles };
}
