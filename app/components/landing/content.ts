export type LandingContent = {
  hero: {
    headline: string;
    subhead: string;
    ctaPrimary: string;
    ctaSecondary: string;
    microTrust: string;
  };
  trustStrip: {
    line: string;
  };
  howItWorks: {
    heading: string;
    steps: { icon: string; label: string }[];
  };
  featureHighlights: {
    heading: string;
    comingSoonLabel: string;
    learnMoreLabel: string;
    items: {
      title: string;
      body: string;
      linkLabel: string | null;
      comingSoon?: true;
    }[];
  };
  promoVideo: {
    heading: string;
    caption: string;
    playAriaLabel: string;
  };
  liveSample: {
    heading: string;
    subheading: string;
    ctaLabel: string;
    lectureSlideLabel: string;
    slidePlaceholder: string;
    quizQuestionLabel: string;
    quizQuestion: string;
    quizOptionA: string;
    quizOptionB: string;
    quizOptionC: string;
    citedAnswerLabel: string;
    citedAnswer: string;
    sourceText: string;
  };
  secondAudience: {
    heading: string;
    body: string;
    ctaLabel: string;
    comingSoonLabel: string;
    comingSoon: true;
  };
  finalCta: {
    heading: string;
    ctaLabel: string;
  };
  faq: {
    heading: string;
    items: {
      question: string;
      answer: string;
    }[];
  };
  footer: {
    productHeading: string;
    accountHeading: string;
    aboutHeading: string;
    legalHeading: string;
    productLinks: string[];
    accountLinks: string[];
    aboutLinks: string[];
    legalLinks: string[];
    brand: string;
    tagline: string;
    madeBy: string;
    copyrightFormat: string;
  };
  raiseHandTeaser: {
    label: string;
    sampleQuestion: string;
    fullAnswer: string;
    buttonLabel: string;
  };
};

const content: LandingContent = {
  hero: {
    headline: "Upload a textbook. Get a university.",
    subhead:
      "Drop one PDF. We build a four-week semester — lectures, quizzes, a proctored midterm, and a cited Q&A that only answers from your book. No fluff, no waiting.",
    ctaPrimary: "Upload a book",
    ctaSecondary: "See how it works",
    microTrust: "Trusted by students at 12+ universities",
  },

  trustStrip: {
    line: "Built for self-learners, homeschoolers, and anyone who learns better by reading, watching, and asking.",
  },

  howItWorks: {
    heading: "How it works",
    steps: [
      { icon: "Upload", label: "Upload the PDF" },
      { icon: "Build", label: "AI builds the semester" },
      { icon: "Attend", label: "Attend & ask" },
      { icon: "Exam", label: "Sit the exams" },
    ],
  },

  featureHighlights: {
    heading: "Feature highlights",
    comingSoonLabel: "Coming soon",
    learnMoreLabel: "Learn more",
    items: [
      {
        title: "Voiced lectures",
        body: "Each week is a short narrated lesson pulled from your book's own pages. No generic video — every sentence is about your material.",
        linkLabel: "View sample",
      },
      {
        title: "Raise-your-hand cited Q&A",
        body: "Ask anything during a lecture. The answer comes from your book, with the source page attached. No hallucinations, no guesswork.",
        linkLabel: null,
      },
      {
        title: "Quizzes + proctored midterm",
        body: "Weekly multiple-choice quizzes keep you honest. The midterm is timed and proctored — just like the real thing.",
        linkLabel: "See exam format",
      },
      {
        title: "The virtual clock",
        body: "The semester runs on its own schedule — lectures unlock weekly, windows have deadlines. You cannot binge the whole course in one night (and that is the point).",
        linkLabel: null,
      },
      {
        title: "Career-skill validation",
        body: "Pass the course and get a credential that maps your book knowledge to real-world skills. Share it on LinkedIn or your CV.",
        linkLabel: null,
        comingSoon: true,
      },
    ],
  },

  promoVideo: {
    heading: "Watch a month of university in five minutes",
    caption: "Promo video coming soon.",
    playAriaLabel: "Play promo video",
  },

  liveSample: {
    heading: "What a live lecture looks like",
    subheading:
      "See the lecture room — slides, narration, the raise-hand queue, and the cited Q&A sidebar — all running on a real uploaded book.",
    ctaLabel: "Try your own",
    lectureSlideLabel: "Lecture slide",
    slidePlaceholder: "Slide preview placeholder",
    quizQuestionLabel: "Quiz question",
    quizQuestion: "Which of the following best describes X?",
    quizOptionA: "A. First option",
    quizOptionB: "B. Second option",
    quizOptionC: "C. Third option",
    citedAnswerLabel: "Cited answer",
    citedAnswer:
      "The concept was introduced in Chapter 3, where the author explains that\u2026",
    sourceText: "Source: page 42",
  },

  secondAudience: {
    heading: "Are you an educator?",
    body: "Assign a textbook, get a ready-made course shell. Monitor attendance, review Q&A logs, and see aggregate quiz performance — without building slides or writing questions.",
    ctaLabel: "Learn about class mode",
    comingSoonLabel: "Coming soon",
    comingSoon: true,
  },

  finalCta: {
    heading: "Turn your first book into a course.",
    ctaLabel: "Upload a book",
  },

  faq: {
    heading: "Frequently asked questions",
    items: [
      {
        question: "What file formats are supported?",
        answer:
          "Only PDF at the moment. The file is sent to the RAG service for chunking and indexing. The maximum file size is 60 MB.",
      },
      {
        question: "Does the AI invent answers outside my book?",
        answer:
          "No. The Q&A engine is grounded by retrieval-augmented generation (RAG) — it only sees the pages of your uploaded book. Every answer includes a citation you can check.",
      },
      {
        question: "Are the exams really proctored?",
        answer:
          "The midterm is timed and uses a basic proctoring flow to deter shortcuts. Weekly quizzes are self-paced checkpoints. We treat you like an adult — but the record is honest either way.",
      },
      {
        question: "Is my book private?",
        answer:
          "Yes. Your book is indexed in the RAG service and stored in our database. It is never shared with other users or used to train models.",
      },
      {
        question: "Can I use my own AI model?",
        answer:
          "Not yet. The RAG pipeline and lecture generation run on our infrastructure. A BYO-model option is on the roadmap.",
      },
      {
        question: "Is there a free way to try it?",
        answer:
          "Upload one book and go through the full semester at no cost. There is no credit card required to start.",
      },
    ],
  },

  footer: {
    productHeading: "Product",
    accountHeading: "Account",
    aboutHeading: "About",
    legalHeading: "Legal",
    productLinks: ["Upload", "Schedule", "Exams", "Dashboard"],
    accountLinks: ["Login", "Register", "Profile"],
    aboutLinks: ["The idea", "Team", "GitHub"],
    legalLinks: ["Privacy", "Terms"],
    brand: "UnivAI",
    tagline: "One Book, One Month",
    madeBy: "Made by the Jamieh team",
    copyrightFormat: "\u00a9 {year} UnivAI",
  },

  raiseHandTeaser: {
    label: "Live Q&A demo",
    sampleQuestion: "Can you explain the mitotic phase from Chapter 2?",
    fullAnswer:
      "The mitotic phase consists of prophase, metaphase, anaphase, and telophase. Each chromosome divides into two sister chromatids that are pulled to opposite poles of the cell. \u2014 Source: Chapter 2, page 42",
    buttonLabel: "Raise your hand",
  },
};

export default content;
