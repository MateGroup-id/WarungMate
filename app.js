const API = "https://webhook.mategroup.id/warungmate/data";
const STORAGE_KEY = "warungmate-data";

const refreshButton = document.getElementById("refreshButton");
const pageLoadingOverlay = document.getElementById("pageLoadingOverlay");
const loadingState = document.getElementById("loadingState");
const loadingText = document.getElementById("loadingText");
const totalProduk = document.getElementById("totalProduk");
const totalTransaksi = document.getElementById("totalTransaksi");
const inventarisBody = document.getElementById("inventarisBody");
const transaksiBody = document.getElementById("transaksiBody");
const totalRevenue = document.getElementById("totalRevenue");
const totalQtyOut = document.getElementById("totalQtyOut");
const topProduct = document.getElementById("topProduct");
const analyticsChart = document.getElementById("analyticsChart");
const viewRevenueButton = document.getElementById("viewRevenue");
const viewQuantityButton = document.getElementById("viewQuantity");
const filterPeriod = document.getElementById("filterPeriod");
const filterCategory = document.getElementById("filterCategory");
const filterType = document.getElementById("filterType");
const resetFiltersButton = document.getElementById("resetFilters");

let chartMode = "revenue";
let lastDashboardData = null;
let filterChoices = {
  period: null,
  category: null,
  type: null,
};
let filterState = {
  period: "all",
  category: "all",
  type: "all",
};

function setLoading(isLoading, message = "Memuat data dari API...") {
  refreshButton.disabled = isLoading;
  loadingState.classList.toggle("is-hidden", !isLoading);
  loadingText.textContent = message;
}

async function getData(force = false) {
  if (!force) {
    const cache = sessionStorage.getItem(STORAGE_KEY);

    if (cache) {
      return JSON.parse(cache);
    }
  }

  const response = await fetch(API);
  const data = await response.json();

  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  return data;
}

function renderInventaris(items) {
  inventarisBody.innerHTML = items
    .map(
      (item) => `
<tr>
<td>${item.nama_produk}</td>
<td>${item.kategori}</td>
<td>${item.stok_sekarang}</td>
<td>${item.satuan}</td>
<td>Rp ${item.harga_satuan.toLocaleString("id-ID")}</td>
</tr>
`
    )
    .join("");
}

function renderTransaksi(items) {
  transaksiBody.innerHTML = items
    .map(
      (item) => `
<tr>
<td>${item.timestamp}</td>
<td>${item.nama_produk}</td>
<td>${item.jumlah}</td>
<td class="${item.jenis}">${item.jenis}</td>
<td>${item.catatan}</td>
</tr>
`
    )
    .join("");
}

function normalizeName(value) {
  return value.trim().toLowerCase();
}

function parseTimestamp(value) {
  return new Date(value.replace(" ", "T"));
}

function getPeriodThreshold(period) {
  if (period === "all") {
    return null;
  }

  const days = Number(period.replace("d", ""));
  const threshold = new Date();
  threshold.setHours(0, 0, 0, 0);
  threshold.setDate(threshold.getDate() - days);
  return threshold;
}

function buildInventoryIndex(items) {
  return new Map(items.map((item) => [normalizeName(item.nama_produk), item]));
}

function getFilteredData(data) {
  const inventoryIndex = buildInventoryIndex(data.inventaris);
  const categoryFilter = filterState.category;
  const typeFilter = filterState.type;
  const threshold = getPeriodThreshold(filterState.period);

  const filteredTransactions = data.logTransaksi.filter((transaction) => {
    if (typeFilter !== "all" && transaction.jenis !== typeFilter) {
      return false;
    }

    if (threshold) {
      const transactionDate = parseTimestamp(transaction.timestamp);
      if (Number.isNaN(transactionDate.getTime()) || transactionDate < threshold) {
        return false;
      }
    }

    if (categoryFilter !== "all") {
      const inventoryItem = inventoryIndex.get(normalizeName(transaction.nama_produk));
      if (!inventoryItem || normalizeName(inventoryItem.kategori) !== categoryFilter) {
        return false;
      }
    }

    return true;
  });

  const filteredInventaris = data.inventaris.filter((item) => {
    if (categoryFilter === "all") {
      return true;
    }

    return normalizeName(item.kategori) === categoryFilter;
  });

  return {
    inventaris: filteredInventaris,
    logTransaksi: filteredTransactions,
    inventoryIndex,
  };
}

function formatCurrency(value) {
  return `Rp ${value.toLocaleString("id-ID")}`;
}

function populateCategoryFilter(items) {
  const categories = [...new Set(items.map((item) => item.kategori).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right, "id")
  );

  filterCategory.innerHTML = `
    <option value="all">Semua kategori</option>
    ${categories
      .map(
        (category) => `
          <option value="${normalizeName(category)}">${category}</option>
        `
      )
      .join("")}
  `;
}

function destroyFilterChoices() {
  Object.values(filterChoices).forEach((instance) => {
    if (instance) {
      instance.destroy();
    }
  });

  filterChoices = {
    period: null,
    category: null,
    type: null,
  };
}

function enhanceFilterSelects() {
  destroyFilterChoices();

  filterChoices.period = new Choices(filterPeriod, {
    shouldSort: false,
    itemSelectText: "",
    searchEnabled: false,
    allowHTML: false,
    position: "bottom",
  });

  filterChoices.category = new Choices(filterCategory, {
    shouldSort: false,
    itemSelectText: "",
    searchEnabled: false,
    allowHTML: false,
    position: "bottom",
  });

  filterChoices.type = new Choices(filterType, {
    shouldSort: false,
    itemSelectText: "",
    searchEnabled: false,
    allowHTML: false,
    position: "bottom",
  });
}

function syncFilterStateFromUI() {
  filterState = {
    period: filterPeriod.value,
    category: filterCategory.value,
    type: filterType.value,
  };
}

function buildRevenueRows(data) {
  const inventoryByName = new Map(
    data.inventaris.map((item) => [normalizeName(item.nama_produk), item])
  );

  const summaryByProduct = new Map();

  for (const transaction of data.logTransaksi) {
    if (transaction.jenis !== "keluar") {
      continue;
    }

    const productKey = normalizeName(transaction.nama_produk);
    const inventoryItem = inventoryByName.get(productKey);
    const unitPrice = inventoryItem?.harga_satuan ?? 0;
    const qty = Number(transaction.jumlah) || 0;
    const revenue = unitPrice * qty;

    const current = summaryByProduct.get(productKey) ?? {
      name: inventoryItem?.nama_produk ?? transaction.nama_produk,
      qty: 0,
      revenue: 0,
    };

    current.qty += qty;
    current.revenue += revenue;
    summaryByProduct.set(productKey, current);
  }

  return [...summaryByProduct.values()].sort((left, right) => {
    if (chartMode === "quantity") {
      return right.qty - left.qty;
    }

    return right.revenue - left.revenue;
  });
}

function renderChart(data) {
  const rows = buildRevenueRows(data);

  if (rows.length === 0) {
    analyticsChart.innerHTML = '<div class="chart-empty">Belum ada transaksi keluar untuk ditampilkan di chart.</div>';
    totalRevenue.textContent = formatCurrency(0);
    totalQtyOut.textContent = "0";
    topProduct.textContent = "-";
    return;
  }

  const maxValue = Math.max(
    ...rows.map((row) => (chartMode === "quantity" ? row.qty : row.revenue))
  );

  const totalRevenueValue = rows.reduce((sum, row) => sum + row.revenue, 0);
  const totalQtyValue = rows.reduce((sum, row) => sum + row.qty, 0);
  const leader = rows[0];

  totalRevenue.textContent = formatCurrency(totalRevenueValue);
  totalQtyOut.textContent = totalQtyValue.toLocaleString("id-ID");
  topProduct.textContent = leader.name;

  analyticsChart.innerHTML = rows
    .map((row) => {
      const value = chartMode === "quantity" ? row.qty : row.revenue;
      const labelValue = chartMode === "quantity" ? `${value} pcs` : formatCurrency(value);
      const width = maxValue === 0 ? 0 : Math.max(8, (value / maxValue) * 100);

      return `
        <div class="chart-row">
          <div class="chart-meta">
            <span class="chart-label">${row.name}</span>
            <span class="chart-value">${labelValue}</span>
          </div>
          <div class="chart-track" aria-hidden="true">
            <div class="chart-bar" style="width: ${width}%;"></div>
          </div>
        </div>
      `;
    })
    .join("");
}

function updateDashboardView(data) {
  const filtered = getFilteredData(data);

  totalProduk.textContent = filtered.inventaris.length;
  totalTransaksi.textContent = filtered.logTransaksi.length;
  renderInventaris(filtered.inventaris);
  renderTransaksi(filtered.logTransaksi);
  renderChart(filtered);
}

function setChartMode(nextMode) {
  chartMode = nextMode;
  viewRevenueButton.classList.toggle("is-active", chartMode === "revenue");
  viewQuantityButton.classList.toggle("is-active", chartMode === "quantity");
  viewRevenueButton.setAttribute("aria-pressed", String(chartMode === "revenue"));
  viewQuantityButton.setAttribute("aria-pressed", String(chartMode === "quantity"));

  if (lastDashboardData) {
    updateDashboardView(lastDashboardData);
  }
}

async function loadDashboard(force = false) {
  setLoading(true);

  try {
    const data = await getData(force);
    lastDashboardData = data;

    populateCategoryFilter(data.inventaris);
    enhanceFilterSelects();
    syncFilterStateFromUI();
    updateDashboardView(data);
  } finally {
    setLoading(false);
    pageLoadingOverlay.classList.add("is-hidden");
  }
}

async function refreshData() {
  sessionStorage.removeItem(STORAGE_KEY);
  await loadDashboard(true);
}

refreshButton.addEventListener("click", refreshData);
viewRevenueButton.addEventListener("click", () => setChartMode("revenue"));
viewQuantityButton.addEventListener("click", () => setChartMode("quantity"));
filterPeriod.addEventListener("change", () => {
  syncFilterStateFromUI();

  if (lastDashboardData) {
    updateDashboardView(lastDashboardData);
  }
});

filterCategory.addEventListener("change", () => {
  syncFilterStateFromUI();

  if (lastDashboardData) {
    updateDashboardView(lastDashboardData);
  }
});

filterType.addEventListener("change", () => {
  syncFilterStateFromUI();

  if (lastDashboardData) {
    updateDashboardView(lastDashboardData);
  }
});

resetFiltersButton.addEventListener("click", () => {
  if (filterChoices.period) {
    filterChoices.period.removeActiveItems();
    filterChoices.period.setChoiceByValue("all");
  } else {
    filterPeriod.value = "all";
  }

  if (filterChoices.category) {
    filterChoices.category.removeActiveItems();
    filterChoices.category.setChoiceByValue("all");
  } else {
    filterCategory.value = "all";
  }

  if (filterChoices.type) {
    filterChoices.type.removeActiveItems();
    filterChoices.type.setChoiceByValue("all");
  } else {
    filterType.value = "all";
  }

  syncFilterStateFromUI();

  if (lastDashboardData) {
    updateDashboardView(lastDashboardData);
  }
});
loadDashboard();
