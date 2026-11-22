// ============================================================================
// ECHO 23028 Health Centers Morbidity & IMCI Reporting Master Metadata
// Extracted directly from: YEM-HOD-ECHO 23028-HCs-Morbidity Report (8 Sheets)
// ============================================================================

const PROJECT_CODE = 'YEM-HOD-ECHO 23028';

const AGE_GROUPS = [
  '0-6 months',
  '7-59 months',
  '5-14 years',
  '15-18 years',
  '19-49 years',
  '>= 50 years'
];

const AGE_LABELS_SHORT = ['0-6 M', '7-59 M', '5Y-14Y', '15Y-18Y', '19Y-49Y', '≥ 50Y'];
const UNDER_5_AGES = ['0-6 months', '7-59 months'];
const UNDER_18_AGES = ['0-6 months', '7-59 months', '5-14 years', '15-18 years'];
const OVER_18_AGES = ['19-49 years', '>= 50 years'];

const SPECIAL_GROUPS = ['IDPs', 'Migrants', 'Disability', 'Host'];

// 19 Health Facilities directly from sheet 'list'
const ECHO_FACILITIES = [
  { id: 'al_mighlaf', project: 'ECHO', gov: 'AlHudaydah', dist: 'Al Mighlaf', clusterName: 'Mighlaf HC/المركز الصحي المغلاف', shortName: 'Al Mighlaf HC', doctor: 'D/Fathi' },
  { id: 'al_qanawis', project: 'ECHO', gov: 'AlHudaydah', dist: 'Al Qanawis', clusterName: 'Alkanawes HC/المركز الصحي القناوص', shortName: 'Al Qanawis HC', doctor: 'D/Abduljalil Alwesabi' },
  { id: 'al_mansuriyah', project: 'ECHO', gov: 'AlHudaydah', dist: 'Al Mansuriyah', clusterName: 'Al Mansuriyah HC/المركز الصحي المنصورية', shortName: 'Al Mansuriyah HC', doctor: 'D/Mohammed Abdu' },
  { id: 'al_madman', project: 'ECHO', gov: 'AlHudaydah', dist: 'As Sukhnah', clusterName: 'Almedman HC/المركز الصحي المدمن', shortName: 'Al Madman HC', doctor: 'D/Basheer Alsulwi' },
  { id: 'shujinah', project: 'ECHO', gov: 'AlHudaydah', dist: 'As Sukhnah', clusterName: 'Shojaina HC/المركز الصحي شجينه', shortName: 'Shujinah HC', doctor: 'D/Zaid AlHawery' },
  { id: 'al_dawoodia', project: 'ECHO', gov: 'AlHudaydah', dist: 'Al Qanawis', clusterName: 'Aldawediah HU/الوحدة الصحية الداودية', shortName: 'Al Dawoodia HU', doctor: 'D/Muhanad Abdulkabeer' },
  { id: 'may_22', project: 'ECHO', gov: 'Raymah', dist: "Bilad At Ta'am", clusterName: 'May 22 Alrbwa Bni Khuli HC/المركز الصحي 22مايو الربوع بني خولي', shortName: '24 May HC', doctor: 'Dr. Sumaya' },
  { id: 'bani_nader', project: 'ECHO', gov: 'Hajjah', dist: 'Kushar', clusterName: 'Bani Nader HU/الوحدة الصحية بني نادر', shortName: 'Bani Nader HU', doctor: 'D/Suliman' },
  { id: 'ahem_hc', project: 'ECHO', gov: 'Hajjah', dist: 'Kushar', clusterName: 'Ahem maret HU/الوحدة الصحيه عاهم', shortName: 'Ahem HC', doctor: 'D/Abdulkareem' },
  { id: 'al_kharab', project: 'ECHO', gov: 'Hajjah', dist: 'Kushar', clusterName: 'Al Kharab HU/الوحدة الصحية الخراب بيت الخذلاني', shortName: 'Al Kharab HU', doctor: 'D/Namat Alzabidi' },
  { id: 'bani_omar', project: 'ECHO', gov: 'Hajjah', dist: 'Kushar', clusterName: 'Kushar Bine Amaer HC/المركز الصحي بني عمر', shortName: 'Bani Omar HC', doctor: 'D/Abdullah Ham' },
  { id: 'alradha', project: 'ECHO', gov: 'Hajjah', dist: 'Abs', clusterName: 'Albatarya /المركز الصحي (الردحة) البتارية', shortName: 'AlRadha HC', doctor: 'Dr. Sumaya' },
  { id: 'bani_balosh', project: 'ECHO', gov: 'Hajjah', dist: 'Abs', clusterName: 'Bani Balosh HU/الوحدة الصحية بني بلوش', shortName: 'Bani Balosh HU', doctor: 'D/Amer' },
  { id: 'rabou_matwala', project: 'ECHO', gov: 'Hajjah', dist: 'Abs', clusterName: "Rabou'o Matwala /المركز الصحي الربوع مطولة", shortName: "Rabou'o Matwala HU", doctor: 'D/Adel Haj' },
  { id: 'al_jaberi', project: 'ECHO', gov: 'Hajjah', dist: 'Abs', clusterName: 'Al Jaberi HU/الوحدة الصحية الجابري', shortName: 'Al Jaberi HU', doctor: 'D/Suliman' },
  { id: 'mch_center', project: 'ECHO', gov: 'Hajjah', dist: 'Abs', clusterName: 'Mother and child Center/مركز الام والطفل', shortName: 'Mother and child Center', doctor: 'D/Namat Alzabidi' },
  { id: 'almaqayit', project: 'ECHO', gov: 'Hajjah', dist: 'Abs', clusterName: 'Almaqayit HU/الوحدة الصحية المقايط', shortName: 'Almaqayit HU', doctor: 'Dr. AmirAl_maazi' },
  { id: 'al_hayjah', project: 'ECHO', gov: 'Hajjah', dist: 'Abs', clusterName: 'Al Hayjah HU/الوحدة الصحية بالهيجة', shortName: 'Al Hayjah HU', doctor: 'D/Kholood' },
  { id: 'dir_alkuraiti', project: 'ECHO', gov: 'AlHudaydah', dist: 'Al Qanawis', clusterName: 'Dir Al Kuraiti HC/المركز الصحي دير القريطي', shortName: 'Dir Al Kuraiti HC', doctor: '' }
];

// Exact eDEWS Daily Warning Diagnosis IDs from Excel formula:
// W1!I192 = SUM(D122:O125, D128:O129, D134:O135) -> #5, #6, #7, #8, #11, #12, #17, #18
const EDEWS_DAILY_IDS = [5, 6, 7, 8, 11, 12, 17, 18];

// eDEWS Weekly Warning triggers if ANY Notifiable Disease (#1-29) New Case > 0
const EDEWS_WEEKLY_MIN_ID = 1;
const EDEWS_WEEKLY_MAX_ID = 29;

// 55 Official Diagnoses with Categories & Exact Clinical Eligibility Rules from Excel shaded cells
const DIAGNOSES = [
  { id: 1, name: "Upper Respiratory Tract Infection", cat: "A", sub: "a" },
  { id: 2, name: "Lower Respiratory Tract Infection", cat: "A", sub: "a" },
  { id: 3, name: "Influenza Like Illness (ILI)", cat: "A", sub: "a" },
  { id: 4, name: "Severe Acute Respiratory Infections (SARI)", cat: "A", sub: "a" },
  { id: 5, name: "Suspected COVID-19", cat: "A", sub: "a", edewsDaily: true },
  { id: 6, name: "Suspected Pertussis", cat: "A", sub: "a", edewsDaily: true },
  { id: 7, name: "Suspected Diphtheria", cat: "A", sub: "a", edewsDaily: true },
  { id: 8, name: "Acute Watery Diarrhea / Cholera Suspicion", cat: "A", sub: "a", edewsDaily: true },
  { id: 9, name: "Other, Acute Diarrhea", cat: "A", sub: "a" },
  { id: 10, name: "Bloody Diarrhea", cat: "A", sub: "a" },
  { id: 11, name: "Acute Flaccid Paralysis", cat: "A", sub: "a", edewsDaily: true },
  { id: 12, name: "Measles Suspicion", cat: "A", sub: "a", edewsDaily: true },
  { id: 13, name: "Suspected Viral Hepatitis A & E", cat: "A", sub: "a" },
  { id: 14, name: "Tetanus Neonatorum", cat: "A", sub: "a", rule: "NEONATE_ONLY", ruleHint: "0-6 months only (F/M)" },
  { id: 15, name: "Suspected Mumps", cat: "A", sub: "a" },
  { id: 16, name: "Suspected Malaria", cat: "A", sub: "a" },
  { id: 17, name: "Dengue Fever", cat: "A", sub: "a", edewsDaily: true },
  { id: 18, name: "Acute Haemorrhagic Fever", cat: "A", sub: "a", edewsDaily: true },
  { id: 19, name: "Typhoid & Paratyphoid Fever", cat: "A", sub: "a" },
  { id: 20, name: "Brucellosis", cat: "A", sub: "a" },
  { id: 21, name: "Meningitis Suspicion", cat: "A", sub: "a" },
  { id: 22, name: "Tuberculosis Suspicion", cat: "A", sub: "a" },
  { id: 23, name: "Cutaneous Leishmaniasis", cat: "A", sub: "a" },
  { id: 24, name: "Schistosomiasis", cat: "A", sub: "a" },
  { id: 25, name: "Suspected Rabies", cat: "A", sub: "a" },
  { id: 26, name: "Chicken Pox - Varicella Zoster", cat: "A", sub: "a" },
  { id: 27, name: "Pediculosis/Scabies", cat: "A", sub: "a" },
  { id: 28, name: "HIV/AIDS", cat: "A", sub: "a" },
  { id: 29, name: "Guinea Worm", cat: "A", sub: "a" },
  { id: 30, name: "Skin Infection Other Than Scabies", cat: "A", sub: "b" },
  { id: 31, name: "Eye Infection", cat: "A", sub: "b" },
  { id: 32, name: "Intestinal Worms", cat: "A", sub: "b" },
  { id: 33, name: "Urinary Tract Infections", cat: "A", sub: "b" },
  { id: 34, name: "Other Infectious Diseases", cat: "A", sub: "b" },
  { id: 35, name: "Anemia", cat: "B" },
  { id: 36, name: "Skin Diseases Other Than Infectious", cat: "B" },
  { id: 37, name: "Eye Diseases Other Than Infectious", cat: "B" },
  { id: 38, name: "Dental Condition", cat: "B" },
  { id: 39, name: "Gastritis / Peptic Ulcer Conditions", cat: "B" },
  { id: 40, name: "Renal Diseases Other Than Infectious", cat: "B" },
  { id: 41, name: "Heart Disease", cat: "B" },
  { id: 42, name: "Hypertension", cat: "B" },
  { id: 43, name: "Diabetes Mellitus", cat: "B" },
  { id: 44, name: "Asthma", cat: "B" },
  { id: 45, name: "Chronic Obstructive Pulmonary Disease", cat: "B" },
  { id: 46, name: "Musculoskeletal Disease", cat: "B" },
  { id: 47, name: "Other Non-Infectious Diseases", cat: "B" },
  { id: 48, name: "Pregnancy-Related Disorders", cat: "C", rule: "FEMALE_5PLUS", ruleHint: "Female ≥ 5 years only" },
  { id: 49, name: "Gynecological Conditions", cat: "C", rule: "FEMALE_5PLUS", ruleHint: "Female ≥ 5 years only" },
  { id: 50, name: "Wounds/Injuries", cat: "D" },
  { id: 51, name: "Burns", cat: "D" },
  { id: 52, name: "Animal Bite", cat: "D" },
  { id: 53, name: "Suspected Mental Health Conditions", cat: "E" },
  { id: 54, name: "Malnutrition", cat: "E", rule: "MALNUTRITION_ECHO", ruleHint: "<5Y (F/M) or 5-49Y Female (PLW)" },
  { id: 55, name: "Others", cat: "E" }
];

const DEFAULT_TOP_DIAGS = [1, 2, 9, 33, 35, 39];

// 8 Official Referral Types directly from Rows 81-88 of W1..W5 & Monthly
const REFERRAL_TYPES = [
  { id: 'emergency_hosp', label: 'Emergency referrals to the hospital', ar: 'إحالة طارئة إلى المستشفى', rule: 'ALL' },
  { id: 'sc', label: 'Total cases referred to SC', ar: 'إحالة إلى مركز التغذية العلاجية (SC)', rule: 'UNDER_5' },
  { id: 'ctc', label: 'Total cases referred to CTC', ar: 'إحالة إلى مركز علاج الكوليرا (CTC)', rule: 'ALL' },
  { id: 'covid19', label: 'Total Suspected COVID-19 Cases', ar: 'إحالة حالات اشتباه كوفيد-19', rule: 'ALL' },
  { id: 'pregnancy', label: 'Total pregnancy cases referred to the hospital', ar: 'إحالة حالات حمل إلى المستشفى', rule: 'FEMALE_5_49' },
  { id: 'delivery', label: 'Total delivery cases referred to the hospital', ar: 'إحالة حالات ولادة إلى المستشفى', rule: 'FEMALE_5_49' },
  { id: 'mental_health', label: 'Total Mental Health referrals to private clinics', ar: 'إحالة صحة نفسية إلى عيادات خاصة', rule: 'ALL' },
  { id: 'other', label: 'Other Referrals', ar: 'إحالات أخرى', rule: 'ALL' }
];

// 5 Restricted-Use Obstetric Drugs directly from Row 86 of W1..W5 & Monthly
const RESTRICTED_DRUGS = [
  { id: 'nifedipine', label: 'Nifedipine 10 mg Tab', short: 'Nifedipine 10mg' },
  { id: 'methyldopa', label: 'Methyldopa 250 mg Tab', short: 'Methyldopa 250mg' },
  { id: 'misoprostol', label: 'Misoprostol 200 mcg comp.', short: 'Misoprostol 200mcg' },
  { id: 'hydralazine', label: 'Hydralazine 20 mg amp', short: 'Hydralazine 20mg' },
  { id: 'magnesium_sulfate', label: 'Magnesium sulfate 0.5 g/ml, 10 ml vial', short: 'MgSO4 0.5g/ml' }
];

// Official Eligibility Checker matching shaded/blocked cells in Excel
function isDiagnosisCellAllowed(diagId, ageGroup, gender) {
  const isF = String(gender || '').toLowerCase().startsWith('f');
  if (diagId === 14) {
    return ageGroup === '0-6 months';
  }
  if (diagId === 48 || diagId === 49) {
    return isF && !UNDER_5_AGES.includes(ageGroup);
  }
  if (diagId === 54) {
    if (UNDER_5_AGES.includes(ageGroup)) return true;
    return isF && ['5-14 years', '15-18 years', '19-49 years'].includes(ageGroup);
  }
  return true;
}

function isReferralCellAllowed(refTypeId, ageGroup, gender) {
  const isF = String(gender || '').toLowerCase().startsWith('f');
  if (refTypeId === 'sc') {
    return UNDER_5_AGES.includes(ageGroup);
  }
  if (refTypeId === 'pregnancy' || refTypeId === 'delivery') {
    return isF && ['5-14 years', '15-18 years', '19-49 years'].includes(ageGroup);
  }
  return true;
}

// Official Instructions & Definitions directly from Sheet1
const OFFICIAL_INSTRUCTIONS = [
  { num: 1, text: 'تسمية الملف الرسمي بالصيغة المعتمدة: YEM-HOD-ECHO 23028-Morbidity Report-[اسم المرفق]-[الشهر]-[السنة].' },
  { num: 2, text: 'في بداية كل أسبوع، اختر اسم المرفق الصحي من القائمة الرسمية (19 مرفقاً)، وتأكد من التاريخ واسم الطبيب الجامع للبيانات.' },
  { num: 3, text: 'المستفيدون الجدد (New Beneficiaries): عدد الأشخاص الذين يزورون المرفق لأول مرة خلال فترة المشروع (لا يجوز أن يتجاوز عدد الاستشارات الكلي). المتابعة (Follow-up) تُحسب تلقائياً.' },
  { num: 4, text: 'الحالات الجديدة (New Cases): المريض الذي يأتي بمرض محدد لأول مرة (حتى لو زار المرفق سابقاً بمرض مختلف). تشخيص رئيسي واحد فقط لكل مريض.' },
  { num: 5, text: 'الفئات الخاصة: أدخل النازحين (IDPs) والمهاجرين (Migrants) وذوي الإعاقة (Disability)، ويتم احتساب المجتمع المضيف (Host) تلقائياً.' },
  { num: 6, text: 'الإحالات: يجب كتابة تفاصيل الحالة في خانة الملاحظات (العمر الدقيق، الجنس، وسبب الإحالة) لتتطابق مع تقرير الإحالات.' },
  { num: 7, text: 'الترصد الوبائي (eDEWS): يُحسب التنبيه اليومي تلقائياً من الحالات الجديدة للأمراض الثمانية الحرجة (#5, #6, #7, #8, #11, #12, #17, #18)، والتنبيه الأسبوعي عند وجود أي مرض واجب التبليغ (#1-29).' },
  { num: 8, text: 'مؤشرات IMCI وكبار السن: تُجمع استشارات IMCI (<5 سنوات) تلقائياً من جدول الأمراض، مع تتبع فيتامين أ، كبار السن (>65 سنة)، أدوية التوليد المقيدة، والفرز التمريضي (Triage).' }
];

// Official template logo extracted directly from template.xlsx
const ECHO_OFFICIAL_LOGO_URI = "data:image/png;base64,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";
