const content = {
  hero: {
    eyebrow: "A clearer way to move learning forward",
    headlineLead: "Help every learner build",
    headlineAccent: "confidence that lasts.",
    subhead:
      "UnivAI brings focus, momentum, and calm to study time—so learners keep moving and families stay confident.",
    ctaPrimary: "Start free",
    ctaSecondary: "See the experience",
    proofPoints: [
      "Clear next steps",
      "Progress you can see",
      "No card required",
    ],
    progressLabel: "Learning journey",
    progressTitle: "This week is on track",
    progressCaption: "Small wins. Steady momentum.",
    groundedLabel: "Built for real learning",
  },
  trustStrip: {
    items: [
      {
        title: "Clear direction",
        body: "Know what matters now.",
      },
      {
        title: "Visible momentum",
        body: "See progress without guesswork.",
      },
      {
        title: "Honest support",
        body: "Guidance that knows its limits.",
      },
      {
        title: "Family confidence",
        body: "Stay informed without hovering.",
      },
    ],
  },
  howItWorks: {
    eyebrow: "Designed around the learner",
    heading: "Less friction. More meaningful progress.",
    body: "A focused experience that helps learners understand, practice, and grow.",
    steps: [
      {
        title: "Focus",
        body: "Start with one clear goal.",
      },
      {
        title: "Understand",
        body: "Make difficult ideas feel approachable.",
      },
      {
        title: "Practice",
        body: "Turn understanding into confidence.",
      },
      {
        title: "Grow",
        body: "Keep momentum visible.",
      },
    ],
  },
  liveSample: {
    eyebrow: "A small glimpse",
    heading: "A lesson that feels present.",
    subheading: "See how one question can become a clear next step.",
    demoLabel: "Product preview",
    slideLabel: "Algebra · Foundations",
    slideTitle: "Quadratic equations, made clearer",
    slidePoints: [
      "See the idea in simple language.",
      "Listen at your own pace.",
      "Stay focused on the next step.",
    ],
    progressLabel: "Lesson progress",
    ctaLabel: "Start free",
    authNote: "The full learning experience opens after sign-in.",
  },
  raiseHandTeaser: {
    label: "Hear a sample",
    sampleQuestion: "What is the quadratic equation based on?",
    fullAnswer:
      "Sure, the quadratic equation is based on finding the values that make a second-degree polynomial equal to zero.",
    sourceText: "Sample answer · replay anytime",
    buttonLabel: "Ask the question",
    workingLabel: "Preparing your answer…",
    answeredLabel: "Answer ready",
  },
  featureHighlights: {
    eyebrow: "Built for progress",
    heading: "Everything points to the next win.",
    body: "Support that feels connected, focused, and easy to follow.",
    items: [
      {
        title: "A clear next step",
        body: "Know what to focus on now.",
        status: "Included",
      },
      {
        title: "Learning that adapts",
        body: "Support that meets the learner where they are.",
        status: "Included",
      },
      {
        title: "Progress that feels real",
        body: "Turn effort into visible momentum.",
        status: "Included",
      },
      {
        title: "Practice with purpose",
        body: "Build confidence through meaningful repetition.",
        status: "Included",
      },
      {
        title: "Confidence for families",
        body: "See the journey without taking it over.",
        status: "Included",
      },
      {
        title: "More to discover",
        body: "The full experience is waiting inside.",
        status: "Included",
      },
    ],
  },
  learningModes: {
    eyebrow: "A better learning rhythm",
    heading: "Focus. Listen. Practice. Grow.",
    body: "A simple rhythm that keeps learning moving.",
    items: [
      { title: "Focus", body: "Know what matters now." },
      { title: "Listen", body: "Take ideas in at your pace." },
      { title: "Practice", body: "Turn effort into confidence." },
      { title: "Grow", body: "See every step forward." },
    ],
  },
  families: {
    eyebrow: "For families",
    heading: "Confidence without hovering.",
    body: "See whether learning is moving forward, with clear signals and fewer guesses.",
    visibleHeading: "What families need most",
    visibleItems: [
      {
        title: "Clear direction",
        body: "Know what the learner is working toward.",
      },
      {
        title: "Meaningful progress",
        body: "See effort turn into momentum.",
      },
      {
        title: "Room to grow",
        body: "Support independence without taking over.",
      },
    ],
    guardrailTitle: "Thoughtful by design",
    guardrailBody:
      "Clear boundaries, responsible access, and family oversight stay part of the experience.",
    guardrailStatus: "Our standard",
  },
  finalCta: {
    eyebrow: "Start with one better study session",
    heading: "A stronger learning rhythm starts here.",
    body: "Discover a calmer, clearer way to keep learning moving.",
    ctaLabel: "Start free",
  },
  faq: {
    eyebrow: "Questions",
    heading: "The essentials, before you begin.",
    items: [
      {
        question: "Who is UnivAI for?",
        answer:
          "Learners, families, and educators who want clearer direction and steadier progress.",
      },
      {
        question: "What makes it different?",
        answer:
          "UnivAI turns study into one focused journey. The deeper experience is saved for members.",
      },
      {
        question: "Can I see it first?",
        answer:
          "Yes. Try the sample above, then create an account when you are ready for more.",
      },
      {
        question: "Is it designed with families in mind?",
        answer:
          "Yes. Clear progress and responsible access are part of the product direction.",
      },
      {
        question: "How do you approach privacy?",
        answer:
          "We treat clear controls and honest privacy information as launch requirements.",
      },
      {
        question: "Can I try it without a credit card?",
        answer:
          "Yes. You can create an account without entering a credit card.",
      },
    ],
  },
  footer: {
    tagline: "Clearer learning. Steadier progress.",
    productLinks: [
      { label: "Why UnivAI", href: "/#how-it-works" },
      { label: "Preview", href: "/#live-preview" },
      { label: "Benefits", href: "/#features" },
    ],
    familyLinks: [
      { label: "For families", href: "/#for-families" },
      { label: "Our approach", href: "/#for-families" },
      { label: "Questions", href: "/#faq" },
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
