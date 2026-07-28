type HowItWorksIcon = "Upload" | "Build" | "Attend" | "Exam";

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
    steps: { icon: HowItWorksIcon; label: string }[];
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
      "Upload your source books. UnivAI turns them into a focused semester with lectures, quizzes, exams, and Q&A that cites the material or clearly refuses.",
    ctaPrimary: "Upload a book",
    ctaSecondary: "See how it works",
    microTrust: "Built for source-grounded learning, with explicit citations and refusals.",
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
        body: "Each week is a short narrated lesson pulled from your book's own pages. Every sentence stays focused on your material.",
        linkLabel: "View sample",
      },
      {
        title: "Raise-your-hand cited Q&A",
        body: "Ask during a lecture. Every grounded answer carries its source page; unsupported questions receive a clear refusal.",
        linkLabel: null,
      },
      {
        title: "Quizzes + proctored midterm",
        body: "Weekly multiple-choice quizzes keep you on track. The midterm adds a timed proctoring flow.",
        linkLabel: "See exam format",
      },
      {
        title: "The virtual clock",
        body: "The semester runs on its own schedule: lectures unlock weekly and assessment windows have deadlines.",
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
    heading: "See the full learning flow",
    caption: "Sources become a structured semester, live lessons, grounded Q&A, and assessments.",
    playAriaLabel: "Explore the UnivAI learning flow",
  },

  liveSample: {
    heading: "What a live lecture looks like",
    subheading:
      "See the lecture room with slides, narration, the raise-hand queue, and cited Q&A based on an uploaded book.",
    ctaLabel: "Try your own",
    lectureSlideLabel: "Lecture slide",
    slidePlaceholder: "Evidence, claims, and source quality",
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
    body: "Assign a textbook and get a ready-made course shell. Monitor attendance, review Q&A logs, and see aggregate quiz performance without building every asset yourself.",
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
          "The Q&A flow retrieves relevant pages from your uploaded sources. Grounded answers include citations, while unsupported questions receive a clear refusal.",
      },
      {
        question: "Are the exams really proctored?",
        answer:
          "The midterm is timed and uses a basic proctoring flow. Weekly quizzes are self-paced checkpoints.",
      },
      {
        question: "Is my book private?",
        answer:
          "Your book is stored in its own collection and access is tied to your account. Review your deployment's privacy policy before uploading sensitive material.",
      },
      {
        question: "Can I use my own AI model?",
        answer:
          "Not yet. The RAG pipeline and lecture generation run on our infrastructure. A BYO-model option is on the roadmap.",
      },
      {
        question: "Is there a free way to try it?",
        answer:
          "You can create an account and start an upload without entering a credit card.",
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
