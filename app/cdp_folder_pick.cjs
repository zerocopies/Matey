const CDP = require('chrome-remote-interface');

(async () => {
  let client;
  const consoleMessages = [];

  try {
    console.log('[CDP] Connecting...');
    client = await CDP({
      host: '127.0.0.1',
      port: 9222,
      // The page tab id
      target: '675DDBD3077B'
    });

    console.log('[CDP] Connected!');

    const { Runtime, Page, DOM } = client;
    
    await Runtime.enable();
    await Page.enable();
    console.log('[CDP] Runtime + Page enabled');

    // Listen for console messages
    Runtime.consoleAPICalled((params) => {
      const args = (params.args || []).map(a => a.value || a.description || '').join(' ');
      const msg = `[JS console] ${params.type}: ${args}`;
      consoleMessages.push(msg);
      console.log('[CDP-REALTIME]', msg);
    });

    Runtime.exceptionThrown((params) => {
      const details = params.exceptionDetails;
      const msg = `[JS exception] ${details.exception?.description || details.text || 'unknown'}`;
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
            className: el ? el.className : null
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

    // Wait for traces (the Capacitor call will either resolve, reject, or hang)
    console.log('[CDP] Waiting 15 seconds for trace output...');
    await new Promise(r => setTimeout(r, 15000));

    console.log('[CDP] === All captured console messages ===');
    consoleMessages.forEach(m => console.log(m));

  } catch (err) {
    console.error('[CDP] Error:', err.message);
  } finally {
    if (client) {
      await client.close();
      console.log('[CDP] Connection closed.');
    }
    process.exit(0);
  }
})();
