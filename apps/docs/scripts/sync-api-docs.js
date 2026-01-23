#!/usr/bin/env node
const fs = require('fs');
const https = require('https');

// Fetch OpenAPI spec from API repo
function fetchOpenAPI() {
  return new Promise((resolve, reject) => {
    https
      .get('https://raw.githubusercontent.com/Harbour-Enterprises/SuperDoc-API/main/openapi.yaml', (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve(data));
      })
      .on('error', reject);
  });
}

async function syncAPIDocs() {
  console.log('📥 Fetching OpenAPI spec...');
  const spec = await fetchOpenAPI();

  // Save for Mintlify to process
  fs.writeFileSync('openapi.yaml', spec);

  // Create meta file for navigation
  const meta = {
    title: 'API Reference',
    description: 'SuperDoc REST API endpoints',
  };

  fs.mkdirSync('api-reference', { recursive: true });
  fs.writeFileSync('api-reference/_meta.json', JSON.stringify(meta, null, 2));

  console.log('✅ API docs synced');
}

syncAPIDocs().catch(console.error);
