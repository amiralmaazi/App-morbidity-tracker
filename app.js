// ============================================================================
// ECHO 23028 Morbidity & IMCI Reporting Engine (Daily / W1-W5 / Monthly)
// ============================================================================

const KEYS = {
  CASES: 'ECHO23028_CASES_V2',
  OPS: 'ECHO23028_DAILY_OPS_V2',
  REFS: 'ECHO23028_STANDALONE_REFS_V2',
  COMMENTS: 'ECHO23028_DIAG_COMMENTS_V2',
  FACILITY: 'ECHO23028_FACILITY_V2',
  PINS: 'ECHO23028_PINS_V2',
  DEVICE_ID: 'ECHO23028_DEVICE_ID_V1',
  MEMBER_NAME: 'ECHO23028_MEMBER_NAME_V1',
  CYCLES: 'ECHO23028_CYCLES_V1'
};

let deviceId = '';
let teamMemberName = '';

function getOrCreateDeviceId() {
  if (deviceId) return deviceId;
  try {
    const saved = localStorage.getItem(KEYS.DEVICE_ID);
    if (saved && saved.trim()) { deviceId = saved.trim(); return deviceId; }
  } catch (e) {}
  deviceId = 'DEV_' + Date.now().toString(36).toUpperCase() + '_' + Math.random().toString(36).slice(2, 6).toUpperCase();
  try { localStorage.setItem(KEYS.DEVICE_ID, deviceId); } catch (e) {}
  return deviceId;
}

function getCurrentMemberName() {
  if (teamMemberName && teamMemberName.trim()) return teamMemberName.trim();
  return (facility && facility.doctor && facility.doctor.trim()) ? facility.doctor.trim() : 'عضو الفريق';
}

function saveTeamMemberName(val) {
  teamMemberName = String(val || '').trim();
  try { localStorage.setItem(KEYS.MEMBER_NAME, teamMemberName); } catch (e) {}
  showToast('✅ تم تحديث اسمك في الفريق: ' + getCurrentMemberName());
}

function makeUniqueUid(prefix) {
  const dev = getOrCreateDeviceId();
  return `${dev}_${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// Helper: keep dailyOps[date] totals synced from per-device breakdown (backward compatible)
function normalizeDailyOpsEntry(entry, fallbackDevId, fallbackName) {
  const e = entry || {};
  const out = { triageF: 0, triageM: 0, ghoF: 0, ghoM: 0, byDevice: {} };
  if (e.byDevice && typeof e.byDevice === 'object' && Object.keys(e.byDevice).length > 0) {
    Object.entries(e.byDevice).forEach(([dev, v]) => {
      if (!v || typeof v !== 'object') return;
      out.byDevice[dev] = {
        name: String(v.name || fallbackName || dev),
        triageF: Math.max(0, Number(v.triageF) || 0),
        triageM: Math.max(0, Number(v.triageM) || 0),
        ghoF: Math.max(0, Number(v.ghoF) || 0),
        ghoM: Math.max(0, Number(v.ghoM) || 0),
        updatedAt: Number(v.updatedAt) || 0
      };
    });
  } else {
    const tf = Math.max(0, Number(e.triageF) || 0);
    const tm = Math.max(0, Number(e.triageM) || 0);
    const gf = Math.max(0, Number(e.ghoF) || 0);
    const gm = Math.max(0, Number(e.ghoM) || 0);
    if (tf + tm + gf + gm > 0) {
      const key = fallbackDevId || getOrCreateDeviceId();
      out.byDevice[key] = {
        name: String(fallbackName || getCurrentMemberName()),
        triageF: tf, triageM: tm, ghoF: gf, ghoM: gm,
        updatedAt: Number(e.updatedAt) || 0
      };
    }
  }
  recalcDailyOpsTotals(out);
  return out;
}

function recalcDailyOpsTotals(opsEntry) {
  let tf = 0, tm = 0, gf = 0, gm = 0;
  Object.values(opsEntry.byDevice || {}).forEach(v => {
    tf += Math.max(0, Number(v.triageF) || 0);
    tm += Math.max(0, Number(v.triageM) || 0);
    gf += Math.max(0, Number(v.ghoF) || 0);
    gm += Math.max(0, Number(v.ghoM) || 0);
  });
  opsEntry.triageF = tf;
  opsEntry.triageM = tm;
  opsEntry.ghoF = gf;
  opsEntry.ghoM = gm;
  return opsEntry;
}

let allCases = [];
let dailyOps = {};       // { 'YYYY-MM-DD': { triageF, triageM, ghoF, ghoM } }
let standaloneRefs = []; // [{ uid, date, type, gender, ageGroup, cash, comment }]
let diagComments = {};   // { diagId: { hfmd: '', hfam: '' } }
let reportingCycles = {}; // { 'YYYY-MM': { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' } }

let facility = {
  presetId: 'almaqayit',
  project: 'ECHO 23028',
  gov: 'Hajjah',
  dist: 'Abs',
  shortName: 'Almaqayit HU',
  clusterName: 'Almaqayit HU/الوحدة الصحية المقايط',
  doctor: 'Dr. AmirAl_maazi',
  title: 'HF Medical Doctor Officer'
};

let pinned = { caseType: false, specialGroup: false };
let editingUid = null;
let currentForm = {
  gender: '',
  ageGroup: '',
  caseType: 'New',
  benType: 'New',
  specialGroup: 'Host',
  diagId: null
};

// -------------------- أدوات مساعدة --------------------
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.display = 'block';
  clearTimeout(window._tTimer);
  window._tTimer = setTimeout(() => { t.style.display = 'none'; }, 3400);
}

function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

function isFemaleCase(c) {
  return String(c.gender || '').toLowerCase().trim().startsWith('f');
}
function isMaleCase(c) { return !isFemaleCase(c); }

function getArabicDayName(dateStr) {
  const days = ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
  const d = new Date(dateStr + 'T00:00:00');
  return isNaN(d) ? '' : days[d.getDay()];
}

// دورة الشهر التقريري (تدعم الضبط اليدوي لكل شهر، والافتراضي: من 26 الشهر السابق إلى 25 الشهر الحالي)
function getDefaultReportingMonthBounds(monthYYYYMM) {
  const [yr, mo] = String(monthYYYYMM || '').split('-').map(Number);
  const py = mo === 1 ? yr - 1 : yr;
  const pm = mo === 1 ? 12 : mo - 1;
  return {
    startISO: `${py}-${String(pm).padStart(2, '0')}-26`,
    endISO: `${yr}-${String(mo).padStart(2, '0')}-25`,
    isCustom: false
  };
}

function getAppReportingMonthBounds(monthYYYYMM) {
  const custom = reportingCycles && reportingCycles[monthYYYYMM];
  if (custom && custom.start && custom.end && custom.start <= custom.end) {
    return { startISO: custom.start, endISO: custom.end, isCustom: true };
  }
  return getDefaultReportingMonthBounds(monthYYYYMM);
}

function getAppReportingMonthForDate(dateStr) {
  const ds = String(dateStr || '').slice(0, 10);
  if (ds && reportingCycles && typeof reportingCycles === 'object') {
    const keys = Object.keys(reportingCycles).sort();
    for (const ym of keys) {
      const c = reportingCycles[ym];
      if (c && c.start && c.end && ds >= c.start && ds <= c.end) {
        return ym;
      }
    }
  }
  const [yr, mo, dy] = ds.split('-').map(Number);
  if (!yr || !mo || !dy) return new Date().toISOString().slice(0, 7);
  if (dy >= 26) {
    const ny = mo === 12 ? yr + 1 : yr;
    const nm = mo === 12 ? 1 : mo + 1;
    return `${ny}-${String(nm).padStart(2, '0')}`;
  }
  return `${yr}-${String(mo).padStart(2, '0')}`;
}

function addAppDaysISO(dateStr, days) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function diffAppDaysISO(d1, d2) {
  const [y1, m1, day1] = String(d1).split('-').map(Number);
  const [y2, m2, day2] = String(d2).split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, day2) - Date.UTC(y1, m1 - 1, day1)) / 86400000);
}

function fmtShortDate(isoStr) {
  const [y, m, d] = String(isoStr || '').split('-');
  return d ? `${Number(d)}/${Number(m)}/${y}` : isoStr;
}

function getAppReportingWeekBounds(monthYYYYMM, weekIndex0) {
  const { startISO, endISO } = getAppReportingMonthBounds(monthYYYYMM);
  const wkStart = addAppDaysISO(startISO, weekIndex0 * 7);
  const rawEnd = addAppDaysISO(wkStart, 6);
  const wkEnd = weekIndex0 === 4 ? endISO : (rawEnd <= endISO ? rawEnd : endISO);
  return { wkStart, wkEnd, isEmpty: wkStart > endISO };
}

function getReportingWeekNumber(dateStr) {
  const repMonth = getAppReportingMonthForDate(dateStr);
  const { startISO } = getAppReportingMonthBounds(repMonth);
  const diff = diffAppDaysISO(startISO, dateStr);
  if (isNaN(diff) || diff < 0) return 'W1';
  return 'W' + Math.min(5, Math.floor(diff / 7) + 1);
}

function nz(val) { return val > 0 ? `<td class="tpl-nz">${val}</td>` : `<td class="tpl-zero">0</td>`; }

// -------------------- التخزين الدائم --------------------
function saveAllState() {
  try { localStorage.setItem(KEYS.CASES, JSON.stringify(allCases)); } catch (e) {}
  try { localStorage.setItem(KEYS.OPS, JSON.stringify(dailyOps)); } catch (e) {}
  try { localStorage.setItem(KEYS.REFS, JSON.stringify(standaloneRefs)); } catch (e) {}
  try { localStorage.setItem(KEYS.COMMENTS, JSON.stringify(diagComments)); } catch (e) {}
  try { localStorage.setItem(KEYS.FACILITY, JSON.stringify(facility)); } catch (e) {}
  try { localStorage.setItem(KEYS.PINS, JSON.stringify(pinned)); } catch (e) {}
  try { localStorage.setItem(KEYS.CYCLES, JSON.stringify(reportingCycles)); } catch (e) {}
  try {
    const req = indexedDB.open('ECHO23028_DB', 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('store');
    req.onsuccess = e => {
      const tx = e.target.result.transaction('store', 'readwrite');
      tx.objectStore('store').put(JSON.stringify({ allCases, dailyOps, standaloneRefs, diagComments, facility, reportingCycles }), 'snapshot');
    };
  } catch (e) {}
}

function loadAllState(cb) {
  getOrCreateDeviceId();
  try { const x = localStorage.getItem(KEYS.MEMBER_NAME); if (x) teamMemberName = x; } catch (e) {}
  try { const x = localStorage.getItem(KEYS.CASES); if (x) allCases = JSON.parse(x); } catch (e) {}
  try { const x = localStorage.getItem(KEYS.OPS); if (x) dailyOps = JSON.parse(x); } catch (e) {}
  try { const x = localStorage.getItem(KEYS.REFS); if (x) standaloneRefs = JSON.parse(x); } catch (e) {}
  try { const x = localStorage.getItem(KEYS.COMMENTS); if (x) diagComments = JSON.parse(x); } catch (e) {}
  try { const x = localStorage.getItem(KEYS.FACILITY); if (x) facility = { ...facility, ...JSON.parse(x) }; } catch (e) {}
  try { const x = localStorage.getItem(KEYS.PINS); if (x) pinned = { ...pinned, ...JSON.parse(x) }; } catch (e) {}
  try { const x = localStorage.getItem(KEYS.CYCLES); if (x) reportingCycles = JSON.parse(x) || {}; } catch (e) {}

  // تحديث اسم الطبيب الرسمي لوحدة المقايط تلقائياً إلى Dr. AmirAl_maazi إذا كان يحمل القيمة الافتراضية القديمة
  if (facility.presetId === 'almaqayit' || String(facility.shortName || '').toLowerCase().includes('almaqayit')) {
    const oldDoc = String(facility.doctor || '').trim();
    if (!oldDoc || oldDoc === 'D/Kholood' || oldDoc === 'Dr.Sumaia' || oldDoc === 'Dr.') {
      facility.doctor = 'Dr. AmirAl_maazi';
      try { localStorage.setItem(KEYS.FACILITY, JSON.stringify(facility)); } catch (e) {}
    }
  }

  // Ensure all local records carry deviceId & normalized dailyOps breakdown
  const myDev = getOrCreateDeviceId();
  const myName = getCurrentMemberName();
  allCases.forEach(c => {
    if (!c.deviceId) c.deviceId = myDev;
    if (!c.enteredBy) c.enteredBy = myName;
    if (!c.updatedAt) c.updatedAt = 0;
  });
  standaloneRefs.forEach(r => {
    if (!r.deviceId) r.deviceId = myDev;
    if (!r.enteredBy) r.enteredBy = myName;
    if (!r.updatedAt) r.updatedAt = 0;
  });
  Object.keys(dailyOps).forEach(dt => {
    dailyOps[dt] = normalizeDailyOpsEntry(dailyOps[dt], myDev, myName);
  });

  // استيراد تلقائي من الإصدارات السابقة إذا كانت الذاكرة الجديدة فارغة
  if (allCases.length === 0) {
    ['MORBIDITY_RECORDS_V4', 'MORBIDITY_APP'].forEach(k => {
      try {
        const old = JSON.parse(localStorage.getItem(k) || '[]');
        if (Array.isArray(old) && old.length > allCases.length) {
          allCases = old.map((r, i) => normalizeRecord(r, i)).filter(Boolean);
        }
      } catch (e) {}
    });
  }
  recalculateDailySerials();
  cb();
}

function normalizeRecord(r, idx, ctxDevId, ctxMemberName) {
  if (!r || typeof r !== 'object') return null;
  let diagId = Number(r.diagId ?? r.id ?? r['Diagnosis #'] ?? 0);
  let diagObj = DIAGNOSES.find(d => d.id === diagId);
  if (!diagObj && (r.diagName || r['Diagnosis Name'])) {
    const nm = String(r.diagName || r['Diagnosis Name']).toLowerCase().trim();
    diagObj = DIAGNOSES.find(d => d.name.toLowerCase() === nm);
  }
  if (!diagObj) return null;

  const rawGen = String(r.gender ?? r['Gender'] ?? 'Female').toLowerCase().trim();
  let gender = (rawGen === 'male' || rawGen === 'm' || rawGen === 'ذكر') ? 'Male' : 'Female';
  if (diagObj.id === 48 || diagObj.id === 49) gender = 'Female';

  const rawAge = String(r.ageGroup ?? r['Age Group'] ?? '5-14 years');
  let ageGroup = '5-14 years';
  if (rawAge.includes('0-6')) ageGroup = '0-6 months';
  else if (rawAge.includes('7-59')) ageGroup = '7-59 months';
  else if (rawAge.includes('5-14') || rawAge.includes('5Y')) ageGroup = '5-14 years';
  else if (rawAge.includes('15-18') || rawAge.includes('15Y')) ageGroup = '15-18 years';
  else if (rawAge.includes('19-49') || rawAge.includes('19Y')) ageGroup = '19-49 years';
  else if (rawAge.includes('50')) ageGroup = '>= 50 years';

  const rawType = String(r.caseType ?? r['Case Type'] ?? 'New').toLowerCase();
  const caseType = rawType.includes('follow') ? 'Follow up' : 'New';
  const rawBen = String(r.benType ?? r['Beneficiary Type'] ?? caseType).toLowerCase();
  const benType = rawBen.includes('follow') ? 'Follow up' : 'New';

  const rawSpec = String(r.specialGroup ?? r['Special Group'] ?? 'Host').toLowerCase();
  let specialGroup = 'Host';
  if (rawSpec.includes('idp')) specialGroup = 'IDPs';
  else if (rawSpec.includes('mig')) specialGroup = 'Migrants';
  else if (rawSpec.includes('dis')) specialGroup = 'Disability';

  const date = String(r.date ?? r['Date'] ?? new Date().toISOString().split('T')[0]).slice(0, 10);
  return {
    uid: String(r.uid || (Date.now() + '_' + idx + '_' + Math.random().toString(36).slice(2, 6))),
    serial: Number(r.serial || idx + 1),
    date,
    time: String(r.time ?? r['Time'] ?? '08:00').slice(0, 5),
    gender, ageGroup, caseType, benType, specialGroup,
    diagId: diagObj.id,
    diagName: diagObj.name,
    elderly65: Boolean(r.elderly65),
    vitA: Boolean(r.vitA),
    referral: r.referral || null,
    restrictedDrugs: Array.isArray(r.restrictedDrugs) ? r.restrictedDrugs : [],
    deviceId: String(r.deviceId || ctxDevId || ''),
    enteredBy: String(r.enteredBy || ctxMemberName || ''),
    updatedAt: Number(r.updatedAt) || 0,
    _hasExplicitUid: Boolean(r.uid)
  };
}

function recalculateDailySerials() {
  const cMap = {};
  allCases.forEach(c => {
    cMap[c.date] = (cMap[c.date] || 0) + 1;
    c.serial = cMap[c.date];
  });
}

// -------------------- تهيئة الواجهة --------------------
function initApp() {
  const today = new Date().toISOString().split('T')[0];
  const initRepMonth = getAppReportingMonthForDate(today);
  const initBounds = getAppReportingMonthBounds(initRepMonth);
  document.getElementById('workDate').value = today;
  document.getElementById('reportMonthPicker').value = initRepMonth;
  document.getElementById('rangeStart').value = initBounds.startISO;
  document.getElementById('rangeEnd').value = initBounds.endISO;

  // ملء القوائم المنسدلة من data.js
  const facSel = document.getElementById('facPresetSelect');
  facSel.innerHTML = `<option value="">-- اختر مرفقاً من القائمة الرسمية (19 مرفقاً) --</option>` +
    ECHO_FACILITIES.map(f => `<option value="${f.id}">${f.gov} - ${f.dist} | ${f.shortName} (${f.doctor || '-'})</option>`).join('');

  const refOpts = REFERRAL_TYPES.map(r => `<option value="${r.id}">${r.ar} (${r.label})</option>`).join('');
  document.getElementById('inlineRefType').innerHTML = refOpts;
  document.getElementById('saRefType').innerHTML = refOpts;
  document.getElementById('saRefAge').innerHTML = AGE_GROUPS.map(a => `<option value="${a}">${a}</option>`).join('');
  document.getElementById('cmtDiagSelect').innerHTML = DIAGNOSES.map(d => `<option value="${d.id}">#${d.id} - ${d.name}</option>`).join('');

  document.getElementById('inlineDrugsChecks').innerHTML = RESTRICTED_DRUGS.map(d =>
    `<label class="drug-check-item"><input type="checkbox" class="drug-chk" value="${d.id}"> ${d.short}</label>`
  ).join('');

  document.getElementById('officialGuideList').innerHTML = OFFICIAL_INSTRUCTIONS.map(i =>
    `<div class="guide-item"><strong>${i.num}.</strong> ${i.text}</div>`
  ).join('');

  loadAllState(() => {
    syncFacilityUI();
    updatePinButtonsUI();
    onDateChange();
    renderDiagList();
    renderQuickPicks();
    updateLivePreview();
    refreshTemplateStatusUI();
  });

  if ('serviceWorker' in navigator && !window.cordova) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

// -------------------- إعدادات المنشأة --------------------
function syncFacilityUI() {
  document.getElementById('activeFacilityPill').textContent = `📍 ${facility.shortName} (${facility.gov}) ⚙️`;
  document.getElementById('facPresetSelect').value = facility.presetId || '';
  document.getElementById('facProject').value = facility.project || 'ECHO 23028';
  document.getElementById('facGov').value = facility.gov || '';
  document.getElementById('facDist').value = facility.dist || '';
  document.getElementById('facShort').value = facility.shortName || '';
  document.getElementById('facCluster').value = facility.clusterName || '';
  document.getElementById('facDoctor').value = facility.doctor || '';
  document.getElementById('facTitle').value = facility.title || 'HF Medical Doctor Officer';
}

function applyFacilityPreset(id) {
  const f = ECHO_FACILITIES.find(x => x.id === id);
  if (!f) return;
  document.getElementById('facProject').value = f.project + ' 23028';
  document.getElementById('facGov').value = f.gov;
  document.getElementById('facDist').value = f.dist;
  document.getElementById('facShort').value = f.shortName;
  document.getElementById('facCluster').value = f.clusterName;
  document.getElementById('facDoctor').value = f.doctor || '';
}

function saveFacilitySettings() {
  facility = {
    presetId: document.getElementById('facPresetSelect').value,
    project: document.getElementById('facProject').value.trim() || 'ECHO 23028',
    gov: document.getElementById('facGov').value.trim(),
    dist: document.getElementById('facDist').value.trim(),
    shortName: document.getElementById('facShort').value.trim(),
    clusterName: document.getElementById('facCluster').value.trim(),
    doctor: document.getElementById('facDoctor').value.trim(),
    title: document.getElementById('facTitle').value.trim()
  };
  saveAllState();
  syncFacilityUI();
  renderReports();
  closeModal('facilityModal');
  showToast('✅ تم حفظ بيانات المرفق الصحي بنجاح');
}

// -------------------- التبويبات والتاريخ --------------------
function switchTab(tab) {
  ['entry', 'ops', 'report', 'analytics'].forEach(t => {
    document.getElementById('tab-' + t).classList.toggle('hidden', t !== tab);
  });
  document.getElementById('tabBtnEntry').classList.toggle('active', tab === 'entry');
  document.getElementById('tabBtnOps').classList.toggle('active', tab === 'ops');
  document.getElementById('tabBtnReport').classList.toggle('active', tab === 'report');
  document.getElementById('tabBtnAnalytics').classList.toggle('active', tab === 'analytics');

  if (tab === 'ops') renderOpsUI();
  if (tab === 'report') renderReports();
  if (tab === 'analytics') renderAnalytics();
}

function updateCycleBadgesUI() {
  const monthVal = (document.getElementById('reportMonthPicker') && document.getElementById('reportMonthPicker').value)
    || getAppReportingMonthForDate(document.getElementById('workDate').value);
  const { startISO, endISO, isCustom } = getAppReportingMonthBounds(monthVal);
  const shortSpan = `${fmtShortDate(startISO).slice(0, -5)} → ${fmtShortDate(endISO).slice(0, -5)}`;
  const btn = document.getElementById('btnCyclePill');
  if (btn) btn.textContent = `🗓️ الدورة: ${shortSpan}${isCustom ? ' ✏️' : ''}`;
  const chip = document.getElementById('reportCycleBadge');
  if (chip) chip.textContent = `📅 دورة ${monthVal}: ${fmtShortDate(startISO)} → ${fmtShortDate(endISO)}${isCustom ? ' (مضبوطة يدوياً)' : ' (افتراضي 26→25)'}`;
}

function onDateChange() {
  const dateStr = document.getElementById('workDate').value;
  const repMonth = getAppReportingMonthForDate(dateStr);
  document.getElementById('dayWeekLabel').textContent = `${getArabicDayName(dateStr)} | ${getReportingWeekNumber(dateStr)} (دورة ${repMonth})`;
  document.getElementById('reportMonthPicker').value = repMonth;
  document.querySelectorAll('.opsDateLbl').forEach(el => el.textContent = dateStr);
  updateCycleBadgesUI();
  refreshAllViews();
}

function onReportMonthChange() {
  updateCycleBadgesUI();
  renderReports();
}

// -------------------- نافذة ضبط الدورة الشهرية يدوياً --------------------
function openCycleModal() {
  const activeMonth = (document.getElementById('reportMonthPicker') && document.getElementById('reportMonthPicker').value)
    || getAppReportingMonthForDate(document.getElementById('workDate').value);
  document.getElementById('cycleMonthSelect').value = activeMonth;
  onCycleModalMonthChange();
  renderSavedCyclesList();
  openModal('cycleModal');
}

function onCycleModalMonthChange() {
  const ym = document.getElementById('cycleMonthSelect').value;
  if (!ym) return;
  const { startISO, endISO } = getAppReportingMonthBounds(ym);
  document.getElementById('cycleStartInput').value = startISO;
  document.getElementById('cycleEndInput').value = endISO;
  previewCycleWeeksUI();
}

function previewCycleWeeksUI() {
  const startISO = document.getElementById('cycleStartInput').value;
  const endISO = document.getElementById('cycleEndInput').value;
  const box = document.getElementById('cycleWeeksPreview');
  if (!startISO || !endISO) {
    box.innerHTML = '<span style="color:#dc2626;">⚠️ حدد تاريخ البداية وتاريخ النهاية.</span>';
    return;
  }
  if (startISO > endISO) {
    box.innerHTML = '<span style="color:#dc2626;">⚠️ تاريخ البداية يجب أن يكون قبل تاريخ النهاية!</span>';
    return;
  }
  const totalDays = diffAppDaysISO(startISO, endISO) + 1;
  let rows = `<div style="font-weight:900;color:#5b21b6;margin-bottom:4px;">📅 معاينة توزيع الأسابيع (${totalDays} يوماً):</div>`;
  for (let w = 0; w < 5; w++) {
    const ws = addAppDaysISO(startISO, w * 7);
    if (ws > endISO) {
      rows += `<div class="cycle-wk-row"><strong>W${w + 1}</strong><span style="color:#94a3b8;">(فارغ — خارج نطاق الدورة)</span></div>`;
    } else {
      const rawEnd = addAppDaysISO(ws, 6);
      const we = (w === 4) ? endISO : (rawEnd <= endISO ? rawEnd : endISO);
      const dCnt = diffAppDaysISO(ws, we) + 1;
      rows += `<div class="cycle-wk-row"><strong>W${w + 1}</strong><span dir="ltr">${fmtShortDate(ws)} → ${fmtShortDate(we)} (${dCnt}d)</span></div>`;
    }
  }
  box.innerHTML = rows;
}

function saveManualCycleSettings() {
  const ym = document.getElementById('cycleMonthSelect').value;
  const startISO = document.getElementById('cycleStartInput').value;
  const endISO = document.getElementById('cycleEndInput').value;
  if (!ym || !startISO || !endISO) return showToast('⚠️ يرجى تحديد الشهر وتاريخي البداية والنهاية');
  if (startISO > endISO) return showToast('⚠️ تاريخ البداية يجب أن يسبق تاريخ النهاية');

  reportingCycles[ym] = { start: startISO, end: endISO };
  saveAllState();
  document.getElementById('reportMonthPicker').value = ym;
  updateCycleBadgesUI();
  onDateChange();
  renderSavedCyclesList();
  closeModal('cycleModal');
  showToast(`✅ تم حفظ حدود دورة ${ym}: ${fmtShortDate(startISO)} → ${fmtShortDate(endISO)}`);
}

function resetManualCycleForMonth() {
  const ym = document.getElementById('cycleMonthSelect').value;
  if (!ym) return;
  delete reportingCycles[ym];
  saveAllState();
  onCycleModalMonthChange();
  renderSavedCyclesList();
  updateCycleBadgesUI();
  onDateChange();
  showToast(`🔄 تمت إعادة دورة ${ym} إلى الوضع الافتراضي (26 → 25)`);
}

function selectSavedCycle(ym) {
  document.getElementById('cycleMonthSelect').value = ym;
  onCycleModalMonthChange();
}

function deleteSavedCycle(ym) {
  delete reportingCycles[ym];
  saveAllState();
  renderSavedCyclesList();
  onCycleModalMonthChange();
  updateCycleBadgesUI();
  onDateChange();
  showToast(`🗑️ تم حذف الضبط اليدوي لدورة ${ym}`);
}

function renderSavedCyclesList() {
  const listEl = document.getElementById('savedCyclesList');
  if (!listEl) return;
  const entries = Object.entries(reportingCycles).sort((a, b) => b[0].localeCompare(a[0]));
  if (!entries.length) {
    listEl.innerHTML = '<div style="font-size:12px;color:#64748b;">لا توجد دورات مضبوطة يدوياً بعد — يُستخدم النطاق الافتراضي (26 → 25).</div>';
    return;
  }
  listEl.innerHTML = entries.map(([ym, c]) => `<div class="mini-item">
    <span onclick="selectSavedCycle('${ym}')" style="cursor:pointer;">🗓️ <strong>${ym}</strong>: <span dir="ltr">${fmtShortDate(c.start)} → ${fmtShortDate(c.end)}</span></span>
    <button class="btn-action btn-pdf" style="padding:4px 8px;" onclick="deleteSavedCycle('${ym}')">حذف</button>
  </div>`).join('');
}

function refreshAllViews() {
  const dateStr = document.getElementById('workDate').value;
  const dayCases = allCases.filter(c => c.date === dateStr);
  document.getElementById('nextSerialBadge').textContent = `الحالة القادمة: #${dayCases.length + 1}`;
  document.getElementById('totalDbBadge').textContent = `الذاكرة: ${allCases.length}`;

  // تحديث شارة الإنذار الوبائي اليومية eDEWS
  const dailyEdewsCount = dayCases.filter(c => c.caseType === 'New' && EDEWS_DAILY_IDS.includes(c.diagId)).length;
  const badge = document.getElementById('edewsAlertBadge');
  badge.classList.toggle('hidden', dailyEdewsCount === 0);
  badge.textContent = `🚨 eDEWS اليوم: ${dailyEdewsCount}`;

  renderDailyLog();
  renderOpsUI();
  renderReports();
  if (!document.getElementById('tab-analytics').classList.contains('hidden')) renderAnalytics();
}

// -------------------- منطق الإدخال السريع والقواعد السريرية --------------------
function selectOption(group, val) {
  currentForm[group] = val;
  document.querySelectorAll(`.choice-btn[data-group="${group}"]`).forEach(b => {
    b.classList.toggle('selected', b.getAttribute('data-val') === val);
  });

  if (group === 'caseType') {
    currentForm.benType = val;
    const radio = document.querySelector(`input[name="benType"][value="${val}"]`);
    if (radio) radio.checked = true;
  }

  // إظهار الخيارات التلقائية المرتبطة بالعمر والجنس
  document.getElementById('elderlyToggleWrap').classList.toggle('hidden', currentForm.ageGroup !== '>= 50 years');
  if (currentForm.ageGroup !== '>= 50 years') document.getElementById('chkElderly65').checked = false;

  const isUnder5 = UNDER_5_AGES.includes(currentForm.ageGroup);
  document.getElementById('vitAWrap').classList.toggle('hidden', !isUnder5);
  if (!isUnder5) document.getElementById('chkVitA').checked = false;

  const isFemale5Plus = currentForm.gender === 'Female' && currentForm.ageGroup && !isUnder5;
  document.getElementById('restrictedDrugToggleWrap').classList.toggle('hidden', !isFemale5Plus);
  if (!isFemale5Plus) {
    document.getElementById('chkRestrictedDrugs').checked = false;
    document.getElementById('inlineDrugsBox').classList.add('hidden');
  }

  renderDiagList();
  updateLivePreview();
}

function setBenType(v) { currentForm.benType = v; updateLivePreview(); }

function togglePin(field) {
  pinned[field] = !pinned[field];
  saveAllState();
  updatePinButtonsUI();
}

function updatePinButtonsUI() {
  const b1 = document.getElementById('pinCaseTypeBtn');
  const b2 = document.getElementById('pinSpecialGroupBtn');
  b1.classList.toggle('pinned', pinned.caseType);
  b1.textContent = pinned.caseType ? '📌 مُثبّت' : '📌 تثبيت';
  b2.classList.toggle('pinned', pinned.specialGroup);
  b2.textContent = pinned.specialGroup ? '📌 مُثبّت' : '📌 تثبيت';
}

function toggleInlineReferral() {
  document.getElementById('inlineReferralBox').classList.toggle('hidden', !document.getElementById('chkReferral').checked);
}

function toggleInlineDrugs() {
  document.getElementById('inlineDrugsBox').classList.toggle('hidden', !document.getElementById('chkRestrictedDrugs').checked);
}

function selectDiagnosis(id) {
  if (currentForm.gender && currentForm.ageGroup && !isDiagnosisCellAllowed(id, currentForm.ageGroup, currentForm.gender)) {
    const dObj = DIAGNOSES.find(x => x.id === id);
    showToast(`⚠️ غير مسموح حسب قيود ECHO: #${id} (${dObj.ruleHint})`);
    return;
  }
  currentForm.diagId = id;
  if (id === 48 || id === 49) selectOption('gender', 'Female');
  if (id === 14) selectOption('ageGroup', '0-6 months');
  const d = DIAGNOSES.find(x => x.id === id);
  document.getElementById('selectedDiagBadge').textContent = d ? `#${d.id} ${d.name}` : 'لم يتم الاختيار';
  renderDiagList();
  renderQuickPicks();
  updateLivePreview();
}

function renderQuickPicks() {
  const counts = {};
  allCases.forEach(c => { counts[c.diagId] = (counts[c.diagId] || 0) + 1; });
  let topIds = Object.keys(counts).map(Number).sort((a, b) => counts[b] - counts[a]).slice(0, 6);
  DEFAULT_TOP_DIAGS.forEach(id => { if (topIds.length < 6 && !topIds.includes(id)) topIds.push(id); });

  document.getElementById('quickPicksContainer').innerHTML = topIds.map(id => {
    const d = DIAGNOSES.find(x => x.id === id);
    return `<div class="quick-chip ${currentForm.diagId === id ? 'selected' : ''}" onclick="selectDiagnosis(${id})">
      <span class="quick-chip-num">#${id}</span><span>${d.name}</span>${counts[id] ? `<small>(${counts[id]})</small>` : ''}
    </div>`;
  }).join('');
}

function renderDiagList() {
  const q = (document.getElementById('diagSearch').value || '').trim().toLowerCase();
  const filtered = DIAGNOSES.filter(d => !q || String(d.id).startsWith(q) || d.name.toLowerCase().includes(q));
  document.getElementById('diagListContainer').innerHTML = filtered.map(d => {
    const allowed = (!currentForm.gender || !currentForm.ageGroup) || isDiagnosisCellAllowed(d.id, currentForm.ageGroup, currentForm.gender);
    return `<div class="diag-item ${currentForm.diagId === d.id ? 'selected' : ''} ${allowed ? '' : 'ineligible'}" onclick="selectDiagnosis(${d.id})">
      <div class="diag-left"><span class="diag-num">${d.id}</span><span>${d.name}</span></div>
      <div class="row-gap">
        ${d.edewsDaily ? `<span class="tag-edews">🚨 eDEWS</span>` : ''}
        ${d.ruleHint ? `<span class="tag-rule">${d.ruleHint}</span>` : ''}
      </div>
    </div>`;
  }).join('');
}

function updateLivePreview() {
  const d = DIAGNOSES.find(x => x.id === currentForm.diagId);
  const pills = [
    `الجنس: ${currentForm.gender || '—'}`,
    `العمر: ${currentForm.ageGroup || '—'}${document.getElementById('chkElderly65').checked ? ' (>65)' : ''}`,
    `الحالة: ${currentForm.caseType} / مستفيد: ${currentForm.benType}`,
    `الفئة: ${currentForm.specialGroup}`,
    `التشخيص: ${d ? `#${d.id} ${d.name}` : '—'}`
  ];
  if (document.getElementById('chkVitA').checked) pills.push('💊 Vit A');
  if (document.getElementById('chkReferral').checked) pills.push('🚑 إحالة');
  document.getElementById('livePreviewPills').innerHTML = pills.map(p => `<span class="pill">${p}</span>`).join('');
}

function saveCase() {
  if (!currentForm.gender) return showToast('⚠️ اختر الجنس أولاً');
  if (!currentForm.ageGroup) return showToast('⚠️ اختر الفئة العمرية أولاً');
  if (!currentForm.diagId) return showToast('⚠️ اختر التشخيص أولاً');
  if (!isDiagnosisCellAllowed(currentForm.diagId, currentForm.ageGroup, currentForm.gender)) {
    return showToast('⚠️ التشخيص لا يتطابق مع الفئة العمرية/الجنس في نموذج ECHO');
  }

  let referralObj = null;
  if (document.getElementById('chkReferral').checked) {
    const refType = document.getElementById('inlineRefType').value;
    if (!isReferralCellAllowed(refType, currentForm.ageGroup, currentForm.gender)) {
      return showToast('⚠️ نوع الإحالة المختار غير مسموح لهذه الفئة العمرية أو الجنس');
    }
    referralObj = {
      type: refType,
      cash: document.getElementById('inlineRefCash').checked,
      comment: document.getElementById('inlineRefComment').value.trim()
    };
  }

  const drugs = document.getElementById('chkRestrictedDrugs').checked
    ? [...document.querySelectorAll('.drug-chk:checked')].map(el => el.value)
    : [];

  const dateStr = document.getElementById('workDate').value;
  const diagObj = DIAGNOSES.find(x => x.id === currentForm.diagId);
  const recordData = {
    date: dateStr,
    gender: currentForm.gender === 'Male' ? 'Male' : 'Female',
    ageGroup: currentForm.ageGroup,
    caseType: currentForm.caseType,
    benType: currentForm.benType,
    specialGroup: currentForm.specialGroup,
    diagId: diagObj.id,
    diagName: diagObj.name,
    elderly65: document.getElementById('chkElderly65').checked,
    vitA: document.getElementById('chkVitA').checked,
    referral: referralObj,
    restrictedDrugs: drugs
  };

  if (editingUid) {
    const idx = allCases.findIndex(c => c.uid === editingUid);
    if (idx !== -1) {
      allCases[idx] = { ...allCases[idx], ...recordData, updatedAt: Date.now() };
      recalculateDailySerials();
      saveAllState();
      cancelEditCase();
      refreshAllViews();
      showToast('✅ تم تحديث الحالة بنجاح');
      return;
    }
  }

  const timeStr = new Date().toTimeString().slice(0, 5);
  allCases.push({
    uid: makeUniqueUid('c'),
    serial: allCases.filter(c => c.date === dateStr).length + 1,
    time: timeStr,
    deviceId: getOrCreateDeviceId(),
    enteredBy: getCurrentMemberName(),
    updatedAt: Date.now(),
    ...recordData
  });
  saveAllState();

  // فحص التنبيه الوبائي الفوري eDEWS
  if (recordData.caseType === 'New' && EDEWS_DAILY_IDS.includes(diagObj.id)) {
    alert(`🚨 تنبيه ترصد وبائي فوري (eDEWS Daily Warning):\n\nتم تسجيل حالة جديدة مشتبهة: #${diagObj.id} ${diagObj.name}\nيرجى استكمال استمارة التبليغ الفوري حسب بروتوكول ECHO/eDEWS.`);
  }

  resetFormAfterSave();
  refreshAllViews();
  renderQuickPicks();
  showToast(`✅ تم حفظ الحالة بنجاح (#${allCases[allCases.length - 1].serial})`);
}

function resetFormAfterSave() {
  currentForm.gender = '';
  currentForm.ageGroup = '';
  if (!pinned.caseType) { currentForm.caseType = 'New'; currentForm.benType = 'New'; }
  if (!pinned.specialGroup) currentForm.specialGroup = 'Host';
  currentForm.diagId = null;

  document.querySelectorAll('.choice-btn[data-group="gender"], .choice-btn[data-group="ageGroup"]').forEach(b => b.classList.remove('selected'));
  selectOption('caseType', currentForm.caseType);
  selectOption('specialGroup', currentForm.specialGroup);
  document.getElementById('diagSearch').value = '';
  document.getElementById('selectedDiagBadge').textContent = 'لم يتم الاختيار';
  document.getElementById('chkElderly65').checked = false;
  document.getElementById('chkVitA').checked = false;
  document.getElementById('chkReferral').checked = false;
  document.getElementById('inlineReferralBox').classList.add('hidden');
  document.getElementById('inlineRefComment').value = '';
  document.getElementById('inlineRefCash').checked = false;
  document.getElementById('chkRestrictedDrugs').checked = false;
  document.getElementById('inlineDrugsBox').classList.add('hidden');
  document.querySelectorAll('.drug-chk').forEach(el => el.checked = false);
  renderDiagList();
  updateLivePreview();
}

function startEditCase(uid) {
  const c = allCases.find(x => x.uid === uid);
  if (!c) return;
  editingUid = uid;
  document.getElementById('workDate').value = c.date;
  selectOption('gender', c.gender);
  selectOption('ageGroup', c.ageGroup);
  selectOption('caseType', c.caseType);
  setBenType(c.benType || c.caseType);
  const rb = document.querySelector(`input[name="benType"][value="${c.benType || c.caseType}"]`);
  if (rb) rb.checked = true;
  selectOption('specialGroup', c.specialGroup);
  selectDiagnosis(c.diagId);

  document.getElementById('chkElderly65').checked = !!c.elderly65;
  document.getElementById('chkVitA').checked = !!c.vitA;
  document.getElementById('chkReferral').checked = !!c.referral;
  toggleInlineReferral();
  if (c.referral) {
    document.getElementById('inlineRefType').value = c.referral.type;
    document.getElementById('inlineRefComment').value = c.referral.comment || '';
    document.getElementById('inlineRefCash').checked = !!c.referral.cash;
  }
  const hasDrugs = c.restrictedDrugs && c.restrictedDrugs.length > 0;
  document.getElementById('chkRestrictedDrugs').checked = hasDrugs;
  toggleInlineDrugs();
  document.querySelectorAll('.drug-chk').forEach(el => {
    el.checked = hasDrugs && c.restrictedDrugs.includes(el.value);
  });

  document.getElementById('editModeBanner').classList.remove('hidden');
  document.getElementById('editModeText').textContent = `✏️ جاري تعديل الحالة #${c.serial} (${c.date})`;
  document.getElementById('mainSaveBtn').textContent = `💾 حفظ التعديل على الحالة #${c.serial}`;
  document.getElementById('mainSaveBtn').classList.add('edit-active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cancelEditCase() {
  editingUid = null;
  document.getElementById('editModeBanner').classList.add('hidden');
  document.getElementById('mainSaveBtn').textContent = '✅ حفظ الحالة وإضافتها للسجل التسلسلي بالأسفل';
  document.getElementById('mainSaveBtn').classList.remove('edit-active');
  resetFormAfterSave();
}

function quickToggleGender(uid) {
  const c = allCases.find(x => x.uid === uid);
  if (!c) return;
  const nextG = c.gender === 'Female' ? 'Male' : 'Female';
  if (!isDiagnosisCellAllowed(c.diagId, c.ageGroup, nextG)) {
    return showToast('⚠️ لا يمكن تبديل الجنس لهذا التشخيص حسب قواعد الاستمارة');
  }
  c.gender = nextG;
  saveAllState();
  refreshAllViews();
}

function deleteCase(uid) {
  if (editingUid === uid) cancelEditCase();
  allCases = allCases.filter(c => c.uid !== uid);
  recalculateDailySerials();
  saveAllState();
  refreshAllViews();
  renderQuickPicks();
  showToast('🗑️ تم حذف الحالة');
}

function clearCurrentDayCases() {
  const d = document.getElementById('workDate').value;
  if (!confirm(`مسح جميع حالات يوم ${d}؟`)) return;
  allCases = allCases.filter(c => c.date !== d);
  saveAllState();
  refreshAllViews();
  renderQuickPicks();
}

// -------------------- السجل اليومي --------------------
function syncLogScope() { renderDailyLog(); }

function getCasesForLogScope() {
  const scope = document.getElementById('logScopeSelect').value;
  const d = document.getElementById('workDate').value;
  const repMonth = getAppReportingMonthForDate(d);
  if (scope === 'all') return allCases;
  if (scope === 'month') return allCases.filter(c => getAppReportingMonthForDate(c.date) === repMonth);
  if (scope === 'week') {
    const wk = getReportingWeekNumber(d);
    return allCases.filter(c => getAppReportingMonthForDate(c.date) === repMonth && getReportingWeekNumber(c.date) === wk);
  }
  return allCases.filter(c => c.date === d);
}

function renderDailyLog() {
  const list = getCasesForLogScope().slice().reverse();
  document.getElementById('countLog').textContent = list.length;
  const tbody = document.getElementById('dailyLogTbody');
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="10" style="padding:16px;color:#64748b;">لا توجد حالات مسجلة في هذا النطاق بعد.</td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(c => {
    const extras = [];
    if (c.vitA) extras.push('💊VitA');
    if (c.elderly65) extras.push('👴>65');
    if (c.referral) extras.push('🚑Ref');
    if (c.restrictedDrugs && c.restrictedDrugs.length) extras.push(`💉(${c.restrictedDrugs.length})`);
    return `<tr>
      <td><span class="badge-serial">#${c.serial}</span>${c.enteredBy ? `<div><span class="member-tag">${c.enteredBy}</span></div>` : ''}</td>
      <td>${c.time}</td>
      <td>${c.date}</td>
      <td><span onclick="quickToggleGender('${c.uid}')" style="cursor:pointer;font-weight:900;color:${c.gender==='Female'?'#9d174d':'#1e40af'}">${c.gender==='Female'?'👩 F':'👨 M'}</span></td>
      <td dir="ltr">${c.ageGroup}</td>
      <td>${c.caseType} <small style="color:#64748b;">(${c.benType || c.caseType})</small></td>
      <td>${c.specialGroup}</td>
      <td dir="ltr" style="text-align:left;"><strong>#${c.diagId}</strong> ${c.diagName}</td>
      <td>${extras.join(' ') || '—'}</td>
      <td>
        <button class="btn-action btn-edit" style="padding:4px 7px;" onclick="startEditCase('${c.uid}')">✏️</button>
        <button class="btn-action btn-pdf" style="padding:4px 7px;" onclick="deleteCase('${c.uid}')">🗑️</button>
      </td>
    </tr>`;
  }).join('');
}

// -------------------- التبويب 2: الإحالات، الفرز، GHO والملاحظات --------------------
function renderOpsUI() {
  const d = document.getElementById('workDate').value;
  const ops = normalizeDailyOpsEntry(dailyOps[d], getOrCreateDeviceId(), getCurrentMemberName());
  document.getElementById('opsTriageF').value = ops.triageF || 0;
  document.getElementById('opsTriageM').value = ops.triageM || 0;
  document.getElementById('opsTriageTot').value = (Number(ops.triageF) || 0) + (Number(ops.triageM) || 0);
  document.getElementById('opsGhoF').value = ops.ghoF || 0;
  document.getElementById('opsGhoM').value = ops.ghoM || 0;
  document.getElementById('opsGhoTot').value = (Number(ops.ghoF) || 0) + (Number(ops.ghoM) || 0);

  // عرض تفصيل مساهمات الفريق للفرز والتدريب إذا شارك أكثر من جهاز في نفس اليوم
  const bdBox = document.getElementById('opsTeamBreakdownBox');
  if (bdBox) {
    const contributors = Object.entries(ops.byDevice || {}).filter(([, v]) => (v.triageF + v.triageM + v.ghoF + v.ghoM) > 0);
    if (contributors.length > 1) {
      bdBox.classList.remove('hidden');
      bdBox.innerHTML = `<div class="section-title" style="margin-bottom:6px;"><span>👥 تفصيل مساهمة الفريق ليوم ${d} (مجموع تلقائي بدون تداخل)</span></div>` +
        contributors.map(([, v]) => `<div class="mini-item"><span>👤 <strong>${v.name}</strong></span><span>الفرز: F=${v.triageF} / M=${v.triageM} | GHO: F=${v.ghoF} / M=${v.ghoM}</span></div>`).join('');
    } else {
      bdBox.classList.add('hidden');
    }
  }

  const dayRefs = standaloneRefs.filter(r => r.date === d);
  document.getElementById('standaloneReferralsList').innerHTML = dayRefs.map(r => {
    const rt = REFERRAL_TYPES.find(x => x.id === r.type);
    return `<div class="mini-item">
      <span>🚑 <strong>${rt ? rt.ar : r.type}</strong> | ${r.gender} | ${r.ageGroup} ${r.cash ? '| 💵 نقدية' : ''} — ${r.comment || 'بدون ملاحظة'}</span>
      <button class="btn-action btn-pdf" style="padding:4px 8px;" onclick="deleteStandaloneRef('${r.uid}')">حذف</button>
    </div>`;
  }).join('') || `<div style="font-size:12px;color:#64748b;margin-top:6px;">لا توجد إحالات مستقلة ليوم ${d}</div>`;

  const cmts = Object.entries(diagComments).filter(([, v]) => v.hfmd || v.hfam);
  document.getElementById('savedCommentsList').innerHTML = cmts.map(([id, v]) => {
    const diag = DIAGNOSES.find(x => x.id === Number(id));
    return `<div class="mini-item">
      <span><strong>#${id} ${diag ? diag.name : ''}</strong> — HFMD: ${v.hfmd || '-'} | HFAM: ${v.hfam || '-'}</span>
      <button class="btn-action btn-pdf" style="padding:4px 8px;" onclick="deleteDiagComment(${id})">حذف</button>
    </div>`;
  }).join('');
}

function saveDailyOps() {
  const d = document.getElementById('workDate').value;
  const myDev = getOrCreateDeviceId();
  const myName = getCurrentMemberName();
  const entry = normalizeDailyOpsEntry(dailyOps[d], myDev, myName);

  const newTF = Math.max(0, Number(document.getElementById('opsTriageF').value) || 0);
  const newTM = Math.max(0, Number(document.getElementById('opsTriageM').value) || 0);
  const newGF = Math.max(0, Number(document.getElementById('opsGhoF').value) || 0);
  const newGM = Math.max(0, Number(document.getElementById('opsGhoM').value) || 0);

  let otherTF = 0, otherTM = 0, otherGF = 0, otherGM = 0;
  Object.entries(entry.byDevice || {}).forEach(([dev, v]) => {
    if (dev === myDev) return;
    otherTF += Number(v.triageF) || 0;
    otherTM += Number(v.triageM) || 0;
    otherGF += Number(v.ghoF) || 0;
    otherGM += Number(v.ghoM) || 0;
  });

  if (newTF < otherTF || newTM < otherTM || newGF < otherGF || newGM < otherGM) {
    // تعديل يدوي مباشر من المنسق لتصحيح الإجمالي
    entry.byDevice = {
      [myDev]: { name: myName, triageF: newTF, triageM: newTM, ghoF: newGF, ghoM: newGM, updatedAt: Date.now() }
    };
  } else {
    entry.byDevice[myDev] = {
      name: myName,
      triageF: newTF - otherTF,
      triageM: newTM - otherTM,
      ghoF: newGF - otherGF,
      ghoM: newGM - otherGM,
      updatedAt: Date.now()
    };
  }

  dailyOps[d] = recalcDailyOpsTotals(entry);
  saveAllState();
  renderOpsUI();
  renderReports();
}

function addStandaloneReferral() {
  const type = document.getElementById('saRefType').value;
  const gender = document.getElementById('saRefGender').value;
  const ageGroup = document.getElementById('saRefAge').value;
  if (!isReferralCellAllowed(type, ageGroup, gender)) {
    return showToast('⚠️ نوع الإحالة غير متوافق مع الفئة العمرية أو الجنس حسب ECHO');
  }
  standaloneRefs.push({
    uid: makeUniqueUid('ref'),
    deviceId: getOrCreateDeviceId(),
    enteredBy: getCurrentMemberName(),
    updatedAt: Date.now(),
    date: document.getElementById('workDate').value,
    type, gender, ageGroup,
    cash: document.getElementById('saRefCash').value === '1',
    comment: document.getElementById('saRefComment').value.trim()
  });
  document.getElementById('saRefComment').value = '';
  saveAllState();
  renderOpsUI();
  renderReports();
  showToast('✅ تم تسجيل الإحالة');
}

function deleteStandaloneRef(uid) {
  standaloneRefs = standaloneRefs.filter(r => r.uid !== uid);
  saveAllState();
  renderOpsUI();
  renderReports();
}

function saveDiagComment() {
  const id = document.getElementById('cmtDiagSelect').value;
  diagComments[id] = {
    hfmd: document.getElementById('cmtHfmd').value.trim(),
    hfam: document.getElementById('cmtHfam').value.trim()
  };
  saveAllState();
  renderOpsUI();
  renderReports();
  showToast('✅ تم حفظ الملاحظة للتقرير الشهري');
}

function deleteDiagComment(id) {
  delete diagComments[id];
  saveAllState();
  renderOpsUI();
  renderReports();
}

// -------------------- تصفية النطاق الزمني (يومي / W1-W5 / شهري / مخصص) --------------------
function onReportScopeChange() {
  const s = document.getElementById('reportScope').value;
  document.getElementById('customRangeWrap').classList.toggle('hidden', s !== 'custom');
  renderReports();
}

function getScopeFilterPredicate(scopeOverride) {
  const scope = scopeOverride || document.getElementById('reportScope').value;
  const workDate = document.getElementById('workDate').value;
  const monthVal = document.getElementById('reportMonthPicker').value || getAppReportingMonthForDate(workDate);
  const { startISO: mStart, endISO: mEnd } = getAppReportingMonthBounds(monthVal);
  const rStart = document.getElementById('rangeStart').value;
  const rEnd = document.getElementById('rangeEnd').value;

  let label = '';
  let fn = () => true;

  if (scope === 'day') {
    label = `DAILY: ${workDate} (${getArabicDayName(workDate)})`;
    fn = d => d === workDate;
  } else if (['W1','W2','W3','W4','W5'].includes(scope)) {
    const wIdx = Number(scope.slice(1)) - 1;
    const { wkStart, wkEnd, isEmpty } = getAppReportingWeekBounds(monthVal, wIdx);
    label = isEmpty
      ? `WEEKLY (${scope}) - ${monthVal} (خارج نطاق 26–25)`
      : `WEEKLY (${scope}): ${fmtShortDate(wkStart)} → ${fmtShortDate(wkEnd)}`;
    fn = d => !isEmpty && d >= wkStart && d <= wkEnd;
  } else if (scope === 'month') {
    label = `MONTHLY CONSOLIDATED (${monthVal}): ${fmtShortDate(mStart)} → ${fmtShortDate(mEnd)}`;
    fn = d => d >= mStart && d <= mEnd;
  } else if (scope === 'custom') {
    label = `CUSTOM RANGE: ${rStart} → ${rEnd}`;
    fn = d => (!rStart || d >= rStart) && (!rEnd || d <= rEnd);
  } else {
    label = `ALL SAVED RECORDS (CUMULATIVE)`;
    fn = () => true;
  }
  return { scope, label, matchDate: fn };
}

// -------------------- تجميع كافة بيانات الاستمارة الرسمية --------------------
function buildReportDataset(scopeOverride) {
  const { scope, label, matchDate } = getScopeFilterPredicate(scopeOverride);
  const cases = allCases.filter(c => matchDate(c.date));
  const refs = [
    ...cases.filter(c => c.referral).map(c => ({
      date: c.date, type: c.referral.type, gender: c.gender,
      ageGroup: c.ageGroup, cash: c.referral.cash, comment: c.referral.comment
    })),
    ...standaloneRefs.filter(r => matchDate(r.date))
  ];

  let triageF = 0, triageM = 0, ghoF = 0, ghoM = 0;
  Object.entries(dailyOps).forEach(([d, v]) => {
    if (matchDate(d)) {
      triageF += Number(v.triageF) || 0;
      triageM += Number(v.triageM) || 0;
      ghoF += Number(v.ghoF) || 0;
      ghoM += Number(v.ghoM) || 0;
    }
  });

  // eDEWS Daily & Weekly exact ECHO formulas
  const edewsDaily = cases.filter(c => c.caseType === 'New' && EDEWS_DAILY_IDS.includes(c.diagId)).length;
  const activeNotifiableWeeks = new Set(
    cases.filter(c => c.caseType === 'New' && c.diagId >= EDEWS_WEEKLY_MIN_ID && c.diagId <= EDEWS_WEEKLY_MAX_ID)
      .map(c => getAppReportingMonthForDate(c.date) + '_' + getReportingWeekNumber(c.date))
  );
  const edewsWeekly = scope === 'day' || ['W1','W2','W3','W4','W5'].includes(scope)
    ? (activeNotifiableWeeks.size > 0 ? 1 : 0)
    : activeNotifiableWeeks.size;

  return { scope, label, cases, refs, triageF, triageM, ghoF, ghoM, edewsDaily, edewsWeekly };
}

// -------------------- بناء الاستمارة الرسمية بنفس شكل وألوان القالب الرسمي 100% --------------------
function renderReports() {
  updateCycleBadgesUI();
  const ds = buildReportDataset();
  const { scope, cases, refs, triageF, triageM, ghoF, ghoM, edewsDaily, edewsWeekly, label } = ds;

  const workDate = document.getElementById('workDate').value;
  const monthVal = document.getElementById('reportMonthPicker').value || getAppReportingMonthForDate(workDate);
  const { startISO: mStart, endISO: mEnd } = getAppReportingMonthBounds(monthVal);

  let formHeading = 'DAILY MORBIDITY FORM';
  let formDateDisplay = fmtShortDate(workDate);
  if (['W1', 'W2', 'W3', 'W4', 'W5'].includes(scope)) {
    const wIdx = Number(scope.slice(1)) - 1;
    const wb = getAppReportingWeekBounds(monthVal, wIdx);
    formHeading = `WEEKLY MORBIDITY FORM (${scope})`;
    formDateDisplay = wb.isEmpty ? 'Out of Cycle' : `${fmtShortDate(wb.wkStart)} - ${fmtShortDate(wb.wkEnd)}`;
  } else if (scope === 'month') {
    formHeading = 'MONTHLY MORBIDITY FORM';
    formDateDisplay = `${fmtShortDate(mStart)} - ${fmtShortDate(mEnd)}`;
  } else if (scope === 'custom') {
    formHeading = 'CUSTOM MORBIDITY FORM';
    formDateDisplay = `${fmtShortDate(document.getElementById('rangeStart').value)} - ${fmtShortDate(document.getElementById('rangeEnd').value)}`;
  } else if (scope === 'all') {
    formHeading = 'CUMULATIVE MORBIDITY FORM';
    formDateDisplay = 'All Saved Records';
  }

  // 1. Beneficiaries Table (NEW BENEFICIARIES #B7DDE8 + FOLLOW UP #FBD4B4 + Total #C4BD97)
  let benRowsHtml = '';
  const benSums = new Array(15).fill(0);
  ['Female', 'Male'].forEach(g => {
    const chk = g === 'Female' ? isFemaleCase : isMaleCase;
    let newB = 0, fuB = 0;
    const nArr = AGE_GROUPS.map((ag, i) => {
      const totalAge = cases.filter(c => chk(c) && c.ageGroup === ag).length;
      const nb = Math.min(totalAge, cases.filter(c => chk(c) && c.ageGroup === ag && (c.benType || c.caseType) === 'New').length);
      newB += nb; benSums[i] += nb; return nb;
    });
    benSums[6] += newB;
    const fArr = AGE_GROUPS.map((ag, i) => {
      const totalAge = cases.filter(c => chk(c) && c.ageGroup === ag).length;
      const fb = Math.max(0, totalAge - nArr[i]);
      fuB += fb; benSums[7 + i] += fb; return fb;
    });
    benSums[13] += fuB;
    benSums[14] += (newB + fuB);
    benRowsHtml += `<tr>
      <td class="tpl-sand">${g[0]}</td>
      ${nArr.map(nz).join('')}
      <td class="tpl-tan">${newB}</td>
      ${fArr.map(nz).join('')}
      <td class="tpl-tan">${fuB}</td>
      <td class="tpl-tan">${newB + fuB}</td>
    </tr>`;
  });

  // 2. Morbidity Matrix (1-55 + Category A-E #C6D9F0 red titles + Subcat a-b #DDD9C3 red titles + Blocked #C4BD97 + Total #95B3D7)
  const diagRowValues = {};
  DIAGNOSES.forEach(d => {
    const dCases = cases.filter(c => c.diagId === d.id);
    const arr = [];
    AGE_GROUPS.forEach(ag => {
      arr.push(dCases.filter(c => c.caseType === 'New' && c.ageGroup === ag && isFemaleCase(c)).length);
      arr.push(dCases.filter(c => c.caseType === 'New' && c.ageGroup === ag && isMaleCase(c)).length);
    });
    AGE_GROUPS.forEach(ag => {
      arr.push(dCases.filter(c => c.caseType === 'Follow up' && c.ageGroup === ag && isFemaleCase(c)).length);
      arr.push(dCases.filter(c => c.caseType === 'Follow up' && c.ageGroup === ag && isMaleCase(c)).length);
    });
    const tf = dCases.filter(isFemaleCase).length;
    const tm = dCases.filter(isMaleCase).length;
    arr.push(tf, tm, tf + tm);
    diagRowValues[d.id] = arr;
  });

  const sumIds = ids => {
    const s = new Array(27).fill(0);
    ids.forEach(id => diagRowValues[id].forEach((v, i) => s[i] += v));
    return s;
  };
  const rangeIds = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  const sub_a = sumIds(rangeIds(1, 29));
  const sub_b = sumIds(rangeIds(30, 34));
  const cat_A = sumIds(rangeIds(1, 34));
  const cat_B = sumIds(rangeIds(35, 47));
  const cat_C = sumIds(rangeIds(48, 49));
  const cat_D = sumIds(rangeIds(50, 52));
  const cat_E = sumIds(rangeIds(53, 55));
  const grandTot = sumIds(rangeIds(1, 55));

  const renderSubtotalRow = (code, title, arr, cls) =>
    `<tr class="${cls}"><td>${code}</td><td class="diag-name-cell">${title}</td>${arr.map(v => `<td>${v}</td>`).join('')}<td></td><td></td></tr>`;

  let matBody = '';
  DIAGNOSES.forEach(d => {
    if (d.id === 1) {
      matBody += renderSubtotalRow('A', 'Communicable Diseases', cat_A, 'tpl-cat-row');
      matBody += renderSubtotalRow('a', 'Notifiable Diseases', sub_a, 'tpl-subcat-row');
    } else if (d.id === 30) {
      matBody += renderSubtotalRow('b', 'Other Infectious / Communicable Diseases', sub_b, 'tpl-subcat-row');
    } else if (d.id === 35) {
      matBody += renderSubtotalRow('B', 'Non-Communicable Diseases', cat_B, 'tpl-cat-row');
    } else if (d.id === 48) {
      matBody += renderSubtotalRow('C', 'Reproductive Health (Not include Routine Preventive services)', cat_C, 'tpl-cat-row');
    } else if (d.id === 50) {
      matBody += renderSubtotalRow('D', 'Trauma-Related Injuries', cat_D, 'tpl-cat-row');
    } else if (d.id === 53) {
      matBody += renderSubtotalRow('E', 'Others', cat_E, 'tpl-cat-row');
    }

    const vals = diagRowValues[d.id];
    const cellsHtml = vals.map((v, idx) => {
      if (idx < 24) {
        const ag = AGE_GROUPS[Math.floor((idx % 12) / 2)];
        const gen = idx % 2 === 0 ? 'Female' : 'Male';
        if (!isDiagnosisCellAllowed(d.id, ag, gen)) return `<td class="tpl-blocked">.</td>`;
        return nz(v);
      }
      if (idx === 24 || idx === 25) return `<td class="tpl-tot-fm">${v}</td>`;
      return `<td class="tpl-tot-all">${v}</td>`;
    }).join('');
    const cmt = diagComments[d.id] || {};
    matBody += `<tr><td><b>${d.id}</b></td><td class="diag-name-cell">${d.name}</td>${cellsHtml}<td class="cmt-cell">${cmt.hfmd || ''}</td><td class="cmt-cell">${cmt.hfam || ''}</td></tr>`;
  });
  matBody += `<tr class="tpl-grand-row"><td colspan="2">Total</td>${grandTot.map(v => `<td>${v}</td>`).join('')}<td></td><td></td></tr>`;

  // 3. Referrals Table (Rows 78-89: #C4BD97 headers, #D8D8D8 row labels, #DDD9C3 F/M total, #C4BD97 All total & blocked cells)
  const cashSums = new Array(15).fill(0);
  const refRowsHtml = REFERRAL_TYPES.map(rt => {
    const rList = refs.filter(r => r.type === rt.id);
    const cells = [];
    let rf = 0, rm = 0;
    AGE_GROUPS.forEach((ag, i) => {
      const fCnt = rList.filter(r => r.ageGroup === ag && isFemaleCase(r)).length;
      const mCnt = rList.filter(r => r.ageGroup === ag && isMaleCase(r)).length;
      rf += fCnt; rm += mCnt;
      const fCash = rList.filter(r => r.ageGroup === ag && isFemaleCase(r) && r.cash).length;
      const mCash = rList.filter(r => r.ageGroup === ag && isMaleCase(r) && r.cash).length;
      cashSums[i * 2] += fCash; cashSums[i * 2 + 1] += mCash;

      cells.push(isReferralCellAllowed(rt.id, ag, 'Female') ? nz(fCnt) : `<td class="tpl-blocked">.</td>`);
      cells.push(isReferralCellAllowed(rt.id, ag, 'Male') ? nz(mCnt) : `<td class="tpl-blocked">.</td>`);
    });
    const rCashF = rList.filter(r => isFemaleCase(r) && r.cash).length;
    const rCashM = rList.filter(r => isMaleCase(r) && r.cash).length;
    cashSums[12] += rCashF; cashSums[13] += rCashM; cashSums[14] += (rCashF + rCashM);
    const cmts = rList.map(r => r.comment).filter(Boolean).join('; ');
    return `<tr><td class="tpl-gray-lbl">${rt.label}</td>${cells.join('')}<td class="tpl-tot-fm">${rf}</td><td class="tpl-tot-fm">${rm}</td><td class="tpl-tot-all">${rf + rm}</td><td class="cmt-cell">${cmts}</td></tr>`;
  }).join('');

  // 4. Special Groups Table (IDPs, Migrants, Disability as in template.xlsx)
  const spRowsHtml = ['IDPs', 'Migrants', 'Disability'].map(sg => {
    const uF = cases.filter(c => c.specialGroup === sg && UNDER_18_AGES.includes(c.ageGroup) && isFemaleCase(c)).length;
    const uM = cases.filter(c => c.specialGroup === sg && UNDER_18_AGES.includes(c.ageGroup) && isMaleCase(c)).length;
    const oF = cases.filter(c => c.specialGroup === sg && OVER_18_AGES.includes(c.ageGroup) && isFemaleCase(c)).length;
    const oM = cases.filter(c => c.specialGroup === sg && OVER_18_AGES.includes(c.ageGroup) && isMaleCase(c)).length;
    return `<tr><td style="text-align:left;font-weight:800;padding-left:6px;">${sg}</td>${nz(uF)}${nz(uM)}${nz(oF)}${nz(oM)}<td class="tpl-tot-all">${uF + uM + oF + oM}</td></tr>`;
  }).join('');

  // 5. Restricted-Use Drugs (5 Drugs)
  const drugCounts = RESTRICTED_DRUGS.map(dr => cases.filter(c => c.restrictedDrugs && c.restrictedDrugs.includes(dr.id)).length);
  const drugTotal = drugCounts.reduce((a, b) => a + b, 0);

  // 6. IMCI + Elderly (>65 Yrs) + GHO
  const vitA_06F = cases.filter(c => c.vitA && c.ageGroup === '0-6 months' && isFemaleCase(c)).length;
  const vitA_06M = cases.filter(c => c.vitA && c.ageGroup === '0-6 months' && isMaleCase(c)).length;
  const vitA_759F = cases.filter(c => c.vitA && c.ageGroup === '7-59 months' && isFemaleCase(c)).length;
  const vitA_759M = cases.filter(c => c.vitA && c.ageGroup === '7-59 months' && isMaleCase(c)).length;

  const imci_06F = grandTot[0] + grandTot[12];
  const imci_06M = grandTot[1] + grandTot[13];
  const imci_759F = grandTot[2] + grandTot[14];
  const imci_759M = grandTot[3] + grandTot[15];

  const eldF = cases.filter(c => c.elderly65 && isFemaleCase(c)).length;
  const eldM = cases.filter(c => c.elderly65 && isMaleCase(c)).length;

  const logoHtml = (typeof ECHO_OFFICIAL_LOGO_URI !== 'undefined' && ECHO_OFFICIAL_LOGO_URI)
    ? `<img src="${ECHO_OFFICIAL_LOGO_URI}" alt="Official Logo" class="echo-logo-img">`
    : '';

  document.getElementById('printableReportArea').innerHTML = `
    <div class="echo-canvas">
      <!-- Top Strip (Rows 2-5 of template.xlsx) -->
      <div class="echo-top-strip">
        <div class="echo-brand-block">
          <div>
            <div class="echo-brand-title">Morbidity-IMCI<br>Daily Form</div>
            <div class="echo-brand-sub">${facility.project || 'ECHO 23028'}</div>
          </div>
          ${logoHtml}
        </div>
        <div>
          <table class="morbidity-table">
            <thead>
              <tr>
                <th rowspan="2" class="tpl-sand">Gender</th>
                <th colspan="6" class="tpl-ben-new">NEW BENEFICIARIES</th>
                <th rowspan="2" class="tpl-tan">Total</th>
                <th colspan="6" class="tpl-ben-fu">FOLLOW UP</th>
                <th rowspan="2" class="tpl-tan">Total</th>
                <th rowspan="2" class="tpl-tan">Total</th>
              </tr>
              <tr>
                ${AGE_LABELS_SHORT.map(a => `<th class="tpl-ben-new">${a}</th>`).join('')}
                ${AGE_LABELS_SHORT.map(a => `<th class="tpl-ben-fu">${a}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${benRowsHtml}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Meta, Main Banner & Triage Strip (Rows 8-10 of template.xlsx) -->
      <div class="echo-meta-strip">
        <div class="echo-meta-left">
          <table>
            <tr><td class="echo-meta-lbl">COLLECTION SITE:</td><td>${facility.shortName || '—'}</td></tr>
            <tr><td class="echo-meta-lbl">DATE:</td><td>${formDateDisplay}</td></tr>
            <tr><td class="echo-meta-lbl">COLLECTED BY:</td><td>${facility.doctor || '—'}</td></tr>
          </table>
        </div>
        <div class="echo-meta-center">
          <div class="echo-form-main-title">${formHeading}</div>
          <div class="echo-form-scope-sub">${label} | Total Consultations: ${cases.length}</div>
          <div class="echo-form-note">NOTE: ONLY 1 MAIN DIAGNOSIS PER PATIENT.</div>
        </div>
        <div class="echo-meta-triage">
          <div class="echo-triage-caption">Total Cases triaged at HC entry by HF Triage Nurse</div>
          <table>
            <thead><tr><th class="tpl-tan">Female</th><th class="tpl-tan">Male</th><th class="tpl-tan">Total</th></tr></thead>
            <tbody><tr>${nz(triageF)}${nz(triageM)}<td class="tpl-tan">${triageF + triageM}</td></tr></tbody>
          </table>
        </div>
      </div>

      <!-- Main Morbidity Table (Rows 11-75 of template.xlsx) -->
      <div class="table-scroll">
        <table class="morbidity-table">
          <thead>
            <tr>
              <th rowspan="3" class="tpl-sand">SN</th>
              <th rowspan="3" class="tpl-sand">DIAGNOSIS</th>
              <th colspan="12" class="tpl-morb-new">NEW CASES</th>
              <th colspan="12" class="tpl-morb-fu">FOLLOW UP CASES</th>
              <th colspan="3" rowspan="2" class="tpl-sand">TOTAL</th>
              <th rowspan="3" class="tpl-sand">HFMD comments</th>
              <th rowspan="3" class="tpl-sand">HFAM comments</th>
            </tr>
            <tr>
              ${AGE_LABELS_SHORT.map(a => `<th colspan="2" class="tpl-morb-new">${a}</th>`).join('')}
              ${AGE_LABELS_SHORT.map(a => `<th colspan="2" class="tpl-morb-fu">${a}</th>`).join('')}
            </tr>
            <tr>
              ${AGE_GROUPS.map(() => `<th class="tpl-morb-new">F</th><th class="tpl-morb-new">M</th>`).join('')}
              ${AGE_GROUPS.map(() => `<th class="tpl-morb-fu">F</th><th class="tpl-morb-fu">M</th>`).join('')}
              <th class="tpl-sand">F</th><th class="tpl-sand">M</th><th class="tpl-tan">Total</th>
            </tr>
          </thead>
          <tbody>${matBody}</tbody>
        </table>
      </div>

      <!-- Bottom Split: Referrals + Special Groups & Restricted-Use Drugs (Rows 78-89) -->
      <div class="echo-split-bottom">
        <div>
          <table class="morbidity-table">
            <thead>
              <tr>
                <th rowspan="2" class="tpl-tan">REFERRALS</th>
                ${AGE_LABELS_SHORT.map(a => `<th colspan="2" class="tpl-tan">${a}</th>`).join('')}
                <th colspan="2" class="tpl-tan">Total</th>
                <th rowspan="2" class="tpl-tan">Total</th>
                <th rowspan="2" class="tpl-tan">COMMENTS<br>(CASE DETAILS)</th>
              </tr>
              <tr>
                ${AGE_GROUPS.map(() => `<th class="tpl-tan">F</th><th class="tpl-tan">M</th>`).join('')}
                <th class="tpl-tan">F</th><th class="tpl-tan">M</th>
              </tr>
            </thead>
            <tbody>
              ${refRowsHtml}
              <tr>
                <td class="tpl-gray-lbl">Total Referred cases who received cash assistance</td>
                ${cashSums.slice(0, 12).map(nz).join('')}
                <td class="tpl-tot-fm">${cashSums[12]}</td>
                <td class="tpl-tot-fm">${cashSums[13]}</td>
                <td class="tpl-tot-all">${cashSums[14]}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style="display:flex;flex-direction:column;gap:8px;">
          <table class="morbidity-table">
            <thead>
              <tr>
                <th rowspan="2" style="background:#fff;font-weight:900;">Special Groups</th>
                <th colspan="2" class="tpl-tan">0 - 18 Y</th>
                <th colspan="2" class="tpl-tan">&ge; 18 Y</th>
                <th rowspan="2" class="tpl-tan">Total</th>
              </tr>
              <tr>
                <th class="tpl-tan">F</th><th class="tpl-tan">M</th>
                <th class="tpl-tan">F</th><th class="tpl-tan">M</th>
              </tr>
            </thead>
            <tbody>${spRowsHtml}</tbody>
          </table>

          <table class="morbidity-table">
            <thead>
              <tr><th colspan="7" class="tpl-tan">Number of people treated for the restricted use indication</th></tr>
              <tr>
                <th class="tpl-tan">Drug</th>
                ${RESTRICTED_DRUGS.map(d => `<th style="background:#fff;white-space:normal;font-size:8.5px;">${d.short}</th>`).join('')}
                <th class="tpl-tan">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="tpl-tan">Female</td>
                ${drugCounts.map(nz).join('')}
                <td class="tpl-tan">${drugTotal}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- eDEWS Warnings Strip (Row 90 / Row 192) -->
      <div class="edews-bar">
        <div class="edews-box ${edewsDaily > 0 ? 'alert-on' : ''}">
          <span class="edews-lbl">eDEWS daily warning (#5, #6, #7, #8, #11, #12, #17, #18 New Cases)</span>
          <span class="edews-num">${edewsDaily}</span>
        </div>
        <div class="edews-box ${edewsWeekly > 0 ? 'alert-on' : ''}">
          <span class="edews-lbl">eDEWS weekly warning (Notifiable Diseases #1 - #29)</span>
          <span class="edews-num">${edewsWeekly}</span>
        </div>
      </div>

      <!-- IMCI, Elderly >65 & GHO Trained Strip (Rows 94-98) -->
      <div class="echo-imci-strip">
        <table class="morbidity-table">
          <thead>
            <tr>
              <th rowspan="2" class="tpl-tan">IMCI</th>
              <th colspan="2" class="tpl-tan">0-6 m.o.</th>
              <th colspan="2" class="tpl-tan">&gt; 6-59 m.o.</th>
              <th colspan="2" class="tpl-tan">TOTAL</th>
            </tr>
            <tr>
              <th class="tpl-tan">female</th><th class="tpl-tan">male</th>
              <th class="tpl-tan">female</th><th class="tpl-tan">male</th>
              <th class="tpl-tan">female</th><th class="tpl-tan">male</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="tpl-gray-lbl">Patients receiving Vitamin A</td>
              ${nz(vitA_06F)}${nz(vitA_06M)}${nz(vitA_759F)}${nz(vitA_759M)}
              <td class="tpl-tot-all">${vitA_06F + vitA_759F}</td>
              <td class="tpl-tot-all">${vitA_06M + vitA_759M}</td>
            </tr>
            <tr>
              <td class="tpl-gray-lbl">Total # of IMCI consultations</td>
              ${nz(imci_06F)}${nz(imci_06M)}${nz(imci_759F)}${nz(imci_759M)}
              <td class="tpl-tot-all">${imci_06F + imci_759F}</td>
              <td class="tpl-tot-all">${imci_06M + imci_759M}</td>
            </tr>
          </tbody>
        </table>

        <table class="morbidity-table">
          <thead>
            <tr><th colspan="3" style="background:#fff;white-space:normal;font-size:9px;">Total Consultation cases of Elderly people (&gt;65 Yrs)</th></tr>
            <tr><th class="tpl-tan">female</th><th class="tpl-tan">male</th><th class="tpl-tan">Total</th></tr>
          </thead>
          <tbody><tr>${nz(eldF)}${nz(eldM)}<td class="tpl-tan">${eldF + eldM}</td></tr></tbody>
        </table>

        <table class="morbidity-table">
          <thead>
            <tr><th colspan="3" style="background:#fff;white-space:normal;font-size:9px;">Number of GHO trained (on job coaching)</th></tr>
            <tr><th class="tpl-tan">female</th><th class="tpl-tan">male</th><th class="tpl-tan">Total</th></tr>
          </thead>
          <tbody><tr>${nz(ghoF)}${nz(ghoM)}<td class="tpl-tan">${ghoF + ghoM}</td></tr></tbody>
        </table>
      </div>
    </div>
  `;
}

// -------------------- التبويب 4: لوحة التحليل والإنذار الوبائي --------------------
function renderAnalytics() {
  const ds = buildReportDataset();
  const { cases, refs, edewsDaily, edewsWeekly, label } = ds;
  const fCnt = cases.filter(isFemaleCase).length;
  const u5Cnt = cases.filter(c => UNDER_5_AGES.includes(c.ageGroup)).length;
  const idpCnt = cases.filter(c => c.specialGroup === 'IDPs').length;

  const diagMap = {};
  cases.forEach(c => { diagMap[c.diagId] = (diagMap[c.diagId] || 0) + 1; });
  const top8 = Object.entries(diagMap).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxVal = top8.length ? top8[0][1] : 1;

  const edewsList = DIAGNOSES.filter(d => EDEWS_DAILY_IDS.includes(d.id)).map(d => ({
    d, cnt: cases.filter(c => c.caseType === 'New' && c.diagId === d.id).length
  }));

  document.getElementById('analyticsContainer').innerHTML = `
    <div class="card"><strong>📊 التحليل الوبائي للنطاق: ${label}</strong></div>
    <div class="kpi-grid">
      <div class="kpi-card"><div class="kpi-val">${cases.length}</div><div class="kpi-lbl">إجمالي الاستشارات</div></div>
      <div class="kpi-card"><div class="kpi-val">${cases.length ? Math.round((fCnt/cases.length)*100) : 0}%</div><div class="kpi-lbl">نسبة الإناث (${fCnt})</div></div>
      <div class="kpi-card"><div class="kpi-val">${u5Cnt}</div><div class="kpi-lbl">أطفال IMCI (&lt;5 سنوات)</div></div>
      <div class="kpi-card"><div class="kpi-val" style="color:${edewsDaily>0?'#dc2626':'#16a34a'}">${edewsDaily}</div><div class="kpi-lbl">تنبيهات eDEWS اليومية (الأسبوعي: ${edewsWeekly})</div></div>
    </div>
    <div class="grid-2-resp">
      <div class="card">
        <div class="section-title"><span>🔥 أعلى 8 تشخيصات مسجلة</span><span>نازحون (IDPs): ${idpCnt} | إحالات: ${refs.length}</span></div>
        ${top8.length ? top8.map(([id, cnt]) => {
          const d = DIAGNOSES.find(x => x.id === Number(id));
          return `<div class="bar-row"><span style="width:170px;direction:ltr;text-align:left;">#${id} ${d.name}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round((cnt/maxVal)*100)}%"></div></div><strong>${cnt}</strong></div>`;
        }).join('') : '<p style="color:#64748b;">لا توجد بيانات في هذا النطاق بعد.</p>'}
      </div>
      <div class="card">
        <div class="section-title"><span>🚨 مرصد أمراض التبليغ اليومي الفوري (eDEWS Daily)</span></div>
        ${edewsList.map(x => `<div class="mini-item" style="${x.cnt>0?'background:#fee2e2;border-color:#dc2626;color:#991b1b;':''}">
          <span dir="ltr"><strong>#${x.d.id}</strong> ${x.d.name}</span><strong>${x.cnt} حالة جديدة</strong>
        </div>`).join('')}
      </div>
    </div>
    ${(() => {
      const mMap = {};
      cases.forEach(c => {
        const who = (c.enteredBy && c.enteredBy.trim()) ? c.enteredBy.trim() : 'غير محدد';
        mMap[who] = (mMap[who] || 0) + 1;
      });
      const mList = Object.entries(mMap).sort((a, b) => b[1] - a[1]);
      if (!mList.length) return '';
      const mMax = mList[0][1] || 1;
      return `<div class="card">
        <div class="section-title"><span>👥 توزيع الحالات المسجلة حسب أعضاء الفريق (${mList.length})</span></div>
        ${mList.map(([name, cnt]) => `<div class="bar-row"><span style="width:160px;">👤 ${name}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round((cnt/mMax)*100)}%"></div></div><strong>${cnt} حالة</strong></div>`).join('')}
      </div>`;
    })()}
  `;
}

// -------------------- التصدير المزدوج: حفظ مباشر في الجهاز + إرسال / مشاركة نسخة --------------------
function base64ToBlob(b64, type) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type });
}

function sanitizeExportFilename(filename) {
  return String(filename || 'ECHO23028_File')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'ECHO23028_File';
}

function writeBlobToCordovaDir(dirUrl, fileName, blob) {
  return new Promise((resolve, reject) => {
    window.resolveLocalFileSystemURL(dirUrl, dirEntry => {
      dirEntry.getFile(fileName, { create: true, exclusive: false }, fileEntry => {
        fileEntry.createWriter(writer => {
          writer.onwriteend = () => resolve(fileEntry.nativeURL || (dirUrl + fileName));
          writer.onerror = err => reject(err);
          writer.write(blob);
        }, reject);
      }, reject);
    }, reject);
  });
}

// حفظ الملف مباشرة في الجهاز (يدعم أندرويد APK عبر cordova-plugin-file + تنزيل مباشر في المتصفح)
async function saveBase64FileToDevice(pureBase64, filename, mimeType) {
  const safeName = sanitizeExportFilename(filename);
  const blob = base64ToBlob(pureBase64, mimeType);

  // 1. داخل تطبيق الأندرويد (Cordova) مع إضافة cordova-plugin-file
  if (window.cordova && window.resolveLocalFileSystemURL && window.cordova.file) {
    const candidateDirs = [];
    if (window.cordova.file.externalRootDirectory) {
      candidateDirs.push({ url: window.cordova.file.externalRootDirectory + 'Download/', label: 'مجلد التنزيلات (Download)' });
    }
    if (window.cordova.file.externalDataDirectory) {
      candidateDirs.push({ url: window.cordova.file.externalDataDirectory, label: 'مجلد التطبيق (Android/data/com.echo.morbiditypro/files)' });
    }
    for (const dir of candidateDirs) {
      try {
        await writeBlobToCordovaDir(dir.url, safeName, blob);
        showToast(`✅ تم حفظ الملف في ${dir.label}: ${safeName}`);
        alert(`✅ تم حفظ الملف في الجهاز بنجاح!\n\nاسم الملف:\n${safeName}\n\nالمسار:\n${dir.label}`);
        return true;
      } catch (e) {}
    }
  }

  // 2. إذا كان داخل APK قديم بدون cordova-plugin-file -> افتح نافذة الحفظ/المشاركة
  if (window.cordova && window.plugins && window.plugins.socialsharing) {
    await shareBase64File(pureBase64, safeName, mimeType, 'حفظ الملف في الجهاز (اختر الملفات أو Drive)');
    return true;
  }

  // 3. في المتصفح (جوال أو كمبيوتر) -> تنزيل مباشر لمجلد Downloads
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safeName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 2500);
  showToast('📥 تم حفظ الملف في مجلد التنزيلات: ' + safeName);
  return true;
}

// إرسال / مشاركة نسخة من الملف (واتساب / تيليجرام / بريد)
async function shareBase64File(pureBase64, filename, mimeType, chooserTitle) {
  const safeName = sanitizeExportFilename(filename);

  if (window.plugins && window.plugins.socialsharing) {
    const title = chooserTitle || 'إرسال نسخة عبر واتساب أو تطبيق آخر';
    window.plugins.socialsharing.shareWithOptions(
      { message: safeName, subject: safeName, files: [`df:${safeName};data:${mimeType};base64,${pureBase64}`], chooserTitle: title },
      () => showToast('✅ تمت مشاركة النسخة بنجاح'),
      () => window.plugins.socialsharing.shareWithOptions(
        { message: safeName, subject: safeName, files: [`df:${safeName};base64,${pureBase64}`], chooserTitle: title },
        () => showToast('✅ تمت مشاركة النسخة بنجاح'),
        () => window.plugins.socialsharing.share(null, safeName, `data:${mimeType};base64,${pureBase64}`, null)
      )
    );
    return;
  }

  const blob = base64ToBlob(pureBase64, mimeType);
  try {
    const file = new File([blob], safeName, { type: mimeType });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: safeName });
      return showToast('✅ تم إرسال النسخة بنجاح');
    }
  } catch (e) { if (e && e.name === 'AbortError') return; }

  // متصفح كمبيوتر لا يدعم Web Share -> تنزيل مباشر كنسخة جاهزة للإرسال
  await saveBase64FileToDevice(pureBase64, safeName, mimeType);
}

// -------------------- تصدير ملف Excel الرسمي المطابق للقالب 100% (حفظ في الجهاز / إرسال نسخة) --------------------
let pendingExcelExportMode = 'save';

async function exportOfficialExcel(mode) {
  const actionMode = mode === 'share' ? 'share' : 'save';
  const tpl = await resolveTemplateSource();
  if (!tpl) {
    pendingExportAfterTemplateUpload = true;
    pendingExcelExportMode = actionMode;
    await openTemplateModal();
    showToast('📂 اختر ملف القالب الرسمي (.xlsx) مرة واحدة وسيتم تعبئته وتصديره تلقائياً');
    return;
  }

  const overlay = document.getElementById('captureOverlay');
  const statusEl = document.getElementById('captureStatusText');
  statusEl.textContent = `جاري تعبئة القالب الرسمي (${(tpl.meta && tpl.meta.name) || 'ECHO 23028'}) بجميع الألوان والشعارات والمعادلات...`;
  overlay.classList.remove('hidden');

  try {
    const targetMonth = document.getElementById('reportMonthPicker').value || getAppReportingMonthForDate(document.getElementById('workDate').value);
    const cycleBounds = getAppReportingMonthBounds(targetMonth);
    const { pureBase64, filename } = await exportExactOfficialEchoExcel(
      allCases, dailyOps, standaloneRefs, diagComments, facility, targetMonth, cycleBounds
    );
    overlay.classList.add('hidden');
    const xlsxMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    if (actionMode === 'share') {
      await shareBase64File(pureBase64, filename, xlsxMime, 'إرسال نسخة من تقرير Excel الرسمي');
    } else {
      await saveBase64FileToDevice(pureBase64, filename, xlsxMime);
    }
  } catch (err) {
    overlay.classList.add('hidden');
    if (err && err.code === 'NO_TEMPLATE') {
      pendingExportAfterTemplateUpload = true;
      pendingExcelExportMode = actionMode;
      await openTemplateModal();
      return;
    }
    showToast('⚠️ تعذر تصدير القالب الرسمي: ' + (err.message || err));
  }
}

// -------------------- إدارة القالب الرسمي المرفوع داخل التطبيق --------------------
let pendingExportAfterTemplateUpload = false;

async function refreshTemplateStatusUI() {
  const statusEl = document.getElementById('templateStatusText');
  const delBtn = document.getElementById('btnDeleteTemplate');
  const hdrBtn = document.getElementById('btnTemplateMgr');

  const tpl = await resolveTemplateSource();
  if (!tpl) {
    if (statusEl) statusEl.innerHTML = '⚠️ <strong>لم يتم رفع القالب الرسمي بعد.</strong><br><small>ارفع ملف <code>جديد اكسل.xlsx</code> بالأسفل مرة واحدة ليُحفظ للأبد.</small>';
    if (delBtn) delBtn.classList.add('hidden');
    if (hdrBtn) { hdrBtn.textContent = '📄 رفع القالب'; hdrBtn.style.background = '#d97706'; }
    return null;
  }

  const m = tpl.meta || {};
  const sizeKB = m.size ? (m.size / 1024).toFixed(0) + ' KB' : '';
  const sheetsInfo = Array.isArray(m.sheets) && m.sheets.length ? ` | الأوراق: ${m.sheets.join(', ')}` : '';
  const srcLabel = tpl.source === 'uploaded' ? 'محفوظ في ذاكرة التطبيق (أوفلاين)' : 'مضمّن افتراضياً مع التطبيق';

  if (statusEl) {
    statusEl.innerHTML = `✅ <strong>${m.name || 'القالب الرسمي.xlsx'}</strong> ${sizeKB ? `(${sizeKB})` : ''}<br><small style="color:#0f766e;">${srcLabel}${sheetsInfo}</small>`;
  }
  if (delBtn) delBtn.classList.toggle('hidden', tpl.source !== 'uploaded');
  if (hdrBtn) { hdrBtn.textContent = '📄 القالب ✅'; hdrBtn.style.background = '#0d9488'; }
  return tpl;
}

async function openTemplateModal() {
  openModal('templateModal');
  await refreshTemplateStatusUI();
}

function handleTemplateUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const NativeReader = (window.FileReader && window.FileReader.REAL_READER) ? window.FileReader.REAL_READER : window.FileReader;
  const reader = new NativeReader();
  reader.onload = async ev => {
    try {
      const bytes = new Uint8Array(ev.target.result);
      const info = await inspectEchoTemplateBytes(bytes);
      const meta = {
        name: file.name,
        size: bytes.byteLength,
        sheets: info.sheetNames,
        weeks: info.weekSheets,
        savedAt: new Date().toISOString()
      };
      await saveUploadedTemplateToIDB(meta, bytes);
      await refreshTemplateStatusUI();
      showToast(`✅ تم حفظ القالب الرسمي (${file.name}) بنجاح — ${info.sheetNames.length} أوراق`);
      if (pendingExportAfterTemplateUpload) {
        pendingExportAfterTemplateUpload = false;
        closeModal('templateModal');
        await exportOfficialExcel(pendingExcelExportMode);
      }
    } catch (err) {
      showToast('⚠️ ' + (err.message || 'تعذر قراءة ملف القالب'));
    }
    e.target.value = '';
  };
  reader.readAsArrayBuffer(file);
}

async function deleteSavedTemplate() {
  if (!confirm('حذف القالب الرسمي المحفوظ من ذاكرة التطبيق؟')) return;
  await clearUploadedTemplateFromIDB();
  await refreshTemplateStatusUI();
  showToast('🗑️ تم حذف القالب المحفوظ');
}

async function exportOfficialExcelFromModal(mode) {
  closeModal('templateModal');
  await exportOfficialExcel(mode || 'save');
}

// -------------------- مركز دمج الفريق والنسخ الاحتياطي الأوفلاين (JSON) --------------------
function getBackupExportFilter(scope) {
  const workDate = document.getElementById('workDate').value;
  const repMonth = getAppReportingMonthForDate(workDate);
  if (scope === 'day') {
    return { tag: workDate, match: d => d === workDate };
  }
  if (scope === 'week') {
    const wk = getReportingWeekNumber(workDate);
    return { tag: `${repMonth}_${wk}`, match: d => getAppReportingMonthForDate(d) === repMonth && getReportingWeekNumber(d) === wk };
  }
  if (scope === 'month') {
    return { tag: repMonth, match: d => getAppReportingMonthForDate(d) === repMonth };
  }
  return { tag: `Full_${workDate}`, match: () => true };
}

function buildTeamExportPayload(scope) {
  const { tag, match } = getBackupExportFilter(scope);
  const myDev = getOrCreateDeviceId();
  const myName = getCurrentMemberName();

  const expCases = allCases.filter(c => match(c.date)).map(c => ({
    ...c,
    deviceId: c.deviceId || myDev,
    enteredBy: c.enteredBy || myName
  }));
  const expRefs = standaloneRefs.filter(r => match(r.date)).map(r => ({
    ...r,
    deviceId: r.deviceId || myDev,
    enteredBy: r.enteredBy || myName
  }));
  const expOps = {};
  Object.entries(dailyOps).forEach(([dt, v]) => {
    if (match(dt)) expOps[dt] = normalizeDailyOpsEntry(v, myDev, myName);
  });

  return {
    tag,
    payload: {
      schemaVersion: 3,
      exportedAt: new Date().toISOString(),
      exportScope: scope,
      sender: { deviceId: myDev, name: myName },
      facility,
      allCases: expCases,
      dailyOps: expOps,
      standaloneRefs: expRefs,
      diagComments,
      reportingCycles
    }
  };
}

function updateBackupScopePreview() {
  const scopeEl = document.getElementById('backupExportScope');
  const scope = scopeEl ? scopeEl.value : 'all';
  const { match } = getBackupExportFilter(scope);
  const cnt = allCases.filter(c => match(c.date)).length;
  const el = document.getElementById('modalScopeCount');
  if (el) el.textContent = cnt;
}

function openBackupModal() {
  document.getElementById('modalTotalCases').textContent = allCases.length;
  document.getElementById('backupPasteArea').value = '';
  const nameInput = document.getElementById('teamMemberNameInput');
  if (nameInput) nameInput.value = getCurrentMemberName();
  const idBadge = document.getElementById('deviceIdBadge');
  if (idBadge) idBadge.textContent = getOrCreateDeviceId();
  updateBackupScopePreview();
  openModal('backupModal');
}

function toSafeAsciiTag(str) {
  const map = {
    'أ':'A','إ':'I','آ':'A','ا':'a','ب':'b','ت':'t','ث':'th','ج':'j','ح':'h','خ':'kh',
    'د':'d','ذ':'dh','ر':'r','ز':'z','س':'s','ش':'sh','ص':'s','ض':'d','ط':'t','ظ':'z',
    'ع':'a','غ':'gh','ف':'f','ق':'q','ك':'k','ل':'l','م':'m','ن':'n','ه':'h','و':'w',
    'ي':'y','ى':'a','ة':'h','ئ':'e','ؤ':'o'
  };
  const trans = String(str || '').split('').map(ch => map[ch] ?? ch).join('');
  return trans.replace(/[^a-zA-Z0-9-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 20);
}

async function exportBackupJSON(mode) {
  const actionMode = mode === 'save' ? 'save' : 'share';
  const scope = (document.getElementById('backupExportScope') && document.getElementById('backupExportScope').value) || 'all';
  const { tag, payload } = buildTeamExportPayload(scope);
  const senderTag = toSafeAsciiTag(getCurrentMemberName()) || getOrCreateDeviceId().slice(-6);
  const fname = `ECHO23028_Team_${senderTag}_${tag}.json`;
  const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload, null, 2))));
  if (actionMode === 'save') {
    await saveBase64FileToDevice(b64, fname, 'application/json');
  } else {
    await shareBase64File(b64, fname, 'application/json', 'إرسال ملف بيانات الفريق (.json)');
  }
}

function copyBackupToClipboard() {
  const scope = (document.getElementById('backupExportScope') && document.getElementById('backupExportScope').value) || 'all';
  const { payload } = buildTeamExportPayload(scope);
  const txt = JSON.stringify(payload);
  document.getElementById('backupPasteArea').value = txt;
  if (navigator.clipboard) navigator.clipboard.writeText(txt).then(() => showToast('📋 تم نسخ كود الفريق للحافظة — الصقه في واتساب')).catch(() => {});
}

// دمج مصدر واحد (ملف JSON أو Excel أو نص) وإرجاع إحصائية تفصيلية دقيقة
function mergeSingleSourceIntoState(parsed, sourceLabel, mode, keepFacility) {
  const stats = {
    file: sourceLabel,
    sender: (parsed && parsed.sender && parsed.sender.name) || (parsed && parsed.facility && parsed.facility.doctor) || sourceLabel,
    casesAdded: 0,
    casesUpdated: 0,
    casesSkipped: 0,
    refsAdded: 0,
    opsDaysMerged: 0,
    commentsMerged: 0
  };

  const srcDevId = (parsed && parsed.sender && parsed.sender.deviceId) || ('SRC_' + sourceLabel.replace(/\W+/g, '').slice(0, 12));
  const srcName = stats.sender;

  if (parsed && typeof parsed.snapshot === 'string') {
    try { parsed = JSON.parse(parsed.snapshot); } catch (e) {}
  }
  const rawList = Array.isArray(parsed)
    ? parsed
    : (Array.isArray(parsed.allCases) ? parsed.allCases
      : Array.isArray(parsed.cases) ? parsed.cases
      : Array.isArray(parsed.records) ? parsed.records
      : Array.isArray(parsed.data) ? parsed.data : []);
  const cleanCases = rawList.map((r, i) => normalizeRecord(r, i, srcDevId, srcName)).filter(Boolean);

  // بناء فهرس الحالات الحالية بالـ uid الفريد + مفتاح احتياطي للملفات القديمة جداً بدون uid
  const uidIndex = new Map();
  const legacyKeySet = new Set();
  allCases.forEach((c, idx) => {
    if (c.uid) uidIndex.set(String(c.uid), idx);
    legacyKeySet.add(`${c.deviceId || 'L'}_${c.date}_${c.time}_${c.gender}_${c.ageGroup}_${c.diagId}_${c.serial}`);
  });

  cleanCases.forEach(item => {
    const hasUid = item._hasExplicitUid;
    delete item._hasExplicitUid;

    if (hasUid && uidIndex.has(item.uid)) {
      const existingIdx = uidIndex.get(item.uid);
      const existing = allCases[existingIdx];
      // إذا قام الزميل بتعديل نفس الحالة لاحقاً (updatedAt أحدث)، نحدّثها تلقائياً
      if ((item.updatedAt || 0) > (existing.updatedAt || 0)) {
        allCases[existingIdx] = { ...existing, ...item };
        stats.casesUpdated++;
      } else {
        stats.casesSkipped++;
      }
      return;
    }

    const legacyKey = `${item.deviceId || srcDevId}_${item.date}_${item.time}_${item.gender}_${item.ageGroup}_${item.diagId}_${item.serial}`;
    if (!hasUid && legacyKeySet.has(legacyKey)) {
      stats.casesSkipped++;
      return;
    }

    if (!hasUid) item.uid = `${srcDevId}_imp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    allCases.push(item);
    uidIndex.set(item.uid, allCases.length - 1);
    legacyKeySet.add(legacyKey);
    stats.casesAdded++;
  });

  if (parsed && !Array.isArray(parsed)) {
    // 1. بيانات المرفق (لا تُستبدل أثناء دمج الفريق إذا كان خيار الحماية مفعّلاً)
    if (parsed.facility && (mode === 'replace' || !keepFacility)) {
      facility = { ...facility, ...parsed.facility };
      syncFacilityUI();
    }

    // 2. دمج الفرز التمريضي و GHO حسب كل جهاز (byDevice) بدون تصفير أو تكرار
    if (parsed.dailyOps && typeof parsed.dailyOps === 'object') {
      Object.entries(parsed.dailyOps).forEach(([dt, incRaw]) => {
        const incNorm = normalizeDailyOpsEntry(incRaw, srcDevId, srcName);
        const incDevs = Object.entries(incNorm.byDevice || {});
        if (!incDevs.length) return;

        const curNorm = normalizeDailyOpsEntry(dailyOps[dt], getOrCreateDeviceId(), getCurrentMemberName());
        let changed = false;
        incDevs.forEach(([dev, v]) => {
          const sumV = (v.triageF || 0) + (v.triageM || 0) + (v.ghoF || 0) + (v.ghoM || 0);
          if (sumV === 0 && !curNorm.byDevice[dev]) return;
          const prev = curNorm.byDevice[dev];
          if (!prev || (v.updatedAt || 0) >= (prev.updatedAt || 0)) {
            curNorm.byDevice[dev] = { ...v };
            changed = true;
          }
        });
        if (changed) {
          dailyOps[dt] = recalcDailyOpsTotals(curNorm);
          stats.opsDaysMerged++;
        }
      });
    }

    // 3. دمج الإحالات المستقلة بدون تكرار عبر uid
    if (Array.isArray(parsed.standaloneRefs)) {
      const refIdxMap = new Map();
      standaloneRefs.forEach((r, idx) => {
        const key = r.uid || `${r.date}_${r.type}_${r.gender}_${r.ageGroup}_${r.comment || ''}`;
        refIdxMap.set(key, idx);
      });
      parsed.standaloneRefs.forEach(r => {
        if (!r || !r.date || !r.type) return;
        const cleanRef = {
          uid: r.uid || `${srcDevId}_ref_${r.date}_${r.type}_${r.gender}_${r.ageGroup}_${(r.comment || '').slice(0, 12)}`,
          deviceId: r.deviceId || srcDevId,
          enteredBy: r.enteredBy || srcName,
          updatedAt: Number(r.updatedAt) || 0,
          date: String(r.date).slice(0, 10),
          type: r.type,
          gender: r.gender === 'Male' ? 'Male' : 'Female',
          ageGroup: r.ageGroup || '19-49 years',
          cash: Boolean(r.cash),
          comment: String(r.comment || '')
        };
        if (refIdxMap.has(cleanRef.uid)) {
          const exIdx = refIdxMap.get(cleanRef.uid);
          if ((cleanRef.updatedAt || 0) > (standaloneRefs[exIdx].updatedAt || 0)) {
            standaloneRefs[exIdx] = cleanRef;
          }
        } else {
          standaloneRefs.push(cleanRef);
          refIdxMap.set(cleanRef.uid, standaloneRefs.length - 1);
          stats.refsAdded++;
        }
      });
    }

    // 4. دمج ملاحظات التشخيصات (HFMD / HFAM) بدون مسح الملاحظات السابقة
    if (parsed.diagComments && typeof parsed.diagComments === 'object') {
      Object.entries(parsed.diagComments).forEach(([diagId, v]) => {
        if (!v || (!v.hfmd && !v.hfam)) return;
        const cur = diagComments[diagId] || { hfmd: '', hfam: '' };
        const mergeTxt = (a, b) => {
          const sA = String(a || '').trim();
          const sB = String(b || '').trim();
          if (!sB) return sA;
          if (!sA) return sB;
          if (sA.includes(sB)) return sA;
          return `${sA} | ${sB}`;
        };
        const nextHfmd = mergeTxt(cur.hfmd, v.hfmd);
        const nextHfam = mergeTxt(cur.hfam, v.hfam);
        if (nextHfmd !== cur.hfmd || nextHfam !== cur.hfam) {
          diagComments[diagId] = { hfmd: nextHfmd, hfam: nextHfam };
          stats.commentsMerged++;
        }
      });
    }

    // 5. دمج الدورات الشهرية المخصصة إذا لم تكن مضبوطة محلياً
    if (parsed.reportingCycles && typeof parsed.reportingCycles === 'object') {
      Object.entries(parsed.reportingCycles).forEach(([ym, c]) => {
        if (c && c.start && c.end && !reportingCycles[ym]) {
          reportingCycles[ym] = { start: c.start, end: c.end };
        }
      });
    }
  }

  return stats;
}

function parseSmartBackupText(rawText) {
  let txt = String(rawText || '').replace(/^\uFEFF/, '').replace(/\u0000/g, '').trim();
  if (!txt) throw new Error('الملف فارغ');

  // محاولة فك Base64 إذا كان النص بصيغة data:application/json;base64,...
  if (/^data:[^;]*;base64,/i.test(txt)) {
    const b64 = txt.split(',')[1] || '';
    txt = decodeURIComponent(escape(atob(b64.trim())));
  }

  let parsed = null;
  try {
    parsed = JSON.parse(txt);
  } catch (e1) {
    // محاولة استخراج كود JSON من داخل رسالة واتساب أو نص محيط به
    const firstObj = txt.indexOf('{');
    const lastObj = txt.lastIndexOf('}');
    const firstArr = txt.indexOf('[');
    const lastArr = txt.lastIndexOf(']');
    let candidate = '';
    if (firstObj !== -1 && lastObj > firstObj && (firstArr === -1 || firstObj < firstArr)) {
      candidate = txt.slice(firstObj, lastObj + 1);
    } else if (firstArr !== -1 && lastArr > firstArr) {
      candidate = txt.slice(firstArr, lastArr + 1);
    }
    if (!candidate) throw new Error('الملف لا يحتوي على بيانات JSON صالحة');
    parsed = JSON.parse(candidate);
  }

  // في حال كان JSON مشفّراً كنص مزدوج
  if (typeof parsed === 'string') {
    parsed = JSON.parse(parsed);
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('بنية ملف النسخة الاحتياطية غير معروفة');
  }
  return parsed;
}

function decodeBytesToText(bytes) {
  // UTF-16 LE BOM (FF FE) or UTF-16 BE BOM (FE FF)
  if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
    return new TextDecoder('utf-16le').decode(bytes);
  }
  if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
    return new TextDecoder('utf-16be').decode(bytes);
  }
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder('utf-8').decode(bytes);
  }
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
  try { return decodeURIComponent(escape(out)); } catch (e) { return out; }
}

function readFileAsUint8Array(file) {
  if (file && typeof file.arrayBuffer === 'function') {
    return file.arrayBuffer().then(buf => new Uint8Array(buf)).catch(() => readFileViaFileReader(file));
  }
  return readFileViaFileReader(file);
}

function readFileViaFileReader(file) {
  return new Promise((resolve, reject) => {
    const NativeReader = (window.FileReader && window.FileReader.REAL_READER) ? window.FileReader.REAL_READER : window.FileReader;
    const reader = new NativeReader();
    reader.onload = ev => {
      if (ev.target.result instanceof ArrayBuffer) {
        resolve(new Uint8Array(ev.target.result));
      } else {
        resolve(null);
      }
    };
    reader.onerror = () => reject(new Error('تعذر قراءة محتوى الملف من الجهاز'));
    reader.readAsArrayBuffer(file);
  });
}

function readFileAsTextFallback(file) {
  if (file && typeof file.text === 'function') {
    return file.text();
  }
  return new Promise((resolve, reject) => {
    const NativeReader = (window.FileReader && window.FileReader.REAL_READER) ? window.FileReader.REAL_READER : window.FileReader;
    const reader = new NativeReader();
    reader.onload = ev => resolve(String(ev.target.result || ''));
    reader.onerror = () => reject(new Error('تعذر قراءة النص من الملف'));
    reader.readAsText(file);
  });
}

function isRecognizedBackupObject(obj) {
  if (!obj || typeof obj !== 'object') return false;
  if (Array.isArray(obj)) return obj.length > 0;
  return (
    Array.isArray(obj.allCases) ||
    Array.isArray(obj.cases) ||
    Array.isArray(obj.records) ||
    Array.isArray(obj.data) ||
    Boolean(obj.dailyOps && typeof obj.dailyOps === 'object') ||
    Array.isArray(obj.standaloneRefs) ||
    Boolean(obj.diagComments && typeof obj.diagComments === 'object') ||
    typeof obj.snapshot === 'string'
  );
}

async function readSingleRestoreFile(file) {
  const fname = (file && file.name) ? file.name : 'ملف_غير_مسمى';
  try {
    let bytes = null;
    try { bytes = await readFileAsUint8Array(file); } catch (e) {}

    // فحص البايتات الأولى لمعرفة نوع الملف الحقيقي حتى لو غيّر أندرويد أو واتساب الامتداد
    const isZipMagic = bytes && bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04;
    const isOleMagic = bytes && bytes.length >= 4 && bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0;
    const looksExcelByName = /\.(xlsx|xls|csv)$/i.test(fname);

    // 1. ملفات Excel حقيقية (XLSX / XLS)
    if (isZipMagic || isOleMagic || /\.(xlsx|xls)$/i.test(fname)) {
      if (typeof XLSX === 'undefined') {
        return { name: fname, error: 'مكتبة قراءة Excel غير محمّلة' };
      }
      const wb = XLSX.read(bytes, { type: 'array' });
      const sheetNames = wb.SheetNames || [];
      // التحقق مما إذا كان المستخدم اختار ملف تقرير ECHO الرسمي المجمّع بدلاً من ملف النسخة الاحتياطية JSON
      if (sheetNames.includes('W1') && sheetNames.includes('Monthly')) {
        return { name: fname, error: 'هذا ملف تقرير ECHO المجمّع (وليس ملف نسخة احتياطية). للدمج الجماعي استخدم ملفات (.json) المُصدّرة من زر «إرسال / حفظ ملف الفريق».' };
      }
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetNames[0]]);
      if (!rows || !rows.length) {
        return { name: fname, error: 'ملف الإكسل فارغ أو لا يحتوي على صفوف حالات' };
      }
      return { name: fname, parsed: rows };
    }

    // 2. قراءة كنص ومحاولة تحليل JSON أولاً (يعمل حتى لو كان الملف بدون امتداد أو بامتداد .txt / .bin / .json)
    let textContent = '';
    if (bytes && bytes.length > 0) {
      textContent = decodeBytesToText(bytes);
    } else {
      textContent = await readFileAsTextFallback(file);
    }

    try {
      const parsed = parseSmartBackupText(textContent);
      if (!isRecognizedBackupObject(parsed)) {
        return { name: fname, error: 'ملف JSON لا يحتوي على بنية بيانات تطبيق Morbidity Pro' };
      }
      return { name: fname, parsed };
    } catch (jsonErr) {
      // 3. محاولة أخيرة كـ CSV إذا كان امتداده .csv
      if (looksExcelByName && typeof XLSX !== 'undefined' && bytes) {
        try {
          const wb = XLSX.read(bytes, { type: 'array' });
          const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
          if (rows && rows.length) return { name: fname, parsed: rows };
        } catch (eCsv) {}
      }
      return { name: fname, error: jsonErr.message || 'صيغة الملف غير مدعومة (تأكد أنه ملف .json من التطبيق)' };
    }
  } catch (err) {
    return { name: fname, error: (err && err.message) ? err.message : 'تعذر قراءة الملف من الهاتف' };
  }
}

function renderMergeReportUI(resultsList, errorList, mode) {
  const box = document.getElementById('mergeReportBox');
  const content = document.getElementById('mergeReportContent');
  if (!box || !content) return;

  const totAdded = resultsList.reduce((a, r) => a + r.casesAdded, 0);
  const totUpdated = resultsList.reduce((a, r) => a + r.casesUpdated, 0);
  const totSkipped = resultsList.reduce((a, r) => a + r.casesSkipped, 0);
  const totRefs = resultsList.reduce((a, r) => a + r.refsAdded, 0);
  const totOps = resultsList.reduce((a, r) => a + r.opsDaysMerged, 0);

  const summaryHtml = resultsList.length ? `
    <div class="merge-summary-banner">
      ${mode === 'replace' ? '🔄 تم استبدال البيانات:' : '🤝 اكتمل الدمج الجماعي:'}
      +${totAdded} حالة جديدة${totUpdated ? ` | ✏️ ${totUpdated} محدّثة` : ''}${totSkipped ? ` | ⏭️ ${totSkipped} مكررة` : ''}${totRefs ? ` | 🚑 +${totRefs} إحالة` : ''}${totOps ? ` | 🩺 ${totOps} يوم فرز` : ''}
      — الإجمالي الآن: ${allCases.length} حالة
    </div>` : '';

  const okRows = resultsList.map(r => `<div class="merge-file-row">
    <strong>📄 ${r.file}</strong> <span class="member-tag">👤 ${r.sender}</span><br>
    ✅ جديد: <b>${r.casesAdded}</b> | ✏️ محدّث: <b>${r.casesUpdated}</b> | ⏭️ مكرر: <b>${r.casesSkipped}</b> | 🚑 إحالات: <b>${r.refsAdded}</b> | 🩺 أيام فرز/GHO: <b>${r.opsDaysMerged}</b>
  </div>`).join('');

  const errRows = (errorList || []).map(e => `<div class="merge-file-err">
    <strong>⚠️ ${e.name}</strong><br>${e.error}
  </div>`).join('');

  content.innerHTML = summaryHtml + okRows + errRows;
  box.classList.remove('hidden');
  setTimeout(() => { try { box.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) {} }, 80);
}

function applyBatchRestoredSources(sourcesArray, errorList) {
  const errs = errorList || [];
  const mode = document.querySelector('input[name="restoreMode"]:checked').value;
  const keepFacility = document.getElementById('chkKeepFacilityOnMerge') ? document.getElementById('chkKeepFacilityOnMerge').checked : true;

  if (!sourcesArray.length) {
    renderMergeReportUI([], errs, mode);
    showToast('⚠️ لم يتم العثور على ملفات صالحة للدمج — راجع التفاصيل بالأسفل');
    return;
  }

  if (mode === 'replace') {
    allCases = [];
    dailyOps = {};
    standaloneRefs = [];
    diagComments = {};
  }

  const results = sourcesArray.map(src => mergeSingleSourceIntoState(src.parsed, src.name, mode, keepFacility));

  // ترتيب الحالات زمنياً وإعادة ترقيم التسلسل اليومي
  allCases.sort((a, b) => (a.date + ' ' + a.time).localeCompare(b.date + ' ' + b.time));
  recalculateDailySerials();
  saveAllState();
  refreshAllViews();
  renderQuickPicks();

  document.getElementById('modalTotalCases').textContent = allCases.length;
  updateBackupScopePreview();
  renderMergeReportUI(results, errs, mode);

  const totAdded = results.reduce((a, r) => a + r.casesAdded, 0);
  const totOps = results.reduce((a, r) => a + r.opsDaysMerged, 0);
  showToast(`✅ تم دمج ${results.length} ملف بنجاح (+${totAdded} حالة${totOps ? ` | ${totOps} يوم فرز` : ''} | الإجمالي: ${allCases.length})`);
}

async function handleUniversalRestore(e) {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
  const loaded = await Promise.all(files.map(readSingleRestoreFile));
  e.target.value = '';
  const valid = loaded.filter(x => x && x.parsed && !x.error);
  const failed = loaded.filter(x => !x || x.error);
  applyBatchRestoredSources(valid, failed);
}

function restoreFromText() {
  try {
    const parsed = parseSmartBackupText(document.getElementById('backupPasteArea').value);
    if (!isRecognizedBackupObject(parsed)) {
      return showToast('⚠️ النص الملصق لا يحتوي على بيانات صالحة للتطبيق');
    }
    applyBatchRestoredSources([{ name: 'نص ملصق من الحافظة', parsed }], []);
  } catch (err) {
    showToast('⚠️ ' + (err.message || 'النص الملصق غير صالح (تأكد من نسخ كود JSON كاملاً)'));
  }
}

window.addEventListener('DOMContentLoaded', initApp);
