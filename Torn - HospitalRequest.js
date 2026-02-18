// ==UserScript==
// @name         Torn - Pedido de Hospitalização (Discord)
// @namespace    https://torn.com/
// @version      1.0.0
// @description  Adiciona botão laranja na sidebar para enviar "Pedido de Hospitalização" para Discord com o teu XID e link do perfil.
// @match        https://www.torn.com/*
// @grant        GM_xmlhttpRequest
// @connect      discord.com
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';
  const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1473685827249901643/EZzoEJq7k2LzoW2FMkqX7AM8dRE0ZWz432f3HycB82uAagknwmj3KHEMAZhcRVyXO7D8';

  const BTN_ID = 'tt-hosp-request-btn';

  function safeText(s) {
    return (s || '').toString().trim();
  }

  function getUserFromSidebarOrFallback() {
  // 1) Fonte correcta: bloco Information na sidebar (o teu HTML)
      const sidebar = document.getElementById('sidebar');
      if (sidebar) {
          // Anchor do teu nome no bloco Information:
          // <a href="/profiles.php?XID=2418928" class="menu-value___gLaLR">Saint_Lucifer</a>
          const a = sidebar.querySelector(
              '.user-information___VBSOk a.menu-value___gLaLR[href*="profiles.php?XID="]'
          ) || sidebar.querySelector(
              'p.menu-info-row___YG31c a[href*="profiles.php?XID="]'
          );

          if (a) {
              const name = safeText(a.textContent);
              const href = a.getAttribute('href') || '';
              const fullLink = href.startsWith('http') ? href : `https://www.torn.com${href}`;
              const xidMatch = fullLink.match(/XID=(\d+)/i);
              const xid = xidMatch ? xidMatch[1] : null;
              return { name, xid, link: fullLink };
          }
      }

      // 2) Fallback: se estiveres num perfil (menos ideal, mas seguro)
      const m = window.location.href.match(/profiles\.php\?XID=(\d+)/i);
      const xid = m ? m[1] : null;
      const link = xid ? `https://www.torn.com/profiles.php?XID=${xid}` : 'https://www.torn.com/';
      return { name: 'Desconhecido', xid, link };
  }

  function postToDiscord(payload) {
    return new Promise((resolve, reject) => {
      if (!DISCORD_WEBHOOK_URL || DISCORD_WEBHOOK_URL.includes('COLOCA_AQUI')) {
        reject(new Error('Webhook do Discord não configurado.'));
        return;
      }

      GM_xmlhttpRequest({
        method: 'POST',
        url: DISCORD_WEBHOOK_URL,
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify(payload),
        onload: (resp) => {
          if (resp.status >= 200 && resp.status < 300) resolve(resp);
          else reject(new Error(`Discord respondeu com status ${resp.status}: ${resp.responseText}`));
        },
        onerror: () => reject(new Error('Falha ao enviar para o Discord (erro de rede).')),
      });
    });
  }

  function buildMessage(user) {
    const who = user.name ? `**${user.name}**` : '**Utilizador**';
    const xid = user.xid ? ` (XID: \`${user.xid}\`)` : '';
    const link = user.link || 'https://www.torn.com/';

    return {
      content: `🏥 **Pedido de Hospitalização**\n${who}${xid}\n${link}`,
      // Se quiseres embeds em vez de content, diz que eu adapto.
    };
  }

  function injectStyles() {
    if (document.getElementById('tt-hosp-btn-style')) return;
    const style = document.createElement('style');
    style.id = 'tt-hosp-btn-style';
    style.textContent = `
  #${BTN_ID} {
    display: block;
    width: calc(100%);
    margin: 2px auto 0 auto;
    padding: 6px 8px;
    border: 0;
    border-radius: 1.5px;
    background: #ff8c00;
    color: #111;
    font-weight: 700;
    font-size: 12px;
    cursor: pointer;
    text-align: center;
    line-height: 1.15;
    box-shadow: 0 1px 0 rgba(0,0,0,.25);
    user-select: none;
  }
  #${BTN_ID}:hover { filter: brightness(1.05); }
  #${BTN_ID}:active { transform: translateY(1px); }
  #${BTN_ID}[data-sending="1"] {
    opacity: .75;
    cursor: progress;
  }
`;
    document.head.appendChild(style);
  }

  function findSidebarInsertPoint() {
    // Tenta inserir no bloco “Information”, mas sem depender de classes “random”
    // 1) Sidebar principal
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return null;

    // 2) Tenta encontrar o título "Information"
    const infoTitle = Array.from(sidebar.querySelectorAll('h2')).find(h => safeText(h.textContent).toLowerCase() === 'information');
    if (infoTitle) {
      // inserir no container do “Information”
      const container = infoTitle.closest('div')?.parentElement; // header -> toggle-block
      // Vamos tentar inserir no conteúdo visível mais abaixo
      const toggleContent = container?.querySelector('.toggle-content___BJ9Q9') || container?.parentElement?.querySelector('.toggle-content___BJ9Q9');
      if (toggleContent) return toggleContent;
    }

    // fallback: no topo da sidebar
    return sidebar;
  }

  function createButton() {
    if (document.getElementById(BTN_ID)) return;

    const btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.type = 'button';
    btn.innerHTML = `<b>Ask Hospital</b>`;

    btn.addEventListener('click', async () => {
      const user = getUserFromSidebarOrFallback();
      const payload = buildMessage(user);

      btn.setAttribute('data-sending', '1');
      const old = btn.innerHTML;
      btn.innerHTML = `⏳ A enviar...<small>Pedido de Hospitalização</small>`;

      try {
        await postToDiscord(payload);
        btn.innerHTML = `✅ Enviado!<small>Pedido de Hospitalização</small>`;
        setTimeout(() => { btn.innerHTML = old; }, 1800);
      } catch (e) {
        console.error('[TT Hosp Request] Erro:', e);
        btn.innerHTML = `❌ Falhou<small>${safeText(e.message)}</small>`;
        setTimeout(() => { btn.innerHTML = old; }, 2600);
        alert(`Falhou ao enviar para o Discord:\n${e.message}`);
      } finally {
        btn.removeAttribute('data-sending');
      }
    });

    const where = findSidebarInsertPoint();
    if (!where) return;

    // Colocar o botão logo no início do container escolhido
    where.prepend(btn);
  }

  function init() {
    injectStyles();
    createButton();
  }

  // Torn é SPA-ish em alguns pontos; observar mudanças
  init();
  const obs = new MutationObserver(() => {
    // se o botão desaparecer (re-render), reinjectar
    if (!document.getElementById(BTN_ID)) init();
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });

})();
