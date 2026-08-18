export const CREDIT_COSTS = {
  raise_hand: 2,
  answer_regeneration: 15,
  practice_quiz: 40,
  appeal: 100,
} as const;

export type CreditPurpose = keyof typeof CREDIT_COSTS;
