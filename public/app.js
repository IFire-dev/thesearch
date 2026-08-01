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

  // Dot color encodes what actually happened, not just that it
  // succeeded: green = Ultra answered first try, brass = Ultra
  // answered after retrying, orange = had to fall back to Nano.
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
  body.textContent = result.answer;
  card.appendChild(body);

  summary.appendChild(card);
}
