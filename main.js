const SUBGRAPH_URL =
  "https://api.goldsky.com/api/public/project_cmf4aw4t78kut01ya4vbh4iz6/subgraphs/redstone-testnet-fast-eden-testnet/1.0.0/gn";
const VALUE_UPDATES_QUERY = `query PriceUpdates($first: Int!, $skip: Int!) {
  valueUpdates(first: $first, skip: $skip, orderBy: updatedAt, orderDirection: desc) {
    value
    dataFeedId
    updatedAt
  }
}`;

const state = {
  tia: {
    updates: [],
    currentIndex: 0,
  },
  eth: {
    updates: [],
    currentIndex: 0,
  },
  pagination: {
    skip: 0,
    limit: 50,
    hasMore: true,
    totalLoaded: 0,
  },
};

function clearFeedState() {
  state.tia.updates = [];
  state.eth.updates = [];
  state.tia.currentIndex = 0;
  state.eth.currentIndex = 0;
  state.pagination.skip = state.pagination.limit;
  state.pagination.totalLoaded = 0;
  state.pagination.hasMore = false;
}

function formatGraphQLErrors(errors = []) {
  return errors
    .map((error) => error.message)
    .filter(Boolean)
    .join("; ");
}

function isMissingValueUpdatesError(errors = []) {
  return errors.some((error) =>
    (error.message || "").includes("Type `Query` has no field `valueUpdates`"),
  );
}

async function fetchQueryRootFields() {
  try {
    const response = await fetch(SUBGRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "{ __schema { queryType { fields { name } } } }",
      }),
    });
    const payload = await response.json();
    return payload?.data?.__schema?.queryType?.fields?.map((field) => field.name) || [];
  } catch (error) {
    return [];
  }
}

async function handleSchemaMismatch() {
  clearFeedState();
  updateCard("tia");
  updateCard("eth");
  updateLoadMoreButton();

  const fields = await fetchQueryRootFields();
  const availableFields = fields.length ? fields.join(", ") : "unknown";

  updateStatus("Wrong subgraph type: missing valueUpdates");
  document.getElementById("last-refresh").textContent =
    `Expected adapter ValueUpdate schema. Query fields: ${availableFields}`;
  console.error(
    "Subgraph schema mismatch. Expected Query.valueUpdates but got:",
    availableFields,
  );
}

async function fetchPriceUpdates(append = false) {
  try {
    const skip = append ? state.pagination.skip : 0;
    const response = await fetch(SUBGRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: VALUE_UPDATES_QUERY,
        variables: {
          first: state.pagination.limit,
          skip,
        },
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}: ${response.statusText || "subgraph request failed"}`,
      );
    }

    if (payload.errors?.length) {
      const error = new Error(formatGraphQLErrors(payload.errors));
      error.graphQLErrors = payload.errors;
      throw error;
    }

    if (!Array.isArray(payload?.data?.valueUpdates)) {
      throw new Error("Subgraph response missing data.valueUpdates");
    }

    const valueUpdates = payload.data.valueUpdates;

    // Check if we have more data
    const hasMore = valueUpdates.length === state.pagination.limit;
    state.pagination.hasMore = hasMore;

    // Separate updates by feed type
    const tiaUpdates = [];
    const ethUpdates = [];

    valueUpdates.forEach((update) => {
      const isETH = update.dataFeedId.startsWith("0x455448");
      const isTIA = update.dataFeedId.startsWith("0x544941");

      if (isETH) {
        ethUpdates.push(update);
      } else if (isTIA) {
        tiaUpdates.push(update);
      }
    });

    // Update state
    if (append) {
      // Append new data to existing
      state.tia.updates = [...state.tia.updates, ...tiaUpdates];
      state.eth.updates = [...state.eth.updates, ...ethUpdates];
      state.pagination.skip += state.pagination.limit;
      state.pagination.totalLoaded += valueUpdates.length;
    } else {
      // Replace with fresh data
      state.tia.updates = tiaUpdates;
      state.eth.updates = ethUpdates;
      state.tia.currentIndex = 0;
      state.eth.currentIndex = 0;
      state.pagination.skip = state.pagination.limit;
      state.pagination.totalLoaded = valueUpdates.length;
    }

    // Update UI
    updateCard("tia");
    updateCard("eth");
    updateLoadMoreButton();
    updateStatus(append ? "More history loaded" : "Prices loaded successfully");
    if (!append) {
      updateLastRefresh();
    }
  } catch (error) {
    console.error("Failed to fetch prices:", error);
    if (isMissingValueUpdatesError(error.graphQLErrors || [])) {
      await handleSchemaMismatch();
      return;
    }
    updateStatus("Error loading prices");
  }
}

function updateCard(feedType) {
  const feed = state[feedType];
  const card = document.getElementById(`${feedType}-card`);

  if (!feed.updates.length) {
    card.querySelector(".value").textContent = "No data";
    card.querySelector(".timestamp").textContent = "--";
    card.querySelector(".current-index").textContent = "0";
    card.querySelector(".total-updates").textContent = "0";
    card.querySelector(".nav-btn.prev").disabled = true;
    card.querySelector(".nav-btn.next").disabled = true;
    return;
  }

  const currentUpdate = feed.updates[feed.currentIndex];

  // Convert value (8 decimal places)
  const price = (Number(currentUpdate.value) / 1e8).toFixed(4);

  // Format timestamp
  const date = new Date(currentUpdate.updatedAt * 1000);
  const timeAgo = getTimeAgo(date);
  const fullDate = date.toLocaleString();

  // Update card content
  card.querySelector(".value").textContent = `$${price}`;
  card.querySelector(".timestamp").textContent = `${timeAgo} (${fullDate})`;

  // Update counter
  card.querySelector(".current-index").textContent = feed.currentIndex + 1;
  card.querySelector(".total-updates").textContent = feed.updates.length;

  // Update navigation buttons
  card.querySelector(".nav-btn.prev").disabled = feed.currentIndex === 0;
  card.querySelector(".nav-btn.next").disabled =
    feed.currentIndex === feed.updates.length - 1;
}

function navigateFeed(feedType, direction) {
  const feed = state[feedType];

  if (direction === "prev" && feed.currentIndex > 0) {
    feed.currentIndex--;
  } else if (
    direction === "next" &&
    feed.currentIndex < feed.updates.length - 1
  ) {
    feed.currentIndex++;
  }

  updateCard(feedType);
}

function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);

  if (seconds < 60) return `${seconds} seconds ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;

  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

function updateStatus(message) {
  document.getElementById("status").textContent = message;
}

function updateLastRefresh() {
  const now = new Date().toLocaleTimeString();
  document.getElementById("last-refresh").textContent = `Last refresh: ${now}`;
}

function updateLoadMoreButton() {
  const btn = document.getElementById("load-more");
  const info = document.querySelector(".load-more-info");

  btn.disabled = !state.pagination.hasMore;

  if (!state.pagination.hasMore) {
    btn.textContent = "No More History";
  } else {
    btn.textContent = "Load More History";
  }

  info.textContent = `Showing ${state.pagination.totalLoaded} updates`;
}

async function loadMoreHistory() {
  const btn = document.getElementById("load-more");

  // Add loading state
  btn.classList.add("loading");
  btn.disabled = true;

  try {
    await fetchPriceUpdates(true);
  } catch (error) {
    console.error("Failed to load more history:", error);
    updateStatus("Error loading more history");
  } finally {
    btn.classList.remove("loading");
    updateLoadMoreButton();
  }
}

// Event listeners
document.addEventListener("DOMContentLoaded", () => {
  // Navigation buttons
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const feedType = e.target.dataset.feed;
      const direction = e.target.classList.contains("prev") ? "prev" : "next";
      navigateFeed(feedType, direction);
    });
  });

  // Load more button
  document
    .getElementById("load-more")
    .addEventListener("click", loadMoreHistory);

  // Initial load
  fetchPriceUpdates();

  // Refresh every 30 seconds (only refresh, don't append)
  setInterval(() => fetchPriceUpdates(false), 30000);
});
