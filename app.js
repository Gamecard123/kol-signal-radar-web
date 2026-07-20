const DATA_URL = new URL("./data/public-summary.json", document.baseURI);

const state = {
  data: null,
  activeHandle: "all",
  query: "",
};

const elements = {
  accountGrid: document.querySelector("#account-grid"),
  accountTabs: document.querySelector("#account-tabs"),
  asOf: document.querySelector("#as-of"),
  disclaimer: document.querySelector("#disclaimer"),
  errorBanner: document.querySelector("#error-banner"),
  errorMessage: document.querySelector("#error-message"),
  errorRetry: document.querySelector("#error-retry"),
  executiveSummary: document.querySelector("#executive-summary"),
  heroNote: document.querySelector("#hero-note"),
  pulseStack: document.querySelector("#pulse-stack"),
  refreshButton: document.querySelector("#refresh-button"),
  searchInput: document.querySelector("#search-input"),
  statActive: document.querySelector("#stat-active"),
  statMonitored: document.querySelector("#stat-monitored"),
  statSummaries: document.querySelector("#stat-summaries"),
  watchGrid: document.querySelector("#watch-grid"),
  windowHours: document.querySelector("#window-hours"),
  windowLabel: document.querySelector("#window-label"),
};

const confidenceLabels = {
  high: "高一致度",
  medium: "中等把握",
  low: "待验证",
};

const stanceLabels = {
  bullish: "偏多",
  bearish: "偏空",
  mixed: "多空交织",
  neutral: "中性",
  unclear: "方向不明",
};

const topicLabels = {
  ai: "AI",
  credit: "信用",
  liquidity: "流动性",
  macro: "宏观",
  policy: "政策",
  risk: "风险",
  semiconductor: "半导体",
  technology: "科技",
  volatility: "波动率",
};

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function create(tagName, className, text) {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatTime(value) {
  if (!value) return "本轮无新增";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间待核验";
  return `${dateFormatter.format(date)} ET`;
}

function setLoading(isLoading) {
  elements.refreshButton.disabled = isLoading;
  elements.refreshButton.textContent = isLoading ? "读取中…" : "刷新摘要";
}

function showError(message) {
  elements.errorMessage.textContent = message;
  elements.errorBanner.hidden = false;
}

function hideError() {
  elements.errorBanner.hidden = true;
}

function validatePublicData(data) {
  if (!data || data.schemaVersion !== 1 || !Array.isArray(data.accounts)) {
    throw new Error("公开摘要格式不正确");
  }
  const allowedTopLevel = new Set([
    "schemaVersion",
    "generatedAt",
    "hours",
    "window",
    "disclaimer",
    "sourceNote",
    "stats",
    "executiveSummary",
    "accounts",
    "watchItems",
  ]);
  const allowedAccountFields = new Set(["handle", "profileUrl", "lastActiveAt", "stance", "summaries"]);
  const hasUnexpectedFields = Object.keys(data).some((key) => !allowedTopLevel.has(key))
    || data.accounts.some((account) => Object.keys(account).some((key) => !allowedAccountFields.has(key)));
  if (hasUnexpectedFields) {
    throw new Error("公开摘要未通过安全检查");
  }
  return data;
}

function renderExecutiveSummary() {
  elements.executiveSummary.replaceChildren();
  state.data.executiveSummary.forEach((item, index) => {
    const row = create("li", "summary-item");
    const number = create("span", "summary-number", String(index + 1).padStart(2, "0"));
    const copy = create("div", "summary-copy");
    const meta = create("div", "summary-meta");
    meta.append(
      create("span", "topic-chip", item.topic),
      create("span", `confidence confidence-${item.confidence}`, confidenceLabels[item.confidence] || "待验证"),
    );
    copy.append(meta, create("p", "", item.summary));
    row.append(number, copy);
    elements.executiveSummary.append(row);
  });
}

function renderPulse() {
  const counts = new Map();
  state.data.accounts.forEach((account) => {
    account.summaries.forEach((summary) => {
      summary.topics.forEach((topic) => counts.set(topic, (counts.get(topic) || 0) + 1));
    });
  });
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxValue = Math.max(1, ...entries.map((entry) => entry[1]));
  elements.pulseStack.replaceChildren();
  entries.forEach(([topic, count]) => {
    const row = create("div", "pulse-row");
    const label = create("div", "pulse-label");
    label.append(
      create("span", "", topicLabels[topic] || topic),
      create("strong", "", String(count)),
    );
    const track = create("div", "pulse-track");
    const bar = create("i", "pulse-bar");
    bar.style.width = `${Math.max(9, (count / maxValue) * 100)}%`;
    track.append(bar);
    row.append(label, track);
    elements.pulseStack.append(row);
  });
}

function renderTabs() {
  elements.accountTabs.replaceChildren();
  const options = [{ handle: "all", label: "全部" }, ...state.data.accounts.map((account) => ({
    handle: account.handle,
    label: `@${account.handle}`,
  }))];
  options.forEach((option) => {
    const button = create("button", option.handle === state.activeHandle ? "active" : "", option.label);
    button.type = "button";
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(option.handle === state.activeHandle));
    button.addEventListener("click", () => {
      state.activeHandle = option.handle;
      renderTabs();
      renderAccounts();
    });
    elements.accountTabs.append(button);
  });
}

function summaryMatches(summary, query) {
  return [summary.summary, summary.stance, ...summary.topics]
    .join(" ")
    .toLocaleLowerCase()
    .includes(query);
}

function makeSummaryRow(summary) {
  const row = create("li", "viewpoint-row");
  const meta = create("div", "viewpoint-meta");
  meta.append(
    create("span", `stance stance-${summary.stance}`, stanceLabels[summary.stance] || "方向不明"),
    create("span", `confidence confidence-${summary.confidence}`, confidenceLabels[summary.confidence] || "待验证"),
  );
  const topics = create("div", "topic-list");
  summary.topics.forEach((topic) => topics.append(create("span", "", topicLabels[topic] || topic)));
  row.append(meta, create("p", "", summary.summary), topics);
  return row;
}

function renderAccounts() {
  const query = state.query.trim().toLocaleLowerCase();
  const accounts = state.data.accounts.filter((account) => {
    const selected = state.activeHandle === "all" || state.activeHandle === account.handle;
    const matched = !query
      || account.handle.toLocaleLowerCase().includes(query)
      || account.summaries.some((summary) => summaryMatches(summary, query));
    return selected && matched;
  });

  elements.accountGrid.replaceChildren();
  accounts.forEach((account) => {
    const card = create("article", "account-card");
    const header = create("header", "account-header");
    const avatar = create("div", "avatar", account.handle.slice(0, 2).toUpperCase());
    const identity = create("div", "account-identity");
    identity.append(
      create("h2", "", `@${account.handle}`),
      create("p", "", `最后观察 ${formatTime(account.lastActiveAt)}`),
    );
    const profile = create("a", "profile-link", "X ↗");
    profile.href = account.profileUrl;
    profile.target = "_blank";
    profile.rel = "noopener noreferrer";
    profile.setAttribute("aria-label", `打开 ${account.handle} 的公开 X 主页`);
    header.append(avatar, identity, profile);

    const band = create("div", "account-band");
    band.append(
      create("span", `stance stance-${account.stance}`, stanceLabels[account.stance] || "方向不明"),
      create("span", "summary-count", `${account.summaries.length} 条公开提要`),
    );

    const label = create("p", "card-label", "观点提要");
    const list = create("ul", "viewpoint-list");
    account.summaries.forEach((summary) => list.append(makeSummaryRow(summary)));
    card.append(header, band, label, list);
    elements.accountGrid.append(card);
  });

  if (accounts.length === 0) {
    const empty = create("div", "empty-results");
    empty.append(
      create("strong", "", "没有匹配的公开摘要"),
      create("p", "", "请尝试更换关键词或选择“全部”。"),
    );
    elements.accountGrid.append(empty);
  }
}

function renderWatchItems() {
  elements.watchGrid.replaceChildren();
  state.data.watchItems.forEach((item, index) => {
    const card = create("article", "watch-item");
    const copy = create("div", "");
    copy.append(create("strong", "", item.topic), create("p", "", item.summary));
    card.append(create("span", "watch-number", String(index + 1)), copy);
    elements.watchGrid.append(card);
  });
}

function renderMetadata() {
  const { stats, window: observationWindow } = state.data;
  elements.windowHours.textContent = `${state.data.hours}H`;
  elements.windowLabel.textContent = `${formatTime(observationWindow.start)} — ${formatTime(observationWindow.end)}`;
  elements.asOf.textContent = `更新于 ${formatTime(state.data.generatedAt)}`;
  elements.disclaimer.textContent = state.data.disclaimer;
  elements.heroNote.textContent = `追踪 ${stats.monitoredAccounts} 位公开 KOL，只呈现经过脱敏和改写的高层摘要；原始内容、回复与采集数据不在本站发布。`;
  elements.statMonitored.textContent = String(stats.monitoredAccounts);
  elements.statActive.textContent = `${stats.activeAccounts}/${stats.monitoredAccounts}`;
  elements.statSummaries.textContent = String(stats.summaryItems);
}

function render() {
  renderMetadata();
  renderExecutiveSummary();
  renderPulse();
  renderTabs();
  renderAccounts();
  renderWatchItems();
}

async function loadData() {
  setLoading(true);
  hideError();
  try {
    const response = await fetch(`${DATA_URL.href}?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`公开摘要读取失败（${response.status}）`);
    state.data = validatePublicData(await response.json());
    render();
  } catch (error) {
    showError(error instanceof Error ? error.message : "公开摘要暂时不可用");
  } finally {
    setLoading(false);
  }
}

elements.searchInput.addEventListener("input", (event) => {
  state.query = event.target.value;
  if (state.data) renderAccounts();
});
elements.refreshButton.addEventListener("click", loadData);
elements.errorRetry.addEventListener("click", loadData);

void loadData();
