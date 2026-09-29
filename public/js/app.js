// Global Operational Portal State
const state = {
  currentTab: 'dashboard',
  reportType: 'USER_MASTER_FEES',
  courseFilter: 'ALL',
  statusFilter: 'ALL',
  searchQuery: '',
  startDate: '',
  endDate: '',
  datePreset: 'ALL',
  currentPage: 1,
  rowsPerPage: 25,

  // Datasets
  rawDatasets: {
    userMasterFees: [],
    consolidatedMatrix: [],
    callingList: [],
    studentDirectory: [],
    payments: []
  },

  filteredRecords: []
};

// DOM Loaded Initializer
document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) lucide.createIcons();

  initNavigation();
  initGlobalSearch();
  loadPortalData();
});

// Navigation Handling
function initNavigation() {
  document.querySelectorAll('.nav-link').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      switchTab(tabId);
    });
  });
}

function switchTab(tabId) {
  state.currentTab = tabId;

  document.querySelectorAll('.nav-link').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

  const activeBtn = document.querySelector(`.nav-link[data-tab="${tabId}"]`);
  if (activeBtn) activeBtn.classList.add('active');

  const activePane = document.getElementById(`tab-${tabId}`);
  if (activePane) activePane.classList.add('active');

  // If switched to a tab, set report type accordingly
  if (tabId === 'user-master-fees') setReportType('USER_MASTER_FEES');
  else if (tabId === 'consolidated-matrix') setReportType('CONSOLIDATED_MATRIX');
  else if (tabId === 'calling-list') setReportType('CALLING_LIST');
  else if (tabId === 'student-directory') setReportType('STUDENT_DIRECTORY');

  applyGlobalFilters();
}

function setReportType(type) {
  state.reportType = type;
  const select = document.getElementById('reportTypeFilter');
  if (select) select.value = type;
}

// Data Fetching
async function loadPortalData() {
  try {
    const [resUserFees, resMatrix, resCalling, resDirectory] = await Promise.all([
      fetch('/api/reports/student-user-fees').then(r => r.json()).catch(() => ({ data: [] })),
      fetch('/api/reports/consolidated-matrix').then(r => r.json()).catch(() => ({ data: [] })),
      fetch('/api/reports/calling-list').then(r => r.json()).catch(() => ({ data: [] })),
      fetch('/api/reports/students').then(r => r.json()).catch(() => ({ data: [] }))
    ]);

    state.rawDatasets.userMasterFees = resUserFees.data || [];
    state.rawDatasets.consolidatedMatrix = resMatrix.data || [];
    state.rawDatasets.callingList = resCalling.data || [];
    state.rawDatasets.studentDirectory = resDirectory.data || [];

    updateDashboardStats();
    applyGlobalFilters();
  } catch (err) {
    console.error('Error loading datasets:', err);
  }
}

// Update Overview Dashboard Stats
function updateDashboardStats() {
  const dataset = state.rawDatasets.userMasterFees;
  const totalStudents = dataset.length || 1250;
  
  let collected = 0;
  let pending = 0;
  let callCount = 0;

  dataset.forEach(r => {
    collected += Number(r["Total Paid (₹)"] || 0);
    pending += Number(r["Overall Pending Balance (₹)"] || 0);
    if (r["Overall Pending Balance (₹)"] > 0) callCount++;
  });

  const elemStudents = document.getElementById('statTotalStudents');
  if (elemStudents) elemStudents.textContent = totalStudents.toLocaleString('en-IN');

  const elemCollected = document.getElementById('statCollectedFees');
  if (elemCollected) elemCollected.textContent = `₹${collected.toLocaleString('en-IN')}`;

  const elemPending = document.getElementById('statPendingFees');
  if (elemPending) elemPending.textContent = `₹${pending.toLocaleString('en-IN')}`;

  const elemCall = document.getElementById('statStudentsToCall');
  if (elemCall) elemCall.textContent = callCount.toLocaleString('en-IN');
}

// Global Filter Logic
function applyGlobalFilters() {
  state.reportType = document.getElementById('reportTypeFilter').value;
  state.courseFilter = document.getElementById('courseFilter').value;
  state.statusFilter = document.getElementById('statusFilter').value;
  state.startDate = document.getElementById('startDateInput').value;
  state.endDate = document.getElementById('endDateInput').value;
  state.searchQuery = document.getElementById('globalSearchInput').value.trim().toLowerCase();

  // Select source dataset based on Report Type
  let source = [];
  if (state.reportType === 'USER_MASTER_FEES') source = state.rawDatasets.userMasterFees;
  else if (state.reportType === 'CONSOLIDATED_MATRIX') source = state.rawDatasets.consolidatedMatrix;
  else if (state.reportType === 'CALLING_LIST') source = state.rawDatasets.callingList;
  else if (state.reportType === 'STUDENT_DIRECTORY') source = state.rawDatasets.studentDirectory;
  else source = state.rawDatasets.userMasterFees;

  // Filter 1: Course Filter
  let filtered = source;
  if (state.courseFilter !== 'ALL') {
    filtered = filtered.filter(r => (r["Course"] || "").toUpperCase() === state.courseFilter.toUpperCase());
  }

  // Filter 2: Status Filter
  if (state.statusFilter !== 'ALL') {
    filtered = filtered.filter(r => {
      const status = r["Fee Payment Status"] || r["Overall Status"] || r["Fee Status"] || r["Status"] || "";
      return status.toUpperCase() === state.statusFilter.toUpperCase();
    });
  }

  // Filter 3: Date Range Filter
  if (state.startDate || state.endDate) {
    const start = state.startDate ? new Date(state.startDate) : null;
    const end = state.endDate ? new Date(state.endDate) : null;

    filtered = filtered.filter(r => {
      const dateStr = r["Created Date"] || r["Last Login Date"] || r["Due Date"] || "2024-07-15";
      if (!dateStr || dateStr === '--') return true;
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return true;
      if (start && d < start) return false;
      if (end && d > end) return false;
      return true;
    });
  }

  // Filter 4: Search Query Matching Word Filter
  if (state.searchQuery) {
    const q = state.searchQuery;
    filtered = filtered.filter(r => {
      const jsonStr = JSON.stringify(r).toLowerCase();
      return jsonStr.includes(q);
    });
  }

  state.filteredRecords = filtered;
  state.currentPage = 1;

  renderActiveReportTable();
  renderSpecificTabTables();
  if (window.lucide) lucide.createIcons();
}

// Quick Date Presets
function setPresetDate(preset) {
  state.datePreset = preset;
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));

  const now = new Date();
  const startInput = document.getElementById('startDateInput');
  const endInput = document.getElementById('endDateInput');

  if (preset === 'ALL') {
    startInput.value = '';
    endInput.value = '';
    event.target.classList.add('active');
  } else if (preset === 'MONTH') {
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    startInput.value = firstDay.toISOString().split('T')[0];
    endInput.value = now.toISOString().split('T')[0];
    event.target.classList.add('active');
  } else if (preset === 'YEAR') {
    startInput.value = '2026-01-01';
    endInput.value = '2026-12-31';
    event.target.classList.add('active');
  }

  applyGlobalFilters();
}

// Global Search Event
function initGlobalSearch() {
  const input = document.getElementById('globalSearchInput');
  if (!input) return;

  input.addEventListener('input', () => {
    applyGlobalFilters();
  });
}

// Render Master Report Table
function renderActiveReportTable() {
  const header = document.getElementById('masterReportHeader');
  const body = document.getElementById('masterReportBody');
  const countBadge = document.getElementById('masterRecordCountBadge');
  const summaryTag = document.getElementById('reportFilterSummaryTag');

  if (!header || !body) return;

  const total = state.filteredRecords.length;
  if (countBadge) countBadge.textContent = `Showing ${total.toLocaleString('en-IN')} Records`;
  if (summaryTag) summaryTag.textContent = `Report: ${getReportTitleName(state.reportType)} (${total.toLocaleString('en-IN')} records matched)`;

  if (total === 0) {
    header.innerHTML = '<th>No Data</th>';
    body.innerHTML = '<tr><td class="text-center p-4 text-secondary">No records match your selected filters and search query.</td></tr>';
    updatePaginationControls(0);
    return;
  }

  const cols = Object.keys(state.filteredRecords[0]);
  header.innerHTML = cols.map(c => `<th>${c}</th>`).join('');

  // Paginate records
  const startIdx = (state.currentPage - 1) * state.rowsPerPage;
  const pageRecords = state.filteredRecords.slice(startIdx, startIdx + state.rowsPerPage);

  body.innerHTML = pageRecords.map(row => `
    <tr>
      ${cols.map(c => {
        const val = row[c];
        let displayVal = typeof val === 'number' ? (c.includes('Fee') || c.includes('Paid') || c.includes('Pending') || c.includes('Balance') ? `₹${val.toLocaleString('en-IN')}` : val) : String(val === null || val === undefined ? '--' : val);

        // Highlight matching query word
        if (state.searchQuery && displayVal.toLowerCase().includes(state.searchQuery)) {
          const regex = new RegExp(`(${escapeRegExp(state.searchQuery)})`, 'gi');
          displayVal = displayVal.replace(regex, '<mark class="search-highlight">$1</mark>');
        }

        let badgeClass = '';
        if (c.includes('Status') || c.includes('Priority')) {
          if (displayVal.includes('PAID') || displayVal.includes('ACTIVE') || displayVal.includes('CLEARED')) badgeClass = 'pill pill-paid';
          else if (displayVal.includes('PARTIAL') || displayVal.includes('REQUIRED')) badgeClass = 'pill pill-partial';
          else if (displayVal.includes('PENDING') || displayVal.includes('DELETED')) badgeClass = 'pill pill-pending';
        }

        return `<td><span class="${badgeClass}">${displayVal}</span></td>`;
      }).join('')}
    </tr>
  `).join('');

  updatePaginationControls(total);
}

// Helper to escape regex
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getReportTitleName(type) {
  if (type === 'USER_MASTER_FEES') return 'Student & User Master Semester Fees';
  if (type === 'CONSOLIDATED_MATRIX') return 'Consolidated Semester-Wise Fee Matrix';
  if (type === 'CALLING_LIST') return 'Student Fee Calling List';
  if (type === 'STUDENT_DIRECTORY') return 'Student Master Directory';
  return 'Master Report';
}

// Pagination Controls
function changePageRows() {
  state.rowsPerPage = parseInt(document.getElementById('rowsPerPageSelect').value) || 25;
  state.currentPage = 1;
  renderActiveReportTable();
}

function prevPage() {
  if (state.currentPage > 1) {
    state.currentPage--;
    renderActiveReportTable();
  }
}

function nextPage() {
  const totalPages = Math.ceil(state.filteredRecords.length / state.rowsPerPage);
  if (state.currentPage < totalPages) {
    state.currentPage++;
    renderActiveReportTable();
  }
}

function updatePaginationControls(total) {
  const totalPages = Math.ceil(total / state.rowsPerPage) || 1;
  const pageInfo = document.getElementById('paginationInfo');
  if (pageInfo) pageInfo.textContent = `Page ${state.currentPage} of ${totalPages} (${total.toLocaleString('en-IN')} total records)`;

  const btnPrev = document.getElementById('btnPrevPage');
  const btnNext = document.getElementById('btnNextPage');

  if (btnPrev) btnPrev.disabled = state.currentPage <= 1;
  if (btnNext) btnNext.disabled = state.currentPage >= totalPages;
}

// Render Tab-Specific Tables
function renderSpecificTabTables() {
  renderTabTable('userFeesHeader', 'userFeesBody', state.rawDatasets.userMasterFees);
  renderTabTable('matrixHeader', 'matrixBody', state.rawDatasets.consolidatedMatrix);
  renderTabTable('callingHeader', 'callingBody', state.rawDatasets.callingList);
  renderTabTable('directoryHeader', 'directoryBody', state.rawDatasets.studentDirectory);
}

function renderTabTable(headerId, bodyId, dataset) {
  const header = document.getElementById(headerId);
  const body = document.getElementById(bodyId);
  if (!header || !body || !dataset || dataset.length === 0) return;

  const cols = Object.keys(dataset[0]);
  header.innerHTML = cols.map(c => `<th>${c}</th>`).join('');

  const sampleRows = dataset.slice(0, 50); // High performance 50 rows preview
  body.innerHTML = sampleRows.map(row => `
    <tr>
      ${cols.map(c => {
        const val = row[c];
        let displayVal = typeof val === 'number' ? (c.includes('Fee') || c.includes('Paid') || c.includes('Pending') || c.includes('Balance') ? `₹${val.toLocaleString('en-IN')}` : val) : String(val === null || val === undefined ? '--' : val);
        let badgeClass = '';
        if (c.includes('Status') || c.includes('Priority')) {
          if (displayVal.includes('PAID') || displayVal.includes('ACTIVE') || displayVal.includes('CLEARED')) badgeClass = 'pill pill-paid';
          else if (displayVal.includes('PARTIAL') || displayVal.includes('REQUIRED')) badgeClass = 'pill pill-partial';
          else if (displayVal.includes('PENDING') || displayVal.includes('DELETED')) badgeClass = 'pill pill-pending';
        }
        return `<td><span class="${badgeClass}">${displayVal}</span></td>`;
      }).join('')}
    </tr>
  `).join('');
}

// Excel Download Functionality
function exportExcelCurrentView() {
  if (!state.filteredRecords || state.filteredRecords.length === 0) {
    alert('No filtered records available to export.');
    return;
  }

  const worksheet = XLSX.utils.json_to_sheet(state.filteredRecords);
  const colWidths = Object.keys(state.filteredRecords[0]).map(key => ({
    wch: Math.max(key.length + 4, 15)
  }));
  worksheet['!cols'] = colWidths;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Report View");

  const dateStr = new Date().toISOString().split('T')[0];
  XLSX.writeFile(workbook, `BRDP_${state.reportType}_Report_${dateStr}.xlsx`);
}
