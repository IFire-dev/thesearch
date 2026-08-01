const fetch = require('node-fetch');

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
const NVIDIA_ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';

const ULTRA_MODEL = 'nvidia/nemotron-3-ultra-550b-a55b';
const NANO_MODEL = 'nvidia/nemotron-3-nano-30b-a3b';

const MAX_ULTRA_ATTEMPTS = 10;
const RETRY_DELAY_MS = 800; // between Ultra retry attempts

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Single call to any NVIDIA NIM chat model. Returns { ok: true, answer }
// or { ok: false, error }.
async function callNvidiaModel(model, query) {
  try {
    const response = await fetch(NVIDIA_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${NVIDIA_API_KEY}`
      },
      body: JSON.stringify({
        model,
        max_tokens: 500,
        // These models can emit a chain-of-thought reasoning trace
        // before the actual answer, which would otherwise eat into
        // max_tokens and risk an empty/truncated response for a query
        // this short. Turning it off keeps `content` populated.
        chat_template_kwargs: { enable_thinking: false },
        messages: [
          { role: 'user', content: `Give a short, direct answer to this search query. A sentence or two, no preamble: ${query}` }
        ]
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return { ok: false, error: data.error?.message || `NVIDIA API returned ${response.status}` };
    }

    const answer = data.choices?.[0]?.message?.content;
    return { ok: true, answer: answer || 'No answer returned.' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// Tries Nemotron 3 Ultra up to MAX_ULTRA_ATTEMPTS times (it's a huge
// flagship model on a free shared endpoint, so "all workers busy"
// errors are common and usually transient — worth retrying a few
// times before giving up). Falls back to Nemotron 3 Nano — a much
// smaller model with far more free capacity — if Ultra never comes
// through.
async function askNvidiaPrimary(query) {
  if (!NVIDIA_API_KEY) {
    return { error: 'NVIDIA_API_KEY not set in .env' };
  }

  let lastError;
  for (let attempt = 1; attempt <= MAX_ULTRA_ATTEMPTS; attempt++) {
    const result = await callNvidiaModel(ULTRA_MODEL, query);
    if (result.ok) {
      return { answer: result.answer, model: 'Nemotron 3 Ultra' };
    }
    lastError = result.error;
    if (attempt < MAX_ULTRA_ATTEMPTS) await sleep(RETRY_DELAY_MS);
  }

  // Ultra never succeeded — fall back to the smaller model.
  const fallback = await callNvidiaModel(NANO_MODEL, query);
  if (fallback.ok) {
    return { answer: fallback.answer, model: 'Nemotron 3 Nano — fallback, Ultra was busy' };
  }
  return { error: `Ultra failed after ${MAX_ULTRA_ATTEMPTS} attempts (${lastError}); Nano fallback also failed (${fallback.error})` };
}

// Independent second panel — always Nemotron 3 Nano, replacing what
// used to be the Perplexity call. Runs regardless of how the Ultra
// call above goes.
async function askNvidiaSecondary(query) {
  if (!NVIDIA_API_KEY) {
    return { error: 'NVIDIA_API_KEY not set in .env' };
  }

  const result = await callNvidiaModel(NANO_MODEL, query);
  if (result.ok) {
    return { answer: result.answer, model: 'Nemotron 3 Nano' };
  }
  return { error: result.error };
}

module.exports = { askNvidiaPrimary, askNvidiaSecondary };
