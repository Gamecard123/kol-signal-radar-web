const DATA_URL = new URL("./data/public-summary.json", document.baseURI);

const state = {
  data: null,
  activeHandle: "all",
  query: "",
};

const elements = {
  accountGrid: document.querySelector("#account-grid"),
  accountTabs: document.querySelector("#account-tabs"),
  activityList: document.querySelector("#activity-list"),
  asOf: document.querySelector("#as-of"),
  errorBanner: document.querySelector("#error-banner"),
  errorMessage: document.querySelector("#error-message"),
  errorRetry: document.querySelector("#error-retry"),
  executiveSummary: document.querySelector("#executive-summary"),
  heroNote: document.querySelector("#hero-note"),
  refreshButton: document.querySelector("#refresh-button"),
  searchInput: document.querySelector("#search-input"),
  statActive: document.querySelector("#stat-active"),
  statMonitored: document.querySelector("#stat-monitored"),
  statSummaries: document.querySelector("#stat-summaries"),
  watchGrid: document.querySelector("#watch-grid"),
  windowHours: document.querySelector("#window-hours"),
  windowLabel: document.querySelector("#window-label"),
};

const stanceLabels = {
  bullish: "偏多",
  bearish: "偏空",
  mixed: "多空交织",
  neutral: "中性",
  unclear: "方向不明",
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

const timeZoneFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  timeZoneName: "short",
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
  const zone = timeZoneFormatter
    .formatToParts(date)
    .find((part) => part.type === "timeZoneName")?.value || "ET";
  return `${dateFormatter.format(date)} ${zone}`;
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
    throw new Error("观点摘要格式不正确");
  }
  const allowedTopLevel = new Set([
    "schemaVersion",
    "generatedAt",
    "hours",
    "window",
    "stats",
    "executiveSummary",
    "accounts",
    "watchItems",
  ]);
  const allowedAccountFields = new Set(["handle", "profileUrl", "lastActiveAt", "activityCount", "stance", "headline", "summaries"]);
  const hasUnexpectedFields = Object.keys(data).some((key) => !allowedTopLevel.has(key))
    || data.accounts.some((account) => Object.keys(account).some((key) => !allowedAccountFields.has(key)));
  if (hasUnexpectedFields) {
    throw new Error("观点摘要暂不可用");
  }
  return data;
}

function renderExecutiveSummary() {
  elements.executiveSummary.replaceChildren();
  state.data.executiveSummary.forEach((item, index) => {
    const row = create("li", "summary-item");
    const number = create("span", "summary-number", String(index + 1).padStart(2, "0"));
    const copy = create("div", "summary-copy");
    copy.append(create("p", "", item.summary));
    row.append(number, copy);
    elements.executiveSummary.append(row);
  });
}

function renderActivity() {
  const maxActivity = Math.max(1, ...state.data.accounts.map((account) => account.activityCount));
  elements.activityList.replaceChildren();
  state.data.accounts.forEach((account) => {
    const button = create("button", "");
    button.type = "button";
    button.setAttribute("aria-label", `只看 ${account.handle}`);
    const label = create("span", "", `@${account.handle}`);
    const track = create("i", "");
    const bar = create("b", "");
    bar.style.width = `${Math.max(4, (account.activityCount / maxActivity) * 100)}%`;
    track.append(bar);
    button.append(label, track, create("strong", "", String(account.activityCount)));
    button.addEventListener("click", () => {
      state.activeHandle = account.handle;
      renderTabs();
      renderAccounts();
    });
    elements.activityList.append(button);
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

function renderAccounts() {
  const query = state.query.trim().toLocaleLowerCase();
  const accounts = [...state.data.accounts]
    .sort((left, right) => {
      const leftTime = left.lastActiveAt ? new Date(left.lastActiveAt).getTime() : 0;
      const rightTime = right.lastActiveAt ? new Date(right.lastActiveAt).getTime() : 0;
      return rightTime - leftTime;
    })
    .filter((account) => {
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

    const metrics = create("div", "account-metrics");
    const activity = create("span", "");
    activity.append(
      create("strong", "", String(account.activityCount)),
      document.createTextNode(" 本人内容"),
    );
    const count = create("span", "");
    count.append(
      create("strong", "", String(account.summaries.length)),
      document.createTextNode(" 条观点提要"),
    );
    metrics.append(activity, count);

    const block = create("div", "viewpoint-block");
    block.append(create("p", "card-label", "观点提要"));
    block.append(create("p", "headline-copy", account.headline));

    const updates = create("div", "updates-block");
    updates.append(create("p", "card-label", "最新观点摘要"));
    [...account.summaries]
      .sort((left, right) => {
        const leftTime = left.postedAt ? new Date(left.postedAt).getTime() : 0;
        const rightTime = right.postedAt ? new Date(right.postedAt).getTime() : 0;
        return rightTime - leftTime;
      })
      .forEach((summary) => {
        const row = create("div", "summary-row");
        const meta = create("div", "summary-row-meta");
        const time = create("time", "", summary.postedAt ? formatTime(summary.postedAt) : "本轮观察");
        if (summary.postedAt) time.dateTime = summary.postedAt;
        meta.append(
          create("span", `stance-${summary.stance}`, stanceLabels[summary.stance] || "方向不明"),
          time,
        );
        if (summary.url) {
          const source = create("a", "summary-source", "原帖 ↗");
          source.href = summary.url;
          source.target = "_blank";
          source.rel = "noopener noreferrer";
          meta.append(source);
        }
        row.append(meta, create("p", "", summary.summary));
        updates.append(row);
      });
    card.append(header, metrics, block, updates);
    elements.accountGrid.append(card);
  });

  if (accounts.length === 0) {
    const empty = create("div", "empty-results");
    empty.append(
      create("strong", "", "没有匹配的观点摘要"),
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
  elements.heroNote.textContent = `聚合 ${stats.monitoredAccounts} 位 KOL 的市场观点、方向变化与风险线索。打开页面先看观点结论，量化指标只作为辅助参考。`;
  elements.statMonitored.textContent = String(stats.monitoredAccounts);
  elements.statActive.textContent = `${stats.activeAccounts}/${stats.monitoredAccounts}`;
  elements.statSummaries.textContent = String(stats.summaryItems);
}

function render() {
  renderMetadata();
  renderExecutiveSummary();
  renderActivity();
  renderTabs();
  renderAccounts();
  renderWatchItems();
}

async function loadData() {
  setLoading(true);
  hideError();
  try {
    const response = await fetch(`${DATA_URL.href}?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`观点摘要读取失败（${response.status}）`);
    state.data = validatePublicData(await response.json());
    render();
  } catch (error) {
    showError(error instanceof Error ? error.message : "观点摘要暂时不可用");
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
