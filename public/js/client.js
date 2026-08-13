(() => {
  const APP_URL = 'https://club-openwines.netlify.app/';
  const PREFS_BY_TYPE = {
    'Tintos': ['Malbec', 'Cabernet Sauvignon', 'Cabernet Franc', 'Syrah', 'Merlot', 'Petit Verdot', 'Bonarda', 'Pinot Noir', 'Tempranillo', 'Garnacha', 'Rosé', 'Ancellotta'],
    'Blancos': ['Sauvignon Blanc', 'Torrontés', 'Viognier', 'Chardonnay', 'Blanco Dulce'],
    'Espumantes': ['Espumante Brut', 'Extra Brut', 'Brut Rosé'],
  };
  const PREFS = Object.values(PREFS_BY_TYPE).flat();
  const LEVEL_THRESHOLDS = { Bronce: 0, Plata: 1000, Oro: 3000 };
  const BENEFITS = {
    Bronce: '5% OFF en tu segunda compra + acumulación de puntos.',
    Plata: '5% beneficio adicional en todas tus compras + 5% descuento en eventos + doble puntos en cumpleaños.',
    Oro: '7% beneficio adicional en todas tus compras + 10% descuento en eventos + envío gratuito en compras superiores a $95.000 + regalo de cumpleaños.',
  };
  const LEVEL_INFO = [
    {
      key: 'Bronce',
      range: '0 – 999 Puntos Open',
      benefits: [
        '🎁 5% OFF en tu segunda compra',
        '🍷 Acumulación de Puntos Open en todas tus compras',
        '📩 Acceso a promociones y novedades exclusivas'
      ]
    },
    {
      key: 'Plata',
      range: '1.000 – 2.999 Puntos Open',
      benefits: [
        '🏷️ 5% de beneficio adicional sobre el precio vigente',
        '🎯 5% descuento en eventos organizados por Open Wines',
        '⏰ Acceso anticipado a promociones y lanzamientos',
        '🎂 Doble acumulación de puntos en tu mes de cumpleaños'
      ]
    },
    {
      key: 'Oro',
      range: '3.000+ Puntos Open',
      benefits: [
        '🏷️ 7% de beneficio adicional sobre el precio vigente',
        '🎯 10% descuento en eventos organizados por Open Wines',
        '🚚 Envío gratuito en compras superiores a $95.000',
        '⏰ Acceso anticipado a promociones y lanzamientos',
        '🎁 Regalo especial de cumpleaños',
        '🎂 Doble acumulación de puntos en tu mes de cumpleaños'
      ]
    }
  ];

  let state = null; // último payload de /api/client-data
  let countdownTimers = [];
  let cart = {}; // combo_id -> cantidad, para armar un pedido de varios combos antes de enviarlo
  let appliedCoupon = null; // cupón aplicado al carrito
  let pollingInterval = null; // para actualizar puntos automáticamente

  const $ = (sel) => document.querySelector(sel);
  const loginScreen = $('#login-screen');
  const dashboard = $('#dashboard');

  function fmtMoney(n) { return '$' + Number(n).toLocaleString('es-AR'); }
  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

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
    const birthday = $('#login-birthday').value;
    const email = $('#login-email').value.trim();
    $('#login-error').classList.add('hidden');

    // Si el name-field está visible, validar que el nombre sea completado
    if (!$('#name-field').classList.contains('hidden') && !name) {
      $('#login-error').textContent = 'Completá tu nombre';
      $('#login-error').classList.remove('hidden');
      $('#login-name').focus();
      return;
    }

    try {
      const data = await api('/api/client-login', { method: 'POST', body: JSON.stringify({ phone, name, birthday, email }) });
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
    if (pollingInterval) clearInterval(pollingInterval);
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

      // Iniciar polling para actualizar puntos cada 30 segundos
      if (pollingInterval) clearInterval(pollingInterval);
      pollingInterval = setInterval(async () => {
        try {
          const updated = await api(`/api/client-data?phone=${encodeURIComponent(phone)}`);
          state = updated;
          renderDashboard(updated);
        } catch (err) {
          // silenciar errores de polling
        }
      }, 30000);
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
      if (client.origin === 'referido') {
        $('#welcome-referral-text').innerHTML = `${escapeHtml(client.origin_detail || 'Alguien')} te recomendo Club Openwines. Tenés un <strong>5%</strong> en tu próxima compra.`;
      } else {
        $('#welcome-referral-text').innerHTML = `Llegaste desde ${escapeHtml(client.origin_detail || 'uno de nuestros restaurantes aliados')} a Club Openwines. Tenés <strong>5%</strong> en tu próxima compra.`;
      }
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

    // Cargar pedidos del cliente
    loadClientOrders(client.phone);

    // Cargar flyers
    loadFlyers();

    renderLevelsModal(level);
    renderPrefsModal(client);
    renderCombos(data);
    renderWineries(data.wineries);
    renderRestaurants(data.restaurants);
    renderMoments(data.moments);
    setupPushOptIn();
    // setupScratchCard desactivado - modal siempre oculto
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

  // ---------- Pedidos ----------
  async function loadClientOrders(phone) {
    try {
      const data = await api(`/api/client-orders?phone=${encodeURIComponent(phone)}`);
      const { orders } = data;

      if (!orders || orders.length === 0) {
        $('#orders-card').classList.add('hidden');
        return;
      }

      $('#orders-card').classList.remove('hidden');

      // Agregar event listener al botón desplegable
      const toggleBtn = $('#toggle-orders');
      const content = $('#orders-content');
      if (toggleBtn && !toggleBtn.hasListener) {
        toggleBtn.addEventListener('click', () => {
          const isHidden = content.classList.contains('hidden');
          content.classList.toggle('hidden');
          toggleBtn.setAttribute('aria-expanded', isHidden);
        });
        toggleBtn.hasListener = true;
      }

      const pending = orders.filter(o => o.status === 'Pendiente');
      const completed = orders.filter(o => o.status === 'Confirmado');

      function fmtOrderDate(d) {
        if (!d) return '—';
        const date = new Date(d);
        return date.toLocaleDateString('es-AR');
      }

      const pendingHtml = pending.length === 0
        ? '<div class="muted" style="font-size:0.9em;">No tienes pedidos en curso</div>'
        : `<div style="display:flex;flex-direction:column;gap:12px;">
            ${pending.map(o => `
              <div style="background:var(--cream);padding:12px;border-radius:8px;border-left:4px solid var(--gold);">
                <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px;">
                  <div>
                    <div style="font-weight:600;color:var(--violet);">${escapeHtml(o.combos?.name || '')}</div>
                    <div class="muted" style="font-size:0.85em;">Cantidad: ${o.quantity}</div>
                  </div>
                  <div style="text-align:right;">
                    <div style="font-weight:600;color:var(--violet);">${fmtMoney(o.total)}</div>
                    <div class="muted" style="font-size:0.85em;">${fmtOrderDate(o.created_at)}</div>
                  </div>
                </div>
                <div class="muted" style="font-size:0.8em;">Estado: ${o.status}</div>
              </div>
            `).join('')}
          </div>`;

      const completedHtml = completed.length === 0
        ? '<div class="muted" style="font-size:0.9em;">No tienes pedidos finalizados</div>'
        : `<div style="display:flex;flex-direction:column;gap:12px;">
            ${completed.map(o => `
              <div style="background:var(--cream);padding:12px;border-radius:8px;border-left:4px solid var(--violet);">
                <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px;">
                  <div>
                    <div style="font-weight:600;color:var(--violet);">${escapeHtml(o.combos?.name || '')}</div>
                    <div class="muted" style="font-size:0.85em;">Cantidad: ${o.quantity}</div>
                  </div>
                  <div style="text-align:right;">
                    <div style="font-weight:600;color:var(--violet);">${fmtMoney(o.total)}</div>
                    <div class="muted" style="font-size:0.85em;">✓ ${fmtOrderDate(o.delivered_at || o.created_at)}</div>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>`;

      $('#orders-pending').innerHTML = pendingHtml;
      $('#orders-completed').innerHTML = completedHtml;
    } catch (err) {
      console.error('Error loading orders:', err);
      $('#orders-card').classList.add('hidden');
    }
  }

  // ---------- Flyers ----------
  async function loadFlyers() {
    try {
      const data = await api('/api/client-flyers');
      const { flyers } = data;

      if (!flyers || flyers.length === 0) {
        $('#flyers-card').classList.add('hidden');
        return;
      }

      $('#flyers-card').classList.remove('hidden');
      $('#flyers-grid').innerHTML = flyers.map((f) => `
        <div style="border-radius:8px;overflow:hidden;background:white;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
          <img src="${escapeHtml(f.image_url)}" alt="Flyer" style="width:100%;height:auto;display:block;max-height:300px;object-fit:cover;">
          ${f.title || f.description ? `
            <div style="padding:12px;">
              ${f.title ? `<div style="font-weight:600;font-size:1rem;color:var(--violet);margin-bottom:6px;">${escapeHtml(f.title)}</div>` : ''}
              ${f.description ? `<div class="muted" style="font-size:0.9em;">${escapeHtml(f.description)}</div>` : ''}
            </div>
          ` : ''}
        </div>
      `).join('');
    } catch (err) {
      console.error('Error loading flyers:', err);
      $('#flyers-container').classList.add('hidden');
    }
  }

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
    const prefs = Array.from(document.querySelectorAll('#prefs-options input:checked')).map((i) => i.value);
    if (!prefs.length) return toast('Elegí al menos una preferencia');
    try {
      const data = await api('/api/complete-profile', {
        method: 'POST',
        body: JSON.stringify({ phone: state.client.phone, prefs }),
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
              <span style="display:flex;align-items:center;gap:4px;"><span class="qty-value" data-qty-for="${c.id}">${cart[c.id] || 0}</span> 🛒</span>
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
              <span style="margin-left:8px;font-size:1.2rem;">🛒</span>
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
  $('#cart-bar-close').addEventListener('click', () => $('#cart-bar').classList.add('hidden'));

  // Declinar pedido
  $('#cart-decline').addEventListener('click', () => {
    cart = {};
    appliedCoupon = null;
    $('#cart-modal').classList.add('hidden');
    $('#cart-bar').classList.add('hidden');
    toast('Pedido descartado');
  });

  $('#cart-send-whatsapp').addEventListener('click', async () => {
    if (!state.business.whatsapp) return toast('WhatsApp no configurado todavía');
    const entries = Object.entries(cart).filter(([, qty]) => qty > 0);
    if (!entries.length) return toast('Todavía no agregaste combos');

    try {
      // Crear cada order en la BD
      for (const [combo_id, quantity] of entries) {
        const orderData = {
          phone: state.client.phone,
          combo_id: combo_id.trim(),
          quantity: parseInt(quantity, 10),
          payment_method: $('#cart-payment').value || null,
        };
        console.log('Creating order:', orderData);
        const result = await api('/api/create-order', {
          method: 'POST',
          body: JSON.stringify(orderData),
        });
        console.log('Order created:', result);
      }

      // Calcular totales para el mensaje
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
      const phone = state.business.whatsapp;

      // Usar https://wa.me/ que abre la app nativa instalada
      // Si el usuario tiene múltiples apps, el sistema le pedirá elegir una vez
      const whatsappUrl = `https://wa.me/${phone}?text=${text}`;
      window.open(whatsappUrl, '_blank');

      // Limpiar carrito y cerrar modal después de enviar
      cart = {};
      appliedCoupon = null;
      $('#cart-modal').classList.add('hidden');
      $('#cart-bar').classList.add('hidden');

      // Actualizar UI completamente: renderi grid de combos y carrito
      if (state.combos && state.combos.length) {
        renderCombos(state);
      }
      renderCartBar();
      renderCartItems();
      toast('✅ Gracias por elegirnos. Te contactaremos vía WhatsApp para la entrega');
    } catch (err) {
      console.error('Error creating order:', err);
      toast(`Error: ${err.message || 'No se pudo crear el pedido'}`);
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
      // Sanitizar teléfono para WhatsApp: mantener solo dígitos y el +
      let cleanPhone = friend_phone.replace(/[\s\-\(\)]/g, '').trim();
      // Si tiene +, remover espacios adicionales y validar
      if (cleanPhone.startsWith('+')) {
        cleanPhone = '+' + cleanPhone.replace(/\D/g, '');
      } else {
        // Si no tiene +, asumir que es Argentina y agregar código de país
        cleanPhone = '+54' + cleanPhone.replace(/\D/g, '');
      }

      const text = encodeURIComponent(
        `Hola! amig@ 🍷 Te quiero invitar al Club de Vinos de Open Wines.\n\nNo tiene costo mensual y vas a acceder a vinos seleccionados, promos y beneficios exclusivos.\n\nAdemás, arrancás con 10% OFF en tu primera compra 🎁\n\nSumate acá 👉 ${APP_URL}\n\nAbrazo!`
      );
      window.open(`https://wa.me/${cleanPhone}?text=${text}`, '_blank');
      $('#form-referral').reset();
      toast('¡Invitación enviada!');
    } catch (err) {
      toast(err.message);
    }
  });

  // Condiciones referrals modal
  const conditionsModal = $('#referral-conditions-modal');
  const closeRefModal = () => {
    conditionsModal.classList.add('hidden');
    setTimeout(() => {
      const refInput = $('#ref-name');
      refInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      refInput.classList.add('highlight');
      refInput.focus();
      setTimeout(() => {
        refInput.classList.remove('highlight');
      }, 4000);
    }, 100);
  };
  $('#btn-referral-conditions').addEventListener('click', () => {
    conditionsModal.classList.remove('hidden');
    setTimeout(() => {
      conditionsModal.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  });
  $('#close-conditions').addEventListener('click', closeRefModal);
  $('#confirm-conditions').addEventListener('click', closeRefModal);
  conditionsModal.addEventListener('click', (e) => {
    if (e.target === conditionsModal) closeRefModal();
  });

  // Bases y Condiciones modal
  const basesModal = $('#bases-condiciones-modal');
  const closeBasesModal = () => {
    basesModal.classList.add('hidden');
  };
  $('#btn-bases-condiciones').addEventListener('click', () => {
    basesModal.classList.remove('hidden');
    setTimeout(() => {
      basesModal.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  });
  $('#close-bases').addEventListener('click', closeBasesModal);
  $('#confirm-bases').addEventListener('click', closeBasesModal);
  basesModal.addEventListener('click', (e) => {
    if (e.target === basesModal) closeBasesModal();
  });

  // Preguntas Frecuentes modal
  const faqModal = $('#faq-modal');
  const closeFaqModal = () => {
    faqModal.classList.add('hidden');
  };
  $('#btn-faq').addEventListener('click', () => {
    faqModal.classList.remove('hidden');
    setTimeout(() => {
      faqModal.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  });
  $('#close-faq').addEventListener('click', closeFaqModal);
  $('#confirm-faq').addEventListener('click', closeFaqModal);
  faqModal.addEventListener('click', (e) => {
    if (e.target === faqModal) closeFaqModal();
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


  // ---------- Init ----------
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
  const savedPhone = localStorage.getItem('ow_phone');
  if (savedPhone) loadDashboard(savedPhone);
})();
