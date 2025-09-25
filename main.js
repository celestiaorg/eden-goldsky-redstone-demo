const SUBGRAPH_URL = 'https://api.goldsky.com/api/public/project_cmf4aw4t78kut01ya4vbh4iz6/subgraphs/eden-redstone-adapter-eden-testnet/1.0/gn';

const state = {
  tia: {
    updates: [],
    currentIndex: 0
  },
  eth: {
    updates: [],
    currentIndex: 0
  }
};

async function fetchPriceUpdates() {
  try {
    const response = await fetch(SUBGRAPH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `{
          valueUpdates(first: 50, orderBy: updatedAt, orderDirection: desc) {
            value
            dataFeedId
            updatedAt
          }
        }`
      })
    });

    const { data } = await response.json();

    // Separate updates by feed type
    const tiaUpdates = [];
    const ethUpdates = [];

    data.valueUpdates.forEach(update => {
      const isETH = update.dataFeedId.startsWith('0x455448');
      const isTIA = update.dataFeedId.startsWith('0x544941');

      if (isETH) {
        ethUpdates.push(update);
      } else if (isTIA) {
        tiaUpdates.push(update);
      }
    });

    // Update state
    state.tia.updates = tiaUpdates;
    state.eth.updates = ethUpdates;
    state.tia.currentIndex = 0;
    state.eth.currentIndex = 0;

    // Update UI
    updateCard('tia');
    updateCard('eth');
    updateStatus('Prices loaded successfully');
    updateLastRefresh();

  } catch (error) {
    console.error('Failed to fetch prices:', error);
    updateStatus('Error loading prices');
  }
}

function updateCard(feedType) {
  const feed = state[feedType];
  const card = document.getElementById(`${feedType}-card`);

  if (!feed.updates.length) {
    card.querySelector('.value').textContent = 'No data';
    card.querySelector('.timestamp').textContent = '--';
    card.querySelector('.current-index').textContent = '0';
    card.querySelector('.total-updates').textContent = '0';
    card.querySelector('.nav-btn.prev').disabled = true;
    card.querySelector('.nav-btn.next').disabled = true;
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
  card.querySelector('.value').textContent = `$${price}`;
  card.querySelector('.timestamp').textContent = `${timeAgo} (${fullDate})`;

  // Update counter
  card.querySelector('.current-index').textContent = feed.currentIndex + 1;
  card.querySelector('.total-updates').textContent = feed.updates.length;

  // Update navigation buttons
  card.querySelector('.nav-btn.prev').disabled = feed.currentIndex === 0;
  card.querySelector('.nav-btn.next').disabled = feed.currentIndex === feed.updates.length - 1;
}

function navigateFeed(feedType, direction) {
  const feed = state[feedType];

  if (direction === 'prev' && feed.currentIndex > 0) {
    feed.currentIndex--;
  } else if (direction === 'next' && feed.currentIndex < feed.updates.length - 1) {
    feed.currentIndex++;
  }

  updateCard(feedType);
}

function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);

  if (seconds < 60) return `${seconds} seconds ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;

  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}

function updateStatus(message) {
  document.getElementById('status').textContent = message;
}

function updateLastRefresh() {
  const now = new Date().toLocaleTimeString();
  document.getElementById('last-refresh').textContent = `Last refresh: ${now}`;
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
  // Navigation buttons
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const feedType = e.target.dataset.feed;
      const direction = e.target.classList.contains('prev') ? 'prev' : 'next';
      navigateFeed(feedType, direction);
    });
  });

  // Initial load
  fetchPriceUpdates();

  // Refresh every 30 seconds
  setInterval(fetchPriceUpdates, 30000);
});