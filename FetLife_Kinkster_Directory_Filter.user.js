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
        // Broadened to catch full words like "Female" up to 12 characters
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
                
                // Hard depth limit prevents leeching up to the body/main container
                while (p && p !== document.body && steps < 8) {
                    steps++;
                    
                    if (p.tagName === 'MAIN' || p.tagName === 'HEADER' || p.id === 'main-content') break;

                    const text = p.innerText || p.textContent || '';
                    if (text.length > 800) break; // Safety ceiling, likely hit the grid wrapper
                    
                    if (regex.test(text)) {
                        validCard = p;
                        break; // Stop going up immediately when we find the demographic text
                    }
                    
                    p = p.parentElement;
                }
                
                if (validCard) {
                    // Try to snap to the logical FetLife card wrapper if possible
                    let wrapper = validCard.closest('article') || 
                                  validCard.closest('.relative') || 
                                  validCard;
                    
                    if ((wrapper.innerText || '').length < 1000) {
                        cards.add(wrapper);
                    }
                }
            } catch (e) {}
        });
        
        // Deduplicate overlapping wrappers
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
            
            // Replaced CSS attribute injection with absolute inline styling to bypass Tailwind overrides
            if (shouldHide) {
                card.style.display = 'none';
                card.setAttribute('data-kf-hidden', '1');
            } else {
                card.style.display = '';
                card.removeAttribute('data-kf-hidden');
            }
        });
    }

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
