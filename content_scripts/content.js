(() => {
  const SAVE_BUTTON_CLASS = "ls-save-btn";
  const SAVE_ATTR = "data-ls-injected";
  const LOW_ENGAGEMENT_KEY = "lowEngagementThreshold";
  const DEFAULT_LOW_ENGAGEMENT = 25;

  let lowEngagementThreshold = DEFAULT_LOW_ENGAGEMENT;
  let currentPath = location.pathname;

  chrome.storage.local.get([LOW_ENGAGEMENT_KEY], (res) => {
    if (res && typeof res[LOW_ENGAGEMENT_KEY] === "number") {
      lowEngagementThreshold = res[LOW_ENGAGEMENT_KEY];
    }
  });

  const classifyPostType = (text) => {
    const normalized = (text || "").toLowerCase();
    const hasJob = /hiring|open role|job|opening|we are hiring/.test(normalized);
    const hasHiring = /hiring manager|recruiting|recruiter|talent acquisition/.test(normalized);
    const hasOpportunity = /opportunity|partner|collaboration/.test(normalized);
    const isThought = normalized.split(/\s+/).length > 80;

    if (hasJob) return "job";
    if (hasHiring) return "hiring";
    if (hasOpportunity) return "opportunity";
    if (isThought) return "thought-leader";
    return "unknown";
  };

  const extractEngagement = (root) => {
    let likes = 0;
    let comments = 0;

    const ariaNodes = root.querySelectorAll("[aria-label]");
    ariaNodes.forEach((node) => {
      const label = node.getAttribute("aria-label") || "";
      const lower = label.toLowerCase();
      const numberMatch = label.replace(/[^0-9]/g, "");
      const value = Number(numberMatch || 0);
      if (lower.includes("like")) likes = Math.max(likes, value);
      if (lower.includes("comment")) comments = Math.max(comments, value);
    });

    const textNodes = root.querySelectorAll("span, div");
    textNodes.forEach((node) => {
      const text = node.textContent || "";
      if (!/like|comment/i.test(text)) return;
      const value = Number(text.replace(/[^0-9]/g, ""));
      if (text.toLowerCase().includes("like")) likes = Math.max(likes, value);
      if (text.toLowerCase().includes("comment")) comments = Math.max(comments, value);
    });

    return { likes, comments, engagement_count: likes + comments };
  };

  const extractAuthorInfo = (article) => {
    const nameNode = article.querySelector("span.feed-shared-actor__name, span.update-components-actor__name, a.app-aware-link span[dir='ltr']") || article.querySelector(".feed-shared-update-v2__commentary span[dir='ltr']");
    const roleNode = article.querySelector("span.feed-shared-actor__description, span.update-components-actor__sub-description") || article.querySelector(".feed-shared-actor__sub-description");

    const author_name = nameNode ? nameNode.textContent.trim() : "";
    const roleText = roleNode ? roleNode.textContent.trim() : "";

    let author_role = "";
    let author_company = "";
    if (roleText.includes(" at ")) {
      const [role, company] = roleText.split(" at ");
      author_role = role.trim();
      author_company = company ? company.trim() : "";
    } else {
      author_role = roleText;
    }

    return { author_name, author_role, author_company };
  };

  const extractPostUrl = (article) => {
    const shareLink = article.querySelector("a.app-aware-link[href*='/posts/']");
    if (shareLink) return shareLink.href.split("?")[0];
    const anchor = article.querySelector("a[href*='linkedin.com/feed/update']");
    if (anchor) return anchor.href.split("?")[0];
    return location.href;
  };

  const extractPostTimestamp = (article) => {
    const timeNode = article.querySelector("time");
    if (timeNode) {
      const datetime = timeNode.getAttribute("datetime");
      if (datetime) return new Date(datetime).toISOString();
    }
    return new Date().toISOString();
  };

  const extractProfileInfo = (root) => {
    const nameNode = root.querySelector("h1") || root.querySelector(".text-heading-xlarge");
    const headlineNode = root.querySelector(".text-body-medium.break-words") || root.querySelector(".pv-text-details__left-panel div.text-body-medium");
    const companyNode = root.querySelector(".pv-text-details__right-panel") || root.querySelector(".pv-entity__secondary-title");

    const name = nameNode ? nameNode.textContent.trim() : "";
    const current_role = headlineNode ? headlineNode.textContent.trim() : "";
    const company = companyNode ? companyNode.textContent.trim() : "";

    const combined = `${current_role} ${company}`.toLowerCase();
    const is_hiring_manager = /(hiring manager|recruiter|talent acquisition|recruiting|people ops)/.test(combined);

    return {
      name,
      current_role,
      company,
      profile_url: location.href.split("?")[0],
      is_hiring_manager
    };
  };

  const markSaved = (button) => {
    button.textContent = "Saved";
    button.disabled = true;
    button.classList.add("ls-saved");
    setTimeout(() => {
      button.disabled = false;
      button.textContent = "Save";
      button.classList.remove("ls-saved");
    }, 1800);
  };

  const handlePostSave = (article, button) => {
    const text = article.innerText || "";
    const { likes, comments, engagement_count } = extractEngagement(article);
    const meta = {
      type: classifyPostType(text),
      ...extractAuthorInfo(article),
      post_url: extractPostUrl(article),
      engagement_count,
      is_low_engagement: engagement_count <= lowEngagementThreshold,
      likes,
      comments,
      timestamp: extractPostTimestamp(article),
      saved_at: new Date().toISOString()
    };

    chrome.runtime.sendMessage({ kind: "SAVE_POST", payload: meta }, () => {
      markSaved(button);
    });
  };

  const handleProfileSave = (root, button) => {
    const meta = {
      ...extractProfileInfo(root),
      saved_at: new Date().toISOString()
    };
    chrome.runtime.sendMessage({ kind: "SAVE_PROFILE", payload: meta }, () => {
      markSaved(button);
    });
  };

  const createSaveButton = () => {
    const btn = document.createElement("button");
    btn.className = SAVE_BUTTON_CLASS;
    btn.type = "button";
    btn.textContent = "Save";
    return btn;
  };

  const injectPostButton = (article) => {
    if (!article || article.getAttribute(SAVE_ATTR)) return;
    article.setAttribute(SAVE_ATTR, "true");
    article.style.position = article.style.position || "relative";

    const button = createSaveButton();
    button.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      handlePostSave(article, button);
    });

    article.appendChild(button);
  };

  const scanForPosts = () => {
    const posts = document.querySelectorAll("article");
    posts.forEach((article) => injectPostButton(article));
  };

  const observeFeed = () => {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          if (node.tagName === "ARTICLE") {
            injectPostButton(node);
          } else {
            node.querySelectorAll && node.querySelectorAll("article").forEach((art) => injectPostButton(art));
          }
        });
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  };

  const injectProfileButton = () => {
    const profileRoot = document.querySelector("main");
    if (!profileRoot || profileRoot.getAttribute(SAVE_ATTR)) return;
    const actionBar = profileRoot.querySelector(".pv-text-details__left-panel") || profileRoot.querySelector("header");
    if (!actionBar) return;

    const button = createSaveButton();
    button.classList.add("ls-profile-btn");
    button.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      handleProfileSave(profileRoot, button);
    });

    actionBar.appendChild(button);
    profileRoot.setAttribute(SAVE_ATTR, "true");
  };

  const onRouteChange = () => {
    const newPath = location.pathname;
    if (newPath === currentPath) return;
    currentPath = newPath;
    if (newPath.startsWith("/in/")) {
      injectProfileButton();
    }
  };

  const init = () => {
    scanForPosts();
    observeFeed();
    if (location.pathname.startsWith("/in/")) {
      injectProfileButton();
    }
    setInterval(onRouteChange, 800);
  };

  if (document.readyState === "complete" || document.readyState === "interactive") {
    init();
  } else {
    window.addEventListener("DOMContentLoaded", init, { once: true });
  }
})();
