/**
 * LearningPath v1 — Cross-book serial prerequisite fixture.
 *
 * Temporary source of truth for the cross-book serial learning path contract
 * this app DISPLAYS: prerequisite edges, evidence, warnings, alternatives,
 * overrides and exact-version approval. The app never infers a prerequisite
 * itself — it only renders edges that exist in this validated contract — and
 * never auto-approves anything based on confidence or any other signal;
 * approval happens only via an explicit human action through the approve
 * route. Swap for the real Agent contract later without changing field names.
 *
 * Schema version: 1.0.0
 */

/**
 * Resolvable evidence for an edge. Follows the repo's citation resolvability
 * rule (CitationV1): a citation is actionable only when document identity,
 * book title and pages are all present; `null` on an edge means "source
 * unavailable", which consumers render explicitly instead of guessing.
 * `excerpt` stays nullable because older citations contain page-only
 * references.
 */
export type LearningPathEvidenceV1 = {
  /** documents.id (collections schema) / SourceCoverage.document_id. */
  document_id: number;
  /** Book title. */
  book_title: string;
  /** Page range (e.g. "1–350"), mirroring SourceCoverage.pages. */
  pages: string;
  /** Quoted excerpt; null when the citation is page-only. */
  excerpt: string | null;
};

/** A proposed alternative to the edge's prerequisite; the app only displays it. */
export type LearningPathAlternativeV1 = {
  /** Alternative book the Agent proposes as the prerequisite. */
  prerequisite_book_id: number;
  /** Why the Agent proposed it. */
  rationale: string;
  /** Resolvable evidence; null means "source unavailable". */
  evidence: LearningPathEvidenceV1 | null;
  /**
   * false = not yet resolved or chosen. Only an explicit human action may
   * resolve/choose an alternative; the app renders the unresolved state and
   * never auto-picks one.
   */
  resolved: boolean;
};

/** Human-recorded override of a proposed edge; the app only displays it. */
export type LearningPathOverrideV1 = {
  /** false = the override has not been decided; only a human may decide. */
  resolved: boolean;
  /** Why the human recorded the override; null until resolved. */
  reason: string | null;
};

/**
 * One directed cross-book prerequisite edge. Confidence is a 0..1 display
 * score: the app renders warnings from it but NEVER gates approval on it.
 */
export type LearningPathEdgeV1 = {
  /** The book the learner must study first. */
  prerequisite_book_id: number;
  /** The book that depends on the prerequisite. */
  dependent_book_id: number;
  /** 0..1, display-only; see the threshold note on lowConfidenceFixture. */
  confidence: number;
  /** Why the Agent proposed the edge. */
  rationale: string;
  /** Resolvable citation; null = "source unavailable", rendered explicitly. */
  evidence: LearningPathEvidenceV1 | null;
  /** Alternative/override options; empty when none were proposed. */
  alternatives: LearningPathAlternativeV1[];
  /** Human override; null until a human records one. */
  override: LearningPathOverrideV1 | null;
};

/** Book identity an edge refers to, resolved for display like plan.courses. */
export type LearningPathBookV1 = {
  id: number;
  title: string;
};

/**
 * Cross-book serial learning path v1. Versioning follows the repo's plan
 * convention: `plan_version` is a positive integer starting at 1,
 * incremented by 1 per revision, and approval targets an EXACT version — the
 * app never infers "the latest" itself.
 */
export type LearningPathV1 = {
  plan_version: number;
  books: LearningPathBookV1[];
  edges: LearningPathEdgeV1[];
};

const EVIDENCE_ALGEBRA: LearningPathEvidenceV1 = {
  document_id: 1,
  book_title: "Linear Algebra",
  pages: "1–120",
  excerpt:
    "The vector-space axioms in chapter 3 are assumed without restatement in every later chapter.",
};

const EVIDENCE_CALCULUS: LearningPathEvidenceV1 = {
  document_id: 2,
  book_title: "Calculus I",
  pages: "1–90",
  excerpt: "Chapter 1 defines the limit; the epsilon-delta argument is reused verbatim in chapter 7.",
};

/** A -> B -> C. Every edge has confidence, rationale and resolvable evidence. */
export const validChainABC: LearningPathV1 = {
  plan_version: 3,
  books: [
    { id: 1, title: "Linear Algebra" },
    { id: 2, title: "Calculus I" },
    { id: 3, title: "Mathematical Methods" },
  ],
  edges: [
    {
      prerequisite_book_id: 1,
      dependent_book_id: 2,
      confidence: 0.9,
      rationale:
        "Calculus I builds directly on the vector-space and matrix material in Linear Algebra; the Agent cites the axioms reused in chapters 3–7.",
      evidence: EVIDENCE_ALGEBRA,
      alternatives: [],
      override: null,
    },
    {
      prerequisite_book_id: 2,
      dependent_book_id: 3,
      confidence: 0.85,
      rationale:
        "Mathematical Methods opens by differentiating the single-variable results of Calculus I; the Agent cites the limit definition reused in its first chapter.",
      evidence: EVIDENCE_CALCULUS,
      alternatives: [],
      override: null,
    },
  ],
};

/**
 * A -> B -> A. Contains a cycle but is otherwise well-formed: every edge
 * carries full confidence, rationale and resolvable evidence.
 */
export const cycleFixture: LearningPathV1 = {
  plan_version: 1,
  books: [
    { id: 1, title: "Linear Algebra" },
    { id: 2, title: "Calculus I" },
  ],
  edges: [
    {
      prerequisite_book_id: 1,
      dependent_book_id: 2,
      confidence: 0.9,
      rationale:
        "Calculus I reuses the vector-space axioms developed in Linear Algebra, so it depends on book 1.",
      evidence: EVIDENCE_ALGEBRA,
      alternatives: [],
      override: null,
    },
    {
      prerequisite_book_id: 2,
      dependent_book_id: 1,
      confidence: 0.8,
      rationale:
        "Linear Algebra's later chapters assume the limit technique only developed in Calculus I, so it depends on book 2 — forming a cycle.",
      evidence: EVIDENCE_CALCULUS,
      alternatives: [],
      override: null,
    },
  ],
};

/**
 * One edge (Calculus I -> Mathematical Methods) sits at 0.4 confidence.
 * Chosen display threshold: 0.7 — edges at or above it render without a
 * warning, anything below renders an explicit low-confidence warning. 0.7 is
 * chosen because the strong edges in these fixtures are all >= 0.8 and the
 * weak one is 0.4, so the threshold is unambiguous. The threshold is purely
 * presentational: approval is never gated on confidence.
 */
export const lowConfidenceFixture: LearningPathV1 = {
  plan_version: 1,
  books: [
    { id: 1, title: "Linear Algebra" },
    { id: 2, title: "Calculus I" },
    { id: 3, title: "Mathematical Methods" },
  ],
  edges: [
    {
      prerequisite_book_id: 1,
      dependent_book_id: 2,
      confidence: 0.9,
      rationale:
        "Calculus I builds directly on the vector-space and matrix material in Linear Algebra.",
      evidence: EVIDENCE_ALGEBRA,
      alternatives: [],
      override: null,
    },
    {
      prerequisite_book_id: 2,
      dependent_book_id: 3,
      confidence: 0.4,
      rationale:
        "Mathematical Methods references single-variable calculus, but the Agent found only indirect mentions and could not pin the dependency to a specific chapter.",
      evidence: EVIDENCE_CALCULUS,
      alternatives: [],
      override: null,
    },
  ],
};

/**
 * One edge (Calculus I -> Mathematical Methods) has no resolvable evidence:
 * `evidence` is null, mirroring CitationV1's "null means source unavailable".
 * Consumers render the explicit "source unavailable" state instead of
 * guessing.
 */
export const missingEvidenceFixture: LearningPathV1 = {
  plan_version: 1,
  books: [
    { id: 1, title: "Linear Algebra" },
    { id: 2, title: "Calculus I" },
    { id: 3, title: "Mathematical Methods" },
  ],
  edges: [
    {
      prerequisite_book_id: 1,
      dependent_book_id: 2,
      confidence: 0.9,
      rationale:
        "Calculus I builds directly on the vector-space and matrix material in Linear Algebra.",
      evidence: EVIDENCE_ALGEBRA,
      alternatives: [],
      override: null,
    },
    {
      prerequisite_book_id: 2,
      dependent_book_id: 3,
      confidence: 0.6,
      rationale:
        "Mathematical Methods is reported to require Calculus I, but the Agent produced no citation for the dependency.",
      evidence: null,
      alternatives: [],
      override: null,
    },
  ],
};

/**
 * Same content as validChainABC (identical books and edges) but with an
 * older `plan_version` (2 vs 3). Approval targets an exact version, so
 * approving this fixture conflicts when the current plan is at a newer
 * version — mirroring the approve route's 409 "Stale plan version. Refresh
 * and try again."
 */
export const staleVersionFixture: LearningPathV1 = {
  plan_version: 2,
  books: validChainABC.books,
  edges: validChainABC.edges,
};

/**
 * A -> B, with an alternative (book 4) and an override that have NOT been
 * resolved or chosen (`resolved: false` everywhere). The app renders the
 * unresolved state and never auto-picks an alternative or auto-applies an
 * override — only an explicit human action may resolve them.
 */
export const unresolvedAlternativesFixture: LearningPathV1 = {
  plan_version: 1,
  books: [
    { id: 1, title: "Linear Algebra" },
    { id: 2, title: "Calculus I" },
    { id: 4, title: "Discrete Mathematics" },
  ],
  edges: [
    {
      prerequisite_book_id: 1,
      dependent_book_id: 2,
      confidence: 0.75,
      rationale:
        "Calculus I builds directly on the vector-space and matrix material in Linear Algebra.",
      evidence: EVIDENCE_ALGEBRA,
      alternatives: [
        {
          prerequisite_book_id: 4,
          rationale:
            "The Agent also proposed Discrete Mathematics as a prerequisite, citing its logic chapter as an alternative foundation.",
          evidence: {
            document_id: 4,
            book_title: "Discrete Mathematics",
            pages: "1–60",
            excerpt: "Chapter 2 formalises the implication rules used throughout the calculus proofs.",
          },
          resolved: false,
        },
      ],
      override: { resolved: false, reason: null },
    },
  ],
};
