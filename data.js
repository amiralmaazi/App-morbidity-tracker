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
  { id: 'almaqayit', project: 'ECHO', gov: 'Hajjah', dist: 'Abs', clusterName: 'Almaqayit HU/الوحدة الصحية المقايط', shortName: 'Almaqayit HU', doctor: 'D/Kholood' },
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
