const fetch = require('node-fetch');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;

// Calls Claude for a short, direct answer to the query. Returns
// { answer } on success or { error } if the key is missing or the
// request fails — callers should show the error inline rather than
// letting it break the whole search.
async function askClaude(query) {
  if (!ANTHROPIC_API_KEY) {
    return { error: 'ANTHROPIC_API_KEY not set in .env' };
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 300,
        messages: [
          { role: 'user', content: `Give a short, direct answer to this search query. A sentence or two, no preamble: ${query}` }
        ]
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return { error: data.error?.message || `Claude API returned ${response.status}` };
    }

    const answer = data.content?.[0]?.text;
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

module.exports = { askClaude, askPerplexity };
