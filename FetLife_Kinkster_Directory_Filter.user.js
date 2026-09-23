// ==UserScript==
// @name         FetLife Kinkster Directory Filter
// @namespace    https://github.com/ShavedW00kie/
// @version      1.0.3
// @author       ShavedW00kie
// @homepageURL  https://github.com/ShavedW00kie
// @description  Filter kinkster profile directories by gender/sex and location keywords on FetLife.
// @match        https://fetlife.com/*
// @match        https://www.fetlife.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @run-at       document-idle
// @license      BSD-3-Clause
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_KEY = 'tbcc_kf_settings_v1';
    const PANEL_ID = 'tbcc-kf-panel';
    const FAB_ID = 'tbcc-kf-fab';

    const GENDERS = [
        { id: 'M', label: 'Male (M / Man)' },
        { id: 'F', label: 'Female (F / Woman)' },
        { id: 'NB', label: 'Non-Binary (NB)' },
        { id: 'MTF', label: 'Male to Female (MtF)' },
        { id: 'FTM', label: 'Female to Male (FtM)' },
        { id: 'MTO', label: 'Male to Other (MtO)' },
        { id: 'TM', label: 'Trans Man (TM)' },
        { id: 'TW', label: 'Trans Woman (TW)' },
        { id: 'TG', label: 'Transgender (TG)' },
        { id: 'CD/TV', label: 'Crossdresser (CD/TV)' },
        { id: 'GF', label: 'Gender Fluid (GF)' },
        { id: 'GQ', label: 'Gender Queer (GQ)' },
        { id: 'IS', label: 'Intersex (IS)' }
    ];

    const DEFAULT_SETTINGS = {
        locationKeywords: "La Grande, Elgin, Union",
        enableLocationFilter: false,
        hiddenSexes: {}
    };

    let settings = (() => {
        try {
            const saved = GM_getValue(STORAGE_KEY);
            return saved && typeof saved === 'object' ? { ...DEFAULT_SETTINGS, ...saved } : DEFAULT_SETTINGS;
        } catch (e) {
            return DEFAULT_SETTINGS;
        }
    })();

    let stylesInjected = false;
    function ensureStyles() {
        if (stylesInjected) return;
        GM_addStyle(`
            #${PANEL_ID} {
                position: fixed; z-index: 1000000; right: 16px; bottom: 110px;
                width: min(400px, calc(100vw - 24px)); max-height: min(75vh, 600px);
                overflow: hidden; display: flex; flex-direction: column;
                background: #1a1a1a; color: #d4d4d4;
                border: 1px solid #333; border-radius: 8px; display: none;
                font: 13px/1.35 system-ui, sans-serif; box-shadow: 0 4px 12px rgba(0,0,0,0.5);
            }
            #${PANEL_ID}.open { display: flex; }
            #${PANEL_ID} header {
                background: #222; padding: 10px 12px;
                display: flex; gap: 8px; align-items: center; border-bottom: 1px solid #333;
            }
            #${PANEL_ID} header strong { flex: 1; font-size: 14px; }
            #${PANEL_ID} button {
                background: #333; color: #eee; border: 1px solid #555; border-radius: 6px;
                padding: 6px 10px; cursor: pointer;
            }
            #${PANEL_ID} button:hover { background: #444; }
            #${PANEL_ID} .cat { padding: 4px 0 8px; font-weight: 700; color: #bbb; border-bottom: 1px solid #333; margin-bottom: 8px;}
            #${PANEL_ID} .grid-cb { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
            #${PANEL_ID} label { display: flex; gap: 8px; cursor: pointer; align-items: center; }
            #${FAB_ID} {
                position: fixed; z-index: 1000000; right: 16px; bottom: 60px;
                background: #333; color: #eee; border: 1px solid #555;
                border-radius: 6px; padding: 8px 12px; cursor: pointer; font: 13px system-ui, sans-serif;
                box-shadow: 0 2px 6px rgba(0,0,0,0.4);
            }
            #${FAB_ID}:hover { background: #444; }
        `);
        stylesInjected = true;
    }

    function normalizeSex(rawSex) {
        let s = rawSex.toUpperCase();
        if (s === 'MAN' || s === 'MALE' || s === 'M') return 'M';
        if (s === 'WOMAN' || s === 'FEMALE' || s === 'F') return 'F';
        if (s === 'TRANS MAN') return 'TM';
        if (s === 'TRANS WOMAN') return 'TW';
        if (s === 'TRANSGENDER') return 'TG';
        if (s === 'NON-BINARY' || s === 'NONBINARY' || s === 'ENBY') return 'NB';
        if (s === 'CROSSDRESSER') return 'CD/TV';
        if (s === 'GENDER FLUID' || s === 'GENDERFLUID') return 'GF';
        if (s === 'GENDER QUEER' || s === 'GENDERQUEER') return 'GQ';
        if (s === 'INTERSEX') return 'IS';
        return s;
    }

    function parseSexFromText(text) {
        const match = text.match(/\b(1[89]|[2-9]\d)\s*(?:[·.,|/ -]\s*)?([A-Za-z/\-]{1,12})\b/);
        if (match) {
            let normalized = normalizeSex(match[2]);
            if (GENDERS.some(g => g.id === normalized)) {
                return normalized;
            }
        }
        return null;
    }

    function getCards() {
        const cards = new Set();
        const regex = /\b(1[89]|[2-9]\d)\s*(?:[·.,|/ -]\s*)?([A-Za-z/\-]{1,12})\b/;
        
        document.querySelectorAll('a[href*="/users/"]').forEach(a => {
            try {
                const url = new URL(a.href, window.location.origin);
                if (!/^\/users\/[a-zA-Z0-9_.-]+$/.test(url.pathname)) return;
                
                let p = a.parentElement;
                let validCard = null;
                let steps = 0;
                
                while (p && p !== document.body && steps < 8) {
                    steps++;
                    
                    if (p.tagName === 'MAIN' || p.tagName === 'HEADER' || p.id === 'main-content') break;

                    const text = p.innerText || p.textContent || '';
                    if (text.length > 800) break; 
                    
                    if (regex.test(text)) {
                        validCard = p;
                        break; 
                    }
                    
                    p = p.parentElement;
                }
                
                if (validCard) {
                    let wrapper = validCard.closest('article') || 
                                  validCard.closest('.relative') || 
                                  validCard;
                    
                    if ((wrapper.innerText || '').length < 1000) {
                        cards.add(wrapper);
                    }
                }
            } catch (e) {}
        });
        
        const cardArray = Array.from(cards);
        return cardArray.filter(c => !cardArray.some(other => other !== c && other.contains(c)));
    }

    function applyFilter() {
        const cards = getCards();
        const locs = settings.enableLocationFilter ? settings.locationKeywords.split(',').map(s => s.trim().toLowerCase()).filter(s => s.length > 0) : [];
        
        cards.forEach(card => {
            const text = card.innerText || card.textContent || '';
            let shouldHide = false;
            
            const sex = parseSexFromText(text);
            if (sex && settings.hiddenSexes[sex]) {
                shouldHide = true;
            }
            
            if (!shouldHide && settings.enableLocationFilter && locs.length > 0) {
                const matchesLoc = locs.some(loc => {
                    const escaped = loc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const r = new RegExp('\\b' + escaped + '\\b', 'i');
                    return r.test(text);
                });
                if (!matchesLoc) {
                    shouldHide = true;
                }
            }
            
            if (shouldHide) {
                card.style.display = 'none';
                card.setAttribute('data-kf-hidden', '1');
            } else {
                card.style.display = '';
                card.removeAttribute('data-kf-hidden');
            }
        });
    }

    // =====================================================================
    // FETLIFE KINKSTER DIRECTORY FILTER - SETTINGS & OVERRIDE INJECTION
    // =====================================================================
    (function() {
        'use strict';

        const flOverrides = JSON.parse(localStorage.getItem('fl_kinkster_overrides')) || {
            overrideAds: false,
            overrideVerified: false,
            overrideSupporter: false,
            overrideEmployee: false,
            overrideLinks: false
        };

        function injectFLOverrides(settings) {
            const script = document.createElement('script');
            script.textContent = `
                (function(settings) {
                    const applyOverrides = () => {
                        if (window.FL && window.FL.user && window.FL.features) {
                            if (settings.overrideAds) {
                                window.FL.user.showAds = false;
                            }
                            if (settings.overrideVerified) {
                                window.FL.user.isProfileVerified = true;
                            }
                            if (settings.overrideSupporter) {
                                window.FL.user.isSupporter = true;
                                window.FL.user.supportDaysLeft = 10;
                            }
                            if (settings.overrideEmployee) {
                                window.FL.user.isEmployee = true;
                            }
                            if (settings.overrideLinks) {
                                window.FL.features.restrictLinks = false;
                            }
                        }
                    };

                    applyOverrides();
                    let checkInterval = setInterval(applyOverrides, 50);
                    setTimeout(() => clearInterval(checkInterval), 3000);
                    
                })(${JSON.stringify(settings)});
            `;
            
            (document.head || document.documentElement).appendChild(script);
            script.remove();
        }

        injectFLOverrides(flOverrides);

        window.buildOverrideSettingsUI = function(settingsContainer) {
            const sectionWrapper = document.createElement('div');
            sectionWrapper.id = "fl-overrides-section";
            sectionWrapper.style.marginTop = '25px';
            sectionWrapper.style.paddingTop = '15px';
            sectionWrapper.style.borderTop = '1px solid #333';
            sectionWrapper.style.display = 'flex';
            sectionWrapper.style.flexDirection = 'column';
            sectionWrapper.style.gap = '12px';

            const sectionHeader = document.createElement('h3');
            sectionHeader.textContent = "Data Injection Overrides";
            sectionHeader.style.color = "#eee";
            sectionHeader.style.margin = '0 0 10px 0';
            sectionHeader.style.fontSize = '16px';
            sectionWrapper.appendChild(sectionHeader);

            const saveSettings = () => {
                localStorage.setItem('fl_kinkster_overrides', JSON.stringify(flOverrides));
            };

            const createToggle = (id, labelText, settingKey) => {
                const row = document.createElement('div');
                row.style.display = 'flex';
                row.style.alignItems = 'center';

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.id = id;
                checkbox.checked = flOverrides[settingKey];
                checkbox.style.marginRight = '10px';
                checkbox.style.cursor = 'pointer';

                checkbox.addEventListener('change', (e) => {
                    flOverrides[settingKey] = e.target.checked;
                    saveSettings();
                });

                const label = document.createElement('label');
                label.htmlFor = id;
                label.textContent = labelText;
                label.style.color = '#ccc';
                label.style.cursor = 'pointer';
                label.style.fontSize = '14px';
                label.style.userSelect = 'none';

                row.appendChild(checkbox);
                row.appendChild(label);
                sectionWrapper.appendChild(row);
            };

            createToggle('toggle-fl-ads', 'Disable Ads (showAds: false)', 'overrideAds');
            createToggle('toggle-fl-verified', 'Verified Profile (isProfileVerified: true)', 'overrideVerified');
            createToggle('toggle-fl-supporter', 'Supporter Status (isSupporter: true, 10 Days Left)', 'overrideSupporter');
            createToggle('toggle-fl-employee', 'Employee Status (isEmployee: true)', 'overrideEmployee');
            createToggle('toggle-fl-links', 'Unrestrict Links (restrictLinks: false)', 'overrideLinks');

            const refreshNote = document.createElement('span');
            refreshNote.textContent = "* Page refresh required after toggling overrides.";
            refreshNote.style.color = '#888';
            refreshNote.style.fontSize = '12px';
            refreshNote.style.marginTop = '5px';
            refreshNote.style.fontStyle = 'italic';
            sectionWrapper.appendChild(refreshNote);

            settingsContainer.appendChild(sectionWrapper);
        };
    })();
    // =====================================================================

    function buildTypePanel() {
        if (document.getElementById(PANEL_ID)) return;
        
        const panel = document.createElement('div');
        panel.id = PANEL_ID;
        panel.innerHTML = `
            <header>
                <strong>Directory Filter Settings</strong>
                <button type="button" data-act="close">Close</button>
            </header>
            <div style="padding:16px; overflow-y: auto; flex: 1;">
                <div class="cat">Hide Profiles by Sex</div>
                <div class="grid-cb" id="kf-sex-grid"></div>
                
                <div style="margin-top: 24px;" class="cat">Location Inclusion Filter</div>
                <label style="padding: 4px 0; margin-bottom: 8px;">
                    <input type="checkbox" id="kf-loc-enable" ${settings.enableLocationFilter ? 'checked' : ''}>
                    Enable Location Keyword Filter
                </label>
                <div style="font-size: 11.5px; color:#999; margin-bottom: 8px; line-height: 1.4;">
                    Only show profiles containing at least one of these allowed locations. Separate keywords with commas.
                </div>
                <textarea id="kf-loc-keywords" rows="3" style="width:100%; box-sizing: border-box; background:#222; color:#eee; border:1px solid #444; border-radius:4px; padding:8px; resize:vertical;">${settings.locationKeywords}</textarea>
                
                <div style="margin-top: 24px; display:flex; justify-content: flex-end;">
                    <button type="button" data-act="save" style="background: #c53030; color: white; border:none; padding: 10px 20px; font-weight:bold; font-size: 14px;">Save & Apply</button>
                </div>
            </div>
        `;

        const grid = panel.querySelector('#kf-sex-grid');
        GENDERS.forEach(g => {
            const lab = document.createElement('label');
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.value = g.id;
            cb.checked = settings.hiddenSexes[g.id] === true;
            
            lab.appendChild(cb);
            lab.appendChild(document.createTextNode(g.label));
            grid.appendChild(lab);
        });

        panel.querySelector('[data-act="close"]').onclick = () => panel.classList.remove('open');
        panel.querySelector('[data-act="save"]').onclick = () => {
            settings.enableLocationFilter = panel.querySelector('#kf-loc-enable').checked;
            settings.locationKeywords = panel.querySelector('#kf-loc-keywords').value;
            
            grid.querySelectorAll('input[type=checkbox]').forEach(cb => {
                settings.hiddenSexes[cb.value] = cb.checked;
            });
            
            GM_setValue(STORAGE_KEY, settings);
            applyFilter();
            panel.classList.remove('open');
        };

        // Render the Override settings UI right before the save button
        const scrollableContainer = panel.querySelector('div[style*="overflow-y: auto"]');
        const saveBtnContainer = panel.querySelector('div[style*="justify-content: flex-end"]');
        if (window.buildOverrideSettingsUI && scrollableContainer && saveBtnContainer) {
            const overrideBox = document.createElement('div');
            window.buildOverrideSettingsUI(overrideBox);
            scrollableContainer.insertBefore(overrideBox, saveBtnContainer);
        }

        const target = document.body;
        target.appendChild(panel);

        if (!document.getElementById(FAB_ID)) {
            const fab = document.createElement('button');
            fab.id = FAB_ID;
            fab.type = 'button';
            fab.textContent = 'Directory Filter';
            fab.onclick = () => panel.classList.toggle('open');
            target.appendChild(fab);
        }
    }

    function ensureDom() {
        ensureStyles();
        buildTypePanel();
        applyFilter();
    }

    document.addEventListener("turbo:load", ensureDom);
    document.addEventListener("turbo:render", ensureDom);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', ensureDom);
    } else {
        ensureDom();
    }

    const observer = new MutationObserver((mutations) => {
        let shouldApply = false;
        for (let m of mutations) {
            if (m.addedNodes.length > 0) {
                for (let n of m.addedNodes) {
                    if (n.nodeType === 1 && n.id !== PANEL_ID && n.id !== FAB_ID) {
                        shouldApply = true;
                        break;
                    }
                }
            }
            if (shouldApply) break;
        }
        if (shouldApply) {
            clearTimeout(window.kfFilterTimeout);
            window.kfFilterTimeout = setTimeout(applyFilter, 250);
        }
    });

    const startObserver = () => {
        if (document.body) {
            observer.observe(document.body, { childList: true, subtree: true });
        } else {
            setTimeout(startObserver, 100);
        }
    };
    startObserver();

})();
