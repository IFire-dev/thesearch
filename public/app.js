const form = document.getElementById('search-form');
const input = document.getElementById('search-input');
const status = document.getElementById('status');
const summary = document.getElementById('ai-summary');

form.addEventListener('submit', (e) => {
  e.preventDefault();
  performSearch(input.value.trim());
});

// Lets you jump straight to a search via URL, e.g.
// http://localhost/?search=your+query
// Runs once when the page first loads.
window.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const query = params.get('search');
  if (query) {
    input.value = query;
    performSearch(query);
  }
});

async function performSearch(query) {
  if (!query) return;

  summary.innerHTML = '';
  // The primary panel retries up to 10 times if NVIDIA's big model is
  // busy, so this can take a while longer than a normal search.
  status.textContent = 'Searching... (can take up to ~15s if the big model is busy)';

  try {
    const res = await fetch(`/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();

    status.textContent = '';
    renderSummaryPanel(data.primary, data.secondary);
  } catch (err) {
    status.textContent = 'Something went wrong — check the console.';
    console.error(err);
  }
}

function renderSummaryPanel(primary, secondary) {
  summary.innerHTML = '';
  if (!primary && !secondary) return;

  if (primary) summary.appendChild(renderAiBlock(primary.model || 'NVIDIA', primary));
  if (secondary) summary.appendChild(renderAiBlock(secondary.model || 'NVIDIA', secondary));
}

function renderAiBlock(source, result) {
  const block = document.createElement('div');
  block.className = 'ai-block';
  if (result.error) block.classList.add('ai-error');

  const label = document.createElement('div');
  label.className = 'ai-source';
  label.textContent = source;
  block.appendChild(label);

  const text = document.createElement('p');
  text.textContent = result.error ? `Not available: ${result.error}` : result.answer;
  block.appendChild(text);

  return block;
}
