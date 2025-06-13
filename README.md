# Perplexity Multi-Answer Chrome Extension

A Chrome extension that automatically sends multiple queries to Perplexity AI and generates integrated reports from the responses.

## Overview

This extension allows you to submit 2-5 queries to Perplexity's Web UI simultaneously and automatically combines the responses into a comprehensive report using a custom integration prompt.

## Features

- **Bulk Query Processing**: Submit multiple queries (2-5) to Perplexity at once
- **Automatic Integration**: Combines all responses into a unified report
- **Popup Interface**: Easy-to-use popup with query input and prompt customization
- **Context Menu Integration**: Right-click access for quick activation
- **Error Handling**: Automatic retry mechanism with error notifications
- **Japanese Language Support**: Fully localized for Japanese users

## Installation

### Manual Installation

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right corner
4. Click "Load unpacked" and select the extension directory
5. The extension icon should appear in your Chrome toolbar

## Usage

### Prerequisites

- You must be logged into [Perplexity AI](https://www.perplexity.ai/) before using this extension
- The extension will show an error notification if you're not logged in

### How to Use

1. **Via Popup**: Click the extension icon in your toolbar
2. **Via Context Menu**: Right-click on any webpage and select the extension option
3. Enter your queries (one per line, 2-5 queries maximum)
4. Customize the integration prompt if needed
5. Click submit to process all queries automatically

The extension will:
- Open new tabs for each query
- Automatically submit them to Perplexity
- Collect all responses
- Generate an integrated report in a final tab

## File Structure

```
perplexity-multi-answer/
├── manifest.json           # Extension configuration
├── icons/                  # Extension icons
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
├── src/
│   ├── background/         # Background service worker
│   ├── content/           # Content scripts for Perplexity integration
│   ├── options/           # Extension options page
│   ├── popup/             # Popup interface
│   └── utils/             # Shared utilities
└── README.md              # This file
```

## Permissions

This extension requires the following permissions:
- `tabs`: To create and manage browser tabs
- `scripting`: To inject scripts into Perplexity pages
- `storage`: To save user preferences and error logs
- `contextMenus`: To add right-click menu options
- `notifications`: To display error and status notifications
- `host_permissions`: Access to `https://www.perplexity.ai/*`

## Keyboard Shortcut

- **Ctrl+Shift+Y** (Windows/Linux) or **Cmd+Shift+Y** (Mac): Open extension popup

## Error Handling

- Automatic retry up to 3 times for failed requests
- Error notifications displayed in popup
- Error logs saved within the extension for debugging

## Privacy

- No query content or history is permanently stored
- All processing happens locally in your browser
- Only communicates with Perplexity AI's official website

## Development

For development setup and contribution guidelines, please refer to the [`request.txt`](./request.txt) file which contains the detailed specification.

## License

This project is open source. Please check the repository for license details.

## Support

If you encounter any issues or have questions, please open an issue in the GitHub repository.
