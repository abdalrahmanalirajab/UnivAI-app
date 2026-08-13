export const CURRENT_EULA_VERSION = "2026-08-12";
export const CURRENT_PRIVACY_NOTICE_VERSION = "2026-08-12";

export type UiLocale = "en" | "ar";
export type LegalDocumentType = "eula" | "privacy_notice";

export function normalizeUiLocale(value: unknown): UiLocale {
  return value === "ar" ? "ar" : "en";
}

export const EULA_SECTIONS = {
  en: [
    {
      title: "1. Your materials and permission to process them",
      body: "You may upload or use only material that you own, that is in the public domain, or that you are otherwise legally permitted to use. You keep your rights in your material and give UnivAI only the limited, non-exclusive permission needed to store, analyze, transform, and present it back to you as part of the learning service.",
    },
    {
      title: "2. UnivAI does not supply content rights",
      body: "UnivAI is not the publisher, licensor, or rights-clearance service for material you choose. UnivAI does not grant you copyright, database, privacy, confidentiality, or other authorization for that material and cannot confirm that your copy or intended use is lawful.",
    },
    {
      title: "3. Your responsibility and prohibited uses",
      body: "You are responsible for the material you upload and for how you use it. Do not upload or study from material obtained or used unlawfully; infringing copies; content that violates privacy, confidentiality, exam-security, or contractual duties; malware; or material used to harm, deceive, or abuse another person. Illegal or unauthorized use may expose you—not UnivAI—to consequences under applicable law, except where the law assigns responsibility differently.",
    },
    {
      title: "4. Removal and cooperation",
      body: "UnivAI may restrict processing, remove material, preserve relevant records, suspend an account, or respond to a valid legal request when reasonably necessary to protect users, rights holders, the service, or comply with law. You agree to cooperate with reasonable ownership or authorization checks.",
    },
    {
      title: "5. AI-generated learning material",
      body: "Generated lectures, answers, curricula, sections, and study aids can be incomplete or wrong. They are educational assistance, not legal, medical, financial, or professional advice. Check important information against the original source and qualified guidance.",
    },
    {
      title: "6. Account and acceptable use",
      body: "Keep your account secure, provide accurate information, and do not bypass access controls, disrupt the service, scrape protected data, impersonate another person, or use another learner's account or materials without permission.",
    },
    {
      title: "7. Service availability and limits",
      body: "The service is provided subject to applicable law and may change, pause, or contain errors. Nothing in this agreement excludes rights or liability that cannot legally be excluded. Any further warranty, liability, governing-law, and dispute terms must be approved for the jurisdiction in which UnivAI is offered.",
    },
    {
      title: "8. Versions and contact",
      body: "Your acceptance is recorded against this version. A materially changed agreement will require a new acceptance before a covered action. Questions or rights-holder notices can be submitted through the Privacy and Legal center in account settings.",
    },
  ],
  ar: [
    {
      title: "1. المواد التي تستخدمها والإذن بمعالجتها",
      body: "لا يجوز لك رفع أو استخدام إلا المواد التي تملكها، أو الموجودة في الملكية العامة، أو المصرح لك قانونًا باستخدامها. وتظل حقوقك في موادك محفوظة، وتمنح UnivAI إذنًا محدودًا وغير حصري بالقدر اللازم فقط لتخزينها وتحليلها وتحويلها وعرضها لك ضمن خدمة التعلم.",
    },
    {
      title: "2. لا تمنحك UnivAI حقوقًا في المحتوى",
      body: "UnivAI ليست ناشرًا أو جهة ترخيص أو جهة لتصفية حقوق المواد التي تختارها. ولا تمنحك UnivAI أي تصريح متعلق بحقوق النشر أو قواعد البيانات أو الخصوصية أو السرية أو غيرها، ولا يمكنها تأكيد أن نسختك من المادة أو استخدامك المقصود لها مشروع قانونًا.",
    },
    {
      title: "3. مسؤوليتك والاستخدامات المحظورة",
      body: "أنت مسؤول عن المواد التي ترفعها وعن طريقة استخدامها. لا ترفع أو تدرس من مواد تم الحصول عليها أو استخدامها بصورة غير قانونية، أو نسخ منتهِكة للحقوق، أو محتوى يخالف الخصوصية أو السرية أو أمن الاختبارات أو الالتزامات التعاقدية، أو برمجيات ضارة، أو مواد تُستخدم لإيذاء الآخرين أو خداعهم أو إساءة معاملتهم. وقد تترتب على الاستخدام غير القانوني أو غير المصرح به عواقب عليك أنت—وليس على UnivAI—وفق القانون المعمول به، ما لم يقرر القانون خلاف ذلك.",
    },
    {
      title: "4. الإزالة والتعاون",
      body: "يجوز لـ UnivAI تقييد المعالجة أو إزالة المواد أو حفظ السجلات ذات الصلة أو تعليق الحساب أو الاستجابة لطلب قانوني صحيح متى كان ذلك ضروريًا بصورة معقولة لحماية المستخدمين أو أصحاب الحقوق أو الخدمة أو للامتثال للقانون. وتوافق على التعاون مع طلبات التحقق المعقولة من الملكية أو التصريح.",
    },
    {
      title: "5. مواد التعلم المنشأة بالذكاء الاصطناعي",
      body: "قد تكون المحاضرات والإجابات والمناهج والسكاشن ووسائل الدراسة المنشأة ناقصة أو خاطئة. وهي مساعدة تعليمية وليست استشارة قانونية أو طبية أو مالية أو مهنية. تحقّق من المعلومات المهمة بالرجوع إلى المصدر الأصلي وإرشاد المختصين.",
    },
    {
      title: "6. الحساب والاستخدام المقبول",
      body: "حافظ على أمان حسابك، وقدّم معلومات صحيحة، ولا تتجاوز ضوابط الوصول، أو تعطل الخدمة، أو تجمع بيانات محمية آليًا، أو تنتحل شخصية غيرك، أو تستخدم حساب متعلم آخر أو مواده دون إذن.",
    },
    {
      title: "7. إتاحة الخدمة وحدودها",
      body: "تُقدَّم الخدمة مع مراعاة القانون المعمول به، وقد تتغير أو تتوقف مؤقتًا أو تتضمن أخطاء. ولا تستبعد هذه الاتفاقية أي حقوق أو مسؤوليات لا يجوز استبعادها قانونًا. ويجب اعتماد أي شروط إضافية للضمان أو المسؤولية أو القانون الحاكم أو تسوية المنازعات وفق الولاية القضائية التي تُقدَّم فيها UnivAI.",
    },
    {
      title: "8. الإصدارات والتواصل",
      body: "يُسجَّل قبولك لهذا الإصدار تحديدًا. وعند إجراء تغيير جوهري سيُطلب قبول جديد قبل تنفيذ إجراء مشمول. ويمكن إرسال الأسئلة أو إشعارات أصحاب الحقوق من خلال مركز الخصوصية والشؤون القانونية في إعدادات الحساب.",
    },
  ],
} as const;

export const PRIVACY_SECTIONS = {
  en: [
    {
      title: "What we collect",
      body: "We process account and contact details, security and session records, uploaded learning sources, generated learning artifacts, questions and answers, attendance and assessment records, feedback and reports, subscription records, notification preferences, and technical logs needed to operate and secure the service.",
    },
    {
      title: "Why we process it",
      body: "We use data to provide the learning service, personalize and generate requested content, administer assessments, secure accounts, prevent abuse, support users, maintain records, improve quality, and meet legal duties. The applicable legal basis may include performing our agreement, legitimate interests, legal obligations, and consent where the law requires it.",
    },
    {
      title: "AI and service providers",
      body: "Uploaded material and prompts may be processed by configured hosting, database, vector-search, communications, payment, live-audio, and AI providers acting for the service. Deployment owners must document their providers, locations, data-processing terms, and international-transfer safeguards before production use.",
    },
    {
      title: "Sharing and sale",
      body: "UnivAI does not sell personal information or share it for cross-context behavioral advertising in the current product. We disclose data only to authorized service providers, administrators with a legitimate need, or when required to protect rights, safety, the service, or comply with law. California users can still record an opt-out preference in the Privacy center.",
    },
    {
      title: "Retention and security",
      body: "Data is kept only for documented operational, educational, security, and legal needs, then deleted or de-identified under the deployment's retention schedule. We use access controls, tenant-scoped queries, audit records, encryption provided by the hosting environment, and incident-response procedures; no system can guarantee absolute security.",
    },
    {
      title: "Your choices and rights",
      body: "Depending on where you live, you may request access, correction, deletion, restriction, objection, or a portable copy; opt out of sale or sharing; limit certain sensitive-data uses; and withdraw consent where processing relies on consent. You will not be discriminated against for exercising applicable privacy rights. Submit and track a request in account settings. Identity verification and lawful exceptions may apply.",
    },
    {
      title: "Uploaded third-party information",
      body: "Do not upload another person's personal, confidential, or sensitive information unless you have a lawful basis and any required notice or permission. The EULA separately governs rights in books and other learning material.",
    },
    {
      title: "Changes and contact",
      body: "Material notice changes receive a new version and acknowledgment where appropriate. Use the Privacy and Legal center in account settings to contact the deployment administrator, download your data, or submit a privacy request.",
    },
  ],
  ar: [
    {
      title: "البيانات التي نجمعها",
      body: "نعالج بيانات الحساب والتواصل، وسجلات الأمان والجلسات، ومصادر التعلم المرفوعة، ومخرجات التعلم المنشأة، والأسئلة والإجابات، وسجلات الحضور والتقييم، والتعليقات والبلاغات، وسجلات الاشتراك، وتفضيلات الإشعارات، والسجلات التقنية اللازمة لتشغيل الخدمة وتأمينها.",
    },
    {
      title: "لماذا نعالج البيانات",
      body: "نستخدم البيانات لتقديم خدمة التعلم، وتخصيص المحتوى المطلوب وإنشائه، وإدارة التقييمات، وتأمين الحسابات، ومنع إساءة الاستخدام، ودعم المستخدمين، وحفظ السجلات، وتحسين الجودة، والوفاء بالالتزامات القانونية. وقد يكون الأساس القانوني هو تنفيذ اتفاقنا أو المصالح المشروعة أو الالتزام القانوني أو الموافقة عندما يشترطها القانون.",
    },
    {
      title: "الذكاء الاصطناعي ومقدمو الخدمة",
      body: "قد تعالج المواد المرفوعة والتعليمات جهات الاستضافة وقواعد البيانات والبحث المتجهي والاتصالات والدفع والصوت المباشر والذكاء الاصطناعي المهيأة لتقديم الخدمة. ويجب على مسؤول النشر توثيق مقدمي الخدمة ومواقعهم وشروط معالجة البيانات وضمانات نقل البيانات دوليًا قبل الاستخدام الإنتاجي.",
    },
    {
      title: "المشاركة والبيع",
      body: "لا تبيع UnivAI المعلومات الشخصية ولا تشاركها للإعلانات السلوكية عبر السياقات في المنتج الحالي. ولا نفصح عن البيانات إلا لمقدمي الخدمة المصرح لهم، أو للمسؤولين ذوي الحاجة المشروعة، أو عند الضرورة لحماية الحقوق أو السلامة أو الخدمة أو للامتثال للقانون. ويمكن لمستخدمي كاليفورنيا تسجيل تفضيل رفض البيع أو المشاركة في مركز الخصوصية.",
    },
    {
      title: "الاحتفاظ والأمان",
      body: "يُحتفظ بالبيانات فقط للاحتياجات التشغيلية والتعليمية والأمنية والقانونية الموثقة، ثم تُحذف أو تُنزع هويتها وفق جدول الاحتفاظ الخاص بالنشر. ونستخدم ضوابط الوصول، والاستعلامات المعزولة لكل مستخدم، وسجلات التدقيق، والتشفير الذي توفره بيئة الاستضافة، وإجراءات الاستجابة للحوادث؛ ولا يمكن لأي نظام ضمان الأمان المطلق.",
    },
    {
      title: "اختياراتك وحقوقك",
      body: "بحسب مكان إقامتك، قد يحق لك طلب الوصول أو التصحيح أو الحذف أو تقييد المعالجة أو الاعتراض أو الحصول على نسخة قابلة للنقل، ورفض البيع أو المشاركة، والحد من بعض استخدامات البيانات الحساسة، وسحب الموافقة عندما تعتمد المعالجة عليها. ولن تتعرض للتمييز بسبب ممارسة حقوق الخصوصية المطبقة. قدّم الطلب وتابعه من إعدادات الحساب، مع احتمال طلب التحقق من الهوية وتطبيق الاستثناءات القانونية.",
    },
    {
      title: "معلومات الغير في المواد المرفوعة",
      body: "لا ترفع معلومات شخصية أو سرية أو حساسة تخص شخصًا آخر إلا إذا كان لديك أساس قانوني وقدمت أي إخطار أو حصلت على أي إذن مطلوب. وتنظم اتفاقية الاستخدام بصورة منفصلة الحقوق في الكتب ومواد التعلم الأخرى.",
    },
    {
      title: "التغييرات والتواصل",
      body: "تحصل التغييرات الجوهرية في الإشعار على إصدار جديد وإقرار جديد عند الاقتضاء. استخدم مركز الخصوصية والشؤون القانونية في إعدادات الحساب للتواصل مع مسؤول النشر أو تنزيل بياناتك أو تقديم طلب خصوصية.",
    },
  ],
} as const;

export function canonicalLegalText(
  type: LegalDocumentType,
  locale: UiLocale = "en",
): string {
  const sections = type === "eula" ? EULA_SECTIONS[locale] : PRIVACY_SECTIONS[locale];
  return sections.map((section) => `${section.title}\n${section.body}`).join("\n\n");
}
