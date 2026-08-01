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
  status.textContent = 'Searching...';

  try {
    const res = await fetch(`/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();

    status.textContent = '';
    renderSummaryPanel(data.nvidia, data.perplexity);
  } catch (err) {
    status.textContent = 'Something went wrong — check the console.';
    console.error(err);
  }
}

function renderSummaryPanel(nvidia, perplexity) {
  summary.innerHTML = '';
  if (!nvidia && !perplexity) return;

  if (nvidia) summary.appendChild(renderAiBlock('NVIDIA (Nemotron 3 Ultra)', nvidia, null));
  if (perplexity) summary.appendChild(renderAiBlock('Perplexity', perplexity, perplexity.citations));
}

function renderAiBlock(source, result, citations) {
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

  if (citations && citations.length > 0) {
    const citeList = document.createElement('ul');
    citeList.className = 'ai-citations';
    for (const url of citations) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = url;
      li.appendChild(a);
      citeList.appendChild(li);
    }
    block.appendChild(citeList);
  }

  return block;
}
