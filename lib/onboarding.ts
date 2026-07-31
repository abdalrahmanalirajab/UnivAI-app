import { queryOne } from "./db";
import type { OnboardingState } from "./onboarding-flow";
import type { SessionUser } from "./auth-types";

type ExistsRow = { exists: boolean };
type DatabaseError = { code?: string };

async function hasPreparedBook(studentId: string): Promise<boolean> {
  const row = await queryOne<ExistsRow>(
    `SELECT EXISTS(
       SELECT 1 FROM books
       WHERE student_id = $1 AND status = 'ready'
     ) AS exists`,
    [studentId],
  );
  return Boolean(row?.exists);
}

async function hasPreparedDocument(studentId: string): Promise<boolean> {
  try {
    const row = await queryOne<ExistsRow>(
      `SELECT EXISTS(
         SELECT 1 FROM documents
         WHERE student_id = $1 AND status = 'ready'
       ) AS exists`,
      [studentId],
    );
    return Boolean(row?.exists);
  } catch (error) {
    // Older MVP 1 databases do not have the multi-book tables yet. The books
    // query above remains the source of truth in that deployment shape.
    if ((error as DatabaseError)?.code === "42P01") return false;
    throw error;
  }
}

export async function getOnboardingState(user: SessionUser): Promise<OnboardingState> {
  const bookReady = await hasPreparedBook(user.studentId);
  const documentReady = bookReady ? false : await hasPreparedDocument(user.studentId);

  return {
    emailVerified: user.emailVerified,
    hasPreparedSource: bookReady || documentReady,
  };
}
