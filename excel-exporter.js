// ============================================================================
// ECHO 23028 Dynamic Exact-Template Excel Exporter
// Supports:
//   1) User-uploaded .xlsx template saved permanently offline in IndexedDB
//   2) Optional bundled ./template.xlsx in repo/APK
//   3) Legacy window.ECHO_TEMPLATE_XLSX_B64 fallback
// Preserves 100% of Colors, Borders, Fonts, Logos, Merged Cells, Printer
// Settings & Official Formulas across W1..W5 (or W1..W4) + Monthly!
// ============================================================================

const ECHO_DIAG_ROWS = [
  15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,
  45,46,47,48,49,
  51,52,53,54,55,56,57,58,59,60,61,62,63,
  65,66,
  68,69,70,
  72,73,74
];

const ECHO_REF_ROWS = {
  emergency_hosp: 81,
  sc: 82,
  ctc: 83,
  covid19: 84,
  pregnancy: 85,
  delivery: 86,
  mental_health: 87,
  other: 88
};

const ECHO_DRUG_COLS = {
  nifedipine: 26,         // Z
  methyldopa: 28,         // AB
  misoprostol: 30,        // AD
  hydralazine: 32,        // AF
  magnesium_sulfate: 33   // AG
};

// -------------------- IndexedDB Template Storage --------------------
function openEchoTemplateDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('ECHO23028_DB', 1);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('store')) db.createObjectStore('store');
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = e => reject(e.target.error || new Error('IndexedDB Error'));
  });
}

async function saveUploadedTemplateToIDB(meta, uint8Bytes) {
  const db = await openEchoTemplateDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('store', 'readwrite');
    const st = tx.objectStore('store');
    st.put(meta, 'official_template_meta');
    st.put(uint8Bytes, 'official_template_bytes');
    tx.oncomplete = () => resolve(true);
    tx.onerror = e => reject(e.target.error || new Error('Failed to save template'));
  });
}

async function loadUploadedTemplateFromIDB() {
  try {
    const db = await openEchoTemplateDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('store', 'readonly');
      const st = tx.objectStore('store');
      const rMeta = st.get('official_template_meta');
      const rBytes = st.get('official_template_bytes');
      tx.oncomplete = () => {
        if (rBytes.result) {
          resolve({ meta: rMeta.result || {}, bytes: rBytes.result });
        } else {
          resolve(null);
        }
      };
      tx.onerror = e => reject(e.target.error);
    });
  } catch (e) {
    return null;
  }
}

async function clearUploadedTemplateFromIDB() {
  const db = await openEchoTemplateDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('store', 'readwrite');
    const st = tx.objectStore('store');
    st.delete('official_template_meta');
    st.delete('official_template_bytes');
    tx.oncomplete = () => resolve(true);
    tx.onerror = e => reject(e.target.error);
  });
}

// Inspect any .xlsx bytes using JSZip to verify sheet structure
async function inspectEchoTemplateBytes(uint8Bytes) {
  if (typeof JSZip === 'undefined') throw new Error('مكتبة JSZip غير محمّلة');
  const zip = await JSZip.loadAsync(uint8Bytes);
  if (!zip.file('xl/workbook.xml') || !zip.file('xl/_rels/workbook.xml.rels')) {
    throw new Error('الملف المختار ليس ملف Excel (.xlsx) صالحاً');
  }
  const sheetPaths = await resolveSheetPaths(zip);
  const sheetNames = Object.keys(sheetPaths);
  const weekSheets = ['W1', 'W2', 'W3', 'W4', 'W5'].filter(w => sheetPaths[w]);
  const hasMonthly = Boolean(sheetPaths['Monthly']);
  if (weekSheets.length === 0 && !hasMonthly) {
    throw new Error('هذا الملف لا يحتوي على أوراق التقرير الرسمي (W1..W5 أو Monthly)');
  }
  return { sheetNames, weekSheets, hasMonthly, sheetPaths };
}

// Load bundled ./template.xlsx via Fetch OR XMLHttpRequest (supports Web, GitHub Pages & Cordova file:// APK)
async function loadBundledTemplateXlsx() {
  // 1) Try Fetch API (works on HTTPS / GitHub Pages / Cordova https://localhost)
  try {
    const res = await fetch('./template.xlsx', { cache: 'no-cache' });
    if (res && res.ok) {
      const buf = await res.arrayBuffer();
      if (buf && buf.byteLength > 1000) return new Uint8Array(buf);
    }
  } catch (e) {}

  // 2) Fallback to XMLHttpRequest (required for Cordova Android file:///android_asset/www/ mode)
  return await new Promise(resolve => {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', './template.xlsx', true);
      xhr.responseType = 'arraybuffer';
      xhr.onload = () => {
        if ((xhr.status === 200 || xhr.status === 0) && xhr.response && xhr.response.byteLength > 1000) {
          resolve(new Uint8Array(xhr.response));
        } else {
          resolve(null);
        }
      };
      xhr.onerror = () => resolve(null);
      xhr.send();
    } catch (e) {
      resolve(null);
    }
  });
}

// Resolve active template bytes in priority order:
// 1. User-uploaded template in IndexedDB
// 2. Bundled ./template.xlsx in GitHub repo / Android APK
// 3. Legacy window.ECHO_TEMPLATE_XLSX_B64
async function resolveTemplateSource() {
  const saved = await loadUploadedTemplateFromIDB();
  if (saved && saved.bytes) {
    return { source: 'uploaded', bytes: saved.bytes, meta: saved.meta };
  }

  const bundledBytes = await loadBundledTemplateXlsx();
  if (bundledBytes) {
    let sheets = [];
    try {
      const info = await inspectEchoTemplateBytes(bundledBytes);
      sheets = info.sheetNames || [];
    } catch (e) {}
    return {
      source: 'bundled',
      bytes: bundledBytes,
      meta: { name: 'template.xlsx', size: bundledBytes.byteLength, sheets }
    };
  }

  if (window.ECHO_TEMPLATE_XLSX_B64) {
    return { source: 'b64', b64: window.ECHO_TEMPLATE_XLSX_B64, meta: { name: 'Embedded Template' } };
  }

  return null;
}

// -------------------- XML & Date Helpers --------------------
function colNumToLet(n) {
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function colLetToNum(str) {
  let n = 0;
  for (let i = 0; i < str.length; i++) {
    n = n * 26 + (str.charCodeAt(i) - 64);
  }
  return n;
}

function escXml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function isoDateToExcelSerial(dateStr) {
  const parts = String(dateStr || '').split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return 46319;
  const utc = Date.UTC(parts[0], parts[1] - 1, parts[2]);
  const epoch = Date.UTC(1899, 11, 30);
  return Math.round((utc - epoch) / 86400000);
}

function formatShortDMY(dateStr) {
  const p = String(dateStr || '').split('-');
  if (p.length !== 3) return dateStr || '';
  return `${Number(p[2])}/${p[1]}/${p[0]}`;
}

function addDaysISO(dateStr, days) {
  const p = String(dateStr).split('-').map(Number);
  const d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + days));
  return d.toISOString().slice(0, 10);
}

function daysBetweenISO(d1, d2) {
  return isoDateToExcelSerial(d2) - isoDateToExcelSerial(d1);
}

// Reporting cycle: 26th of previous month -> 25th of target month (e.g. 2026-11 = 2026-10-26 to 2026-11-25)
function getReportingMonthBounds(monthYYYYMM) {
  const [yr, mo] = String(monthYYYYMM || '').split('-').map(Number);
  const py = mo === 1 ? yr - 1 : yr;
  const pm = mo === 1 ? 12 : mo - 1;
  const startISO = `${py}-${String(pm).padStart(2, '0')}-26`;
  const endISO = `${yr}-${String(mo).padStart(2, '0')}-25`;
  return { startISO, endISO };
}

function getReportingMonthForDate(dateStr) {
  const [yr, mo, dy] = String(dateStr || '').split('-').map(Number);
  if (!yr || !mo || !dy) return new Date().toISOString().slice(0, 7);
  if (dy >= 26) {
    const ny = mo === 12 ? yr + 1 : yr;
    const nm = mo === 12 ? 1 : mo + 1;
    return `${ny}-${String(nm).padStart(2, '0')}`;
  }
  return `${yr}-${String(mo).padStart(2, '0')}`;
}

function excelWeekday(isoDateStr) {
  const [y, m, d] = isoDateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 1; // Sun=1..Sat=7
}

async function resolveSheetPaths(zip) {
  const wbXml = await zip.file('xl/workbook.xml').async('string');
  const relsXml = await zip.file('xl/_rels/workbook.xml.rels').async('string');

  const relMap = {};
  const relRe = /<Relationship\s+([^>]+?)\/>/g;
  let rm;
  while ((rm = relRe.exec(relsXml)) !== null) {
    const idM = rm[1].match(/Id="([^"]+)"/);
    const tgtM = rm[1].match(/Target="([^"]+)"/);
    if (idM && tgtM) {
      let target = tgtM[1].replace(/^\/+/, '');
      if (!target.startsWith('xl/')) target = 'xl/' + target;
      relMap[idM[1]] = target;
    }
  }

  const sheetMap = {};
  const shRe = /<sheet\s+([^>]+?)\/>/g;
  let sm;
  while ((sm = shRe.exec(wbXml)) !== null) {
    const nameM = sm[1].match(/name="([^"]+)"/);
    const ridM = sm[1].match(/r:id="([^"]+)"/);
    if (nameM && ridM && relMap[ridM[1]]) {
      sheetMap[nameM[1]] = relMap[ridM[1]];
    }
  }
  return sheetMap;
}

// Single-pass safe OOXML cell patcher (preserves styles, borders, colors, shared & array formulas 100%)
function patchWorksheetXml(xml, opsMap) {
  const matched = new Set();

  let out = xml.replace(/<c r="([A-Z]+\d+)"([^>/]*)(?:\/>|>([\s\S]*?)<\/c>)/g, (full, ref, attrs, inner) => {
    const op = opsMap[ref];
    if (!op) return full;
    matched.add(ref);

    const cleanAttrs = attrs.replace(/\s+t="[^"]*"/g, '');

    if (op.kind === 'num') {
      if (op.val === null || op.val === undefined || op.val === '' || op.val === 0) {
        return `<c r="${ref}"${cleanAttrs}/>`;
      }
      return `<c r="${ref}"${cleanAttrs}><v>${op.val}</v></c>`;
    }

    if (op.kind === 'numStrict') {
      return `<c r="${ref}"${cleanAttrs}><v>${op.val}</v></c>`;
    }

    if (op.kind === 'str') {
      if (!op.val) return `<c r="${ref}"${cleanAttrs}/>`;
      return `<c r="${ref}"${cleanAttrs} t="inlineStr"><is><t xml:space="preserve">${escXml(op.val)}</t></is></c>`;
    }

    if (op.kind === 'formulaCache') {
      const innerStr = inner || '';
      const fMatch = innerStr.match(/<f(?:\s[^>/]*)?\/>|<f(?:\s[^>/]*)?>[\s\S]*?<\/f>/);
      if (!fMatch) {
        if (op.isStr) {
          return op.val ? `<c r="${ref}"${cleanAttrs} t="inlineStr"><is><t xml:space="preserve">${escXml(op.val)}</t></is></c>` : `<c r="${ref}"${cleanAttrs}/>`;
        }
        return `<c r="${ref}"${cleanAttrs}><v>${op.val}</v></c>`;
      }
      const fTag = fMatch[0];
      if (op.isStr) {
        return `<c r="${ref}"${cleanAttrs} t="str">${fTag}<v>${escXml(op.val)}</v></c>`;
      }
      return `<c r="${ref}"${cleanAttrs}>${fTag}<v>${op.val}</v></c>`;
    }

    return full;
  });

  // Insert any cell not pre-existing in template XML
  const missingByRow = {};
  for (const [ref, op] of Object.entries(opsMap)) {
    if (matched.has(ref)) continue;
    if (op.kind === 'num' && (!op.val || op.val === 0)) continue;
    if (op.kind === 'str' && !op.val) continue;
    if (op.kind === 'formulaCache') continue;
    const m = ref.match(/^([A-Z]+)(\d+)$/);
    if (!m) continue;
    const rowNum = m[2];
    if (!missingByRow[rowNum]) missingByRow[rowNum] = [];
    missingByRow[rowNum].push({ ref, colNum: colLetToNum(m[1]), op });
  }

  for (const [rowNum, items] of Object.entries(missingByRow)) {
    items.sort((a, b) => a.colNum - b.colNum);
    const rowRe = new RegExp(`(<row r="${rowNum}"[^>]*>)([\\s\\S]*?)(<\\/row>)`);
    out = out.replace(rowRe, (full, openTag, rowBody, closeTag) => {
      let updatedBody = rowBody;
      items.forEach(({ ref, colNum, op }) => {
        const cellXml = op.kind === 'str'
          ? `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escXml(op.val)}</t></is></c>`
          : `<c r="${ref}"><v>${op.val}</v></c>`;
        let inserted = false;
        const cellScan = /<c r="([A-Z]+)\d+"/g;
        let cm;
        while ((cm = cellScan.exec(updatedBody)) !== null) {
          if (colLetToNum(cm[1]) > colNum) {
            updatedBody = updatedBody.slice(0, cm.index) + cellXml + updatedBody.slice(cm.index);
            inserted = true;
            break;
          }
        }
        if (!inserted) updatedBody += cellXml;
      });
      return openTag + updatedBody + closeTag;
    });
  }

  return out;
}

// -------------------- Data Bucketing & Aggregation --------------------
function computeDayBucket(dayCases, dayRefs, dayOps) {
  const diagMat = {};
  DIAGNOSES.forEach(d => {
    const dc = dayCases.filter(c => Number(c.diagId) === d.id);
    const arr = new Array(27).fill(0);
    AGE_GROUPS.forEach((ag, i) => {
      arr[i * 2] = dc.filter(c => c.caseType === 'New' && c.ageGroup === ag && isFemaleCase(c)).length;
      arr[i * 2 + 1] = dc.filter(c => c.caseType === 'New' && c.ageGroup === ag && isMaleCase(c)).length;
      arr[12 + i * 2] = dc.filter(c => c.caseType === 'Follow up' && c.ageGroup === ag && isFemaleCase(c)).length;
      arr[12 + i * 2 + 1] = dc.filter(c => c.caseType === 'Follow up' && c.ageGroup === ag && isMaleCase(c)).length;
    });
    let tf = 0, tm = 0;
    for (let i = 0; i < 24; i += 2) { tf += arr[i]; tm += arr[i + 1]; }
    arr[24] = tf; arr[25] = tm; arr[26] = tf + tm;
    diagMat[d.id] = arr;
  });

  const sumRange = (a, b) => {
    const s = new Array(27).fill(0);
    for (let id = a; id <= b; id++) {
      for (let i = 0; i < 27; i++) s[i] += diagMat[id][i];
    }
    return s;
  };

  const sub_a = sumRange(1, 29);
  const sub_b = sumRange(30, 34);
  const cat_A = sumRange(1, 34);
  const cat_B = sumRange(35, 47);
  const cat_C = sumRange(48, 49);
  const cat_D = sumRange(50, 52);
  const cat_E = sumRange(53, 55);
  const total75 = sumRange(1, 55);

  const newBenF = AGE_GROUPS.map((ag, i) => {
    const maxTot = total75[i * 2] + total75[12 + i * 2];
    const nb = dayCases.filter(c => isFemaleCase(c) && c.ageGroup === ag && (c.benType || c.caseType) === 'New').length;
    return Math.min(maxTot, nb);
  });
  const newBenM = AGE_GROUPS.map((ag, i) => {
    const maxTot = total75[i * 2 + 1] + total75[12 + i * 2 + 1];
    const nb = dayCases.filter(c => isMaleCase(c) && c.ageGroup === ag && (c.benType || c.caseType) === 'New').length;
    return Math.min(maxTot, nb);
  });
  const fuBenF = AGE_GROUPS.map((ag, i) => Math.max(0, (total75[i * 2] + total75[12 + i * 2]) - newBenF[i]));
  const fuBenM = AGE_GROUPS.map((ag, i) => Math.max(0, (total75[i * 2 + 1] + total75[12 + i * 2 + 1]) - newBenM[i]));

  const refMat = {};
  REFERRAL_TYPES.forEach(rt => {
    const rl = dayRefs.filter(r => r.type === rt.id);
    const arr = new Array(15).fill(0);
    AGE_GROUPS.forEach((ag, i) => {
      arr[i * 2] = rl.filter(r => r.ageGroup === ag && isFemaleCase(r)).length;
      arr[i * 2 + 1] = rl.filter(r => r.ageGroup === ag && isMaleCase(r)).length;
    });
    let tf = 0, tm = 0;
    for (let i = 0; i < 12; i += 2) { tf += arr[i]; tm += arr[i + 1]; }
    arr[12] = tf; arr[13] = tm; arr[14] = tf + tm;
    const comment = rl.map(r => r.comment).filter(Boolean).join('; ');
    refMat[rt.id] = { arr, comment };
  });

  const specMat = {};
  ['IDPs', 'Migrants', 'Disability'].forEach(sg => {
    const uF = dayCases.filter(c => c.specialGroup === sg && UNDER_18_AGES.includes(c.ageGroup) && isFemaleCase(c)).length;
    const uM = dayCases.filter(c => c.specialGroup === sg && UNDER_18_AGES.includes(c.ageGroup) && isMaleCase(c)).length;
    const oF = dayCases.filter(c => c.specialGroup === sg && OVER_18_AGES.includes(c.ageGroup) && isFemaleCase(c)).length;
    const oM = dayCases.filter(c => c.specialGroup === sg && OVER_18_AGES.includes(c.ageGroup) && isMaleCase(c)).length;
    specMat[sg] = [uF, uM, oF, oM, uF + uM + oF + oM];
  });

  const drugs = {};
  let drugsTot = 0;
  RESTRICTED_DRUGS.forEach(dr => {
    const cnt = dayCases.filter(c => c.restrictedDrugs && c.restrictedDrugs.includes(dr.id)).length;
    drugs[dr.id] = cnt;
    drugsTot += cnt;
  });

  const vitA = [
    dayCases.filter(c => c.vitA && c.ageGroup === '0-6 months' && isFemaleCase(c)).length,
    dayCases.filter(c => c.vitA && c.ageGroup === '0-6 months' && isMaleCase(c)).length,
    dayCases.filter(c => c.vitA && c.ageGroup === '7-59 months' && isFemaleCase(c)).length,
    dayCases.filter(c => c.vitA && c.ageGroup === '7-59 months' && isMaleCase(c)).length
  ];

  const imci = [
    total75[0] + total75[12],
    total75[1] + total75[13],
    total75[2] + total75[14],
    total75[3] + total75[15]
  ];

  return {
    diagMat, sub_a, sub_b, cat_A, cat_B, cat_C, cat_D, cat_E, total75,
    newBenF, newBenM, fuBenF, fuBenM,
    refMat, specMat, drugs, drugsTot, vitA, imci,
    elderlyF: dayCases.filter(c => c.elderly65 && isFemaleCase(c)).length,
    elderlyM: dayCases.filter(c => c.elderly65 && isMaleCase(c)).length,
    triageF: Number(dayOps.triageF) || 0,
    triageM: Number(dayOps.triageM) || 0,
    ghoF: Number(dayOps.ghoF) || 0,
    ghoM: Number(dayOps.ghoM) || 0
  };
}

function sumDayBuckets(buckets) {
  const sumArr = (getter, len) => {
    const out = new Array(len).fill(0);
    buckets.forEach(b => {
      const a = getter(b);
      for (let i = 0; i < len; i++) out[i] += a[i];
    });
    return out;
  };
  const diagMat = {};
  DIAGNOSES.forEach(d => { diagMat[d.id] = sumArr(b => b.diagMat[d.id], 27); });
  const refMat = {};
  REFERRAL_TYPES.forEach(rt => {
    refMat[rt.id] = {
      arr: sumArr(b => b.refMat[rt.id].arr, 15),
      comment: buckets.map(b => b.refMat[rt.id].comment).filter(Boolean).join(', ')
    };
  });
  const specMat = {};
  ['IDPs', 'Migrants', 'Disability'].forEach(sg => { specMat[sg] = sumArr(b => b.specMat[sg], 5); });
  const drugs = {};
  let drugsTot = 0;
  RESTRICTED_DRUGS.forEach(dr => {
    drugs[dr.id] = buckets.reduce((acc, b) => acc + b.drugs[dr.id], 0);
    drugsTot += drugs[dr.id];
  });

  let edewsDaily = 0;
  EDEWS_DAILY_IDS.forEach(id => { for (let i = 0; i < 12; i++) edewsDaily += diagMat[id][i]; });
  let notifiableNewTotal = 0;
  for (let id = 1; id <= 29; id++) { for (let i = 0; i < 12; i++) notifiableNewTotal += diagMat[id][i]; }
  const edewsWeekly = notifiableNewTotal > 0 ? 1 : 0;

  return {
    diagMat,
    sub_a: sumArr(b => b.sub_a, 27), sub_b: sumArr(b => b.sub_b, 27),
    cat_A: sumArr(b => b.cat_A, 27), cat_B: sumArr(b => b.cat_B, 27),
    cat_C: sumArr(b => b.cat_C, 27), cat_D: sumArr(b => b.cat_D, 27),
    cat_E: sumArr(b => b.cat_E, 27), total75: sumArr(b => b.total75, 27),
    newBenF: sumArr(b => b.newBenF, 6), newBenM: sumArr(b => b.newBenM, 6),
    fuBenF: sumArr(b => b.fuBenF, 6), fuBenM: sumArr(b => b.fuBenM, 6),
    refMat, specMat, drugs, drugsTot,
    vitA: sumArr(b => b.vitA, 4), imci: sumArr(b => b.imci, 4),
    elderlyF: buckets.reduce((a, b) => a + b.elderlyF, 0),
    elderlyM: buckets.reduce((a, b) => a + b.elderlyM, 0),
    triageF: buckets.reduce((a, b) => a + b.triageF, 0),
    triageM: buckets.reduce((a, b) => a + b.triageM, 0),
    ghoF: buckets.reduce((a, b) => a + b.ghoF, 0),
    ghoM: buckets.reduce((a, b) => a + b.ghoM, 0),
    edewsDaily, edewsWeekly
  };
}

function populateDayOpsMap(ops, dayIdx, dayDateStr, bucket, siteName, doctorName) {
  const off = dayIdx * 36;
  const R = (c, r) => `${colNumToLet(c + off)}${r}`;
  const serialDate = isoDateToExcelSerial(dayDateStr);

  ops[R(3, 8)] = { kind: 'str', val: siteName };
  ops[R(3, 9)] = dayIdx === 0
    ? { kind: 'numStrict', val: serialDate }
    : { kind: 'formulaCache', val: serialDate, isStr: false };
  ops[R(3, 10)] = { kind: 'str', val: doctorName };

  ops[R(32, 10)] = { kind: 'num', val: bucket.triageF };
  ops[R(33, 10)] = { kind: 'num', val: bucket.triageM };
  ops[R(34, 10)] = { kind: 'formulaCache', val: bucket.triageF + bucket.triageM };

  const newBenCols = [5, 7, 9, 11, 13, 15];
  const fuBenCols = [18, 20, 22, 24, 26, 28];
  let q4 = 0, q5 = 0, ad4 = 0, ad5 = 0;
  for (let i = 0; i < 6; i++) {
    ops[R(newBenCols[i], 4)] = { kind: 'num', val: bucket.newBenF[i] };
    ops[R(newBenCols[i], 5)] = { kind: 'num', val: bucket.newBenM[i] };
    ops[R(fuBenCols[i], 4)] = { kind: 'formulaCache', val: bucket.fuBenF[i] };
    ops[R(fuBenCols[i], 5)] = { kind: 'formulaCache', val: bucket.fuBenM[i] };
    q4 += bucket.newBenF[i]; q5 += bucket.newBenM[i];
    ad4 += bucket.fuBenF[i]; ad5 += bucket.fuBenM[i];
  }
  ops[R(17, 4)] = { kind: 'formulaCache', val: q4 };
  ops[R(17, 5)] = { kind: 'formulaCache', val: q5 };
  ops[R(30, 4)] = { kind: 'formulaCache', val: ad4 };
  ops[R(30, 5)] = { kind: 'formulaCache', val: ad5 };
  ops[R(31, 4)] = { kind: 'formulaCache', val: q4 + q5 + ad4 + ad5 };

  DIAGNOSES.forEach((d, idx) => {
    const row = ECHO_DIAG_ROWS[idx];
    const arr = bucket.diagMat[d.id];
    for (let i = 0; i < 24; i++) {
      const ag = AGE_GROUPS[Math.floor((i % 12) / 2)];
      const gen = i % 2 === 0 ? 'Female' : 'Male';
      if (isDiagnosisCellAllowed(d.id, ag, gen)) {
        ops[R(4 + i, row)] = { kind: 'num', val: arr[i] };
      }
    }
    ops[R(28, row)] = { kind: 'formulaCache', val: arr[24] };
    ops[R(29, row)] = { kind: 'formulaCache', val: arr[25] };
    ops[R(30, row)] = { kind: 'formulaCache', val: arr[26] };
  });

  [
    [13, bucket.cat_A], [14, bucket.sub_a], [44, bucket.sub_b],
    [50, bucket.cat_B], [64, bucket.cat_C], [67, bucket.cat_D],
    [71, bucket.cat_E], [75, bucket.total75]
  ].forEach(([row, arr]) => {
    for (let i = 0; i < 27; i++) ops[R(4 + i, row)] = { kind: 'formulaCache', val: arr[i] };
  });

  REFERRAL_TYPES.forEach(rt => {
    const row = ECHO_REF_ROWS[rt.id];
    const { arr, comment } = bucket.refMat[rt.id];
    for (let i = 0; i < 12; i++) {
      const ag = AGE_GROUPS[Math.floor(i / 2)];
      const gen = i % 2 === 0 ? 'Female' : 'Male';
      if (isReferralCellAllowed(rt.id, ag, gen)) ops[R(4 + i, row)] = { kind: 'num', val: arr[i] };
    }
    ops[R(16, row)] = { kind: 'formulaCache', val: arr[12] };
    ops[R(17, row)] = { kind: 'formulaCache', val: arr[13] };
    ops[R(18, row)] = { kind: 'formulaCache', val: arr[14] };
    ops[R(19, row)] = { kind: 'str', val: comment };
  });

  [['IDPs', 81], ['Migrants', 82], ['Disability', 83]].forEach(([sg, row]) => {
    const s = bucket.specMat[sg];
    for (let i = 0; i < 4; i++) ops[R(26 + i, row)] = { kind: 'num', val: s[i] };
    ops[R(30, row)] = { kind: 'formulaCache', val: s[4] };
  });

  Object.entries(ECHO_DRUG_COLS).forEach(([drugId, col]) => {
    ops[R(col, 87)] = { kind: 'num', val: bucket.drugs[drugId] };
  });
  ops[R(34, 87)] = { kind: 'formulaCache', val: bucket.drugsTot };

  const imciCols = [4, 6, 8, 10];
  for (let i = 0; i < 4; i++) {
    ops[R(imciCols[i], 94)] = { kind: 'num', val: bucket.vitA[i] };
    ops[R(imciCols[i], 95)] = { kind: 'formulaCache', val: bucket.imci[i] };
  }
  ops[R(12, 94)] = { kind: 'formulaCache', val: bucket.vitA[0] + bucket.vitA[2] };
  ops[R(14, 94)] = { kind: 'formulaCache', val: bucket.vitA[1] + bucket.vitA[3] };
  ops[R(12, 95)] = { kind: 'formulaCache', val: bucket.imci[0] + bucket.imci[2] };
  ops[R(14, 95)] = { kind: 'formulaCache', val: bucket.imci[1] + bucket.imci[3] };

  ops[R(17, 95)] = { kind: 'num', val: bucket.elderlyF };
  ops[R(19, 95)] = { kind: 'num', val: bucket.elderlyM };
  ops[R(21, 95)] = { kind: 'formulaCache', val: bucket.elderlyF + bucket.elderlyM };
  ops[R(24, 95)] = { kind: 'num', val: bucket.ghoF };
  ops[R(26, 95)] = { kind: 'num', val: bucket.ghoM };
  ops[R(28, 95)] = { kind: 'formulaCache', val: bucket.ghoF + bucket.ghoM };
}

function populateWeeklySummaryOpsMap(ops, wkSum, startISO, endISO, siteName, doctorName) {
  const R = (c, r) => `${colNumToLet(c)}${r}`;
  ops['C111'] = { kind: 'formulaCache', val: siteName, isStr: true };
  ops['C112'] = { kind: 'formulaCache', val: `${formatShortDMY(startISO)}-${formatShortDMY(endISO)}`, isStr: true };
  ops['C113'] = { kind: 'formulaCache', val: doctorName, isStr: true };

  ops['AF113'] = { kind: 'formulaCache', val: wkSum.triageF };
  ops['AG113'] = { kind: 'formulaCache', val: wkSum.triageM };
  ops['AH113'] = { kind: 'formulaCache', val: wkSum.triageF + wkSum.triageM };

  const newBenCols = [5, 7, 9, 11, 13, 15];
  const fuBenCols = [18, 20, 22, 24, 26, 28];
  let q107 = 0, q108 = 0, ad107 = 0, ad108 = 0;
  for (let i = 0; i < 6; i++) {
    ops[R(newBenCols[i], 107)] = { kind: 'formulaCache', val: wkSum.newBenF[i] };
    ops[R(newBenCols[i], 108)] = { kind: 'formulaCache', val: wkSum.newBenM[i] };
    ops[R(fuBenCols[i], 107)] = { kind: 'formulaCache', val: wkSum.fuBenF[i] };
    ops[R(fuBenCols[i], 108)] = { kind: 'formulaCache', val: wkSum.fuBenM[i] };
    q107 += wkSum.newBenF[i]; q108 += wkSum.newBenM[i];
    ad107 += wkSum.fuBenF[i]; ad108 += wkSum.fuBenM[i];
  }
  ops['Q107'] = { kind: 'formulaCache', val: q107 };
  ops['Q108'] = { kind: 'formulaCache', val: q108 };
  ops['AD107'] = { kind: 'formulaCache', val: ad107 };
  ops['AD108'] = { kind: 'formulaCache', val: ad108 };

  DIAGNOSES.forEach((d, idx) => {
    const row = ECHO_DIAG_ROWS[idx] + 103;
    const arr = wkSum.diagMat[d.id];
    for (let i = 0; i < 27; i++) ops[R(4 + i, row)] = { kind: 'formulaCache', val: arr[i] };
  });
  [
    [116, wkSum.cat_A], [117, wkSum.sub_a], [147, wkSum.sub_b],
    [153, wkSum.cat_B], [167, wkSum.cat_C], [170, wkSum.cat_D],
    [174, wkSum.cat_E], [178, wkSum.total75]
  ].forEach(([row, arr]) => {
    for (let i = 0; i < 27; i++) ops[R(4 + i, row)] = { kind: 'formulaCache', val: arr[i] };
  });

  REFERRAL_TYPES.forEach(rt => {
    const row = ECHO_REF_ROWS[rt.id] + 102;
    const { arr, comment } = wkSum.refMat[rt.id];
    for (let i = 0; i < 15; i++) ops[R(4 + i, row)] = { kind: 'formulaCache', val: arr[i] };
    ops[R(19, row)] = { kind: 'formulaCache', val: comment, isStr: true };
  });

  [['IDPs', 183], ['Migrants', 184], ['Disability', 185]].forEach(([sg, row]) => {
    const s = wkSum.specMat[sg];
    for (let i = 0; i < 5; i++) ops[R(26 + i, row)] = { kind: 'formulaCache', val: s[i] };
  });

  Object.entries(ECHO_DRUG_COLS).forEach(([drugId, col]) => {
    ops[R(col, 189)] = { kind: 'formulaCache', val: wkSum.drugs[drugId] };
  });
  ops['AH189'] = { kind: 'formulaCache', val: wkSum.drugsTot };

  ops['I192'] = { kind: 'formulaCache', val: wkSum.edewsDaily };
  ops['Q192'] = { kind: 'formulaCache', val: wkSum.edewsWeekly };

  const imciCols = [4, 6, 8, 10];
  for (let i = 0; i < 4; i++) {
    ops[R(imciCols[i], 197)] = { kind: 'formulaCache', val: wkSum.vitA[i] };
    ops[R(imciCols[i], 198)] = { kind: 'formulaCache', val: wkSum.imci[i] };
  }
  ops['L197'] = { kind: 'formulaCache', val: wkSum.vitA[0] + wkSum.vitA[2] };
  ops['N197'] = { kind: 'formulaCache', val: wkSum.vitA[1] + wkSum.vitA[3] };
  ops['L198'] = { kind: 'formulaCache', val: wkSum.imci[0] + wkSum.imci[2] };
  ops['N198'] = { kind: 'formulaCache', val: wkSum.imci[1] + wkSum.imci[3] };
  ops['Q198'] = { kind: 'formulaCache', val: wkSum.elderlyF };
  ops['S198'] = { kind: 'formulaCache', val: wkSum.elderlyM };
  ops['U198'] = { kind: 'formulaCache', val: wkSum.elderlyF + wkSum.elderlyM };
  ops['X198'] = { kind: 'formulaCache', val: wkSum.ghoF };
  ops['Z198'] = { kind: 'formulaCache', val: wkSum.ghoM };
  ops['AB198'] = { kind: 'formulaCache', val: wkSum.ghoF + wkSum.ghoM };
}

function populateMonthlyOpsMap(ops, mSum, weekStartDates, siteName, doctorName, commentsObj) {
  const R = (c, r) => `${colNumToLet(c)}${r}`;
  const midDate = weekStartDates[2] || weekStartDates[0];
  ops['C8'] = { kind: 'formulaCache', val: siteName, isStr: true };
  ops['C9'] = { kind: 'formulaCache', val: isoDateToExcelSerial(midDate), isStr: false };
  ops['C10'] = { kind: 'formulaCache', val: doctorName, isStr: true };

  ops['AF10'] = { kind: 'formulaCache', val: mSum.triageF };
  ops['AG10'] = { kind: 'formulaCache', val: mSum.triageM };
  ops['AH10'] = { kind: 'formulaCache', val: mSum.triageF + mSum.triageM };

  const newBenCols = [5, 7, 9, 11, 13, 15];
  const fuBenCols = [18, 20, 22, 24, 26, 28];
  let q4 = 0, q5 = 0, ad4 = 0, ad5 = 0;
  for (let i = 0; i < 6; i++) {
    ops[R(newBenCols[i], 4)] = { kind: 'formulaCache', val: mSum.newBenF[i] };
    ops[R(newBenCols[i], 5)] = { kind: 'formulaCache', val: mSum.newBenM[i] };
    ops[R(fuBenCols[i], 4)] = { kind: 'formulaCache', val: mSum.fuBenF[i] };
    ops[R(fuBenCols[i], 5)] = { kind: 'formulaCache', val: mSum.fuBenM[i] };
    q4 += mSum.newBenF[i]; q5 += mSum.newBenM[i];
    ad4 += mSum.fuBenF[i]; ad5 += mSum.fuBenM[i];
  }
  ops['Q4'] = { kind: 'formulaCache', val: q4 };
  ops['Q5'] = { kind: 'formulaCache', val: q5 };
  ops['AD4'] = { kind: 'formulaCache', val: ad4 };
  ops['AD5'] = { kind: 'formulaCache', val: ad5 };
  ops['AE4'] = { kind: 'formulaCache', val: q4 + q5 + ad4 + ad5 };

  DIAGNOSES.forEach((d, idx) => {
    const row = ECHO_DIAG_ROWS[idx];
    const arr = mSum.diagMat[d.id];
    for (let i = 0; i < 27; i++) ops[R(4 + i, row)] = { kind: 'formulaCache', val: arr[i] };
    const cm = commentsObj[d.id];
    if (cm && cm.hfmd) ops[R(31, row)] = { kind: 'str', val: cm.hfmd };
    if (cm && cm.hfam) ops[R(33, row)] = { kind: 'str', val: cm.hfam };
  });

  [
    [13, mSum.cat_A], [14, mSum.sub_a], [44, mSum.sub_b],
    [50, mSum.cat_B], [64, mSum.cat_C], [67, mSum.cat_D],
    [71, mSum.cat_E], [75, mSum.total75]
  ].forEach(([row, arr]) => {
    for (let i = 0; i < 27; i++) ops[R(4 + i, row)] = { kind: 'formulaCache', val: arr[i] };
  });

  const refTotals = new Array(15).fill(0);
  REFERRAL_TYPES.forEach(rt => {
    const row = ECHO_REF_ROWS[rt.id];
    const { arr, comment } = mSum.refMat[rt.id];
    for (let i = 0; i < 15; i++) {
      ops[R(4 + i, row)] = { kind: 'formulaCache', val: arr[i] };
      refTotals[i] += arr[i];
    }
    ops[R(19, row)] = { kind: 'formulaCache', val: comment, isStr: true };
  });
  for (let i = 0; i < 15; i++) ops[R(4 + i, 89)] = { kind: 'formulaCache', val: refTotals[i] };

  [['IDPs', 81], ['Migrants', 82], ['Disability', 83]].forEach(([sg, row]) => {
    const s = mSum.specMat[sg];
    for (let i = 0; i < 5; i++) ops[R(26 + i, row)] = { kind: 'formulaCache', val: s[i] };
  });

  Object.entries(ECHO_DRUG_COLS).forEach(([drugId, col]) => {
    ops[R(col, 87)] = { kind: 'formulaCache', val: mSum.drugs[drugId] };
  });
  ops['AH87'] = { kind: 'formulaCache', val: mSum.drugsTot };

  const w1d3 = addDaysISO(weekStartDates[0], 2);
  const w2d3 = addDaysISO(weekStartDates[1] || weekStartDates[0], 2);
  const lastIdx = weekStartDates.length - 1;
  const wPrevD3 = addDaysISO(weekStartDates[Math.max(0, lastIdx - 1)], 2);
  const wLastD3 = addDaysISO(weekStartDates[lastIdx], 2);
  const af80Date = Number(w1d3.slice(8, 10)) > 25 ? w1d3 : w2d3;
  const ag80Date = Number(wLastD3.slice(8, 10)) > 25 ? wPrevD3 : wLastD3;
  const af80Minus2 = addDaysISO(af80Date, -2);
  const af81Val = Math.floor((excelWeekday(af80Minus2) + daysBetweenISO(af80Date, ag80Date)) / 7);
  ops['AF80'] = { kind: 'formulaCache', val: isoDateToExcelSerial(af80Date), isStr: false };
  ops['AG80'] = { kind: 'formulaCache', val: isoDateToExcelSerial(ag80Date), isStr: false };
  ops['AF81'] = { kind: 'formulaCache', val: Math.max(1, af81Val) };

  ops['I90'] = { kind: 'formulaCache', val: mSum.totalEdewsDaily };
  ops['Q90'] = { kind: 'formulaCache', val: Math.min(Math.max(1, af81Val), mSum.totalEdewsWeekly) };

  const imciCols = [4, 6, 8, 10];
  for (let i = 0; i < 4; i++) {
    ops[R(imciCols[i], 97)] = { kind: 'formulaCache', val: mSum.vitA[i] };
    ops[R(imciCols[i], 98)] = { kind: 'formulaCache', val: mSum.imci[i] };
  }
  ops['L97'] = { kind: 'formulaCache', val: mSum.vitA[0] + mSum.vitA[2] };
  ops['N97'] = { kind: 'formulaCache', val: mSum.vitA[1] + mSum.vitA[3] };
  ops['L98'] = { kind: 'formulaCache', val: mSum.imci[0] + mSum.imci[2] };
  ops['N98'] = { kind: 'formulaCache', val: mSum.imci[1] + mSum.imci[3] };
  ops['Q98'] = { kind: 'formulaCache', val: mSum.elderlyF };
  ops['S98'] = { kind: 'formulaCache', val: mSum.elderlyM };
  ops['U98'] = { kind: 'formulaCache', val: mSum.elderlyF + mSum.elderlyM };
  ops['X98'] = { kind: 'formulaCache', val: mSum.ghoF };
  ops['Z98'] = { kind: 'formulaCache', val: mSum.ghoM };
  ops['AB98'] = { kind: 'formulaCache', val: mSum.ghoF + mSum.ghoM };
}

// Main Export Entry Point: Loads uploaded/bundled template and fills W1..W5 + Monthly
async function exportExactOfficialEchoExcel(allCasesArr, dailyOpsObj, standaloneRefsArr, diagCommentsObj, facilityObj, targetMonthYYYYMM, customCycleBounds) {
  if (typeof JSZip === 'undefined') throw new Error('مكتبة JSZip غير محمّلة');

  const tpl = await resolveTemplateSource();
  if (!tpl) {
    const err = new Error('NO_TEMPLATE');
    err.code = 'NO_TEMPLATE';
    throw err;
  }

  const zip = tpl.bytes
    ? await JSZip.loadAsync(tpl.bytes)
    : await JSZip.loadAsync(tpl.b64, { base64: true });

  const sheetPaths = await resolveSheetPaths(zip);
  const weekNames = ['W1', 'W2', 'W3', 'W4', 'W5'].filter(w => sheetPaths[w]);
  if (weekNames.length === 0) {
    throw new Error('القالب المرفوع لا يحتوي على أوراق الأسابيع W1..W5');
  }

  const monthStr = targetMonthYYYYMM || getReportingMonthForDate(new Date().toISOString().slice(0, 10));
  const [yr, mo] = monthStr.split('-').map(Number);
  const defaultBounds = getReportingMonthBounds(monthStr);
  const cycleStartISO = (customCycleBounds && customCycleBounds.startISO) ? customCycleBounds.startISO : defaultBounds.startISO;
  const cycleEndISO = (customCycleBounds && customCycleBounds.endISO) ? customCycleBounds.endISO : defaultBounds.endISO;

  const siteName = facilityObj.shortName || 'Almaqayit HU';
  const doctorName = facilityObj.doctor || 'Dr. AmirAl_maazi';

  // Filter strictly by Reporting Month Cycle: 26th of previous month -> 25th of target month
  const monthCases = allCasesArr.filter(c => {
    const ds = String(c.date || '').slice(0, 10);
    return ds >= cycleStartISO && ds <= cycleEndISO;
  });
  const monthRefs = [
    ...monthCases.filter(c => c.referral).map(c => ({
      date: c.date, type: c.referral.type, gender: c.gender,
      ageGroup: c.ageGroup, cash: c.referral.cash, comment: c.referral.comment
    })),
    ...standaloneRefsArr.filter(r => {
      const ds = String(r.date || '').slice(0, 10);
      return ds >= cycleStartISO && ds <= cycleEndISO;
    })
  ];

  const weeklySummaries = [];
  const weekStartDates = [];
  const numWeeks = weekNames.length;

  for (let w = 0; w < numWeeks; w++) {
    // Fixed official week start: W1 = 26th prev month, W2 = +7d, W3 = +14d, W4 = +21d, W5 = +28d
    const weekStartISO = addDaysISO(cycleStartISO, w * 7);
    const isLastWeek = (w === numWeeks - 1);
    const rawWeekEndISO = addDaysISO(weekStartISO, 6);
    const weekEndISO = isLastWeek ? cycleEndISO : (rawWeekEndISO <= cycleEndISO ? rawWeekEndISO : cycleEndISO);
    const isEmptyWeek = weekStartISO > cycleEndISO;

    const wkCases = isEmptyWeek ? [] : monthCases.filter(c => c.date >= weekStartISO && c.date <= weekEndISO);
    const wkRefs = isEmptyWeek ? [] : monthRefs.filter(r => r.date >= weekStartISO && r.date <= weekEndISO);
    weekStartDates.push(weekStartISO);

    const dayBuckets = [];
    const sheetOps = {};

    for (let k = 0; k < 5; k++) {
      const slotDate = addDaysISO(weekStartISO, k);
      const isLastSlot = (k === 4);
      const matchSlot = (dStr) => {
        if (isEmptyWeek) return false;
        const diff = daysBetweenISO(weekStartISO, dStr);
        return isLastSlot ? (diff >= 4) : (diff === k);
      };

      const dCases = wkCases.filter(c => matchSlot(c.date));
      const dRefs = wkRefs.filter(r => matchSlot(c.date));
      const dOps = { triageF: 0, triageM: 0, ghoF: 0, ghoM: 0 };
      Object.entries(dailyOpsObj || {}).forEach(([dStr, v]) => {
        if (isEmptyWeek) return;
        if (dStr >= weekStartISO && dStr <= weekEndISO && matchSlot(dStr)) {
          dOps.triageF += Number(v.triageF) || 0;
          dOps.triageM += Number(v.triageM) || 0;
          dOps.ghoF += Number(v.ghoF) || 0;
          dOps.ghoM += Number(v.ghoM) || 0;
        }
      });

      const bucket = computeDayBucket(dCases, dRefs, dOps);
      dayBuckets.push(bucket);
      populateDayOpsMap(sheetOps, k, slotDate, bucket, siteName, doctorName);
    }

    const wkSum = sumDayBuckets(dayBuckets);
    weeklySummaries.push(wkSum);
    populateWeeklySummaryOpsMap(sheetOps, wkSum, weekStartISO, addDaysISO(weekStartISO, 4), siteName, doctorName);

    const sheetPath = sheetPaths[weekNames[w]];
    const rawXml = await zip.file(sheetPath).async('string');
    zip.file(sheetPath, patchWorksheetXml(rawXml, sheetOps));
  }

  if (sheetPaths['Monthly']) {
    const monthlySum = sumDayBuckets(weeklySummaries);
    monthlySum.totalEdewsDaily = weeklySummaries.reduce((a, w) => a + w.edewsDaily, 0);
    monthlySum.totalEdewsWeekly = weeklySummaries.reduce((a, w) => a + w.edewsWeekly, 0);

    const monthlyOps = {};
    populateMonthlyOpsMap(monthlyOps, monthlySum, weekStartDates, siteName, doctorName, diagCommentsObj || {});
    const rawMonthlyXml = await zip.file(sheetPaths['Monthly']).async('string');
    zip.file(sheetPaths['Monthly'], patchWorksheetXml(rawMonthlyXml, monthlyOps));
  }

  // Ensure full recalculation on open in Excel/WPS/LibreOffice
  let wbXml = await zip.file('xl/workbook.xml').async('string');
  if (/<calcPr[^>]*\/>/.test(wbXml)) {
    wbXml = wbXml.replace(/<calcPr([^>]*)\/>/, (m, attrs) =>
      `<calcPr${attrs.replace(/\s+fullCalcOnLoad="[^"]*"/g, '')} fullCalcOnLoad="1"/>`
    );
  } else {
    wbXml = wbXml.replace('</workbook>', '<calcPr fullCalcOnLoad="1"/></workbook>');
  }
  zip.file('xl/workbook.xml', wbXml);

  if (zip.file('xl/calcChain.xml')) {
    zip.remove('xl/calcChain.xml');
    let ctXml = await zip.file('[Content_Types].xml').async('string');
    zip.file('[Content_Types].xml', ctXml.replace(/<Override[^>]*calcChain\.xml[^>]*\/>/g, ''));
    let relsXml = await zip.file('xl/_rels/workbook.xml.rels').async('string');
    zip.file('xl/_rels/workbook.xml.rels', relsXml.replace(/<Relationship[^>]*calcChain\.xml[^>]*\/>/g, ''));
  }

  const pureBase64 = await zip.generateAsync({ type: 'base64', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const mLabel = `${monthNames[(mo || 1) - 1]}-${String(yr || 2026).slice(-2)}`;
  const fname = `YEM-HOD-ECHO 23028-HCs-Morbidity Report-${siteName}-${mLabel}.xlsx`.replace(/[\\/:*?"<>|]/g, '_');

  return { pureBase64, filename: fname };
}
