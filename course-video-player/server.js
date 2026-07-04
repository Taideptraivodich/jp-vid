const express = require('express');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT || 8080);
const API_ROOT = process.env.API_ROOT || 'https://api-online.abc.vn/api/v1/client';

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function isAllowed(method, apiPath) {
  const rules = [
    { method: 'GET', re: /^\/my-course\/detail\/\d+$/ },
    { method: 'GET', re: /^\/my-course\/roadmap-lesson$/ },
    { method: 'GET', re: /^\/my-course\/lesson\/\d+$/ }
  ];

  return rules.some(rule => rule.method === method && rule.re.test(apiPath));
}

function cleanForwardHeaders(req) {
  const authorization = req.get('authorization');

  const headers = {
    Accept: 'application/json',
    Platform: req.get('platform') || 'web'
  };

  if (authorization) {
    headers.Authorization = authorization;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    headers['Content-Type'] = 'application/json';
  }

  return headers;
}

app.all('/api/*', async (req, res) => {
  const apiPath = '/' + req.params[0];

  if (!isAllowed(req.method, apiPath)) {
    return res.status(403).json({
      status: { code: 403, message: 'Endpoint is not allowed by local proxy.' }
    });
  }

  if (!req.get('authorization')) {
    return res.status(401).json({
      status: { code: 401, message: 'Missing Authorization header.' }
    });
  }

  const targetUrl = new URL(API_ROOT + apiPath);

  for (const [key, value] of Object.entries(req.query || {})) {
    if (Array.isArray(value)) {
      value.forEach(v => targetUrl.searchParams.append(key, v));
    } else if (value !== undefined) {
      targetUrl.searchParams.set(key, value);
    }
  }

  try {
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers: cleanForwardHeaders(req),
      body: req.method === 'GET' || req.method === 'HEAD'
        ? undefined
        : JSON.stringify(req.body || {})
    });

    const text = await upstream.text();
    const contentType = upstream.headers.get('content-type') || 'application/json; charset=utf-8';

    res.status(upstream.status);
    res.set('content-type', contentType);
    res.send(text);
  } catch (error) {
    res.status(502).json({
      status: { code: 502, message: error.message || 'Proxy request failed.' }
    });
  }
});

app.listen(PORT, () => {
  console.log(`Course Video Player running at http://localhost:${PORT}`);
  console.log(`Proxy API root: ${API_ROOT}`);
});
