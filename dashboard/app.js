(() => {
  const itemsEl = document.getElementById("items");
  const viewToggle = document.getElementById("viewToggle");
  const timeFilterEl = document.getElementById("timeFilter");
  const jobsOnlyEl = document.getElementById("jobsOnly");
  const lowEngagementEl = document.getElementById("lowEngagement");
  const hiringManagersEl = document.getElementById("hiringManagers");
  const thresholdInput = document.getElementById("thresholdInput");
  const summaryCounts = document.getElementById("summaryCounts");

  const state = {
    view: "all",
    timeFilter: "all",
    jobsOnly: false,
    lowEngagement: false,
    hiringManagers: false,
    threshold: 25,
    posts: [],
    profiles: []
  };

  const timeWindows = {
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000
  };

  const loadData = () => {
    chrome.storage.local.get(["savedPosts", "savedProfiles", "lowEngagementThreshold"], (res) => {
      state.posts = Array.isArray(res.savedPosts) ? res.savedPosts : [];
      state.profiles = Array.isArray(res.savedProfiles) ? res.savedProfiles : [];
      state.threshold = typeof res.lowEngagementThreshold === "number" ? res.lowEngagementThreshold : state.threshold;
      thresholdInput.value = state.threshold;
      render();
    });
  };

  const formatDate = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleString();
  };

  const withinWindow = (iso, windowKey) => {
    if (windowKey === "all") return true;
    const ms = timeWindows[windowKey];
    const saved = new Date(iso).getTime();
    return Date.now() - saved <= ms;
  };

  const renderCounts = (posts, profiles) => {
    const lowEngaged = posts.filter((p) => p.is_low_engagement).length;
    summaryCounts.innerHTML = `
      <div><strong>${posts.length}</strong> posts</div>
      <div><strong>${profiles.length}</strong> profiles</div>
      <div><strong>${lowEngaged}</strong> low-engagement</div>
    `;
  };

  const filterItems = () => {
    const posts = state.posts.filter((p) => {
      if (!withinWindow(p.saved_at, state.timeFilter)) return false;
      if (state.jobsOnly && p.type !== "job") return false;
      if (state.lowEngagement && !p.is_low_engagement) return false;
      return true;
    });

    const profiles = state.profiles.filter((p) => {
      if (!withinWindow(p.saved_at, state.timeFilter)) return false;
      if (state.hiringManagers && !p.is_hiring_manager) return false;
      return true;
    });

    renderCounts(posts, profiles);

    if (state.view === "posts") return posts;
    if (state.view === "profiles") return profiles;
    return [...posts, ...profiles].sort((a, b) => new Date(b.saved_at) - new Date(a.saved_at));
  };

  const renderEmpty = () => {
    itemsEl.innerHTML = '<div class="empty">No saved items yet. Hover any LinkedIn post or profile to save.</div>';
  };

  const renderItem = (item) => {
    const isPost = Boolean(item.post_url);
    const card = document.createElement("article");
    card.className = "card";

    const title = isPost ? (item.author_name || "LinkedIn Post") : (item.name || "Profile");
    const url = isPost ? item.post_url : item.profile_url;

    const badge = document.createElement("span");
    badge.className = "badge" + (isPost ? " accent" : "");
    badge.textContent = isPost ? (item.type || "post") : "profile";

    const header = document.createElement("div");
    header.className = "card-header";
    const h3 = document.createElement("h3");
    h3.textContent = title;

    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Open";

    header.appendChild(h3);
    header.appendChild(badge);

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.innerHTML = `
      <span>Saved ${formatDate(item.saved_at)}</span>
      ${isPost ? `<span>${item.engagement_count || 0} engagements</span>` : ""}
      ${isPost && item.is_low_engagement ? "<span>Low engagement</span>" : ""}
      ${!isPost && item.is_hiring_manager ? "<span>Hiring manager</span>" : ""}
    `;

    const body = document.createElement("p");
    body.className = "muted";
    body.textContent = isPost
      ? [item.author_role, item.author_company].filter(Boolean).join(" | ")
      : item.current_role || "";

    const linkRow = document.createElement("div");
    linkRow.className = "meta";
    linkRow.appendChild(link);

    card.appendChild(header);
    card.appendChild(body);
    card.appendChild(meta);
    card.appendChild(linkRow);

    return card;
  };

  const render = () => {
    const filtered = filterItems();
    if (!filtered.length) {
      renderEmpty();
      return;
    }
    itemsEl.innerHTML = "";
    filtered.forEach((item) => itemsEl.appendChild(renderItem(item)));
  };

  viewToggle.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-view]");
    if (!btn) return;
    viewToggle.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.view = btn.dataset.view;
    render();
  });

  timeFilterEl.addEventListener("change", () => {
    state.timeFilter = timeFilterEl.value;
    render();
  });

  jobsOnlyEl.addEventListener("change", () => {
    state.jobsOnly = jobsOnlyEl.checked;
    render();
  });

  lowEngagementEl.addEventListener("change", () => {
    state.lowEngagement = lowEngagementEl.checked;
    render();
  });

  hiringManagersEl.addEventListener("change", () => {
    state.hiringManagers = hiringManagersEl.checked;
    render();
  });

  thresholdInput.addEventListener("change", () => {
    const value = Number(thresholdInput.value);
    if (!Number.isFinite(value)) return;
    state.threshold = value;
    chrome.runtime.sendMessage({ kind: "SET_THRESHOLD", value });
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") loadData();
  });

  loadData();
})();
