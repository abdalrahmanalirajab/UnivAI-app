const content = {
  hero: {
    eyebrow: "Source-grounded learning, built around your book",
    headlineLead: "Turn one trusted book into",
    headlineAccent: "a guided semester.",
    subhead:
      "UnivAI organizes the material into a clear plan with narrated lessons, cited Q&A, practice, and assessments—so learners always know what comes next and where an answer came from.",
    ctaPrimary: "Build my course",
    ctaSecondary: "See the learning loop",
    proofPoints: [
      "Start without a credit card",
      "Citations stay visible",
      "No microphone on this page",
    ],
    progressLabel: "Course plan",
    progressTitle: "Week 2 of 4 is ready",
    progressCaption: "Lessons, questions, and checkpoints stay connected.",
    groundedLabel: "Grounded in your source",
  },
  trustStrip: {
    items: [
      {
        title: "Built from your sources",
        body: "The learning path starts with material you choose.",
      },
      {
        title: "A visible weekly structure",
        body: "Lessons, practice, and assessments have a clear order.",
      },
      {
        title: "Citations or a clear refusal",
        body: "Answers point back to the source instead of hiding uncertainty.",
      },
      {
        title: "Live access after sign-in",
        body: "The public preview stays lightweight and starts no real call.",
      },
    ],
  },
  howItWorks: {
    eyebrow: "From source to semester",
    heading: "A learning path with a beginning, middle, and next step.",
    body: "The interface turns a large book into small, understandable actions. Each stage tells the learner what is happening and what they can do next.",
    steps: [
      {
        title: "Choose the source",
        body: "Upload a PDF you trust. The system prepares it for grounded retrieval.",
      },
      {
        title: "Review the plan",
        body: "See the generated programme, courses, weeks, and learning sequence.",
      },
      {
        title: "Attend and ask",
        body: "Follow narrated slides and raise a hand for answers tied to source pages.",
      },
      {
        title: "Practice and check",
        body: "Use quizzes, exams, attendance, and progress records to close the loop.",
      },
    ],
  },
  liveSample: {
    eyebrow: "Interactive product preview",
    heading: "See the classroom before starting a call.",
    subheading:
      "This scripted preview shows the lecture, raise-hand, and citation flow without loading LiveKit, requesting a microphone, or creating anonymous traffic.",
    demoLabel: "Scripted demo · no live connection",
    slideLabel: "Week 2 · Evaluating evidence",
    slideTitle: "A strong claim needs a traceable source",
    slidePoints: [
      "Separate the claim from the evidence supporting it.",
      "Check whether the source is relevant and credible.",
      "Return to the exact passage before accepting an answer.",
    ],
    progressLabel: "Lesson progress",
    ctaLabel: "Sign up for a real session",
    authNote: "Real-time voice and microphone access begin only after authentication.",
  },
  raiseHandTeaser: {
    label: "Try the raise-hand flow",
    sampleQuestion: "How can I tell whether a source really supports the claim?",
    fullAnswer:
      "Check that the passage directly addresses the claim, then evaluate the source's relevance, authority, and context. If the text does not support the claim, the answer should say so.",
    sourceText: "Source preview: Chapter 3 · page 42",
    buttonLabel: "Raise my hand",
    workingLabel: "Finding the cited passage…",
    answeredLabel: "Answered from the source",
  },
  featureHighlights: {
    eyebrow: "The whole learning loop",
    heading: "More useful than an isolated chatbot tab.",
    body: "The strongest experience connects content, conversation, time, and assessment. Each feature uses the same visual language and feedback states.",
    items: [
      {
        title: "Narrated visual lessons",
        body: "Slides, voice, transcript, and progress stay together so a learner can follow the same idea in more than one form.",
        status: "Available",
      },
      {
        title: "Grounded live Q&A",
        body: "Raise a hand during a lesson, see the connection state, and receive a cited response or a clear refusal.",
        status: "Available",
      },
      {
        title: "Weekly schedule",
        body: "Upcoming, joinable, completed, late, and absent states make the next action easy to understand.",
        status: "Available",
      },
      {
        title: "Practice and exams",
        body: "Quizzes and timed assessments turn passive reading into checkpoints with visible status and results.",
        status: "Available",
      },
      {
        title: "Programme review",
        body: "Generated courses can be reviewed, renamed, reordered, merged, split, and approved before the semester begins.",
        status: "Available",
      },
      {
        title: "Family progress view",
        body: "A guardian-facing summary of study rhythm and checkpoints is an important next step for a child-directed release.",
        status: "Planned",
      },
    ],
  },
  learningModes: {
    eyebrow: "Designed for learner agency",
    heading: "Read it. Hear it. Ask it. Prove it.",
    body: "The same source moves through several forms without losing its place in the learning journey.",
    items: [
      { title: "Read", body: "Keep the original source within reach." },
      { title: "Hear", body: "Follow a narrated, visual explanation." },
      { title: "Ask", body: "Request clarification during the lesson." },
      { title: "Prove", body: "Use practice and assessment to check understanding." },
    ],
  },
  families: {
    eyebrow: "For families and educators",
    heading: "A learning experience adults can inspect—not just trust blindly.",
    body: "The current product makes sources, schedules, attendance, and assessment states visible. A child-directed release must add guardian controls and age-appropriate privacy before independent use.",
    visibleHeading: "Visible in the current learning flow",
    visibleItems: [
      {
        title: "Where answers came from",
        body: "Citations and refusal states make the AI's limits easier to discuss.",
      },
      {
        title: "What happens this week",
        body: "The schedule shows upcoming lessons, completion, and attendance.",
      },
      {
        title: "Where understanding is checked",
        body: "Practice and exams make progress more concrete than time-on-screen.",
      },
    ],
    guardrailTitle: "Required before a children-focused launch",
    guardrailBody:
      "Guardian-managed accounts, age handling, verifiable consent where required, clear retention controls, and a real privacy policy are product requirements—not footer decoration.",
    guardrailStatus: "Launch guardrail",
  },
  finalCta: {
    eyebrow: "Start with what you already trust",
    heading: "Turn the next book into a learning path.",
    body: "Create an account, upload a source, review the generated plan, and move through the semester one clear step at a time.",
    ctaLabel: "Start building free",
  },
  faq: {
    eyebrow: "Questions before you begin",
    heading: "Clear answers, including the limits.",
    items: [
      {
        question: "What does UnivAI create from a book?",
        answer:
          "It prepares the PDF as a grounded source, generates a programme and weekly learning plan, and connects that plan to lectures, cited Q&A, scheduling, quizzes, and exams.",
      },
      {
        question: "Does the AI answer beyond the uploaded source?",
        answer:
          "The Q&A flow retrieves relevant passages from the uploaded material. Supported answers include source context; unsupported questions should receive a clear refusal rather than a confident invention.",
      },
      {
        question: "Can I start a real voice lesson from the home page?",
        answer:
          "No. The home-page interaction is a scripted preview and does not connect to LiveKit or request microphone access. Real sessions start after account authentication.",
      },
      {
        question: "Is this already ready for children to use independently?",
        answer:
          "It should not be presented that way yet. A children-focused deployment needs guardian controls, age-appropriate design, consent where required, clear privacy notices, data-minimization, and retention controls.",
      },
      {
        question: "Is an uploaded book private?",
        answer:
          "Access is tied to the account and collection in the current application flow, but privacy depends on the deployed infrastructure and policy. Do not upload sensitive material without reviewing the deployment's controls.",
      },
      {
        question: "Can I try it without a credit card?",
        answer:
          "The current account flow allows a learner to register and begin an upload without entering a credit card.",
      },
    ],
  },
  footer: {
    tagline: "A guided learning path built from sources you choose.",
    productLinks: [
      { label: "How it works", href: "/#how-it-works" },
      { label: "Live preview", href: "/#live-preview" },
      { label: "Features", href: "/#features" },
    ],
    familyLinks: [
      { label: "For families", href: "/#for-families" },
      { label: "Responsible launch", href: "/#for-families" },
      { label: "FAQ", href: "/#faq" },
    ],
    accountLinks: [
      { label: "Log in", href: "/login" },
      { label: "Register", href: "/register" },
      { label: "Dashboard", href: "/dashboard" },
    ],
    madeBy: "Built by the UnivAI graduation team.",
  },
} as const;

export default content;
