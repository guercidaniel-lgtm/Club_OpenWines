(() => {
  const $ = (sel) => document.querySelector(sel);

  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 3500);
  }

  function getAdminKey() {
    let key = localStorage.getItem('ow_admin_key');
    if (!key) {
      key = prompt('Clave de administrador:');
      if (key) localStorage.setItem('ow_admin_key', key);
    }
    return key;
  }

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      ...opts,
      headers: { 'Content-Type': 'application/json', 'x-admin-key': getAdminKey(), ...(opts.headers || {}) },
    });
    if (res.status === 401) {
      localStorage.removeItem('ow_admin_key');
      throw new Error('Clave incorrecta. Refrescá la página para reintentar.');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Error de conexión');
    return data;
  }

  $('#btn-relogin').addEventListener('click', () => {
    localStorage.removeItem('ow_admin_key');
    getAdminKey();
  });

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function fmtDate(d) { return new Date(d).toLocaleDateString('es-AR'); }
  function fmtDateTime(d) {
    if (!d) return '—';
    const date = new Date(d);
    if (isNaN(date.getTime())) return '—';
    const dateStr = date.toLocaleDateString('es-AR');
    let hh = String(date.getHours()).padStart(2, '0');
    let mm = String(date.getMinutes()).padStart(2, '0');
    // Si viene solo con fecha (00:00), usar un horario razonable
    if (hh === '00' && mm === '00') {
      hh = '14'; // 2:00 PM por defecto
      mm = '00';
    }
    const timeStr = `${hh}:${mm}`;
    return `${dateStr} ${timeStr}`;
  }
  function fmtBirthday(d) {
    if (!d) return '';
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
  }
  function fmtMoney(n) { return '$' + Number(n).toLocaleString('es-AR'); }

  // ---------- Tabs ----------
  document.querySelectorAll('.tabs button').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tabs button').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.add('hidden'));
      btn.classList.add('active');
      $('#tab-' + btn.dataset.tab).classList.remove('hidden');
      loadTab(btn.dataset.tab);
    });
  });

  function loadTab(tab) {
    if (tab === 'clientes') loadClients();
    if (tab === 'combos') loadCombos();
    if (tab === 'flyers') loadFlyers();
    if (tab === 'restaurantes') loadRestaurantsAdmin();
    if (tab === 'momentos') loadMoments();
    if (tab === 'pedidos') loadOrders();
    if (tab === 'referidos') loadReferrals();
    if (tab === 'cumple') loadBirthdays();
    if (tab === 'cupones') loadCupones();
    if (tab === 'reporte') loadReport();
  }

  // ---------- Clientes ----------
  async function loadClients() {
    try {
      const { clients } = await api('/api/admin-clients');
      $('#table-clients tbody').innerHTML = clients.map((c) => {
        const prefsHtml = c.prefs && c.prefs.length
          ? `<div style="font-size:0.85em;line-height:1.4;">${c.prefs.map(p => `<span style="background:var(--gold);color:#000;padding:2px 8px;border-radius:12px;margin-right:4px;display:inline-block;margin-bottom:4px;">${escapeHtml(p)}</span>`).join('')}</div>`
          : '<span class="muted">—</span>';
        return `
        <tr>
          <td>${escapeHtml(c.name)}</td>
          <td>${escapeHtml(c.phone)}</td>
          <td>${c.level}</td>
          <td>${c.points}</td>
          <td>${c.birthday ? fmtBirthday(c.birthday) : '<span class="muted">—</span>'}</td>
          <td>${prefsHtml}</td>
          <td>${c.origin}</td>
          <td>${escapeHtml(c.origin_detail || '')}</td>
          <td>${fmtDate(c.created_at)}</td>
          <td><button class="btn btn-outline btn-delete-client" data-phone="${escapeHtml(c.phone)}" style="border-color:var(--red);color:var(--red);padding:4px 10px;font-size:0.8rem;">Borrar</button></td>
        </tr>`;
      }).join('');

      document.querySelectorAll('.btn-delete-client').forEach((btn) => {
        btn.addEventListener('click', async () => {
          if (!confirm(`¿Borrar cliente ${btn.dataset.phone}? Se eliminarán pedidos, cupones y todo.`)) return;
          try {
            await api(`/api/admin-delete-client?phone=${encodeURIComponent(btn.dataset.phone)}`, { method: 'DELETE' });
            toast('Cliente eliminado');
            loadClients();
          } catch (err) { toast(err.message); }
        });
      });
    } catch (err) { toast(err.message); }
  }

  $('#form-new-client').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/admin-clients', {
        method: 'POST',
        body: JSON.stringify({
          name: $('#nc-name').value.trim(),
          phone: $('#nc-phone').value.trim(),
          origin: $('#nc-origin').value,
          origin_detail: $('#nc-origin-detail').value.trim(),
        }),
      });
      e.target.reset();
      toast('Cliente agregado');
      loadClients();
    } catch (err) { toast(err.message); }
  });

  $('#form-purchase').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const data = await api('/api/admin-purchase', {
        method: 'POST',
        body: JSON.stringify({ phone: $('#p-phone').value.trim(), amount: Number($('#p-amount').value) }),
      });
      e.target.reset();
      toast(`Compra cargada: +${data.pointsEarned} puntos`);
      loadClients();
    } catch (err) { toast(err.message); }
  });

  // ---------- Importar ----------
  let importRows = [];
  let importHeaders = [];

  $('#import-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const wb = XLSX.read(evt.target.result, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      if (!json.length) { toast('El archivo no tiene filas'); return; }
      importRows = json;
      importHeaders = Object.keys(json[0]);
      const opts = importHeaders.map((h) => `<option value="${escapeHtml(h)}">${escapeHtml(h)}</option>`).join('');
      $('#map-name').innerHTML = opts;
      $('#map-phone').innerHTML = opts;
      $('#map-amount').innerHTML = '<option value="">— ninguna —</option>' + opts;
      guessColumn('#map-name', ['nombre', 'name', 'cliente']);
      guessColumn('#map-phone', ['telefono', 'teléfono', 'phone', 'celular']);
      guessColumn('#map-amount', ['monto', 'amount', 'importe', 'compra']);
      $('#import-preview-count').textContent = `${json.length} filas detectadas.`;
      $('#import-mapping').classList.remove('hidden');
    };
    reader.readAsArrayBuffer(file);
  });

  function guessColumn(selId, candidates) {
    const sel = $(selId);
    for (const opt of sel.options) {
      if (candidates.some((c) => opt.value.toLowerCase().includes(c))) { sel.value = opt.value; return; }
    }
  }

  $('#btn-import-run').addEventListener('click', async () => {
    const nameCol = $('#map-name').value;
    const phoneCol = $('#map-phone').value;
    const amountCol = $('#map-amount').value;
    const rows = importRows.map((r) => ({
      name: r[nameCol],
      phone: r[phoneCol],
      amount: amountCol ? r[amountCol] : undefined,
    }));
    try {
      const { results } = await api('/api/admin-import', { method: 'POST', body: JSON.stringify({ rows }) });
      $('#import-results').innerHTML = `<div class="table-wrap"><table><thead><tr><th>Teléfono</th><th>Resultado</th></tr></thead><tbody>${
        results.map((r) => `<tr><td>${escapeHtml(r.phone)}</td><td>${escapeHtml(r.status)}${r.pointsEarned ? ` (+${r.pointsEarned} pts)` : ''}</td></tr>`).join('')
      }</tbody></table></div>`;
      toast('Importación completa');
      loadClients();
    } catch (err) { toast(err.message); }
  });

  // ---------- Combos ----------
  async function loadCombos() {
    try {
      const { combos } = await api('/api/admin-combos');
      const now = Date.now();
      $('#table-combos tbody').innerHTML = combos.map((c) => {
        const expired = c.valid_until && new Date(c.valid_until).getTime() < now;
        const estado = !c.valid_until
          ? '<span class="muted">Sin vencimiento</span>'
          : expired
            ? '<span style="color:var(--red);font-weight:600;">Vencido</span>'
            : '<span style="color:var(--blue);font-weight:600;">Vigente</span>';
        return `
        <tr>
          <td>${c.image_url ? `<img src="${escapeHtml(c.image_url)}" alt="" style="width:50px;height:50px;object-fit:cover;border-radius:6px;">` : '—'}</td>
          <td>${escapeHtml(c.name)}</td>
          <td>${c.bottles}</td>
          <td>${fmtMoney(c.price)}</td>
          <td>${c.anticipo_horas ? c.anticipo_horas + 'h' : '—'}</td>
          <td>${c.valid_until ? fmtDate(c.valid_until) : '—'}</td>
          <td>${estado}</td>
          <td>${fmtDate(c.created_at)}</td>
          <td>
            <button class="btn ${c.notified_at ? 'btn-outline' : 'btn-gold'} btn-notify-combo" data-id="${c.id}" style="padding:4px 10px;font-size:.8rem;" title="${c.notified_at ? 'Notificado el ' + fmtDate(c.notified_at) : ''}">${c.notified_at ? '✓ Notificado' : '🔔 Notificar'}</button>
            <button class="btn btn-outline btn-delete-combo" data-id="${c.id}" style="border-color:var(--red);color:var(--red);padding:4px 10px;font-size:.8rem;">Eliminar</button>
          </td>
        </tr>`;
      }).join('');

      document.querySelectorAll('.btn-delete-combo').forEach((btn) => {
        btn.addEventListener('click', async () => {
          if (!confirm('¿Eliminar este combo? Si tiene pedidos asociados, en vez de borrarlo se va a marcar como vencido para conservar el historial.')) return;
          try {
            const data = await api(`/api/admin-combos?id=${btn.dataset.id}`, { method: 'DELETE' });
            toast(data.softExpired ? data.message : 'Combo eliminado');
            loadCombos();
          } catch (err) { toast(err.message); }
        });
      });

      document.querySelectorAll('.btn-notify-combo').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const already = btn.textContent.includes('✓');
          if (!confirm(already
            ? '¿Volver a mandar la notificación de este combo a todos los suscriptos?'
            : '¿Mandar una notificación push a todos los clientes suscriptos avisando este combo?')) return;
          try {
            const data = await api('/api/admin-send-notification', {
              method: 'POST',
              body: JSON.stringify({ combo_id: btn.dataset.id }),
            });
            toast(data.message || `Notificación enviada a ${data.sent} suscriptos${data.failed ? ` (${data.failed} fallaron)` : ''}`);
          } catch (err) { toast(err.message); }
        });
      });
    } catch (err) { toast(err.message); }
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
      reader.readAsDataURL(file);
    });
  }

  async function uploadImage(bucket, file) {
    if (!['image/jpeg', 'image/png'].includes(file.type)) throw new Error('Solo se aceptan imágenes JPG o PNG');
    if (file.size > 3 * 1024 * 1024) throw new Error('La imagen no puede pesar más de 3MB');
    const dataBase64 = await fileToBase64(file);
    const data = await api('/api/admin-upload-image', {
      method: 'POST',
      body: JSON.stringify({ bucket, filename: file.name, contentType: file.type, dataBase64 }),
    });
    return data.url;
  }

  $('#form-combo').addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    try {
      let image_url = null;
      const file = $('#c-image').files[0];
      if (file) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Subiendo imagen...';
        image_url = await uploadImage('combo-images', file);
      }
      const validUntilRaw = $('#c-valid-until').value;
      const valid_until = validUntilRaw ? new Date(validUntilRaw + 'T23:59:59').toISOString() : null;

      await api('/api/admin-combos', {
        method: 'POST',
        body: JSON.stringify({
          name: $('#c-name').value.trim(),
          bottles: Number($('#c-bottles').value),
          price: Number($('#c-price').value),
          description: $('#c-description').value.trim(),
          anticipo_horas: Number($('#c-anticipo').value),
          image_url,
          valid_until,
        }),
      });
      e.target.reset();
      toast('Combo creado');
      loadCombos();
    } catch (err) {
      toast(err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Crear combo';
    }
  });

  // ---------- Restaurantes ----------
  async function loadRestaurantsAdmin() {
    try {
      const { restaurants } = await api('/api/admin-restaurants');
      $('#restaurants-admin-list').innerHTML = restaurants.map((r) => `
        <div class="flex-between" style="padding:12px 0;border-bottom:1px solid var(--border)">
          <div style="display:flex;align-items:center;gap:12px;">
            ${r.background_image_url
              ? `<img src="${escapeHtml(r.background_image_url)}" alt="" style="width:60px;height:60px;object-fit:cover;border-radius:8px;">`
              : `<div class="muted" style="width:60px;height:60px;border:1px dashed var(--border);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:.7rem;text-align:center;">sin imagen</div>`}
            <strong>${escapeHtml(r.name)}</strong>
          </div>
          <div class="row">
            <input type="file" accept="image/jpeg,image/png" class="restaurant-bg-input" data-id="${r.id}" style="max-width:220px;">
          </div>
        </div>`).join('');

      document.querySelectorAll('.restaurant-bg-input').forEach((input) => {
        input.addEventListener('change', async () => {
          const file = input.files[0];
          if (!file) return;
          try {
            const background_image_url = await uploadImage('restaurant-images', file);
            await api('/api/admin-restaurants', {
              method: 'PATCH',
              body: JSON.stringify({ id: input.dataset.id, background_image_url }),
            });
            toast('Imagen actualizada');
            loadRestaurantsAdmin();
          } catch (err) { toast(err.message); }
        });
      });
    } catch (err) { toast(err.message); }
  }

  // ---------- Momentos Openwines ----------
  async function loadMoments() {
    try {
      const { moments } = await api('/api/admin-moments');
      $('#moments-admin-list').innerHTML = moments.length ? moments.map((m) => `
        <div class="winery-card" style="padding:0;overflow:hidden;">
          <img src="${escapeHtml(m.image_url)}" alt="" style="width:100%;aspect-ratio:4/3;object-fit:cover;display:block;">
          <div style="padding:12px;">
            ${m.location ? `<p class="muted" style="margin:0 0 4px;">${escapeHtml(m.location)}</p>` : ''}
            ${m.winery ? `<p class="muted" style="margin:0 0 8px;">${escapeHtml(m.winery)}</p>` : ''}
            <button class="btn btn-outline btn-delete-moment" data-id="${m.id}" style="border-color:var(--red);color:var(--red);padding:4px 10px;font-size:.8rem;">Eliminar</button>
          </div>
        </div>`).join('') : '<p class="muted">Todavía no cargaste ningún momento.</p>';

      document.querySelectorAll('.btn-delete-moment').forEach((btn) => {
        btn.addEventListener('click', async () => {
          if (!confirm('¿Eliminar esta foto?')) return;
          try {
            await api(`/api/admin-moments?id=${btn.dataset.id}`, { method: 'DELETE' });
            toast('Momento eliminado');
            loadMoments();
          } catch (err) { toast(err.message); }
        });
      });
    } catch (err) { toast(err.message); }
  }

  $('#form-moment').addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const file = $('#m-image').files[0];
    if (!file) return toast('Elegí una foto');
    try {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Subiendo...';
      const image_url = await uploadImage('moment-photos', file);
      await api('/api/admin-moments', {
        method: 'POST',
        body: JSON.stringify({
          image_url,
          location: $('#m-location').value.trim(),
          winery: $('#m-winery').value.trim(),
        }),
      });
      e.target.reset();
      toast('Momento agregado');
      loadMoments();
    } catch (err) {
      toast(err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Agregar momento';
    }
  });

  // ---------- Flyers ----------
  async function loadFlyers() {
    try {
      const { flyers } = await api('/api/admin-flyers');
      $('#flyers-admin-list').innerHTML = flyers.map((f) => `
        <div style="border:1px solid #ddd;border-radius:8px;overflow:hidden;">
          <img src="${escapeHtml(f.image_url)}" style="width:100%;height:150px;object-fit:cover;">
          <div style="padding:8px;">
            <div style="font-weight:600;font-size:0.9em;color:var(--violet);">${escapeHtml(f.title || '(sin título)')}</div>
            <div class="muted" style="font-size:0.8em;margin:4px 0;">${escapeHtml(f.description || '(sin descripción)')}</div>
            <div class="muted" style="font-size:0.75em;">Orden: ${f.display_order}</div>
            <button class="btn btn-outline btn-delete-flyer" data-id="${f.id}" style="width:100%;margin-top:8px;padding:4px;font-size:0.8em;color:var(--red);border-color:var(--red);">Eliminar</button>
          </div>
        </div>
      `).join('');

      document.querySelectorAll('.btn-delete-flyer').forEach((btn) => {
        btn.addEventListener('click', async () => {
          if (!confirm('¿Eliminar este flyer?')) return;
          try {
            await api('/api/admin-flyers', { method: 'DELETE', body: JSON.stringify({ flyer_id: btn.dataset.id }) });
            toast('✅ Flyer eliminado');
            loadFlyers();
          } catch (err) {
            toast(`Error: ${err.message}`);
          }
        });
      });
    } catch (err) { toast(err.message); }
  }

  $('#form-flyer').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const file = $('#f-image').files[0];
      if (!file) { toast('Sube una imagen'); return; }

      const submitBtn = e.target.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Subiendo imagen...';

      const imageUrl = await uploadImage('flyer-images', file);

      await api('/api/admin-flyers', {
        method: 'POST',
        body: JSON.stringify({
          image_url: imageUrl,
          title: $('#f-title').value.trim() || null,
          description: $('#f-description').value.trim() || null,
          display_order: Number($('#f-order').value) || 0,
        }),
      });

      e.target.reset();
      submitBtn.disabled = false;
      submitBtn.textContent = 'Crear flyer';
      toast('✅ Flyer creado');
      loadFlyers();
    } catch (err) {
      const submitBtn = e.target.querySelector('button[type="submit"]');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Crear flyer';
      toast(err.message);
    }
  });

  // ---------- Pedidos ----------
  async function loadOrders() {
    try {
      const { orders } = await api('/api/admin-orders');
      $('#table-orders tbody').innerHTML = orders.map((o) => {
        const orderId = o.id.substring(0, 8).toUpperCase();
        return `
        <tr>
          <td>${escapeHtml(o.clients?.name || '')}</td>
          <td>${escapeHtml(o.clients?.phone || '')}</td>
          <td>${escapeHtml(o.combos?.name || '')}</td>
          <td>${o.quantity}</td>
          <td>${fmtMoney(o.total)}</td>
          <td>${escapeHtml(o.status || 'Pendiente')}</td>
          <td style="font-size:0.85em;color:#666;">
            <strong>#${orderId}</strong><br>
            📅 ${fmtDateTime(o.created_at)}<br>
            ${o.delivered_at ? `✓ ${fmtDateTime(o.delivered_at)}` : '—'}
          </td>
          <td style="display:flex;gap:6px;">
            ${o.status === 'Pendiente' ? `<button class="btn btn-gold btn-confirm-order" data-id="${o.id}" style="flex:1;padding:6px 12px;font-size:0.85em;">Confirmar</button>` : `<span class="muted" style="font-size:0.85em;">✓ ${o.status}</span>`}
            <button class="btn btn-outline btn-delete-order" data-id="${o.id}" style="padding:6px 12px;font-size:0.85em;color:#d61d4d;border-color:#d61d4d;">✕</button>
          </td>
        </tr>`;
      }).join('');

      // Agregar event listeners a botones de eliminar (primero, para asegurar que funcione)
      try {
        document.querySelectorAll('.btn-delete-order').forEach((btn) => {
          btn.addEventListener('click', async () => {
            if (!confirm('¿Eliminar este pedido?')) return;
            try {
              await api('/api/delete-order', { method: 'POST', body: JSON.stringify({ order_id: btn.dataset.id }) });
              toast('✅ Pedido eliminado');
              loadOrders();
            } catch (err) {
              toast(`Error: ${err.message}`);
            }
          });
        });
      } catch (e) {
        console.error('Error adding delete listeners:', e);
      }

      // Agregar event listeners a botones de confirmar
      try {
        document.querySelectorAll('.btn-confirm-order').forEach((btn) => {
          btn.addEventListener('click', async () => {
            try {
              const result = await api('/api/confirm-order', { method: 'POST', body: JSON.stringify({ order_id: btn.dataset.id }) });
              console.log('Confirm result:', result);
              toast('✅ Compra confirmada y puntos acreditados');
              loadOrders();
              loadClients();
            } catch (err) {
              console.error('Confirm error:', err);
              toast(`Error: ${err.message}`);
            }
          });
        });
      } catch (e) {
        console.error('Error adding confirm listeners:', e);
      }
    } catch (err) { toast(err.message); }
  }

  // ---------- Referidos ----------
  async function loadReferrals() {
    try {
      const { referrals } = await api('/api/admin-referrals');
      $('#table-referrals tbody').innerHTML = referrals.map((r) => `
        <tr>
          <td>${escapeHtml(r.referrer_name || '')}</td>
          <td>${escapeHtml(r.referrer_phone)}</td>
          <td>${escapeHtml(r.friend_name)}</td>
          <td>${escapeHtml(r.friend_phone)}</td>
          <td>${r.status}</td>
          <td style="display:flex;gap:6px;">
            ${r.status === 'Pendiente' ? `<button class="btn btn-gold btn-confirm" data-id="${r.id}" style="flex:1;">Confirmar primera compra</button>` : ''}
            <button class="btn btn-outline btn-delete-referral" data-id="${r.id}" style="flex:0 0 auto; padding:6px 12px; font-size:0.85em;" title="Eliminar recomendación">✕</button>
          </td>
        </tr>`).join('');
      document.querySelectorAll('.btn-confirm').forEach((btn) => {
        btn.addEventListener('click', async () => {
          try {
            await api('/api/admin-referrals', { method: 'POST', body: JSON.stringify({ referral_id: btn.dataset.id }) });
            toast('Referido confirmado. Una botella Taymente Malbec acreditada para su próxima compra');
            loadReferrals();
          } catch (err) { toast(err.message); }
        });
      });
      document.querySelectorAll('.btn-delete-referral').forEach((btn) => {
        btn.addEventListener('click', async () => {
          if (!confirm('¿Eliminar esta recomendación?')) return;
          try {
            await api('/api/admin-referrals', { method: 'DELETE', body: JSON.stringify({ referral_id: btn.dataset.id }) });
            toast('Recomendación eliminada');
            loadReferrals();
          } catch (err) { toast(err.message); }
        });
      });
    } catch (err) { toast(err.message); }
  }

  // ---------- Cumpleaños ----------
  async function loadBirthdays() {
    try {
      const { clients } = await api('/api/admin-birthdays');
      if (!clients.length) { $('#birthdays-list').innerHTML = '<p class="muted">Sin cumpleaños Oro este mes.</p>'; return; }
      $('#birthdays-list').innerHTML = clients.map((c) => {
        const text = encodeURIComponent(`¡Feliz cumpleaños, ${c.name}! De parte de todo el equipo de Club Openwines, va tu regalo 🍷🎉`);
        return `
        <div class="flex-between" style="padding:10px 0;border-bottom:1px solid var(--border)">
          <div><strong>${escapeHtml(c.name)}</strong> · ${escapeHtml(c.phone)} · ${fmtBirthday(c.birthday)}</div>
          <a class="btn btn-whatsapp" target="_blank" rel="noopener" href="https://wa.me/${c.phone.replace(/\D/g, '')}?text=${text}">Generar WhatsApp</a>
        </div>`;
      }).join('');
    } catch (err) { toast(err.message); }
  }

  // ---------- Cupones ----------
  async function loadCupones() {
    try {
      const { coupons } = await api('/api/admin-cupones');
      $('#table-cupones tbody').innerHTML = coupons.map((cup) => `
        <tr>
          <td>${escapeHtml(cup.email)}</td>
          <td>${cup.prize === '$10000' ? '$10.000' : cup.prize === '$5000' ? '$5.000' : cup.prize === '$2500' ? '$2.500' : cup.prize === 'points500' ? '+500 pts' : 'Retry'}</td>
          <td><code style="background:var(--cream);padding:4px 8px;border-radius:4px;font-size:0.85em;">${escapeHtml(cup.coupon_code)}</code></td>
          <td>${fmtDate(cup.claimed_at)}</td>
          <td>${fmtDate(cup.expires_at)}</td>
          <td>${cup.used_at ? fmtDate(cup.used_at) : '<span class="muted">—</span>'}</td>
          <td><button class="btn btn-outline btn-delete-coupon" data-id="${cup.id}" style="border-color:var(--red);color:var(--red);padding:4px 10px;font-size:0.8rem;">Borrar</button></td>
        </tr>
      `).join('');

      document.querySelectorAll('.btn-delete-coupon').forEach((btn) => {
        btn.addEventListener('click', async () => {
          if (!confirm('¿Borrar este cupón?')) return;
          try {
            await api(`/api/admin-cupones?id=${btn.dataset.id}`, { method: 'DELETE' });
            toast('Cupón eliminado');
            loadCupones();
          } catch (err) { toast(err.message); }
        });
      });
    } catch (err) { toast(err.message); }
  }

  // ---------- Reporte ----------
  async function loadReport() {
    try {
      const { counts, total } = await api('/api/admin-report');
      const max = Math.max(1, ...Object.values(counts));
      const labels = { organico: 'Orgánico', referido: 'Referido', restaurante: 'Restaurante' };
      $('#report-chart').innerHTML = `
        <p class="muted">${total} altas este mes.</p>
        ${Object.entries(counts).map(([k, v]) => `
          <div class="bar-row">
            <div style="width:100px">${labels[k]}</div>
            <div class="bar-track"><div class="bar-fill" style="width:${(v / max) * 100}%"></div></div>
            <div>${v}</div>
          </div>`).join('')}
      `;
    } catch (err) { toast(err.message); }
  }

  // ---------- Init ----------
  getAdminKey();
  loadClients();
})();
