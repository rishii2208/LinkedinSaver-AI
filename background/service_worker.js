const STORAGE_KEYS = {
  posts: "savedPosts",
  profiles: "savedProfiles",
  threshold: "lowEngagementThreshold"
};

const saveItem = async (key, payload) => {
  const current = await chrome.storage.local.get([key]);
  const existing = Array.isArray(current[key]) ? current[key] : [];
  const itemWithId = { id: crypto.randomUUID(), ...payload };
  await chrome.storage.local.set({ [key]: [itemWithId, ...existing] });
  return itemWithId;
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (!message || !message.kind) return;

    switch (message.kind) {
      case "SAVE_POST": {
        const saved = await saveItem(STORAGE_KEYS.posts, message.payload);
        sendResponse({ ok: true, saved });
        break;
      }
      case "SAVE_PROFILE": {
        const saved = await saveItem(STORAGE_KEYS.profiles, message.payload);
        sendResponse({ ok: true, saved });
        break;
      }
      case "GET_ITEMS": {
        const all = await chrome.storage.local.get([STORAGE_KEYS.posts, STORAGE_KEYS.profiles]);
        sendResponse({ ok: true, ...all });
        break;
      }
      case "SET_THRESHOLD": {
        const value = Number(message.value);
        if (!Number.isFinite(value)) {
          sendResponse({ ok: false });
          break;
        }
        await chrome.storage.local.set({ [STORAGE_KEYS.threshold]: value });
        sendResponse({ ok: true });
        break;
      }
      default:
        sendResponse({ ok: false, reason: "unknown-kind" });
    }
  })();
  return true;
});
