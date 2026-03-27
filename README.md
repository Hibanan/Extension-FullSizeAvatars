# Fullsize Chat Avatars

A SillyTavern extension that replaces low-resolution avatar thumbnails in chat messages with the original avatar source image.

## What It Does

- Replaces avatar thumbnail image URLs with the source image
- Lets you toggle character avatars and persona avatars independently

## Installation

1. Copy this folder to your SillyTavern extensions directory as `Extension-FullSizeAvatars`.
2. Start or restart SillyTavern.
3. Open **Extensions** and enable **Fullsize Chat Avatars** if needed.

## Settings

- **Replace character avatars**: use full source images for character avatars
- **Replace persona avatars**: use full source images for persona avatars
- **Refresh avatars**: forces re-apply on current chat messages

## Files

- `manifest.json` - extension metadata for SillyTavern
- `index.js` - extension logic and settings UI hooks
- `style.css` - avatar and settings styling

## Publishing Notes (Private GitHub Repo)

- This project is ready for direct push to a private GitHub repository.
- Before sharing externally, update `author` and `version` in `manifest.json` as needed.
