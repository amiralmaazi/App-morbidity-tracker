// ============================================================================
// ECHO 23028 Exact-Template Excel Exporter (100% Preserves All 8 Sheets,
// Colors, Borders, Fonts, Logos, Merged Cells, Printer Settings & Formulas)
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

// Single-pass safe OOXML cell patcher (uses [^>/]* so self-closing /> tags are never broken)
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
      const fMatch = innerStr.match(/<f(?:\s[^>]*)?>[\s\S]*?<\/f>|<f(?:\s[^>]*)?\/>/);
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

  // Insert any cell not pre-existing in template XML (e.g. W2 AO88/AP88/AQ88)
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
  ops['C8'] = { kind: 'formulaCache', val: siteName, isStr: true };
  ops['C9'] = { kind: 'formulaCache', val: isoDateToExcelSerial(weekStartDates[2]), isStr: false };
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

  ops['I90'] = { kind: 'formulaCache', val: mSum.totalEdewsDaily };
  ops['Q90'] = { kind: 'formulaCache', val: mSum.totalEdewsWeekly };

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

async function exportExactOfficialEchoExcel(allCasesArr, dailyOpsObj, standaloneRefsArr, diagCommentsObj, facilityObj, targetMonthYYYYMM) {
  if (typeof JSZip === 'undefined') throw new Error('JSZip غير محمّلة');
  if (!window.ECHO_TEMPLATE_XLSX_B64) throw new Error('ملف القالب template-b64.js غير موجود');

  const zip = await JSZip.loadAsync(window.ECHO_TEMPLATE_XLSX_B64, { base64: true });
  const monthStr = targetMonthYYYYMM || new Date().toISOString().slice(0, 7);
  const [yr, mo] = monthStr.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(yr, mo, 0)).getUTCDate();

  const siteName = facilityObj.shortName || 'Almaqayit HU';
  const doctorName = facilityObj.doctor || 'Dr.';

  const monthCases = allCasesArr.filter(c => String(c.date || '').startsWith(monthStr));
  const monthRefs = [
    ...monthCases.filter(c => c.referral).map(c => ({
      date: c.date, type: c.referral.type, gender: c.gender,
      ageGroup: c.ageGroup, cash: c.referral.cash, comment: c.referral.comment
    })),
    ...standaloneRefsArr.filter(r => String(r.date || '').startsWith(monthStr))
  ];

  const weeklySummaries = [];
  const weekStartDates = [];

  for (let w = 0; w < 5; w++) {
    const startDay = w * 7 + 1;
    const endDay = Math.min(daysInMonth, startDay + 6);
    const defaultStartISO = `${monthStr}-${String(Math.min(daysInMonth, startDay)).padStart(2, '0')}`;

    const wkCases = monthCases.filter(c => {
      const d = Number(c.date.slice(8, 10));
      return d >= startDay && d <= endDay;
    });
    const wkRefs = monthRefs.filter(r => {
      const d = Number(r.date.slice(8, 10));
      return d >= startDay && d <= endDay;
    });

    let weekStartISO = defaultStartISO;
    const activeDates = [...new Set([...wkCases.map(c => c.date), ...wkRefs.map(r => r.date)])].sort();
    if (activeDates.length > 0 && daysBetweenISO(activeDates[0], activeDates[activeDates.length - 1]) <= 4) {
      weekStartISO = activeDates[0];
    }
    weekStartDates.push(weekStartISO);

    const dayBuckets = [];
    const sheetOps = {};

    for (let k = 0; k < 5; k++) {
      const slotDate = addDaysISO(weekStartISO, k);
      const isLast = (k === 4);
      const matchSlot = (dStr) => {
        const diff = daysBetweenISO(weekStartISO, dStr);
        return isLast ? (diff >= 4) : (diff === k);
      };

      const dCases = wkCases.filter(c => matchSlot(c.date));
      const dRefs = wkRefs.filter(r => matchSlot(c.date));
      const dOps = { triageF: 0, triageM: 0, ghoF: 0, ghoM: 0 };
      Object.entries(dailyOpsObj || {}).forEach(([dStr, v]) => {
        if (!dStr.startsWith(monthStr)) return;
        const dd = Number(dStr.slice(8, 10));
        if (dd >= startDay && dd <= endDay && matchSlot(dStr)) {
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

    const sheetPath = `xl/worksheets/sheet${3 + w}.xml`;
    const rawXml = await zip.file(sheetPath).async('string');
    zip.file(sheetPath, patchWorksheetXml(rawXml, sheetOps));
  }

  const monthlySum = sumDayBuckets(weeklySummaries);
  monthlySum.totalEdewsDaily = weeklySummaries.reduce((a, w) => a + w.edewsDaily, 0);
  monthlySum.totalEdewsWeekly = weeklySummaries.reduce((a, w) => a + w.edewsWeekly, 0);

  const monthlyOps = {};
  populateMonthlyOpsMap(monthlyOps, monthlySum, weekStartDates, siteName, doctorName, diagCommentsObj || {});
  const rawMonthlyXml = await zip.file('xl/worksheets/sheet8.xml').async('string');
  zip.file('xl/worksheets/sheet8.xml', patchWorksheetXml(rawMonthlyXml, monthlyOps));

  let wbXml = await zip.file('xl/workbook.xml').async('string');
  wbXml = wbXml.replace(/<calcPr([^>]*)\/>/, (m, attrs) =>
    `<calcPr${attrs.replace(/\s+fullCalcOnLoad="[^"]*"/g, '')} fullCalcOnLoad="1"/>`
  );
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
