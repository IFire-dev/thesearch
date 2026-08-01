const fetch = require('node-fetch');

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;

// Calls a free NVIDIA-hosted open-weight model (via build.nvidia.com's
// NIM catalog, OpenAI-compatible endpoint) for a short, direct answer.
// Returns { answer } on success or { error } if the key is missing or
// the request fails — callers should show the error inline rather than
// letting it break the whole search.
async function askNvidia(query) {
  if (!NVIDIA_API_KEY) {
    return { error: 'NVIDIA_API_KEY not set in .env' };
  }

  try {
    const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${NVIDIA_API_KEY}`
      },
      body: JSON.stringify({
        // Nemotron 3 Ultra: NVIDIA's largest model, reasoning-capable.
        // Swap this for any other model ID listed at build.nvidia.com
        // if you want something faster/smaller instead.
        model: 'nvidia/nemotron-3-ultra-550b-a55b',
        max_tokens: 500,
        // This model can emit a chain-of-thought reasoning trace before
        // its actual answer, which would otherwise eat into max_tokens
        // and risk an empty/truncated response for a query this short.
        // Turning it off keeps this fast and keeps `content` populated.
        chat_template_kwargs: { enable_thinking: false },
        messages: [
          { role: 'user', content: `Give a short, direct answer to this search query. A sentence or two, no preamble: ${query}` }
        ]
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return { error: data.error?.message || `NVIDIA API returned ${response.status}` };
    }

    const answer = data.choices?.[0]?.message?.content;
    return { answer: answer || 'No answer returned.' };
  } catch (err) {
    return { error: err.message };
  }
}

// Calls Perplexity's Sonar API, which does its own live web search and
// returns citations alongside the answer. Returns { answer, citations }
// on success or { error } otherwise.
async function askPerplexity(query) {
  if (!PERPLEXITY_API_KEY) {
    return { error: 'PERPLEXITY_API_KEY not set in .env' };
  }

  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${PERPLEXITY_API_KEY}`
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [{ role: 'user', content: query }]
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return { error: data.error?.message || `Perplexity API returned ${response.status}` };
    }

    const answer = data.choices?.[0]?.message?.content;
    const citations = data.citations || [];
    return { answer: answer || 'No answer returned.', citations };
  } catch (err) {
    return { error: err.message };
  }
}

module.exports = { askNvidia, askPerplexity };
