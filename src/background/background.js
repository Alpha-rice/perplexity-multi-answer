// Helper function to inject content script if needed
async function ensureContentScriptInjected(tabId) {
  try {
    // Try to ping the content script first
    const response = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
    if (response && response.status === 'PONG') {
      console.log('[BG] Content script already active in tab:', tabId);
      return true;
    }
  } catch (error) {
    console.log('[BG] Content script not responding, will inject:', error.message);
  }

  try {
    // Inject the content script
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['src/content/contentScript.js']
    });
    console.log('[BG] Content script injected successfully into tab:', tabId);
    
    // Wait a bit for the script to initialize
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Verify injection worked
    const response = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
    if (response && response.status === 'PONG') {
      console.log('[BG] Content script injection verified');
      return true;
    } else {
      throw new Error('Content script injection verification failed');
    }
  } catch (error) {
    console.error('[BG] Failed to inject content script:', error);
    return false;
  }
}

// Function to create multiple new Perplexity tabs and send queries simultaneously
async function createMultipleTabsAndSendQueries(queries, prompt) {
  console.log('[BG] Creating multiple tabs for queries:', queries.length);
  
  try {
    const tabPromises = queries.map(async (query, index) => {
      console.log(`[BG] Creating tab ${index + 1} for query:`, query);
      
      // Create new tab
      const tab = await new Promise((resolve, reject) => {
        chrome.tabs.create({ 
          url: 'https://www.perplexity.ai/',
          active: false // Don't switch to the tab
        }, (newTab) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(newTab);
          }
        });
      });

      console.log(`[BG] Tab ${index + 1} created:`, tab.id);

      // Wait for tab to load
      await new Promise((resolve) => {
        const checkTabStatus = () => {
          chrome.tabs.get(tab.id, (updatedTab) => {
            if (chrome.runtime.lastError) {
              console.error(`[BG] Error checking tab ${tab.id}:`, chrome.runtime.lastError);
              resolve(); // Continue anyway
            } else if (updatedTab.status === 'complete') {
              console.log(`[BG] Tab ${index + 1} loaded successfully`);
              resolve();
            } else {
              setTimeout(checkTabStatus, 500);
            }
          });
        };
        checkTabStatus();
      });

      // Additional wait for page to fully initialize
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Ensure content script is injected
      const injectionSuccess = await ensureContentScriptInjected(tab.id);
      if (!injectionSuccess) {
        throw new Error(`Content script injection failed for tab ${index + 1}`);
      }

      // Send query to the tab
      const response = await new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(
          tab.id,
          {
            type: 'PERPLEXITY_SEND_SINGLE_QUERY',
            query: query,
            tabIndex: index + 1
          },
          (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(`Tab ${index + 1}: ${chrome.runtime.lastError.message}`));
            } else if (typeof response === 'undefined') {
              reject(new Error(`Tab ${index + 1}: Content script did not respond`));
            } else {
              resolve(response);
            }
          }
        );
      });

      return {
        tabIndex: index + 1,
        query: query,
        tabId: tab.id,
        response: response
      };
    });

    // Wait for all queries to complete
    const results = await Promise.allSettled(tabPromises);
    
    const successfulResults = [];
    const errors = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        successfulResults.push(result.value);
      } else {
        errors.push(`Query ${index + 1}: ${result.reason.message}`);
      }
    });

    console.log('[BG] All queries completed. Successful:', successfulResults.length, 'Errors:', errors.length);

    return {
      status: 'ok',
      results: successfulResults,
      errors: errors,
      prompt: prompt
    };

  } catch (error) {
    console.error('[BG] Error in createMultipleTabsAndSendQueries:', error);
    throw error;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[BG] onMessage received:', message);

  if (
    message.type === 'START_PERPLEXITY_QUERIES' &&
    Array.isArray(message.queries) &&
    typeof message.prompt === 'string'
  ) {
    console.log('[BG] START_PERPLEXITY_QUERIES accepted. Creating multiple tabs...');
    
    // Use the new multiple tabs approach
    createMultipleTabsAndSendQueries(message.queries, message.prompt)
      .then((result) => {
        console.log('[BG] Multiple queries completed successfully:', result);
        sendResponse(result);
      })
      .catch((error) => {
        console.error('[BG] Multiple queries failed:', error);
        sendResponse({ 
          status: 'error', 
          message: `複数クエリ処理エラー: ${error.message}` 
        });
      });

    return true; // 非同期応答
  } else {
    console.warn('[BG] Message type not handled:', message.type);
  }
});