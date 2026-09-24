// Netlify Function: relays requests from the page to an AI provider.
// Keys live in Netlify environment variables, never in the page.
//   GEMINI_API_KEY    -> uses Google Gemini (has a free tier)
//   ANTHROPIC_API_KEY -> uses Claude (paid)
// If both are set, Gemini is used.
exports.handler = async (event) => {
  const json = (statusCode, obj) => ({ statusCode, headers: { 'content-type': 'application/json' }, body: JSON.stringify(obj) });
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  try {
    const { messages } = JSON.parse(event.body || '{}');
    if (!Array.isArray(messages) || !messages.length) return json(400, { error: 'messages required' });
    const msgs = messages.slice(-6).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content).slice(0, 30000) }));

    if (process.env.GEMINI_API_KEY) {
      const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body: JSON.stringify({
          contents: msgs.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
          generationConfig: { maxOutputTokens: 3000 }
        })
      });
      const d = await r.json();
      if (!r.ok) return json(502, { error: (d.error && d.error.message) || 'Upstream error' });
      const parts = (d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts) || [];
      return json(200, { text: parts.map(p => p.text || '').join('') });
    }

    if (process.env.ANTHROPIC_API_KEY) {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5', max_tokens: 3000, messages: msgs })
      });
      const d = await r.json();
      if (!r.ok) return json(502, { error: (d.error && d.error.message) || 'Upstream error' });
      return json(200, { text: (d.content || []).filter(b => b.type === 'text').map(b => b.text).join('') });
    }

    return json(500, { error: 'No API key set on the server' });
  } catch (e) {
    return json(500, { error: 'Server error' });
  }
};
