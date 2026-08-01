const form = document.getElementById('search-form');
const input = document.getElementById('search-input');
const status = document.getElementById('status');
const summary = document.getElementById('ai-summary');

// Matches http(s) URLs in plain text for linkifying + preview lookup.
const URL_PATTERN = /https?:\/\/[^\s<>"')\]]+/g;

form.addEventListener('submit', (e) => {
  e.preventDefault();
  performSearch(input.value.trim());
});

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
  status.textContent = 'awaiting response';
  status.classList.add('pending');

  try {
    const res = await fetch(`/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();

    status.textContent = '';
    status.classList.remove('pending');
    renderResponseCard(data);
  } catch (err) {
    status.textContent = '';
    status.classList.remove('pending');
    renderResponseCard({ error: 'Request failed — check the browser console.' });
    console.error(err);
  }
}

function renderResponseCard(result) {
  summary.innerHTML = '';

  const card = document.createElement('div');
  card.className = 'response-card';

  if (result.error) {
    card.classList.add('is-error');
    const body = document.createElement('p');
    body.className = 'response-body';
    body.textContent = `not available — ${result.error}`;
    card.appendChild(body);
    summary.appendChild(card);
    return;
  }

  let dotColor = 'var(--success)';
  let note = 'first try';
  if (result.fellBack) {
    dotColor = 'var(--fallback)';
    note = `fell back after ${result.maxAttempts}/${result.maxAttempts} Ultra attempts`;
  } else if (result.attempts > 1) {
    dotColor = 'var(--warn)';
    note = `succeeded on attempt ${result.attempts}/${result.maxAttempts}`;
  }
  card.style.setProperty('--dot-color', dotColor);

  const telemetry = document.createElement('div');
  telemetry.className = 'telemetry';

  const dot = document.createElement('span');
  dot.className = 'telemetry-dot';
  telemetry.appendChild(dot);

  const model = document.createElement('span');
  model.className = 'telemetry-model';
  model.textContent = result.model || 'nvidia';
  telemetry.appendChild(model);

  const sep1 = document.createElement('span');
  sep1.className = 'telemetry-sep';
  sep1.textContent = '·';
  telemetry.appendChild(sep1);

  const noteSpan = document.createElement('span');
  noteSpan.textContent = note;
  telemetry.appendChild(noteSpan);

  if (typeof result.elapsedMs === 'number') {
    const sep2 = document.createElement('span');
    sep2.className = 'telemetry-sep';
    sep2.textContent = '·';
    telemetry.appendChild(sep2);

    const timing = document.createElement('span');
    timing.textContent = `${(result.elapsedMs / 1000).toFixed(1)}s`;
    telemetry.appendChild(timing);
  }

  card.appendChild(telemetry);

  const body = document.createElement('p');
  body.className = 'response-body';
  body.appendChild(linkifyText(result.answer || ''));
  card.appendChild(body);

  summary.appendChild(card);

  const urls = [...new Set((result.answer || '').match(URL_PATTERN) || [])];
  if (urls.length > 0) {
    renderLinkPreviews(urls);
  }
}

// Turns plain-text URLs into clickable <a> tags, leaving the rest of
// the text untouched. Returns a DocumentFragment so callers can just
// append it — avoids building HTML strings from model output.
function linkifyText(text) {
  const fragment = document.createDocumentFragment();
  let lastIndex = 0;

  for (const match of text.matchAll(URL_PATTERN)) {
    const url = match[0];
    const start = match.index;

    if (start > lastIndex) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex, start)));
    }

    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.className = 'answer-link';
    a.textContent = url;
    fragment.appendChild(a);

    lastIndex = start + url.length;
  }

  if (lastIndex < text.length) {
    fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
  }

  return fragment;
}

async function renderLinkPreviews(urls) {
  const list = document.createElement('div');
  list.className = 'link-previews';
  summary.appendChild(list);

  const results = await Promise.allSettled(
    urls.map((url) => fetch(`/preview?url=${encodeURIComponent(url)}`).then((r) => r.json()))
  );

  for (const result of results) {
    if (result.status !== 'fulfilled' || result.value.error) continue;
    list.appendChild(renderLinkPreviewCard(result.value));
  }
}

function renderLinkPreviewCard(preview) {
  const card = document.createElement('a');
  card.className = 'link-preview-card';
  card.href = preview.url;
  card.target = '_blank';
  card.rel = 'noopener noreferrer';

  if (preview.image) {
    const img = document.createElement('img');
    img.className = 'link-preview-image';
    img.src = preview.image;
    img.alt = '';
    img.loading = 'lazy';
    card.appendChild(img);
  }

  const text = document.createElement('div');
  text.className = 'link-preview-text';

  const title = document.createElement('div');
  title.className = 'link-preview-title';
  title.textContent = preview.title || preview.url;
  text.appendChild(title);

  const domain = document.createElement('div');
  domain.className = 'link-preview-domain';
  try {
    domain.textContent = new URL(preview.url).hostname;
  } catch {
    domain.textContent = preview.url;
  }
  text.appendChild(domain);

  card.appendChild(text);
  return card;
}
