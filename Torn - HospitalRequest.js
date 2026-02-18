// ==UserScript==
// @name         Torn - Pedido de Hospitalização (Discord)
// @namespace    https://torn.com/
// @version      2.2.1
// @description  Botão no bloco Information: pergunta 1x por Nome+XID, depois é só clicar. Shift+Click para alterar. Cache renova +1 mês.
// @match        https://www.torn.com/*
// @grant        GM_xmlhttpRequest
// @connect      discord.com
// @run-at       document-end
// ==/UserScript==
//

(function () {
  'use strict';

  const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1473741022352904246/6P8JHKL-qUV82uuyZUn8zP2SP2wrwj4UJQPtCH7g_uFpLmRCX2qhF9ZSeSGMlXDxdGrD';
  const BTN_ID = 'tt-hosp-request-btn';

  const LS_NAME_KEY  = 'tt_hosp_target_name';
  const LS_XID_KEY   = 'tt_hosp_target_xid';
  const LS_VALID_KEY = 'tt_hosp_valid_until';

  function oneMonthFromNow() {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d.getTime();
  }

  function renewCacheIfExists() {
    const name = localStorage.getItem(LS_NAME_KEY);
    const xid  = localStorage.getItem(LS_XID_KEY);
    if (name && xid) localStorage.setItem(LS_VALID_KEY, String(oneMonthFromNow()));
  }

  function loadCached() {
    const name = localStorage.getItem(LS_NAME_KEY);
    const xid  = localStorage.getItem(LS_XID_KEY);
    const validUntil = parseInt(localStorage.getItem(LS_VALID_KEY) || '0', 10);

    if (!name || !xid) return null;
    if (Date.now() > validUntil) return null;

    return { name, xid };
  }

  function saveCache(name, xid) {
    localStorage.setItem(LS_NAME_KEY, String(name).trim());
    localStorage.setItem(LS_XID_KEY, String(xid).trim());
    localStorage.setItem(LS_VALID_KEY, String(oneMonthFromNow()));
  }

  function postToDiscord(payload) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'POST',
        url: DISCORD_WEBHOOK_URL,
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify(payload),
        onload: (resp) => {
          if (resp.status >= 200 && resp.status < 300) resolve(resp);
          else reject(new Error(`Discord respondeu com status ${resp.status}`));
        },
        onerror: () => reject(new Error('Erro de rede ao enviar para o Discord')),
      });
    });
  }

  function buildMessage(targetName, targetXid) {
    const link = `https://www.torn.com/profiles.php?XID=${targetXid}`;
    return {
      content: `🏥 **Pedido de Hospitalização**\n**Alvo:** ${targetName} (XID: \`${targetXid}\`)\n${link}`,
    };
  }

  function injectStyles() {
    if (document.getElementById('tt-hosp-btn-style')) return;

    const style = document.createElement('style');
    style.id = 'tt-hosp-btn-style';
    style.textContent = `
      #${BTN_ID}{
        display:block;
        width:100%;
        margin: 2px 0 0 0;
        padding: 6px 8px;
        border:0;
        border-radius:3px;
        background:#ff8c00;
        color:#111;
        font-weight:700;
        font-size:12px;
        cursor:pointer;
        text-align:center;
        line-height:1.15;
        box-shadow:0 1px 0 rgba(0,0,0,.25);
        user-select:none;
      }
      #${BTN_ID}:hover{filter:brightness(1.05);}
      #${BTN_ID}[data-sending="1"]{opacity:.7;cursor:progress;}
    `;
    document.head.appendChild(style);
  }

  // Colocar o botão no bloco "Information" sem depender de classes nonce
  function findInformationContainer() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return null;

    // Procura por um h2 cujo texto seja "Information"
    const h2s = sidebar.querySelectorAll('h2');
    for (const h2 of h2s) {
      if ((h2.textContent || '').trim().toLowerCase() === 'information') {
        // tenta encontrar o content logo a seguir (o wrapper pode variar)
        const wrapper = h2.closest('div');
        const candidate =
          wrapper?.parentElement?.querySelector('[class*="toggle-content"]') ||
          wrapper?.parentElement ||
          sidebar;
        return candidate;
      }
    }
    return sidebar;
  }

  async function ensureTarget(forceAsk = false) {
    if (!forceAsk) {
      const cached = loadCached();
      if (cached) return cached;
    }

    const cached = loadCached();
    const xid = prompt('Player ID:', cached?.xid || '');
    if (!xid) return null;

    const name = prompt('Player Name:', cached?.name || '');
    if (!name) return null;


    // validação simples do XID
    if (!/^\d+$/.test(xid.trim())) {
      alert('ID invalid');
      return null;
    }

    saveCache(name, xid);
    return { name: name.trim(), xid: xid.trim() };
  }

  function createButton() {
    if (document.getElementById(BTN_ID)) return;

    const btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.type = 'button';
    btn.textContent = 'Ask Hospital';

    btn.title = 'Click: send | Shift+Click: reconfigure';

    btn.addEventListener('click', async (ev) => {
      // Shift+Click (ou Alt+Click) força reconfiguração
      const forceAsk = ev.shiftKey || ev.altKey;

      // “Sempre que o script for usado” => renovar também ao click
      renewCacheIfExists();

      const target = await ensureTarget(forceAsk);
      if (!target) return;

      // renova validade +1 mês sempre que é usado
      saveCache(target.name, target.xid);

      const payload = buildMessage(target.name, target.xid);

      btn.setAttribute('data-sending', '1');
      const old = btn.textContent;
      btn.textContent = 'Sending...';

      try {
        await postToDiscord(payload);
        btn.textContent = 'Send!';
        setTimeout(() => { btn.textContent = old; }, 1400);
      } catch (e) {
        console.error(e);
        btn.textContent = 'Falhou';
        setTimeout(() => { btn.textContent = old; }, 2000);
        alert(`Faild to Send.\n${e.message || e}`);
      } finally {
        btn.removeAttribute('data-sending');
      }
    });

    const where = findInformationContainer();
    if (!where) return;
    where.prepend(btn);
  }

  function init() {
    // sempre que a página carrega e há dados, estende +1 mês
    renewCacheIfExists();
    injectStyles();
    createButton();
  }

  init();

  // Torn faz re-render; se o botão desaparecer, repõe
  const obs = new MutationObserver(() => {
    if (!document.getElementById(BTN_ID)) createButton();
  });
  obs.observe(document.body, { childList: true, subtree: true });

})();
