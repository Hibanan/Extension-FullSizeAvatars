const MODULE_NAME = 'fullsize-chat-avatars';

const defaultSettings = Object.freeze({
    replaceCharacterAvatars: true,
    replacePersonaAvatars: true,
    debugAvatarClicks: false,
});

const state = {
    observer: null,
    raf: 0,
    eventsBound: false,
    uiBound: false,
};

function cloneDefaults() {
    return JSON.parse(JSON.stringify(defaultSettings));
}

function getContext() {
    return SillyTavern.getContext();
}

function getSettings() {
    const { extensionSettings } = getContext();

    if (!extensionSettings[MODULE_NAME]) {
        extensionSettings[MODULE_NAME] = cloneDefaults();
    }

    const settings = extensionSettings[MODULE_NAME];

    for (const [key, value] of Object.entries(defaultSettings)) {
        if (!Object.hasOwn(settings, key)) {
            settings[key] = value;
        }
    }

    return settings;
}

function saveSettings() {
    const context = getContext();
    context.saveSettingsDebounced?.();
}

function isDebugAvatarClicksEnabled() {
    return Boolean(getSettings().debugAvatarClicks);
}

function debugLog(...args) {
    if (!isDebugAvatarClicksEnabled()) return;
    console.debug(`[${MODULE_NAME}]`, ...args);
}

function stripOrigin(url = '') {
    if (!url) return '';
    return url.startsWith(window.location.origin)
        ? url.slice(window.location.origin.length)
        : url;
}

function ensureLeadingSlash(path = '') {
    if (!path) return '';
    return path.startsWith('/') ? path : `/${path}`;
}

function normalizeAvatarFile(file = '') {
    let value = String(file || '');
    let previous = null;

    // Decode repeatedly so encoded or double-encoded names normalize back
    // to the real filename before we encode once for output.
    for (let i = 0; i < 4 && value !== previous; i++) {
        previous = value;
        try {
            value = decodeURIComponent(value);
        } catch {
            break;
        }
    }

    return value;
}

function parseAvatarSource(rawSrc) {
    if (!rawSrc) return null;

    const normalized = stripOrigin(rawSrc);
    const trimmed = normalized.replace(/^\//, '');

    try {
        const parsed = new URL(normalized, window.location.origin);

        if (parsed.pathname === '/thumbnail' || parsed.pathname.endsWith('/thumbnail')) {
            const type = parsed.searchParams.get('type');
            const file = parsed.searchParams.get('file');

            if (type && file) {
                return {
                    type,
                    file: normalizeAvatarFile(file),
                };
            }
        }
    } catch {
        // Fall through to direct-path inspection.
    }

    if (trimmed.startsWith('characters/')) {
        return {
            type: 'avatar',
            file: normalizeAvatarFile(trimmed.replace(/^characters\//, '')),
        };
    }

    if (trimmed.startsWith('User Avatars/')) {
        return {
            type: 'persona',
            file: normalizeAvatarFile(trimmed.replace(/^User Avatars\//, '')),
        };
    }

    return {
        type: null,
        file: normalizeAvatarFile(trimmed),
    };
}

function resolveAvatarUrls(rawSrc) {
    const info = parseAvatarSource(rawSrc);
    if (!info) return { type: null, thumb: '', original: '' };

    const file = normalizeAvatarFile(info.file);

    if (info.type === 'avatar') {
        return {
            type: 'avatar',
            thumb: `/thumbnail?type=avatar&file=${encodeURIComponent(file)}`,
            original: `/characters/${encodeURIComponent(file)}`,
        };
    }

    if (info.type === 'persona') {
        return {
            type: 'persona',
            thumb: `/thumbnail?type=persona&file=${encodeURIComponent(file)}`,
            original: `/User%20Avatars/${encodeURIComponent(file)}`,
        };
    }

    // For unknown/non-standard paths, preserve the original path as-is
    // so we do not keep re-encoding percent signs.
    const direct = ensureLeadingSlash(stripOrigin(rawSrc));
    return {
        type: info.type ?? null,
        thumb: direct,
        original: direct,
    };
}

function shouldUseOriginalForType(type, settings) {
    if (type === 'avatar') {
        return Boolean(settings.replaceCharacterAvatars);
    }

    if (type === 'persona') {
        return Boolean(settings.replacePersonaAvatars);
    }

    return false;
}

function getMessageElement(input) {
    if (!input) return null;
    if (input instanceof Element) return input;
    if (input?.target instanceof Element) return input.target.closest('.mes');
    if (input?.[0] instanceof Element) return input[0];
    return null;
}

function applyAvatarToMessage(messageElement) {
    const mes = getMessageElement(messageElement);
    if (!mes) return;

    const avatarImg = mes.querySelector('.avatar img');
    if (!avatarImg) return;

    const settings = getSettings();

    const sourceCandidate =
        mes.dataset.fscaAvatarOriginal ||
        mes.dataset.fscaAvatarThumb ||
        avatarImg.getAttribute('data-fsca-avatar-original') ||
        avatarImg.getAttribute('data-fsca-avatar-thumb') ||
        avatarImg.getAttribute('data-src') ||
        avatarImg.getAttribute('src') ||
        '';

    if (!sourceCandidate) return;

    const { type, thumb, original } = resolveAvatarUrls(sourceCandidate);
    const thumbUrl = thumb || original || sourceCandidate;
    const originalUrl = original || thumbUrl;
    const useOriginal = shouldUseOriginalForType(type, settings);
    const displayUrl = useOriginal ? originalUrl : thumbUrl;

    if (!thumbUrl || !displayUrl) return;

    mes.dataset.fscaAvatarThumb = thumbUrl;
    mes.dataset.fscaAvatarOriginal = originalUrl;
    mes.dataset.fscaAvatarDisplay = displayUrl;

    mes.style.setProperty('--mes-avatar-thumb-url', `url("${thumbUrl}")`);
    mes.style.setProperty('--mes-avatar-original-url', `url("${originalUrl}")`);
    mes.style.setProperty('--mes-avatar-url', `url("${displayUrl}")`);

    avatarImg.setAttribute('data-fsca-avatar-thumb', thumbUrl);
    avatarImg.setAttribute('data-fsca-avatar-original', originalUrl);
    avatarImg.setAttribute('data-fsca-avatar-display', displayUrl);
    avatarImg.setAttribute('data-fullsize-avatar', useOriginal ? 'true' : 'false');
    avatarImg.setAttribute('data-avatar-type', type || 'unknown');
    avatarImg.decoding = 'async';

    // Keep src in SillyTavern's expected thumbnail shape (contains ?file=...)
    // so its built-in avatar click-to-zoom parser still works.
    if (avatarImg.getAttribute('src') !== thumbUrl) {
        avatarImg.setAttribute('src', thumbUrl);
    }

    if (useOriginal && originalUrl !== thumbUrl) {
        avatarImg.setAttribute('srcset', `${originalUrl} 1x`);
    } else {
        avatarImg.removeAttribute('srcset');
    }
}

function updateAllAvatars() {
    document.querySelectorAll('.mes').forEach(applyAvatarToMessage);
    syncSettingsUi();
}

function queueAvatarRefresh() {
    cancelAnimationFrame(state.raf);
    state.raf = requestAnimationFrame(updateAllAvatars);
}

function observeChat() {
    const chat = document.getElementById('chat');
    if (!chat || state.observer) return;

    state.observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === 'childList' && (mutation.addedNodes.length || mutation.removedNodes.length)) {
                queueAvatarRefresh();
                return;
            }
        }
    });

    state.observer.observe(chat, {
        childList: true,
        subtree: true,
    });
}

function bindAvatarClickCompatibility() {
    if (window.__fscaAvatarClickCompatBound) return;
    window.__fscaAvatarClickCompatBound = true;

    document.addEventListener('click', (event) => {
        const avatar = event.target.closest?.('.mes .avatar');
        if (!avatar) return;

        const img = avatar.querySelector('img');
        if (!img) return;

        const message = avatar.closest('.mes');
        const srcBefore = img.getAttribute('src') || '';
        const dataSrc = img.getAttribute('data-src') || '';
        const fscaThumb = img.getAttribute('data-fsca-avatar-thumb') || '';
        const fscaOriginal = img.getAttribute('data-fsca-avatar-original') || '';
        const legacyThumb = img.getAttribute('data-avatar-thumb') || '';
        const legacyOriginal = img.getAttribute('data-avatar-original') || '';

        debugLog('avatar click', {
            mesId: message?.getAttribute('mesid') || null,
            isUser: message?.getAttribute('is_user') || null,
            isSystem: message?.getAttribute('is_system') || null,
            eventTargetClass: event.target instanceof Element ? event.target.className : null,
            src: srcBefore,
            dataSrc,
            fscaThumb,
            fscaOriginal,
            legacyThumb,
            legacyOriginal,
            parsedSrc: parseAvatarSource(srcBefore),
            parsedDataSrc: parseAvatarSource(dataSrc),
        });

        const fallbackSrc =
            img.getAttribute('src') ||
            img.getAttribute('data-avatar-thumb') ||
            img.getAttribute('data-avatar-original') ||
            img.getAttribute('data-src');

        if (fallbackSrc && !img.getAttribute('src')) {
            img.setAttribute('src', fallbackSrc);
            debugLog('applied fallback src', { fallbackSrc });
        } else {
            debugLog('fallback not applied', {
                hasSrc: Boolean(img.getAttribute('src')),
                fallbackSrc: fallbackSrc || null,
            });
        }
    }, true);
}

function renderSettingsUi() {
    if (document.getElementById('fsca_settings')) return;

    const html = `
        <div id="fsca_settings" class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>Fullsize Chat Avatars</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <div class="fsca-note">
                    Replace chat avatar thumbnails with original source images.
                </div>

                <label class="fsca-row">
                    <span>Replace character avatars</span>
                    <input id="fsca_replace_character" type="checkbox" />
                </label>

                <label class="fsca-row">
                    <span>Replace persona avatars</span>
                    <input id="fsca_replace_persona" type="checkbox" />
                </label>

                <label class="fsca-row">
                    <span>Debug avatar click logs</span>
                    <input id="fsca_debug_clicks" type="checkbox" />
                </label>

                <div class="fsca-actions">
                    <button id="fsca_refresh" class="menu_button">Refresh avatars</button>
                </div>
            </div>
        </div>
    `;

    $('#extensions_settings2').append(html);
}

function syncSettingsUi() {
    const settings = getSettings();

    const replaceCharacter = document.getElementById('fsca_replace_character');
    const replacePersona = document.getElementById('fsca_replace_persona');
    const debugClicks = document.getElementById('fsca_debug_clicks');

    if (replaceCharacter) {
        replaceCharacter.checked = Boolean(settings.replaceCharacterAvatars);
    }

    if (replacePersona) {
        replacePersona.checked = Boolean(settings.replacePersonaAvatars);
    }

    if (debugClicks) {
        debugClicks.checked = Boolean(settings.debugAvatarClicks);
    }
}

function bindSettingsUi() {
    if (state.uiBound) return;
    state.uiBound = true;

    $(document).on('input change', '#fsca_replace_character', (event) => {
        const settings = getSettings();
        settings.replaceCharacterAvatars = Boolean($(event.currentTarget).prop('checked'));
        saveSettings();
        queueAvatarRefresh();
    });

    $(document).on('input change', '#fsca_replace_persona', (event) => {
        const settings = getSettings();
        settings.replacePersonaAvatars = Boolean($(event.currentTarget).prop('checked'));
        saveSettings();
        queueAvatarRefresh();
    });

    $(document).on('input change', '#fsca_debug_clicks', (event) => {
        const settings = getSettings();
        settings.debugAvatarClicks = Boolean($(event.currentTarget).prop('checked'));
        saveSettings();

        if (window.toastr) {
            toastr.info(
                `Debug avatar click logs ${settings.debugAvatarClicks ? 'enabled' : 'disabled'}.`,
                'Fullsize Chat Avatars',
            );
        }
    });

    $(document).on('click', '#fsca_refresh', () => {
        queueAvatarRefresh();
        if (window.toastr) {
            toastr.info('Avatar refresh queued.', 'Fullsize Chat Avatars');
        }
    });
}

function bindEvents() {
    if (state.eventsBound) return;
    state.eventsBound = true;

    const { eventSource, event_types } = getContext();

    if (event_types.APP_READY) {
        eventSource.on(event_types.APP_READY, () => {
            renderSettingsUi();
            bindSettingsUi();
            syncSettingsUi();
            observeChat();
            queueAvatarRefresh();
        });
    }

    if (event_types.CHAT_CHANGED) {
        eventSource.on(event_types.CHAT_CHANGED, () => {
            observeChat();
            queueAvatarRefresh();
        });
    }

    if (event_types.USER_MESSAGE_RENDERED) {
        eventSource.on(event_types.USER_MESSAGE_RENDERED, (messageElement) => {
            applyAvatarToMessage(messageElement);
        });
    }

    if (event_types.CHARACTER_MESSAGE_RENDERED) {
        eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, (messageElement) => {
            applyAvatarToMessage(messageElement);
        });
    }
}

jQuery(() => {
    renderSettingsUi();
    bindSettingsUi();
    syncSettingsUi();
    bindEvents();
    observeChat();
    bindAvatarClickCompatibility();
    queueAvatarRefresh();

    window.updateAvatars = updateAllAvatars;
});

