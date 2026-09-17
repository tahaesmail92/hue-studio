// Arabic is the source dictionary, not a translation of the English one.
// Its shape defines the `Dictionary` type, so a key missing from en.ts is a
// compile error rather than a string that quietly falls back.
export const ar = {
  localeName: "العربية",

  app: {
    name: "استوديو هيو",
    tagline: "حجز وإدارة جلسات الإنتاج المرئي",
  },

  common: {
    save: "حفظ",
    cancel: "إلغاء",
    edit: "تعديل",
    delete: "حذف",
    add: "إضافة",
    search: "بحث",
    back: "رجوع",
    next: "التالي",
    previous: "السابق",
    today: "اليوم",
    none: "—",
    yes: "نعم",
    no: "لا",
    loading: "جارٍ التحميل…",
    saved: "تم الحفظ",
    required: "مطلوب",
    optional: "اختياري",
    all: "الكل",
    from: "من",
    to: "إلى",
    notes: "ملاحظات",
    status: "الحالة",
    actions: "إجراءات",
    date: "التاريخ",
    time: "الوقت",
    email: "البريد الإلكتروني",
    phone: "رقم الهاتف",
    name: "الاسم",
    language: "اللغة",
    theme: "المظهر",
    themeDark: "المظهر الداكن",
    themeLight: "المظهر الفاتح",
    signOut: "تسجيل الخروج",
    nothingHere: "لا يوجد شيء هنا بعد",
  },

  auth: {
    signIn: "تسجيل الدخول",
    signInSubtitle: "ادخل ببيانات حسابك للمتابعة",
    password: "كلمة المرور",
    newPassword: "كلمة المرور الجديدة",
    confirmPassword: "تأكيد كلمة المرور",
    forgot: "نسيت كلمة المرور؟",
    forgotTitle: "استعادة كلمة المرور",
    forgotSubtitle: "اكتب بريدك وهنبعتلك رابط لتعيين كلمة مرور جديدة",
    sendResetLink: "أرسل الرابط",
    // Deliberately says nothing about whether the address exists.
    resetSent: "لو البريد ده مسجّل عندنا، هيوصله رابط خلال دقائق.",
    setPassword: "تعيين كلمة المرور",
    setPasswordSubtitle: "اختر كلمة مرور لحسابك للدخول للنظام",
    passwordHint: "{min} أحرف على الأقل. اختر جملة تفتكرها بدل كلمة معقدة.",
    welcome: "أهلًا بك في استوديو هيو",
    badCredentials: "البريد أو كلمة المرور غير صحيحة.",
    accountInactive: "هذا الحساب موقوف. تواصل مع إدارة الإنتاج.",
    accountNotActivated: "لم يتم تفعيل هذا الحساب بعد. افتح رابط الدعوة المُرسل إليك.",
    passwordsDoNotMatch: "كلمتا المرور غير متطابقتين.",
    passwordTooShort: "كلمة المرور يجب أن تكون 10 أحرف على الأقل.",
    passwordTooLong: "كلمة المرور طويلة أكثر من اللازم.",
    inviteInvalid: "هذا الرابط غير صالح أو تم استخدامه من قبل.",
    inviteExpired: "انتهت صلاحية هذا الرابط. اطلب رابطًا جديدًا من إدارة الإنتاج.",
    selfResetDisabled: "استعادة كلمة المرور معطّلة. تواصل مع إدارة الإنتاج.",
  },

  nav: {
    dashboard: "الرئيسية",
    requests: "الطلبات",
    calendar: "التقويم",
    schedule: "جدول الموارد",
    shoots: "الجلسات",
    myShoots: "جلساتي",
    clients: "العملاء",
    crew: "الطاقم",
    resources: "الموارد",
    reports: "التقارير",
    settings: "الإعدادات",
    newRequest: "طلب جلسة جديدة",
    notifications: "الإشعارات",
  },

  roles: {
    admin: "مدير النظام",
    producer: "مدير إنتاج",
    crew: "طاقم",
    client: "عميل",
  },

  shoot: {
    one: "جلسة",
    many: "جلسات",
    ref: "رقم الجلسة",
    title: "اسم الجلسة",
    titlePlaceholder: "مثال: تصوير منتج — مجموعة الخريف",
    kind: "نوع الجلسة",
    client: "العميل",
    requestedDate: "التاريخ المفضّل",
    requestedTime: "الوقت المفضّل",
    scheduled: "الموعد المؤكد",
    startsAt: "البداية",
    endsAt: "النهاية",
    setupMinutes: "وقت السيت أب (دقيقة)",
    teardownMinutes: "وقت التفكيك (دقيقة)",
    duration: "المدة",
    crew: "الطاقم والموارد",
    location: "الموقع",
    address: "العنوان",
    mapUrl: "رابط الخريطة",
    cameraCount: "عدد الكاميرات",
    reelsRequired: "عدد الريلز/الفيديوهات",
    photosRequired: "عدد الصور",
    products: "المنتجات المطلوب تصويرها",
    moodboard: "المرجع / المود بورد",
    reshootOf: "إعادة تصوير لجلسة",
    reshootReason: "سبب إعادة التصوير",
    timeline: "مراحل الجلسة",
    confirmation: "تأكيد الموعد",
    callSheet: "ورقة النداء",
    downloadPdf: "تحميل PDF",
  },

  shootKind: {
    photo: "تصوير فوتوغرافي",
    video: "تصوير فيديو",
    both: "فوتو وفيديو",
  },

  shootStatus: {
    pending: "بانتظار الموافقة",
    confirmed: "تم التأكيد",
    in_progress: "قيد التنفيذ",
    completed: "انتهى التصوير",
    delivered: "تم التسليم",
    cancelled: "ملغاة",
    rejected: "مرفوضة",
  },

  locationKind: {
    studio: "استوديو داخلي",
    on_location: "لوكيشن خارجي",
  },

  resource: {
    one: "مورد",
    many: "الموارد",
    kind: "النوع",
    craft: "التخصص",
    linkedAccount: "الحساب المرتبط",
    active: "مُفعّل",
  },

  resourceKind: {
    person: "فرد من الطاقم",
    studio: "استوديو",
    equipment: "معدة",
  },

  craft: {
    photographer: "مصوّر فوتوغرافي",
    videographer: "مصوّر فيديو",
    editor: "مونتير",
  },

  client: {
    one: "عميل",
    many: "العملاء",
    company: "اسم الجهة",
    sector: "القطاع",
    logo: "الشعار",
    timezone: "المنطقة الزمنية",
    preferences: "تفضيلات ثابتة",
    preferencesHint: "مثال: يفضّل الإضاءة الطبيعية، يطلب دائمًا كاميرتين.",
    visits: "عدد الجلسات",
    visitsDay: "اليوم",
    visitsWeek: "هذا الأسبوع",
    visitsMonth: "هذا الشهر",
    visitsYear: "هذه السنة",
    invite: "إرسال دعوة",
    reinvite: "إعادة إرسال الدعوة",
    inviteSent: "تم إرسال الدعوة.",
    contacts: "جهات الاتصال",
  },

  clientStatus: {
    active: "نشط",
    paused: "متوقف مؤقتًا",
    archived: "مؤرشف",
  },

  deliverable: {
    many: "المواد المُسلَّمة",
    raw: "المواد الخام",
    final: "النسخة النهائية المعتمدة",
    url: "رابط الدرايف",
    label: "وصف مختصر",
    visibleToClient: "ظاهر للعميل",
    approve: "اعتماد النسخة النهائية",
    approved: "تم الاعتماد",
    rate: "تقييم الجلسة",
  },

  event: {
    created: "تم تقديم الطلب",
    confirmed: "تم تأكيد الموعد",
    rescheduled: "تم تعديل الموعد",
    reassigned: "تم تعديل الطاقم",
    field_changed: "تم تعديل البيانات",
    status_changed: "تغيّرت الحالة",
    cancelled: "تم الإلغاء",
    rejected: "تم الرفض",
    delivered: "تم تسليم المواد",
    approved: "اعتمد العميل النسخة النهائية",
    note: "ملاحظة",
  },

  conflict: {
    title: "تعارض في الموعد",
    // {resource} و {shoot} بيتعوّضوا وقت العرض
    busy: "{resource} محجوز بالفعل في هذا الوقت ضمن الجلسة {shoot}.",
    blocked: "لا يمكن تأكيد هذه الجلسة: أحد الموارد المختارة محجوز في نفس التوقيت.",
    checking: "جارٍ فحص التعارض…",
    clear: "لا يوجد تعارض.",
  },

  settings: {
    company: "بيانات الشركة",
    workingHours: "أوقات العمل",
    blackouts: "أيام الإغلاق",
    defaults: "الإعدادات الافتراضية",
    reminders: "التذكيرات",
    reminderOffsets: "التذكير قبل الموعد بـ (ساعات)",
    allowSelfReset: "السماح للمستخدمين باستعادة كلمة المرور بأنفسهم",
    closed: "مغلق",
  },

  weekday: {
    "0": "الأحد",
    "1": "الإثنين",
    "2": "الثلاثاء",
    "3": "الأربعاء",
    "4": "الخميس",
    "5": "الجمعة",
    "6": "السبت",
  },

  month: {
    "0": "يناير", "1": "فبراير", "2": "مارس", "3": "أبريل",
    "4": "مايو", "5": "يونيو", "6": "يوليو", "7": "أغسطس",
    "8": "سبتمبر", "9": "أكتوبر", "10": "نوفمبر", "11": "ديسمبر",
  },

  errors: {
    generic: "حصل خطأ غير متوقع. حاول مرة أخرى.",
    forbidden: "لا تملك صلاحية الوصول لهذا.",
    notFound: "غير موجود.",
    emailTaken: "هذا البريد مسجّل بالفعل.",
  },
} as const;

/**
 * Every leaf widened to `string`, so en.ts is checked against the SHAPE of the
 * Arabic dictionary rather than its literal values. A key added here and
 * forgotten there is a compile error; a different sentence is not.
 */
type Widen<T> = T extends string ? string : { [K in keyof T]: Widen<T[K]> };

export type Dictionary = Widen<typeof ar>;
