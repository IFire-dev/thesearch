const form = document.getElementById('search-form');
const input = document.getElementById('search-input');
const status = document.getElementById('status');
const summary = document.getElementById('ai-summary');
const resultsList = document.getElementById('results');

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

  resultsList.innerHTML = '';
  summary.innerHTML = '';
  status.textContent = 'Searching...';

  try {
    const res = await fetch(`/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();

    renderSummaryPanel(data.claude, data.perplexity);

    const webResults = data.web || [];
    if (webResults.length === 0) {
      status.textContent = 'No web results.';
      return;
    }

    status.textContent = '';
    for (const result of webResults) {
      resultsList.appendChild(renderResult(result));
    }
  } catch (err) {
    status.textContent = 'Something went wrong — check the console.';
    console.error(err);
  }
}

function renderSummaryPanel(claude, perplexity) {
  summary.innerHTML = '';
  if (!claude && !perplexity) return;

  if (claude) summary.appendChild(renderAiBlock('Claude', claude, null));
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

function renderResult({ title, url, snippet }) {
  const li = document.createElement('li');
  li.className = 'result';

  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = title;

  const urlLine = document.createElement('div');
  urlLine.className = 'result-url';
  urlLine.textContent = url;

  const snippetLine = document.createElement('p');
  snippetLine.className = 'result-snippet';
  snippetLine.textContent = snippet;

  li.appendChild(link);
  li.appendChild(urlLine);
  li.appendChild(snippetLine);
  return li;
}
