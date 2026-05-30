let alternatives = getDefaultAlternatives();
let criteria = getDefaultCriteria();
let activeTab = 'dashboard';
let selectedLaptopCode = 'A5';
let selectedComparisonCode = 'A1';
let searchQuery = '';

const criterionUnits = {
  harga: 'juta',
  ram: 'GB',
  prosesor: 'skor',
  baterai: 'jam',
  storage: 'GB',
  gpu: 'skor',
  berat: 'kg'
};

function getDefaultAlternatives() {
  return [
    { code: 'A1', name: 'ASUS VivoBook Pro 14 OLED', values: { harga: 11, ram: 16, prosesor: 1820, baterai: 8, storage: 512, gpu: 2450, berat: 1.45 } },
    { code: 'A2', name: 'Lenovo ThinkBook 14 Gen 6', values: { harga: 12, ram: 16, prosesor: 1810, baterai: 9, storage: 512, gpu: 2380, berat: 1.40 } },
    { code: 'A3', name: 'Acer Swift Go 14', values: { harga: 10.5, ram: 16, prosesor: 1815, baterai: 9.5, storage: 512, gpu: 2410, berat: 1.25 } },
    { code: 'A4', name: 'ASUS ROG Zephyrus G14', values: { harga: 18.5, ram: 32, prosesor: 2310, baterai: 8, storage: 1000, gpu: 11500, berat: 1.65 } },
    { code: 'A5', name: 'MacBook Air M3 13', values: { harga: 17, ram: 16, prosesor: 3100, baterai: 15, storage: 512, gpu: 8750, berat: 1.24 } }
  ];
}

function getDefaultCriteria() {
  return [
    { code: 'C1', name: 'Harga', key: 'harga', weight: 0.25, type: 'Cost', unit: 'juta' },
    { code: 'C2', name: 'RAM', key: 'ram', weight: 0.15, type: 'Benefit', unit: 'GB' },
    { code: 'C3', name: 'Prosesor', key: 'prosesor', weight: 0.20, type: 'Benefit', unit: 'skor' },
    { code: 'C4', name: 'Baterai', key: 'baterai', weight: 0.15, type: 'Benefit', unit: 'jam' },
    { code: 'C5', name: 'Storage', key: 'storage', weight: 0.10, type: 'Benefit', unit: 'GB' },
    { code: 'C6', name: 'GPU', key: 'gpu', weight: 0.10, type: 'Benefit', unit: 'skor' },
    { code: 'C7', name: 'Berat', key: 'berat', weight: 0.05, type: 'Cost', unit: 'kg' }
  ];
}

function calculatePromethee(currentAlternatives, currentCriteria) {
  const n = currentAlternatives.length;
  const k = currentCriteria.length;
  const matrix = {};
  const pairwise = calculatePairwiseDetails(currentAlternatives, currentCriteria);

  currentAlternatives.forEach((a) => {
    matrix[a.code] = {};
    currentAlternatives.forEach((b) => {
      if (a.code === b.code || k === 0) {
        matrix[a.code][b.code] = 0;
        return;
      }
      const detail = pairwise[`${a.code}|${b.code}`];
      matrix[a.code][b.code] = detail ? detail.preferenceIndex : 0;
    });
  });

  const flows = currentAlternatives.map((alt) => {
    const divisor = Math.max(n - 1, 1);
    const leavingTotal = currentAlternatives.reduce((sum, other) => {
      return other.code === alt.code ? sum : sum + matrix[alt.code][other.code];
    }, 0);
    const enteringTotal = currentAlternatives.reduce((sum, other) => {
      return other.code === alt.code ? sum : sum + matrix[other.code][alt.code];
    }, 0);
    const leaving = n > 1 ? leavingTotal / divisor : 0;
    const entering = n > 1 ? enteringTotal / divisor : 0;

    return {
      ...alt,
      leaving,
      entering,
      net: leaving - entering
    };
  });

  const ranking = [...flows]
    .sort((a, b) => b.net - a.net || a.code.localeCompare(b.code))
    .map((item, index) => ({ ...item, rank: index + 1, status: getStatusByRank(index + 1) }));

  return { matrix, pairwise, flows, ranking };
}

function calculatePairwiseDetails(currentAlternatives, currentCriteria) {
  const details = {};

  currentAlternatives.forEach((a) => {
    currentAlternatives.forEach((b) => {
      if (a.code === b.code) return;

      const criteriaDetails = currentCriteria.map((criterion) => {
        const valueA = normalizeNumber(a.values[criterion.key]);
        const valueB = normalizeNumber(b.values[criterion.key]);
        const isCost = criterion.type === 'Cost';
        const diff = isCost ? valueB - valueA : valueA - valueB;
        const preference = diff > 0 ? 1 : 0;

        return {
          criterion,
          valueA,
          valueB,
          diff,
          preference
        };
      });

      const preferenceIndex = currentCriteria.length
        ? criteriaDetails.reduce((sum, item) => sum + item.preference, 0) / currentCriteria.length
        : 0;

      details[`${a.code}|${b.code}`] = {
        from: a.code,
        to: b.code,
        criteriaDetails,
        preferenceIndex
      };
    });
  });

  return details;
}

function getPairwiseComparison(bestCode, selectedCode, currentAlternatives, currentCriteria) {
  const best = currentAlternatives.find((item) => item.code === bestCode);
  const selected = currentAlternatives.find((item) => item.code === selectedCode);
  if (!best || !selected || best.code === selected.code) return null;

  const pairwise = calculatePairwiseDetails(currentAlternatives, currentCriteria);
  const detail = pairwise[`${best.code}|${selected.code}`];
  if (!detail) return null;

  return {
    best,
    selected,
    preferenceIndex: detail.preferenceIndex,
    rows: detail.criteriaDetails.map((item) => {
      const isCost = item.criterion.type === 'Cost';
      const message = item.diff > 0
        ? (isCost ? 'Laptop terbaik lebih unggul karena nilainya lebih kecil' : 'Laptop terbaik lebih unggul')
        : 'Laptop terbaik tidak lebih unggul';

      return {
        criterion: item.criterion,
        valueBest: item.valueA,
        valueSelected: item.valueB,
        diff: item.diff,
        preference: item.preference,
        message
      };
    })
  };
}

function getStatusByRank(rank) {
  if (rank === 1) return 'Rekomendasi Utama';
  if (rank === 2) return 'Alternatif Kuat';
  return 'Pertimbangan';
}

function renderHeader() {
  const result = calculatePromethee(alternatives, criteria);
  const best = result.ranking[0];
  const totalWeight = getTotalWeight(criteria);
  const header = document.getElementById('pageHeader');
  header.innerHTML = `
    <div class="header-grid">
      <div>
        <p class="eyebrow">Sistem Pendukung Keputusan</p>
        <h1>Dashboard Pemilihan Laptop Mahasiswa</h1>
        <p class="subtitle">Sistem Pendukung Keputusan menggunakan metode PROMETHEE. Dashboard ini membandingkan laptop berdasarkan harga, performa, baterai, kapasitas, GPU, dan berat.</p>
      </div>
      <div>
        <div class="badge-row" aria-label="Status dashboard">
          <span class="badge">PROMETHEE</span>
          <span class="badge ${isWeightValid(criteria) ? 'good' : 'warn'}">Bobot ${isWeightValid(criteria) ? 'valid' : 'belum valid'}: ${formatNumber(totalWeight, 2)}</span>
          <span class="badge">Data contoh aktif</span>
          ${best ? `<span class="badge good">Terbaik: ${escapeHtml(best.code)}</span>` : ''}
        </div>
        <div class="report-meta">
          <div>Decision Report</div>
          <div>${alternatives.length} alternatif / ${criteria.length} kriteria</div>
          <div>Indeks preferensi rata-rata</div>
        </div>
      </div>
    </div>
  `;

  document.querySelectorAll('[data-tab-link]').forEach((button) => {
    button.classList.toggle('active', button.dataset.tabLink === activeTab);
  });
}

function renderMetricCards(result) {
  const best = result.ranking[0];
  const cards = [
    {
      label: 'Laptop Terbaik',
      value: best ? best.name : '-',
      note: best ? `${best.code} dengan status ${best.status}` : 'Butuh minimal 2 alternatif'
    },
    {
      label: 'Net Flow Tertinggi',
      value: best ? formatNumber(best.net) : '0.0000',
      note: 'Ranking diurutkan dari Net Flow terbesar'
    },
    {
      label: 'Jumlah Alternatif',
      value: alternatives.length,
      note: 'Data laptop yang dibandingkan'
    },
    {
      label: 'Jumlah Kriteria',
      value: criteria.length,
      note: 'Indeks dihitung rata-rata per kriteria'
    }
  ];

  return `
    <section class="metrics">
      ${cards.map((card, index) => `
        <article class="metric-card">
          <span class="metric-index">${String(index + 1).padStart(2, '0')}</span>
          <div class="metric-label">${escapeHtml(card.label)}</div>
          <div class="metric-value">${escapeHtml(card.value)}</div>
          <div class="metric-note">${escapeHtml(card.note)}</div>
        </article>
      `).join('')}
    </section>
  `;
}

function renderDashboard() {
  const result = calculatePromethee(alternatives, criteria);
  const best = result.ranking[0];

  if (alternatives.length < 2 || criteria.length === 0) {
    return renderEmptyState('Data belum cukup', 'Tambahkan minimal 2 alternatif dan 1 kriteria agar perhitungan PROMETHEE dapat berjalan.');
  }

  const filtered = result.ranking.filter((item) => {
    const keyword = searchQuery.trim().toLowerCase();
    return !keyword || item.code.toLowerCase().includes(keyword) || item.name.toLowerCase().includes(keyword);
  });

  if (!selectedLaptopCode || !alternatives.some((item) => item.code === selectedLaptopCode)) {
    selectedLaptopCode = best.code;
  }

  return `
    ${renderMetricCards(result)}
    <section class="dashboard-grid">
      <article class="recommendation">
        <div>
          <span class="recommend-kicker">Rekomendasi Utama / ${escapeHtml(best.code)}</span>
          <div class="recommend-name">${escapeHtml(best.name)}</div>
          <p class="soft-copy">${escapeHtml(best.code)} menjadi ranking pertama dengan Net Flow tertinggi.</p>
        </div>
        <div class="flow-strip">
          <div class="flow-chip"><span>Net Flow</span><strong>${formatNumber(best.net)}</strong></div>
          <div class="flow-chip"><span>Leaving Flow</span><strong>${formatNumber(best.leaving)}</strong></div>
          <div class="flow-chip"><span>Entering Flow</span><strong>${formatNumber(best.entering)}</strong></div>
        </div>
        <p class="recommend-interpretation">Laptop ini menjadi rekomendasi utama karena memiliki nilai Net Flow tertinggi. Artinya, laptop ini lebih banyak mengungguli alternatif lain dibandingkan dikalahkan oleh alternatif lain.</p>
        <div class="toolbar">
          <button class="button primary" type="button" data-action="download-csv">Download Ranking CSV</button>
          <button class="button secondary" type="button" data-tab-link="calculation">Lihat Perhitungan</button>
        </div>
      </article>

      <article class="panel">
        <div class="panel-header">
          <div>
            <p class="section-label">Kenapa rekomendasi ini terpilih?</p>
            <h3>${escapeHtml(best.name)}</h3>
          </div>
        </div>
        <p class="soft-copy">${escapeHtml(best.name)} memiliki Net Flow ${formatNumber(best.net)}, nilai tertinggi pada data saat ini. Nilai positif menunjukkan posisi alternatif ini lebih kuat dalam perbandingan berpasangan.</p>
        <p class="soft-copy">Lihat tab Perhitungan PROMETHEE untuk detail step-by-step.</p>
      </article>
    </section>

    <section class="dashboard-grid">
      <article class="panel">
        ${renderChapterHeading('01', 'Ranking Akhir', 'Urutan rekomendasi laptop', 'Daftar ini diurutkan berdasarkan Net Flow terbesar, lalu diberi status rekomendasi.')}
        ${renderRankingTable(filtered)}
      </article>

      <article class="panel">
        ${renderChapterHeading('02', 'Net Flow', 'Bar chart ranking', 'Garis tengah menunjukkan nol, sehingga nilai negatif tetap mudah dibaca.')}
        ${renderNetFlowChart(result.ranking)}
      </article>
    </section>

    <section class="split">
      <article class="panel">
        ${renderChapterHeading('03', 'Filter Data', 'Cari laptop', 'Gunakan kode atau nama untuk melihat alternatif tertentu tanpa mengubah hasil perhitungan.')}
        <div class="field">
          <label for="searchLaptop">Kode atau nama laptop</label>
          <input id="searchLaptop" type="search" data-search value="${escapeHtml(searchQuery)}" placeholder="Contoh: A5 atau MacBook">
        </div>
        <div style="margin-top: 16px">${renderRankingTable(filtered, true)}</div>
      </article>

      <article class="panel">
        ${renderChapterHeading('04', 'Detail Alternatif', 'Pilih laptop', 'Detail nilai kriteria ditampilkan dengan satuan yang sama seperti data awal.')}
        <div class="field">
          <label for="selectedLaptop">Alternatif</label>
          <select id="selectedLaptop" data-select-laptop>
            ${alternatives.map((item) => `<option value="${escapeHtml(item.code)}" ${item.code === selectedLaptopCode ? 'selected' : ''}>${escapeHtml(item.code)} - ${escapeHtml(item.name)}</option>`).join('')}
          </select>
        </div>
        ${renderLaptopDetail(selectedLaptopCode)}
      </article>
    </section>
  `;
}

function renderInputData() {
  const totalWeight = getTotalWeight(criteria);
  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <p class="section-label">Input Data</p>
          <h2>Alternatif laptop</h2>
          <p class="soft-copy">Edit nilai laptop langsung dari tabel. Perhitungan akan mengikuti data terbaru.</p>
        </div>
        <div class="toolbar">
          <button class="button secondary" type="button" data-action="recalculate">Hitung Ulang</button>
          <button class="button ghost" type="button" data-action="reset">Reset Data</button>
          <button class="button primary" type="button" data-action="download-csv">Download Ranking CSV</button>
        </div>
      </div>
      ${renderAlternativeInputTable()}
    </section>

    <section class="panel">
      <div class="form-header">
        <div>
          <p class="section-label">Tambah Laptop Baru</p>
          <h2>Alternatif baru</h2>
        </div>
      </div>
      <form class="form-grid" data-form="add-laptop">
        <div class="field"><label>Kode</label><input name="code" required placeholder="A6"></div>
        <div class="field"><label>Nama Laptop</label><input name="name" required placeholder="Nama laptop"></div>
        ${criteria.map((item) => `
          <div class="field">
            <label>${escapeHtml(item.name)}</label>
            <input name="${escapeHtml(item.key)}" type="number" step="any" required placeholder="0">
          </div>
        `).join('')}
        <div class="field"><label>&nbsp;</label><button class="button primary" type="submit">Tambah Laptop</button></div>
      </form>
    </section>

    <section class="panel">
      <div class="panel-header">
        <div>
          <p class="section-label">Kriteria</p>
          <h2>Bobot dan tipe kriteria</h2>
          <p class="soft-copy">Bobot ditampilkan dan divalidasi untuk kebutuhan dashboard. Perhitungan utama tetap menggunakan rata-rata sederhana antar kriteria.</p>
        </div>
      </div>
      ${renderCriteriaInputTable()}
      <div class="status-line ${isWeightValid(criteria) ? 'good' : 'warn'}">
        ${isWeightValid(criteria) ? `Total bobot valid: ${formatNumber(totalWeight, 2)}` : `Total bobot saat ini belum 1.00. Total sekarang: ${formatNumber(totalWeight, 2)}`}
      </div>
    </section>

    <section class="panel">
      <div class="form-header">
        <div>
          <p class="section-label">Tambah Kriteria</p>
          <h2>Kriteria baru</h2>
        </div>
      </div>
      <form class="form-grid" data-form="add-criterion">
        <div class="field"><label>Kode</label><input name="code" required placeholder="C8"></div>
        <div class="field"><label>Kriteria</label><input name="name" required placeholder="Layar"></div>
        <div class="field"><label>Bobot</label><input name="weight" type="number" step="0.01" min="0" required placeholder="0.10"></div>
        <div class="field">
          <label>Tipe</label>
          <select name="type">
            <option value="Benefit">Benefit</option>
            <option value="Cost">Cost</option>
          </select>
        </div>
        <div class="field"><label>Satuan</label><input name="unit" placeholder="skor"></div>
        <div class="field"><label>&nbsp;</label><button class="button primary" type="submit">Tambah Kriteria</button></div>
      </form>
    </section>
  `;
}

function renderCalculation() {
  const result = calculatePromethee(alternatives, criteria);

  if (alternatives.length < 2 || criteria.length === 0) {
    return renderEmptyState('Perhitungan belum tersedia', 'Tambahkan minimal 2 alternatif dan 1 kriteria di tab Input Data.');
  }

  return `
    <section class="panel report-panel">
      ${renderChapterHeading('01', 'Data yang Digunakan', 'Alternatif dan kriteria', 'Dataset aktif yang dipakai untuk perhitungan PROMETHEE.')}
      <p class="soft-copy">Benefit berarti semakin besar nilai semakin baik. Cost berarti semakin kecil nilai semakin baik.</p>
      <div class="split" style="margin-top: 16px">
        ${renderStaticAlternativeTable()}
        ${renderStaticCriteriaTable()}
      </div>
    </section>

    <section class="panel report-panel">
      ${renderChapterHeading('02', 'Matriks Indeks Preferensi Multikriteria', 'Nilai pi(a,b)', 'Setiap sel pi(a,b) menunjukkan seberapa kuat alternatif baris mengungguli alternatif kolom berdasarkan seluruh kriteria.')}
      ${renderPreferenceMatrix(result)}
    </section>

    <section class="panel report-panel">
      ${renderChapterHeading('03', 'Hasil Flow dan Ranking', 'Ranking PROMETHEE', 'Leaving Flow, Entering Flow, dan Net Flow diringkas sebagai dasar keputusan akhir.')}
      ${renderRankingTable(result.ranking)}
    </section>

    ${renderStepByStepAnalysis(result)}
  `;
}

function renderStepByStepAnalysis(result) {
  const best = result.ranking[0];
  const otherOptions = alternatives.filter((item) => item.code !== best.code);
  if (!otherOptions.some((item) => item.code === selectedComparisonCode)) {
    selectedComparisonCode = otherOptions[0] ? otherOptions[0].code : '';
  }

  const comparison = getPairwiseComparison(best.code, selectedComparisonCode, alternatives, criteria);
  const outgoing = alternatives.filter((item) => item.code !== best.code).map((item) => ({
    code: item.code,
    value: result.matrix[best.code][item.code]
  }));
  const incoming = alternatives.filter((item) => item.code !== best.code).map((item) => ({
    code: item.code,
    value: result.matrix[item.code][best.code]
  }));
  const wins = comparison ? comparison.rows.filter((item) => item.preference === 1).length : 0;
  const losses = comparison ? comparison.rows.length - wins : 0;

  return `
    <section class="panel report-panel">
      ${renderChapterHeading('04', 'Analisis Step-by-Step Rekomendasi', escapeHtml(best.name), 'Pembacaan hasil untuk laptop ranking pertama dan alternatif pembanding.')}
      <div class="flow-strip">
        <div class="flow-chip"><span>Laptop terbaik</span><strong>${escapeHtml(best.code)}</strong></div>
        <div class="flow-chip"><span>Leaving Flow</span><strong>${formatNumber(best.leaving)}</strong></div>
        <div class="flow-chip"><span>Entering Flow</span><strong>${formatNumber(best.entering)}</strong></div>
        <div class="flow-chip"><span>Net Flow</span><strong>${formatNumber(best.net)}</strong></div>
      </div>
      <p class="soft-copy" style="margin-top: 16px">Laptop ini menjadi rekomendasi utama karena memiliki Net Flow tertinggi. Net Flow diperoleh dari selisih Leaving Flow dan Entering Flow. Semakin tinggi Net Flow, semakin kuat posisi alternatif tersebut dibandingkan alternatif lain.</p>

      <div class="field" style="margin-top: 20px; max-width: 420px">
        <label for="comparisonLaptop">Pilih alternatif pembanding</label>
        <select id="comparisonLaptop" data-select-comparison>
          ${otherOptions.map((item) => `<option value="${escapeHtml(item.code)}" ${item.code === selectedComparisonCode ? 'selected' : ''}>${escapeHtml(item.code)} - ${escapeHtml(item.name)}</option>`).join('')}
        </select>
      </div>

      ${comparison ? `
        <div style="margin-top: 18px">
          ${renderComparisonTable(comparison)}
          <div class="comparison-summary">
            Dari ${criteria.length} kriteria, ${escapeHtml(best.code)} unggul pada ${wins} kriteria dan tidak unggul pada ${losses} kriteria. Nilai preferensi ${escapeHtml(best.code)} terhadap ${escapeHtml(comparison.selected.code)} adalah ${formatNumber(comparison.preferenceIndex)}.
          </div>
        </div>
      ` : ''}

      <div class="app" style="margin-top: 18px">
        <details open>
          <summary>Bagaimana Leaving Flow dihitung?</summary>
          <div class="details-body">
            <div class="small-list">
              ${outgoing.map((item) => `<div><span>${escapeHtml(best.code)} terhadap ${escapeHtml(item.code)}</span><strong>${formatNumber(item.value)}</strong></div>`).join('')}
            </div>
            <pre class="formula">Leaving Flow = total nilai preferensi keluar / (jumlah alternatif - 1)
Leaving Flow ${escapeHtml(best.code)} = (${outgoing.map((item) => formatNumber(item.value)).join(' + ')}) / ${alternatives.length - 1}
Leaving Flow ${escapeHtml(best.code)} = ${formatNumber(best.leaving)}</pre>
          </div>
        </details>

        <details>
          <summary>Bagaimana Entering Flow dihitung?</summary>
          <div class="details-body">
            <div class="small-list">
              ${incoming.map((item) => `<div><span>${escapeHtml(item.code)} terhadap ${escapeHtml(best.code)}</span><strong>${formatNumber(item.value)}</strong></div>`).join('')}
            </div>
            <pre class="formula">Entering Flow = total nilai preferensi masuk / (jumlah alternatif - 1)
Entering Flow ${escapeHtml(best.code)} = (${incoming.map((item) => formatNumber(item.value)).join(' + ')}) / ${alternatives.length - 1}
Entering Flow ${escapeHtml(best.code)} = ${formatNumber(best.entering)}</pre>
          </div>
        </details>

        <details>
          <summary>Bagaimana Net Flow dihitung?</summary>
          <div class="details-body">
            <pre class="formula">Net Flow = Leaving Flow - Entering Flow
Net Flow ${escapeHtml(best.code)} = ${formatNumber(best.leaving)} - ${formatNumber(best.entering)}
Net Flow ${escapeHtml(best.code)} = ${formatNumber(best.net)}</pre>
          </div>
        </details>

        <details>
          <summary>Ringkasan Rumus PROMETHEE</summary>
          <div class="details-body">
            <pre class="formula">Untuk Benefit: d = nilai(a) - nilai(b)
Untuk Cost: d = nilai(b) - nilai(a)
P(a,b) = 1 jika d > 0
P(a,b) = 0 jika d <= 0
pi(a,b) = (1 / jumlah_kriteria) * jumlah Pk(a,b)
Leaving Flow = jumlah pi(a,b) / (n - 1)
Entering Flow = jumlah pi(b,a) / (n - 1)
Net Flow = Leaving Flow - Entering Flow</pre>
          </div>
        </details>
      </div>
    </section>
  `;
}

function renderAbout() {
  const items = [
    ['Apa itu PROMETHEE', 'PROMETHEE adalah metode pengambilan keputusan multikriteria yang membandingkan setiap alternatif satu per satu berdasarkan beberapa kriteria.'],
    ['Kriteria Benefit', 'Kriteria benefit adalah kriteria yang semakin besar nilainya semakin baik. Contoh: RAM, Prosesor, Baterai, Storage, dan GPU.'],
    ['Kriteria Cost', 'Kriteria cost adalah kriteria yang semakin kecil nilainya semakin baik. Contoh: Harga dan Berat.'],
    ['Leaving Flow', 'Leaving Flow menunjukkan seberapa besar suatu alternatif mengungguli alternatif lain.'],
    ['Entering Flow', 'Entering Flow menunjukkan seberapa besar suatu alternatif dikalahkan oleh alternatif lain.'],
    ['Net Flow', 'Net Flow adalah selisih antara Leaving Flow dan Entering Flow.'],
    ['Kenapa Net Flow tertinggi dipilih', 'Alternatif dengan Net Flow tertinggi direkomendasikan karena secara keseluruhan lebih banyak unggul dibandingkan kalah terhadap alternatif lain.']
  ];

  return `
    <section class="method-grid">
      ${items.map(([title, body]) => `
        <article class="method-item">
          <p class="section-label">PROMETHEE</p>
          <h2>${escapeHtml(title)}</h2>
          <p class="soft-copy">${escapeHtml(body)}</p>
        </article>
      `).join('')}
    </section>
  `;
}

function renderChapterHeading(number, label, title, description = '') {
  return `
    <div class="chapter-heading">
      <span class="chapter-number">${escapeHtml(number)}</span>
      <div>
        <p class="section-label">${escapeHtml(label)}</p>
        <h2>${title}</h2>
        ${description ? `<p class="soft-copy">${escapeHtml(description)}</p>` : ''}
      </div>
    </div>
  `;
}

function renderRankingTable(rows, compact = false) {
  if (!rows.length) {
    return renderEmptyState('Tidak ada hasil', 'Coba ubah kata kunci pencarian atau tambahkan data alternatif.');
  }

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Rank</th>
            <th>Kode</th>
            <th>Nama Laptop</th>
            ${compact ? '' : '<th class="num">Leaving Flow</th><th class="num">Entering Flow</th>'}
            <th class="num">Net Flow</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr class="${row.rank === 1 ? 'best-row' : ''}">
              <td><span class="rank-pill">${row.rank}</span></td>
              <td>${escapeHtml(row.code)}</td>
              <td>${escapeHtml(row.name)}</td>
              ${compact ? '' : `<td class="num">${formatNumber(row.leaving)}</td><td class="num">${formatNumber(row.entering)}</td>`}
              <td class="num">${formatNumber(row.net)}</td>
              <td>${escapeHtml(row.status)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderNetFlowChart(rows) {
  if (!rows.length) return renderEmptyState('Chart belum tersedia', 'Tambahkan alternatif untuk melihat bar chart Net Flow.');
  const maxAbs = Math.max(...rows.map((item) => Math.abs(item.net)), 0.0001);

  return `
    <div class="chart">
      ${rows.map((item) => {
        const width = (Math.abs(item.net) / maxAbs) * 50;
        const left = item.net < 0 ? 50 - width : 50;
        return `
          <div class="chart-row">
            <div class="chart-label"><span class="chart-code">${escapeHtml(item.code)}</span><span class="chart-name">${escapeHtml(item.name)}</span></div>
            <div class="chart-track" aria-label="Net Flow ${escapeHtml(item.code)} ${formatNumber(item.net)}">
              <span class="chart-zero"></span>
              <span class="chart-bar ${item.net < 0 ? 'negative' : ''}" style="--bar-left: ${left}%; --bar-width: ${width}%;"></span>
            </div>
            <div class="chart-value">${formatNumber(item.net)}</div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderPreferenceMatrix(result) {
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Alternatif</th>
            ${alternatives.map((item) => `<th class="num">${escapeHtml(item.code)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${alternatives.map((row) => `
            <tr>
              <td>${escapeHtml(row.code)}</td>
              ${alternatives.map((col) => `<td class="num">${row.code === col.code ? '-' : formatNumber(result.matrix[row.code][col.code])}</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderLaptopDetail(code) {
  const laptop = alternatives.find((item) => item.code === code) || alternatives[0];
  if (!laptop) return renderEmptyState('Laptop belum dipilih', 'Tambahkan data alternatif terlebih dahulu.');

  return `
    <div class="detail-grid" style="margin-top: 16px">
      ${criteria.map((item) => `
        <div class="detail-item">
          <span>${escapeHtml(item.name)}</span>
          <strong>${formatUnit(item.key, laptop.values[item.key])}</strong>
        </div>
      `).join('')}
    </div>
  `;
}

function renderAlternativeInputTable() {
  return `
    <div class="table-wrap">
      <table class="input-table">
        <thead>
          <tr>
            <th>Kode</th>
            <th>Nama Laptop</th>
            ${criteria.map((item) => `<th>${escapeHtml(item.name)}</th>`).join('')}
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody>
          ${alternatives.map((alt) => `
            <tr>
              <td><input data-alt-field="code" data-alt-code="${escapeHtml(alt.code)}" value="${escapeHtml(alt.code)}"></td>
              <td><input data-alt-field="name" data-alt-code="${escapeHtml(alt.code)}" value="${escapeHtml(alt.name)}"></td>
              ${criteria.map((item) => `
                <td><input type="number" step="any" data-alt-field="${escapeHtml(item.key)}" data-alt-code="${escapeHtml(alt.code)}" value="${escapeHtml(String(alt.values[item.key] ?? 0))}"></td>
              `).join('')}
              <td><button class="button danger" type="button" data-delete-laptop="${escapeHtml(alt.code)}" ${alternatives.length <= 2 ? 'disabled' : ''}>Hapus</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderCriteriaInputTable() {
  return `
    <div class="table-wrap">
      <table class="input-table">
        <thead>
          <tr>
            <th>Kode</th>
            <th>Kriteria</th>
            <th>Bobot</th>
            <th>Tipe</th>
            <th>Satuan</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody>
          ${criteria.map((item) => `
            <tr>
              <td><input data-criteria-field="code" data-criteria-code="${escapeHtml(item.code)}" value="${escapeHtml(item.code)}"></td>
              <td><input data-criteria-field="name" data-criteria-code="${escapeHtml(item.code)}" value="${escapeHtml(item.name)}"></td>
              <td><input type="number" step="0.01" min="0" data-criteria-field="weight" data-criteria-code="${escapeHtml(item.code)}" value="${escapeHtml(String(item.weight))}"></td>
              <td>
                <select data-criteria-field="type" data-criteria-code="${escapeHtml(item.code)}">
                  <option value="Benefit" ${item.type === 'Benefit' ? 'selected' : ''}>Benefit</option>
                  <option value="Cost" ${item.type === 'Cost' ? 'selected' : ''}>Cost</option>
                </select>
              </td>
              <td><input data-criteria-field="unit" data-criteria-code="${escapeHtml(item.code)}" value="${escapeHtml(item.unit || '')}"></td>
              <td><button class="button danger" type="button" data-delete-criterion="${escapeHtml(item.code)}" ${criteria.length <= 1 ? 'disabled' : ''}>Hapus</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderStaticAlternativeTable() {
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Kode</th><th>Nama Laptop</th>${criteria.map((item) => `<th class="num">${escapeHtml(item.name)}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${alternatives.map((alt) => `
            <tr><td>${escapeHtml(alt.code)}</td><td>${escapeHtml(alt.name)}</td>${criteria.map((item) => `<td class="num">${formatUnit(item.key, alt.values[item.key])}</td>`).join('')}</tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderStaticCriteriaTable() {
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Kode</th><th>Kriteria</th><th class="num">Bobot</th><th>Tipe</th></tr></thead>
        <tbody>
          ${criteria.map((item) => `
            <tr><td>${escapeHtml(item.code)}</td><td>${escapeHtml(item.name)}</td><td class="num">${formatNumber(item.weight, 2)}</td><td>${escapeHtml(item.type)}</td></tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderComparisonTable(comparison) {
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Kriteria</th>
            <th>Tipe</th>
            <th class="num">Nilai Laptop Terbaik</th>
            <th class="num">Nilai Pembanding</th>
            <th class="num">Selisih</th>
            <th class="num">Preferensi</th>
            <th>Keterangan</th>
          </tr>
        </thead>
        <tbody>
          ${comparison.rows.map((row) => `
            <tr>
              <td>${escapeHtml(row.criterion.name)}</td>
              <td>${escapeHtml(row.criterion.type)}</td>
              <td class="num">${formatUnit(row.criterion.key, row.valueBest)}</td>
              <td class="num">${formatUnit(row.criterion.key, row.valueSelected)}</td>
              <td class="num">${formatNumber(row.diff)}</td>
              <td class="num">${row.preference}</td>
              <td>${escapeHtml(row.message)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderEmptyState(title, body) {
  return `
    <section class="empty-state">
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(body)}</p>
    </section>
  `;
}

function addLaptop(form) {
  const data = new FormData(form);
  const code = String(data.get('code') || '').trim();
  const name = String(data.get('name') || '').trim();

  if (!code || !name || alternatives.some((item) => item.code === code)) return;

  const values = {};
  criteria.forEach((item) => {
    values[item.key] = normalizeNumber(data.get(item.key));
  });

  alternatives.push({ code, name, values });
  selectedLaptopCode = code;
  renderAll();
}

function deleteLaptop(code) {
  if (alternatives.length <= 2) return;
  alternatives = alternatives.filter((item) => item.code !== code);
  if (selectedLaptopCode === code) selectedLaptopCode = alternatives[0] ? alternatives[0].code : '';
  if (selectedComparisonCode === code) selectedComparisonCode = alternatives.find((item) => item.code !== selectedLaptopCode)?.code || '';
  renderAll();
}

function updateAlternativeValue(code, field, value) {
  const target = alternatives.find((item) => item.code === code);
  if (!target) return;

  if (field === 'code') {
    const nextCode = String(value).trim();
    if (!nextCode || alternatives.some((item) => item.code === nextCode && item !== target)) return;
    if (selectedLaptopCode === target.code) selectedLaptopCode = nextCode;
    if (selectedComparisonCode === target.code) selectedComparisonCode = nextCode;
    target.code = nextCode;
    return;
  }

  if (field === 'name') {
    target.name = String(value).trim() || target.name;
    return;
  }

  target.values[field] = normalizeNumber(value);
}

function updateCriteriaValue(code, field, value) {
  const target = criteria.find((item) => item.code === code);
  if (!target) return;

  if (field === 'code') {
    const nextCode = String(value).trim();
    if (!nextCode || criteria.some((item) => item.code === nextCode && item !== target)) return;
    target.code = nextCode;
    return;
  }

  if (field === 'name') {
    const nextName = String(value).trim() || target.name;
    const oldKey = target.key;
    const newKey = oldKey in criterionUnits ? oldKey : slugify(nextName);
    target.name = nextName;
    if (newKey !== oldKey && !criteria.some((item) => item !== target && item.key === newKey)) {
      target.key = newKey;
      alternatives.forEach((alt) => {
        alt.values[newKey] = normalizeNumber(alt.values[oldKey]);
        delete alt.values[oldKey];
      });
    }
    return;
  }

  if (field === 'weight') {
    target.weight = normalizeNumber(value);
    return;
  }

  if (field === 'type') {
    target.type = value === 'Cost' ? 'Cost' : 'Benefit';
    return;
  }

  if (field === 'unit') {
    target.unit = String(value || '').trim();
  }
}

function addCriterion(form) {
  const data = new FormData(form);
  const code = String(data.get('code') || '').trim();
  const name = String(data.get('name') || '').trim();
  const key = slugify(name);

  if (!code || !name || !key || criteria.some((item) => item.code === code || item.key === key)) return;

  const criterion = {
    code,
    name,
    key,
    weight: normalizeNumber(data.get('weight')),
    type: data.get('type') === 'Cost' ? 'Cost' : 'Benefit',
    unit: String(data.get('unit') || '').trim() || 'skor'
  };

  criteria.push(criterion);
  alternatives.forEach((alt) => {
    alt.values[key] = 0;
  });
  renderAll();
}

function deleteCriterion(code) {
  if (criteria.length <= 1) return;
  const target = criteria.find((item) => item.code === code);
  if (!target) return;
  criteria = criteria.filter((item) => item.code !== code);
  alternatives.forEach((alt) => {
    delete alt.values[target.key];
  });
  renderAll();
}

function resetData() {
  alternatives = getDefaultAlternatives();
  criteria = getDefaultCriteria();
  activeTab = 'dashboard';
  selectedLaptopCode = 'A5';
  selectedComparisonCode = 'A1';
  searchQuery = '';
  renderAll();
}

function downloadRankingCsv() {
  const result = calculatePromethee(alternatives, criteria);
  const rows = [
    ['Rank', 'Kode', 'Nama Laptop', 'Leaving Flow', 'Entering Flow', 'Net Flow', 'Status'],
    ...result.ranking.map((item) => [
      item.rank,
      item.code,
      item.name,
      formatNumber(item.leaving),
      formatNumber(item.entering),
      formatNumber(item.net),
      item.status
    ])
  ];
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'ranking-promethee-laptop.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function switchTab(tabName) {
  activeTab = tabName;
  renderAll();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function formatNumber(value, digits = 4) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(digits) : (0).toFixed(digits);
}

function formatUnit(field, value) {
  const criterion = criteria.find((item) => item.key === field);
  const unit = criterion ? criterion.unit : criterionUnits[field];
  const digits = field === 'berat' ? 2 : (Number(value) % 1 === 0 ? 0 : 2);
  return `${formatNumber(value, digits)} ${unit || ''}`.trim();
}

function getTotalWeight(currentCriteria) {
  return currentCriteria.reduce((sum, item) => sum + normalizeNumber(item.weight), 0);
}

function isWeightValid(currentCriteria) {
  return Math.abs(getTotalWeight(currentCriteria) - 1) < 0.0001;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalizeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function renderAll() {
  renderHeader();
  const app = document.getElementById('app');
  if (activeTab === 'input') app.innerHTML = renderInputData();
  else if (activeTab === 'calculation') app.innerHTML = renderCalculation();
  else if (activeTab === 'about') app.innerHTML = renderAbout();
  else app.innerHTML = renderDashboard();
}

document.addEventListener('click', (event) => {
  const tabLink = event.target.closest('[data-tab-link]');
  if (tabLink) {
    event.preventDefault();
    switchTab(tabLink.dataset.tabLink);
    return;
  }

  const action = event.target.closest('[data-action]');
  if (action) {
    const type = action.dataset.action;
    if (type === 'download-csv') downloadRankingCsv();
    if (type === 'reset') resetData();
    if (type === 'recalculate') renderAll();
    return;
  }

  const deleteLaptopButton = event.target.closest('[data-delete-laptop]');
  if (deleteLaptopButton) {
    deleteLaptop(deleteLaptopButton.dataset.deleteLaptop);
    return;
  }

  const deleteCriterionButton = event.target.closest('[data-delete-criterion]');
  if (deleteCriterionButton) {
    deleteCriterion(deleteCriterionButton.dataset.deleteCriterion);
  }
});

document.addEventListener('input', (event) => {
  if (event.target.matches('[data-search]')) {
    const cursor = event.target.selectionStart || 0;
    searchQuery = event.target.value;
    document.getElementById('app').innerHTML = renderDashboard();
    const nextSearch = document.querySelector('[data-search]');
    if (nextSearch) {
      nextSearch.focus();
      nextSearch.setSelectionRange(cursor, cursor);
    }
  }
});

document.addEventListener('change', (event) => {
  if (event.target.matches('[data-select-laptop]')) {
    selectedLaptopCode = event.target.value;
    renderAll();
    return;
  }

  if (event.target.matches('[data-select-comparison]')) {
    selectedComparisonCode = event.target.value;
    renderAll();
    return;
  }

  if (event.target.matches('[data-alt-field]')) {
    updateAlternativeValue(event.target.dataset.altCode, event.target.dataset.altField, event.target.value);
    renderAll();
    return;
  }

  if (event.target.matches('[data-criteria-field]')) {
    updateCriteriaValue(event.target.dataset.criteriaCode, event.target.dataset.criteriaField, event.target.value);
    renderAll();
  }
});

document.addEventListener('submit', (event) => {
  const form = event.target.closest('form');
  if (!form) return;
  event.preventDefault();

  if (form.dataset.form === 'add-laptop') addLaptop(form);
  if (form.dataset.form === 'add-criterion') addCriterion(form);
});

document.addEventListener('DOMContentLoaded', renderAll);
