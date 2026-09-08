const CDP = require('chrome-remote-interface');
const http = require('http');

// First, get the page list to find the correct webSocketDebuggerUrl
function getPageList() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9222/json/list', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch(e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

(async () => {
  let client;
  const consoleMessages = [];

  try {
    const pages = await getPageList();
    console.log('[CDP] Available pages:', JSON.stringify(pages.map(p => ({id: p.id, url: p.url}))));
    
    const page = pages.find(p => p.url.includes('localhost')) || pages[0];
    if (!page) {
      console.log('[CDP] No pages found');
      process.exit(1);
    }
    console.log('[CDP] Using page:', page.id, page.url);
    console.log('[CDP] WebSocket URL:', page.webSocketDebuggerUrl);

    client = await CDP({
      host: '127.0.0.1',
      port: 9222,
      target: page.targetInfo ? undefined : page.id
    });
    
    // Actually, CDP({target: ...}) may not work. Let me use the ws directly
    console.log('[CDP] Connected via CDP!');

    const { Runtime, Page } = client;
    
    await Runtime.enable();
    await Page.enable();
    console.log('[CDP] Runtime + Page enabled');

    // Listen for console messages
    Runtime.consoleAPICalled((params) => {
      const args = (params.args || []).map(a => a.value || a.description || '').join(' ');
      const msg = `[JS] ${params.type}: ${args}`;
      consoleMessages.push(msg);
      console.log('[CDP-REALTIME]', msg);
    });

    Runtime.exceptionThrown((params) => {
      const details = params.exceptionDetails;
      const msg = `[JS-ERR] ${details.exception?.description || details.text || 'unknown'}`;
      consoleMessages.push(msg);
      console.log('[CDP-REALTIME]', msg);
    });

    // Check current display state
    console.log('[CDP] Checking current workspace display...');
    const eval1 = await Runtime.evaluate({
      expression: `
        (function() {
          var el = document.querySelector('.workspace-name, #workspace-display');
          return {
            found: !!el,
            text: el ? el.textContent : null,
            className: el ? el.className : null,
            outerHTML: el ? el.outerHTML.substring(0, 200) : null
          };
        })()
      `,
      returnByValue: true,
      awaitPromise: true
    });
    console.log('[CDP] Current display state:', JSON.stringify(eval1.result?.value));

    // Wait 2s then click
    console.log('[CDP] Waiting 2s before click...');
    await new Promise(r => setTimeout(r, 2000));

    console.log('[CDP] Triggering click on workspace-create button...');
    const eval2 = await Runtime.evaluate({
      expression: `
        (function() {
          var btn = document.querySelector('button[data-workspace="create"]');
          if (!btn) {
            var selector = document.getElementById('workspace-selector');
            var allBtns = selector ? selector.querySelectorAll('button') : [];
            var found = [];
            for (var i = 0; i < allBtns.length; i++) {
              found.push({data: allBtns[i].getAttribute('data-workspace'), text: allBtns[i].textContent.trim()});
            }
            return {clicked: false, buttons: found, selectorExists: !!selector};
          }
          btn.click();
          return {clicked: true, buttonText: btn.textContent.trim()};
        })()
      `,
      returnByValue: true,
      awaitPromise: true
    });
    console.log('[CDP] Click result:', JSON.stringify(eval2.result?.value));

    // Wait for traces (Capacitor call will resolve, reject, or hang)
    console.log('[CDP] Waiting 15s for trace output...');
    await new Promise(r => setTimeout(r, 15000));

    console.log('[CDP] === All captured JS console messages ===');
    consoleMessages.forEach(m => console.log(m));

  } catch (err) {
    console.error('[CDP] Error:', err.stack || err.message);
  } finally {
    if (client) {
      await client.close();
      console.log('[CDP] Connection closed.');
    }
    process.exit(0);
  }
})();
