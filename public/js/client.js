(() => {
  const APP_URL = 'https://club-openwines.netlify.app/';
  const PREFS_BY_TYPE = {
    'Tintos': ['Malbec', 'Cabernet Sauvignon', 'Cabernet Franc', 'Syrah', 'Merlot', 'Petit Verdot', 'Bonarda', 'Pinot Noir', 'Tempranillo', 'Garnacha'],
    'Blancos': ['Sauvignon Blanc', 'Torrontés', 'Viognier', 'Chardonnay', 'Blanco Dulce'],
    'Rosados': ['Rosé'],
    'Espumantes': ['Espumante Brut', 'Extra Brut', 'Brut Rosé'],
    'Blends': ['Blend'],
    'Otros': ['Ancellotta'],
  };
  const PREFS = Object.values(PREFS_BY_TYPE).flat();
  const LEVEL_THRESHOLDS = { Bronce: 0, Plata: 1000, Oro: 3000 };
  const BENEFITS = {
    Bronce: '5% off en tu próxima compra.',
    Plata: '10% off permanente + envío gratis desde 6 botellas + ves los combos 24hs antes.',
    Oro: '15% off permanente + primera opción en partidas boutique + ves los combos 48hs antes + evento anual + regalo de cumpleaños.',
  };
  const LEVEL_INFO = [
    { key: 'Bronce', range: '0 – 999 puntos', benefits: ['5% off en tu próxima compra'] },
    { key: 'Plata', range: '1.000 – 2.999 puntos', benefits: ['10% off permanente', 'Envío gratis desde 6 botellas', 'Ves los combos de la semana 24hs antes'] },
    { key: 'Oro', range: '3.000+ puntos', benefits: ['15% off permanente', 'Primera opción en partidas boutique', 'Ves los combos de la semana 48hs antes', 'Evento anual exclusivo', 'Regalo de cumpleaños'] },
  ];

  let state = null; // último payload de /api/client-data
  let countdownTimers = [];
  let cart = {}; // combo_id -> cantidad, para armar un pedido de varios combos antes de enviarlo
  let appliedCoupon = null; // cupón aplicado al carrito
  let selectedPrize = null; // premio seleccionado en scratch card
  let scratchModalShown = false; // flag para evitar que se abra múltiples veces

  const $ = (sel) => document.querySelector(sel);
  const loginScreen = $('#login-screen');
  const dashboard = $('#dashboard');

  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 3500);
  }

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Error de conexión');
    return data;
  }

  // ---------- Login ----------
  $('#form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const phone = $('#login-phone').value.trim();
    const name = $('#login-name').value.trim();
    $('#login-error').classList.add('hidden');
    try {
      const data = await api('/api/client-login', { method: 'POST', body: JSON.stringify({ phone, name }) });
      if (data.needsName) {
        $('#name-field').classList.remove('hidden');
        $('#login-name').focus();
        return;
      }
      localStorage.setItem('ow_phone', data.client.phone);
      await loadDashboard(data.client.phone);
    } catch (err) {
      $('#login-error').textContent = err.message;
      $('#login-error').classList.remove('hidden');
    }
  });

  $('#btn-logout').addEventListener('click', () => {
    localStorage.removeItem('ow_phone');
    location.reload();
  });

  // ---------- Dashboard ----------
  async function loadDashboard(phone) {
    try {
      const data = await api(`/api/client-data?phone=${encodeURIComponent(phone)}`);
      state = data;
      renderDashboard(data);
      loginScreen.classList.add('hidden');
      dashboard.classList.remove('hidden');
      $('#btn-logout').classList.remove('hidden');
    } catch (err) {
      localStorage.removeItem('ow_phone');
      toast(err.message);
    }
  }

  function renderDashboard(data) {
    const { client, level, nextLevel, pointsToNext, welcomeDiscount } = data;
    $('#client-name').textContent = `Hola, ${client.name.split(' ')[0]}`;
    $('#points-value').textContent = client.points;
    const badge = $('#level-badge');
    badge.textContent = level;
    badge.className = `level-badge level-${level}`;
    $('#welcome-badge').classList.toggle('hidden', !welcomeDiscount);
    $('#benefits-text').textContent = BENEFITS[level];

    const welcomeCard = $('#welcome-referral-card');
    if (welcomeDiscount && (client.origin === 'referido' || client.origin === 'restaurante')) {
      const who = client.origin === 'referido'
        ? (client.origin_detail ? `${escapeHtml(client.origin_detail)} te recomendó` : 'Te recomendaron')
        : (client.origin_detail ? `Llegaste desde ${escapeHtml(client.origin_detail)}` : 'Llegaste por uno de nuestros restaurantes aliados');
      $('#welcome-referral-text').innerHTML = `${who} Club Openwines. Tenés <strong>15% OFF</strong> en tu primera compra.`;
      welcomeCard.classList.remove('hidden');
    } else {
      welcomeCard.classList.add('hidden');
    }

    if (nextLevel) {
      const span = LEVEL_THRESHOLDS[nextLevel] - LEVEL_THRESHOLDS[level];
      const progressed = span - pointsToNext;
      const pct = Math.max(0, Math.min(100, Math.round((progressed / span) * 100)));
      $('#progress-fill').style.width = pct + '%';
      $('#progress-text').textContent = `Te faltan ${pointsToNext} puntos para ${nextLevel}.`;
      $('#progress-wrap').classList.remove('hidden');
    } else {
      $('#progress-wrap').classList.add('hidden');
    }

    // Perfil
    if (!client.profile_complete) {
      $('#profile-card').classList.remove('hidden');
      const wrap = $('#prefs-options');
      wrap.innerHTML = Object.entries(PREFS_BY_TYPE).map(([type, prefs]) => `
        <div style="margin-bottom:16px;">
          <div style="font-weight:600;font-size:0.9em;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">${type}</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;">
            ${prefs.map((p) => `
              <label style="display:flex;align-items:center;gap:6px;font-weight:400;background:var(--cream);padding:8px 14px;border-radius:20px;cursor:pointer;border:1px solid transparent;transition:all 0.2s;">
                <input type="checkbox" value="${p}" style="width:auto;margin:0;cursor:pointer;">
                <span>${p}</span>
              </label>
            `).join('')}
          </div>
        </div>
      `).join('');
    } else {
      $('#profile-card').classList.add('hidden');
    }

    // Preferencias de vino
    if (client.profile_complete && client.prefs && client.prefs.length) {
      $('#prefs-card').classList.remove('hidden');
      const prefsHtml = Object.entries(PREFS_BY_TYPE).map(([type, typePrefs]) => {
        const selected = typePrefs.filter(p => client.prefs.includes(p));
        if (!selected.length) return '';
        return `
          <div style="margin-bottom:12px;">
            <div style="font-weight:600;font-size:0.85em;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">${type}</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;">
              ${selected.map(p => `<span style="background:var(--gold);color:#000;padding:4px 10px;border-radius:16px;font-size:0.9em;">${p}</span>`).join('')}
            </div>
          </div>
        `;
      }).join('');
      $('#prefs-display').innerHTML = prefsHtml;
    } else {
      $('#prefs-card').classList.add('hidden');
    }

    renderLevelsModal(level);
    renderPrefsModal(client);
    renderCombos(data);
    renderWineries(data.wineries);
    renderRestaurants(data.restaurants);
    renderMoments(data.moments);
    setupPushOptIn();
    //  desactivado - modal siempre oculto
  }

  // ---------- Niveles y beneficios ----------
  function renderLevelsModal(currentLevel) {
    $('#levels-list').innerHTML = LEVEL_INFO.map((lvl) => `
      <div class="level-info-card ${lvl.key === currentLevel ? 'current' : ''}">
        <div class="flex-between">
          <span class="level-badge level-${lvl.key}">${lvl.key}</span>
          ${lvl.key === currentLevel ? '<span class="chip">Tu nivel actual</span>' : ''}
        </div>
        <p class="muted" style="margin:8px 0 4px;">${lvl.range}</p>
        <ul style="margin:0;padding-left:18px;">
          ${lvl.benefits.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}
        </ul>
      </div>
    `).join('');
  }
  $('#btn-show-levels').addEventListener('click', () => $('#levels-modal').classList.remove('hidden'));
  $('#levels-close').addEventListener('click', () => $('#levels-modal').classList.add('hidden'));

  // ---------- Preferencias de vino ----------
  function renderPrefsModal(client) {
    const wrap = $('#prefs-edit-options');
    const currentPrefs = client.prefs || [];
    wrap.innerHTML = Object.entries(PREFS_BY_TYPE).map(([type, prefs]) => `
      <div style="margin-bottom:16px;">
        <div style="font-weight:600;font-size:0.9em;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">${type}</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">
          ${prefs.map((p) => `
            <label style="display:flex;align-items:center;gap:6px;font-weight:400;background:var(--cream);padding:8px 14px;border-radius:20px;cursor:pointer;border:1px solid transparent;transition:all 0.2s;">
              <input type="checkbox" value="${p}" style="width:auto;margin:0;cursor:pointer;" ${currentPrefs.includes(p) ? 'checked' : ''}>
              <span>${p}</span>
            </label>
          `).join('')}
        </div>
      </div>
    `).join('');
  }

  $('#btn-edit-prefs').addEventListener('click', () => $('#prefs-modal').classList.remove('hidden'));
  $('#prefs-close').addEventListener('click', () => $('#prefs-modal').classList.add('hidden'));
  $('#prefs-cancel').addEventListener('click', () => $('#prefs-modal').classList.add('hidden'));

  $('#form-prefs-edit').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state || !state.client) return;
    const prefs = Array.from(document.querySelectorAll('#prefs-edit-options input:checked')).map((i) => i.value);
    try {
      await api('/api/update-preferences', {
        method: 'POST',
        body: JSON.stringify({ phone: state.client.phone, prefs }),
      });
      toast('Preferencias actualizadas ✓');
      $('#prefs-modal').classList.add('hidden');
      state.client.prefs = prefs;
      renderDashboard(state);
    } catch (err) { toast(err.message); }
  });

  // Bodegas y restaurantes arrancan colapsados para no restarle protagonismo
  // a los combos de la semana.
  function setupSectionToggle(buttonId, panelId) {
    const btn = $(buttonId);
    const panel = $(panelId);
    btn.addEventListener('click', () => {
      const isHidden = panel.classList.toggle('hidden');
      btn.setAttribute('aria-expanded', String(!isHidden));
    });
  }
  setupSectionToggle('#toggle-wineries', '#wineries-grid');
  setupSectionToggle('#toggle-restaurants', '#restaurants-list');
  setupSectionToggle('#toggle-moments', '#moments-grid');

  $('#form-profile').addEventListener('submit', async (e) => {
    e.preventDefault();
    const birthday = $('#profile-birthday').value;
    const prefs = Array.from(document.querySelectorAll('#prefs-options input:checked')).map((i) => i.value);
    if (!prefs.length) return toast('Elegí al menos una preferencia');
    try {
      const data = await api('/api/complete-profile', {
        method: 'POST',
        body: JSON.stringify({ phone: state.client.phone, birthday, prefs }),
      });
      if (data.bonusApplied) toast('¡Sumaste 150 puntos!');
      await loadDashboard(state.client.phone);
    } catch (err) {
      toast(err.message);
    }
  });

  // ---------- Combos ----------
  function renderCombos(data) {
    countdownTimers.forEach(clearInterval);
    countdownTimers = [];
    const grid = $('#combos-grid');
    if (!data.combos.length) {
      grid.innerHTML = '<p class="muted">Todavía no hay combos cargados.</p>';
      return;
    }
    grid.innerHTML = data.combos.map((c) => `
      <div class="combo-card ${c.locked ? 'locked' : ''}" data-id="${c.id}">
        ${c.image_url ? `<img class="combo-image" src="${escapeAttr(c.image_url)}" alt="${escapeAttr(c.name)}">` : ''}
        <div class="combo-body">
          <h4>${escapeHtml(c.name)}</h4>
          <p class="muted">${c.bottles} botellas</p>
          <p>${escapeHtml(c.description || '')}</p>
          <p class="price">$${Number(c.price).toLocaleString('es-AR')}</p>
          ${c.locked ? `
            <div class="lock-overlay">
              <div class="muted">Disponible para tu nivel en</div>
              <div class="countdown" data-unlock="${c.unlocksAt}">--:--:--</div>
            </div>` : `
            <div class="qty-stepper">
              <button type="button" class="qty-btn qty-minus" data-id="${c.id}">−</button>
              <span class="qty-value" data-qty-for="${c.id}">${cart[c.id] || 0}</span>
              <button type="button" class="qty-btn qty-plus" data-id="${c.id}">+</button>
            </div>`}
        </div>
      </div>
    `).join('');

    grid.querySelectorAll('.countdown').forEach((el) => {
      const target = new Date(el.dataset.unlock).getTime();
      const tick = () => {
        const diff = target - Date.now();
        if (diff <= 0) {
          clearInterval(timer);
          loadDashboard(state.client.phone);
          return;
        }
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        el.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      };
      tick();
      const timer = setInterval(tick, 1000);
      countdownTimers.push(timer);
    });

    grid.querySelectorAll('.qty-plus').forEach((btn) => {
      btn.addEventListener('click', () => changeQty(btn.dataset.id, 1));
    });
    grid.querySelectorAll('.qty-minus').forEach((btn) => {
      btn.addEventListener('click', () => changeQty(btn.dataset.id, -1));
    });

    renderCartBar();
  }

  // ---------- Carrito (varios combos en un solo pedido) ----------
  function cartCount() {
    return Object.values(cart).reduce((sum, qty) => sum + qty, 0);
  }
  function cartTotal() {
    const raw = Object.entries(cart).reduce((sum, [id, qty]) => {
      const combo = state.combos.find((c) => c.id === id);
      return combo ? sum + combo.price * qty : sum;
    }, 0);
    const discount = state.discountPercent || 0;
    let total = Math.round(raw * (1 - discount / 100));
    if (appliedCoupon) total = Math.max(0, total - appliedCoupon.discount);
    return total;
  }
  function changeQty(comboId, delta) {
    const next = Math.max(0, (cart[comboId] || 0) + delta);
    if (next === 0) delete cart[comboId];
    else cart[comboId] = next;
    document.querySelectorAll(`[data-qty-for="${comboId}"]`).forEach((el) => { el.textContent = next; });
    renderCartBar();
    if (!$('#cart-modal').classList.contains('hidden')) renderCartItems();
  }
  function renderCartBar() {
    const count = cartCount();
    const bar = $('#cart-bar');
    if (count === 0) { bar.classList.add('hidden'); return; }
    bar.classList.remove('hidden');
    $('#cart-bar-summary').textContent = `${count} combo${count > 1 ? 's' : ''} seleccionado${count > 1 ? 's' : ''} · $${cartTotal().toLocaleString('es-AR')}`;
  }
  function renderCartItems() {
    const entries = Object.entries(cart).filter(([, qty]) => qty > 0);
    $('#cart-items').innerHTML = entries.length ? entries.map(([id, qty]) => {
      const combo = state.combos.find((c) => c.id === id);
      if (!combo) return '';
      const subtotal = combo.price * qty;
      return `
        <div class="cart-item-row">
          <div>
            <strong>${escapeHtml(combo.name)}</strong>
            <div class="qty-stepper">
              <button type="button" class="qty-btn qty-minus" data-id="${id}">−</button>
              <span class="qty-value" data-qty-for="${id}">${qty}</span>
              <button type="button" class="qty-btn qty-plus" data-id="${id}">+</button>
            </div>
          </div>
          <div>$${subtotal.toLocaleString('es-AR')}</div>
        </div>`;
    }).join('') : '<p class="muted">Todavía no agregaste combos.</p>';

    // Calcular y mostrar desglose de precios
    const raw = Object.entries(cart).reduce((sum, [id, qty]) => {
      const combo = state.combos.find((c) => c.id === id);
      return combo ? sum + combo.price * qty : sum;
    }, 0);

    $('#cart-subtotal').textContent = `$${raw.toLocaleString('es-AR')}`;

    // Mostrar descuento referido
    const referralDiscount = state.discountPercent || 0;
    if (referralDiscount > 0) {
      const discountAmount = Math.round(raw * (referralDiscount / 100));
      $('#referral-discount').style.display = 'flex';
      $('#referral-discount-amount').textContent = discountAmount.toLocaleString('es-AR');
    } else {
      $('#referral-discount').style.display = 'none';
    }

    // Mostrar descuento cupón
    if (appliedCoupon && appliedCoupon.discount > 0) {
      $('#coupon-discount').style.display = 'flex';
      $('#coupon-discount-amount').textContent = appliedCoupon.discount.toLocaleString('es-AR');
    } else {
      $('#coupon-discount').style.display = 'none';
    }

    $('#cart-total').textContent = `$${cartTotal().toLocaleString('es-AR')}`;

    $('#cart-items').querySelectorAll('.qty-plus').forEach((btn) => {
      btn.addEventListener('click', () => changeQty(btn.dataset.id, 1));
    });
    $('#cart-items').querySelectorAll('.qty-minus').forEach((btn) => {
      btn.addEventListener('click', () => changeQty(btn.dataset.id, -1));
    });
  }
  function openCartModal() {
    if (!cartCount()) return toast('Todavía no agregaste combos');
    renderCartItems();
    $('#cart-modal').classList.remove('hidden');
  }
  $('#cart-bar-open').addEventListener('click', openCartModal);
  $('#cart-modal-close').addEventListener('click', () => $('#cart-modal').classList.add('hidden'));

  $('#cart-confirm-app').addEventListener('click', async () => {
    const entries = Object.entries(cart).filter(([, qty]) => qty > 0);
    if (!entries.length) return toast('Todavía no agregaste combos');
    const payment_method = $('#cart-payment').value;
    try {
      for (const [combo_id, quantity] of entries) {
        await api('/api/create-order', {
          method: 'POST',
          body: JSON.stringify({ phone: state.client.phone, combo_id, quantity, payment_method, couponCode: appliedCoupon?.code }),
        });
      }
      if (appliedCoupon) {
        await api('/api/apply-coupon', {
          method: 'POST',
          body: JSON.stringify({ phone: state.client.phone, couponCode: appliedCoupon.code, markAsUsed: true }),
        });
      }
      cart = {};
      appliedCoupon = null;
      $('#cart-modal').classList.add('hidden');
      toast('¡Pedido confirmado! Te contactamos para coordinar.');
      await loadDashboard(state.client.phone);
    } catch (err) {
      toast(err.message);
    }
  });

  $('#cart-send-whatsapp').addEventListener('click', () => {
    if (!state.business.whatsapp) return toast('WhatsApp no configurado todavía');
    const entries = Object.entries(cart).filter(([, qty]) => qty > 0);
    if (!entries.length) return toast('Todavía no agregaste combos');

    // Calcular totales
    const raw = Object.entries(cart).reduce((sum, [id, qty]) => {
      const combo = state.combos.find((c) => c.id === id);
      return combo ? sum + combo.price * qty : sum;
    }, 0);

    const referralDiscount = state.discountPercent ? Math.round(raw * (state.discountPercent / 100)) : 0;
    const couponDiscount = appliedCoupon?.discount || 0;
    const total = cartTotal();

    const lines = entries.map(([id, qty]) => {
      const combo = state.combos.find((c) => c.id === id);
      return `• ${combo.name} x${qty} — $${(combo.price * qty).toLocaleString('es-AR')}`;
    });

    let message = `Hola! Soy ${state.client.name}, quiero hacer este pedido:\n${lines.join('\n')}\n`;
    message += `\n*Subtotal:* $${raw.toLocaleString('es-AR')}`;
    if (referralDiscount > 0) message += `\n*Descuento cliente referido (15%):* -$${referralDiscount.toLocaleString('es-AR')}`;
    if (couponDiscount > 0) message += `\n*Código de descuento:* -$${couponDiscount.toLocaleString('es-AR')}`;
    message += `\n\n*Total: $${total.toLocaleString('es-AR')}*`;

    const text = encodeURIComponent(message);
    window.open(`https://wa.me/${state.business.whatsapp}?text=${text}`, '_blank');
  });

  // ---------- Cupones ----------
  $('#btn-apply-coupon').addEventListener('click', async () => {
    const code = $('#cart-coupon').value.trim().toUpperCase();
    const status = $('#coupon-status');
    if (!code) return status.textContent = '❌ Ingresá un código';
    try {
      const data = await api('/api/apply-coupon', {
        method: 'POST',
        body: JSON.stringify({ phone: state.client.phone, couponCode: code }),
      });
      appliedCoupon = { code, discount: data.discountAmount };
      status.textContent = `✅ ${data.message}`;
      $('#cart-coupon').disabled = true;
      $('#btn-apply-coupon').disabled = true;
      renderCartItems();
    } catch (err) {
      status.textContent = `❌ ${err.message}`;
    }
  });

  // ---------- Referidos ----------
  $('#form-referral').addEventListener('submit', async (e) => {
    e.preventDefault();
    const friend_name = $('#ref-name').value.trim();
    const friend_phone = $('#ref-phone').value.trim();
    try {
      await api('/api/create-referral', {
        method: 'POST',
        body: JSON.stringify({
          referrer_phone: state.client.phone,
          referrer_name: state.client.name,
          friend_name,
          friend_phone,
        }),
      });
      const text = encodeURIComponent(
        `Hola ${friend_name}! Te invito al Club Openwines de nuestra vinoteca. Arrancás con 15% off en tu primera compra. Sumate acá: ${APP_URL} 🍷`
      );
      window.open(`https://wa.me/${friend_phone.replace(/\D/g, '')}?text=${text}`, '_blank');
      $('#form-referral').reset();
      toast('¡Invitación enviada!');
    } catch (err) {
      toast(err.message);
    }
  });

  // ---------- Bodegas ----------
  function renderWineries(wineries) {
    const grid = $('#wineries-grid');
    if (!wineries.length) { grid.innerHTML = '<p class="muted">Próximamente.</p>'; return; }
    grid.innerHTML = wineries.map((w) => `
      <div class="winery-card">
        ${w.logo_url ? `<div class="logo-wrap"><img class="logo" src="${escapeAttr(w.logo_url)}" alt="${escapeAttr(w.name)}"></div>` : ''}
        <h4>${escapeHtml(w.name)}</h4>
        <p class="muted">${escapeHtml(w.one_liner || '')}</p>
        ${w.our_line ? `<span class="chip">${escapeHtml(w.our_line)}</span>` : ''}
        <br><br>
        ${w.website_url
          ? `<a class="btn btn-outline" target="_blank" rel="noopener" href="/out.html?name=${encodeURIComponent(w.name)}&url=${encodeURIComponent(w.website_url)}">Conocer más</a>`
          : `<span class="muted">Próximamente</span>`}
      </div>
    `).join('');
  }

  // ---------- Restaurantes ----------
  function renderRestaurants(restaurants) {
    const wrap = $('#restaurants-list');
    if (!restaurants.length) { wrap.innerHTML = '<p class="muted">Próximamente.</p>'; return; }
    wrap.innerHTML = `<div class="grid">${restaurants.map((r) => `
      <div class="restaurant-card ${r.background_image_url ? 'has-bg' : ''}">
        ${r.background_image_url ? `<div class="bg-image" style="background-image:url('${escapeAttr(r.background_image_url)}')"></div>` : ''}
        <div class="restaurant-body">
          <h4>${escapeHtml(r.name)}</h4>
          ${renderRestaurantLocation(r)}
          ${r.wines_on_menu ? `<p>${escapeHtml(r.wines_on_menu)}</p>` : ''}
          ${r.instagram_url
            ? `<a class="btn btn-outline" target="_blank" rel="noopener" href="/out.html?name=${encodeURIComponent(r.name)}&url=${encodeURIComponent(r.instagram_url)}">Instagram</a>`
            : ''}
        </div>
      </div>
    `).join('')}</div>`;
  }

  function renderRestaurantLocation(r) {
    if (r.address && r.maps_url) {
      return `<p class="muted">📍 <a href="${escapeAttr(r.maps_url)}" target="_blank" rel="noopener">${escapeHtml(r.address)}</a></p>`;
    }
    if (r.address) return `<p class="muted">📍 ${escapeHtml(r.address)}</p>`;
    if (r.maps_url) return `<p class="muted">📍 <a href="${escapeAttr(r.maps_url)}" target="_blank" rel="noopener">Ver en el mapa</a></p>`;
    return '';
  }

  // ---------- Momentos Openwines ----------
  function renderMoments(moments) {
    const grid = $('#moments-grid');
    if (!moments || !moments.length) { grid.innerHTML = '<p class="muted">Todavía no hay fotos cargadas.</p>'; return; }
    grid.innerHTML = moments.map((m) => `
      <div class="moment-card">
        <img class="moment-image" src="${escapeAttr(m.image_url)}" alt="">
        <div class="moment-body">
          ${m.location ? `<p class="moment-caption">${escapeHtml(m.location)}</p>` : ''}
          ${m.winery ? `<p class="moment-caption">${escapeHtml(m.winery)}</p>` : ''}
        </div>
      </div>
    `).join('');
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function escapeAttr(str) { return escapeHtml(str); }

  // ---------- Notificaciones push ----------
  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
  }

  async function setupPushOptIn() {
    const banner = $('#push-opt-in');
    const text = $('#push-opt-in-text');
    const btn = $('#btn-toggle-push');
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !state.business.vapidPublicKey) {
      banner.classList.add('hidden');
      return;
    }
    if (Notification.permission === 'denied') {
      banner.classList.add('hidden');
      return;
    }
    let subscribed = false;
    try {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      subscribed = !!existing;
    } catch (e) { /* si falla la consulta, mostramos el estado "activar" por defecto */ }

    banner.classList.remove('hidden');
    if (subscribed) {
      text.textContent = '🔔 Notificaciones activadas.';
      btn.textContent = 'Desactivar';
      btn.className = 'btn btn-outline';
    } else {
      text.textContent = '🔔 Activá las notificaciones para enterarte apenas suben combos nuevos.';
      btn.textContent = 'Activar';
      btn.className = 'btn btn-gold';
    }
    btn.style.whiteSpace = 'nowrap';
    btn.style.padding = '6px 14px';
    btn.style.fontSize = '.85rem';
  }

  $('#btn-toggle-push').addEventListener('click', async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        await api('/api/unsubscribe-push', {
          method: 'POST',
          body: JSON.stringify({ phone: state.client.phone, endpoint: existing.endpoint }),
        });
        await existing.unsubscribe();
        toast('Notificaciones desactivadas');
      } else {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return toast('No activaste las notificaciones');
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(state.business.vapidPublicKey),
        });
        await api('/api/subscribe-push', {
          method: 'POST',
          body: JSON.stringify({ phone: state.client.phone, subscription: subscription.toJSON() }),
        });
        toast('¡Notificaciones activadas!');
      }
      setupPushOptIn();
    } catch (err) {
      toast('Error: ' + err.message);
    }
  });

  // ---------- Scratch Card ----------
  function createConfetti() {
    const confetti = $('#scratch-confetti');
    const emojis = ['🎉', '✨', '🎁', '🎊', '⭐', '💫', '🎈'];

    for (let i = 0; i < 20; i++) {
      const span = document.createElement('div');
      span.textContent = emojis[Math.floor(Math.random() * emojis.length)];
      span.style.cssText = `
        position: absolute;
        left: ${Math.random() * 100}%;
        top: -20px;
        font-size: ${20 + Math.random() * 20}px;
        animation: fall ${2 + Math.random() * 1}s ease-in forwards;
        opacity: 0.8;
      `;
      confetti.appendChild(span);
    }
  }

  function (data) {
    // TEST: No hacer nada por ahora
    return;

    btn.addEventListener('click', () => {
      $('#scratch-modal').classList.remove('hidden');
      btn.style.transform = 'scale(0.95)';
      setTimeout(() => {
        btn.style.transform = 'scale(1)';
      }, 100);

      const isBirthday = client.birthday && new Date().toISOString().slice(5, 10) === client.birthday.slice(5, 10);

      createConfetti();

      setTimeout(() => {
        $('#scratch-title').style.display = 'none';
        $('#scratch-subtitle').style.display = 'none';
        $('#scratch-container').style.display = 'none';
        $('#scratch-result').classList.remove('hidden');
        (isBirthday);

        // Si es mala suerte (retry), ocultar formulario de email
        if (selectedPrize === 'retry') {
          $('#').style.display = 'none';
          $('#').style.display = 'none';
          // Agregar botón "Cerrar" en su lugar
          const closeBtn = document.createElement('button');
          closeBtn.type = 'button';
          closeBtn.className = 'btn btn-outline btn-block';
          closeBtn.textContent = 'Cerrar';
          closeBtn.addEventListener('click', () => {
            if (!state || !state.client) return;
            // Marcar que el usuario vio el modal (aunque no ganó nada)
            state.hasScratchCard = true;
            localStorage.setItem('scratch_claimed_' + state.client.phone, 'true');
            $('#scratch-modal').classList.add('hidden');
          });
          $('#scratch-result').appendChild(closeBtn);
        }
      }, 300);
    });
  }

  function (isBirthday) {
    const prizes = isBirthday
      ? [
          { text: '🎉 ¡Feliz cumpleaños! Ganaste $5.000 OFF', code: '$5000' },
          { text: '🎂 ¡Feliz cumpleaños! Ganaste $10.000 OFF', code: '$10000' },
          { text: '🎁 ¡Feliz cumpleaños! +500 puntos bonus', code: 'points500' }
        ]
      : [
          { text: '🎉 ¡Ganaste $10.000 OFF!', code: '$10000' },
          { text: '🎉 ¡Ganaste $5.000 OFF en tu próxima compra!', code: '$5000' },
          { text: '🎉 Ganaste $2.500 OFF', code: '$2500' },
          { text: '🎉 ¡+500 puntos bonus!', code: 'points500' },
          { text: '¡Mejor suerte mañana! Intenta de nuevo.', code: 'retry' }
        ];
    const selected = prizes[Math.floor(Math.random() * prizes.length)];
    selectedPrize = selected.code;
    $('#scratch-result-text').textContent = selected.text;
  }

  $('#').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state || !state.client) return;
    const email = $('#scratch-email').value.trim();

    try {
      const data = await api('/api/scratch-card-claim', {
        method: 'POST',
        body: JSON.stringify({ phone: state.client.phone, email, prize: selectedPrize, isBirthday: false }),
      });

      // Guardar en localStorage que vio el modal
      localStorage.setItem('scratch_viewed_' + state.client.phone, 'true');

      if (data.couponCode) {
        $('#scratch-code').textContent = data.couponCode;
        $('#scratch-coupon').classList.remove('hidden');
        $('#scratch-result').classList.add('hidden');
      } else {
        toast('Mejor suerte mañana. ¡Intenta de nuevo!');
        $('#scratch-email').value = '';
        $('#scratch-result').textContent = '¡Mejor suerte mañana! Intenta de nuevo.';
      }
    } catch (err) {
      toast(err.message);
    }
  });

  $('#').addEventListener('click', () => {
    const code = $('#scratch-code').textContent;
    navigator.clipboard.writeText(code).then(() => toast('¡Código copiado!')).catch(() => toast('Error al copiar'));
  });

  $('#').addEventListener('click', () => $('#scratch-modal').classList.add('hidden'));

  $('#').addEventListener('click', () => {
    if (!state || !state.client) return;
    state.client.scratch_card_claimed = true;
    localStorage.setItem('scratch_claimed_' + state.client.phone, 'true');
    $('#scratch-modal').classList.add('hidden');
    toast('Dale, próximo premio te espera.');
  });

  // ---------- Init ----------
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
  const savedPhone = localStorage.getItem('ow_phone');
  if (savedPhone) loadDashboard(savedPhone);
})();
