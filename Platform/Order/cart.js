// Cart Operations & Catalog Management
const SUPABASE_URL = 'https://ygoxjtgoyoxjcvtypoii.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_yfKBDqPQsdXY2dNhkuUPRw_7pea76ia';
var supabaseClient = null;

let userProfile = null;
let existingOrder = null;
let isEditingMode = false;
let cart = {}; // Key: item_id + '_' + size
let kidsDens = [];

document.addEventListener('DOMContentLoaded', async () => {
  if (window.supabase) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    await window.initExchangeRate();
    await initOrdering();
  }
});

// Normalizes size object / string format cleanly
window.normalizeSize = function(s, fallbackSku = '') {
  if (!s) return null;
  if (typeof s === 'object' && s !== null) {
    return { size: String(s.size || s.name || ''), sku: String(s.sku || fallbackSku || '') };
  }
  if (typeof s === 'string') {
    const trimmed = s.trim();
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        return { size: String(parsed.size || ''), sku: String(parsed.sku || fallbackSku || '') };
      } catch (e) {}
    }
    const parts = trimmed.split(':').map(p => p.trim());
    if (parts.length > 1) {
      return { size: parts[0], sku: parts[1] };
    }
    return { size: trimmed, sku: fallbackSku };
  }
  return null;
};

async function initOrdering() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return;

  const { data: profile } = await supabaseClient.from('profile').select('*').eq('id', user.id).single();
  userProfile = profile;
  
  if (profile && Array.isArray(profile.kids)) {
    kidsDens = profile.kids.map(k => {
      if (typeof k === 'object' && k !== null && k.rank) return String(k.rank).trim().toLowerCase();
      return String(k || '').trim().toLowerCase();
    });
  }

  await loadCatalog();

  const { data: orders } = await supabaseClient.from('orders').select('*').eq('user_id', user.id).eq('status', 'placed');
  if (orders && orders.length > 0) {
    existingOrder = orders[0];
    showOrderBanner(existingOrder);
  }
}

function showOrderBanner(order) {
  const banner = document.getElementById('order-banner');
  const details = document.getElementById('order-banner-details');
  const totalItems = (order.items || []).reduce((sum, i) => sum + i.quantity, 0);
  details.textContent = `Total Items: ${totalItems} | Total: ${window.formatPriceDisplay(order.total_amount)} (Placed: ${new Date(order.created_at).toLocaleDateString()})`;
  banner.style.display = 'flex';
  updateCatalogButtonState();
}

function updateCatalogButtonState() {
  const addBtns = document.querySelectorAll('.btn-add');
  addBtns.forEach(btn => {
    btn.disabled = !!(existingOrder && !isEditingMode);
  });

  const orderBtn = document.getElementById('place-order-btn');
  if (existingOrder && !isEditingMode) {
    orderBtn.disabled = true;
    orderBtn.textContent = 'Order Already Placed';
  }
}

window.enableEditOrder = function() {
  if (!existingOrder) return;
  isEditingMode = true;
  cart = {};
  (existingOrder.items || []).forEach(i => {
    const cartKey = `${i.id}_${i.size || 'default'}`;
    cart[cartKey] = { ...i };
  });
  renderCart();
  updateCatalogButtonState();

  const orderBtn = document.getElementById('place-order-btn');
  orderBtn.disabled = false;
  orderBtn.textContent = 'Update Existing Order';

  window.showToast('Existing order loaded into cart. Make changes and click Update.', 'success');
};

window.confirmDeleteOrder = function() {
  if (!existingOrder) return;
  window.showConfirmModal(
    'Delete Order?',
    'Are you sure you want to delete your active order? This cannot be undone.',
    async () => {
      try {
        const { error } = await supabaseClient.from('orders').update({ status: 'cancelled' }).eq('id', existingOrder.id);
        if (error) throw error;
        window.showToast('Order deleted successfully.', 'success');
        setTimeout(() => window.location.reload(), 1000);
      } catch (err) {
        window.showToast(err.message || 'Failed to delete order.', 'error');
      }
    }
  );
};

async function loadCatalog() {
  const container = document.getElementById('catalog-container');
  const { data: items, error } = await supabaseClient.from('items').select('*').order('name');

  if (error || !items) {
    container.innerHTML = '<p style="color:#ef4444;">Failed to load items catalog.</p>';
    return;
  }

  const groups = {};
  items.forEach(item => {
    const den = item.target_den || 'General';
    if (!groups[den]) groups[den] = [];
    groups[den].push(item);
  });

  const denNames = Object.keys(groups).sort((a, b) => {
    const aIsKid = kidsDens.includes(a.toLowerCase());
    const bIsKid = kidsDens.includes(b.toLowerCase());
    if (aIsKid && !bIsKid) return -1;
    if (!aIsKid && bIsKid) return 1;
    return a.localeCompare(b);
  });

  container.innerHTML = denNames.map(den => {
    const isPriority = kidsDens.includes(den.toLowerCase());
    return `
      <details class="den-group ${isPriority ? 'priority' : ''}" ${isPriority ? 'open' : ''}>
        <summary>
          <span>${window.escapeHtml(den)} Items ${isPriority ? '<span class="priority-badge">Your Scout\'s Den</span>' : ''}</span>
          <span style="font-size:0.85rem; color:#94a3b8;">▼</span>
        </summary>
        <div class="items-grid">
          ${groups[den].map(item => {
            const rawSizes = Array.isArray(item.sizes) ? item.sizes : [];
            const sizes = rawSizes.map(s => window.normalizeSize(s, item.sku)).filter(Boolean);
            const hasSizes = sizes.length > 0;
            const initialSku = hasSizes ? (sizes[0].sku || 'N/A') : (item.sku || 'N/A');

            return `
              <div class="item-card">
                <div>
                  <img src="${item.image_url || 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&w=400&q=80'}" class="item-image" alt="${window.escapeHtml(item.name)}" />
                  <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.25rem;">
                    <div class="item-title">${window.escapeHtml(item.name)}</div>
                    <span id="sku-badge-${item.id}" class="badge-sku">${window.escapeHtml(initialSku)}</span>
                  </div>
                  ${item.description ? `<div class="item-desc">${window.escapeHtml(item.description)}</div>` : ''}
                </div>
                <div>
                  <div class="item-price">${window.formatPriceDisplay(item.price)}</div>

                  ${hasSizes ? `
                    <div style="margin-bottom: 0.5rem;">
                      <select id="size-select-${item.id}" class="size-dropdown" onchange="window.handleSizeChange('${item.id}', this)">
                        ${sizes.map(s => `
                          <option value="${window.escapeHtml(s.size)}" data-sku="${window.escapeHtml(s.sku)}">
                            Size: ${window.escapeHtml(s.size)} (${window.escapeHtml(s.sku)})
                          </option>
                        `).join('')}
                      </select>
                    </div>
                  ` : ''}

                  <button class="btn-add" onclick="window.addToCart('${item.id}', '${window.escapeHtml(item.name)}', ${item.price}, '${item.sku || ''}', ${hasSizes})">+ Add to Cart</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </details>
    `;
  }).join('');
}

window.handleSizeChange = function(itemId, selectEl) {
  const selectedOption = selectEl.options[selectEl.selectedIndex];
  const sku = selectedOption.getAttribute('data-sku');
  const badge = document.getElementById(`sku-badge-${itemId}`);
  if (badge && sku) {
    badge.textContent = sku;
  }
};

window.addToCart = function(id, name, price, defaultSku, hasSizes) {
  if (existingOrder && !isEditingMode) {
    window.showToast('You already have an active order. Click "Change Order" to edit.', 'error');
    return;
  }

  let selectedSize = null;
  let activeSku = defaultSku;

  if (hasSizes) {
    const selectEl = document.getElementById(`size-select-${id}`);
    if (selectEl) {
      selectedSize = selectEl.value;
      const selectedOption = selectEl.options[selectEl.selectedIndex];
      activeSku = selectedOption.getAttribute('data-sku') || defaultSku;
    }
  }

  const cartKey = `${id}_${selectedSize || 'default'}`;

  if (!cart[cartKey]) {
    cart[cartKey] = { id, name, price: Number(price), sku: activeSku, size: selectedSize, quantity: 0 };
  }
  cart[cartKey].quantity += 1;
  renderCart();
};

window.updateQty = function(cartKey, delta) {
  if (cart[cartKey]) {
    cart[cartKey].quantity += delta;
    if (cart[cartKey].quantity <= 0) {
      delete cart[cartKey];
    }
  }
  renderCart();
};

function renderCart() {
  const container = document.getElementById('cart-items');
  const totalUsdEl = document.getElementById('cart-total-usd');
  const totalEurEl = document.getElementById('cart-total-eur');
  const btn = document.getElementById('place-order-btn');

  const itemsList = Object.entries(cart);
  if (itemsList.length === 0) {
    container.innerHTML = '<p style="font-size: 0.875rem; color: #94a3b8;">Your cart is empty.</p>';
    totalUsdEl.textContent = '$0.00';
    totalEurEl.textContent = '€0.00';
    btn.disabled = true;
    return;
  }

  let totalUsd = 0;
  container.innerHTML = itemsList.map(([cartKey, item]) => {
    const subtotal = item.price * item.quantity;
    totalUsd += subtotal;
    return `
      <div class="cart-item">
        <div>
          <div style="font-weight:700;">${window.escapeHtml(item.name)}</div>
          <div style="font-size:0.75rem; color:#94a3b8;">
            <span class="badge-sku" style="font-size:0.65rem;">${window.escapeHtml(item.sku || 'N/A')}</span>
            ${item.size ? `<span style="color:#60a5fa; font-weight:700; margin-left:0.25rem;">Size: ${window.escapeHtml(item.size)}</span> | ` : ' | '}
            ${window.formatPriceDisplay(item.price)}
          </div>
        </div>
        <div class="qty-controls">
          <button class="btn-qty" onclick="window.updateQty('${cartKey}', -1)">-</button>
          <span style="font-weight:700; width:18px; text-align:center;">${item.quantity}</span>
          <button class="btn-qty" onclick="window.updateQty('${cartKey}', 1)">+</button>
        </div>
      </div>
    `;
  }).join('');

  const totalEur = Math.round(totalUsd * window.eurExchangeRate * 100) / 100;
  totalUsdEl.textContent = `$${totalUsd.toFixed(2)}`;
  totalEurEl.textContent = `€${totalEur.toFixed(2)}`;
  btn.disabled = false;
}

window.submitOrder = async function() {
  const btn = document.getElementById('place-order-btn');
  btn.disabled = true;
  btn.textContent = 'Submitting...';

  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    const itemsList = Object.values(cart);
    const totalAmount = itemsList.reduce((sum, i) => sum + (i.price * i.quantity), 0);

    if (existingOrder && isEditingMode) {
      const { error } = await supabaseClient.from('orders').update({
        items: itemsList,
        total_amount: totalAmount,
        updated_at: new Date().toISOString()
      }).eq('id', existingOrder.id);
      if (error) throw error;
      window.showToast('Order updated successfully!', 'success');
    } else {
      const { error } = await supabaseClient.from('orders').insert({
        user_id: user.id,
        parent_name: userProfile ? userProfile.parent_name : 'Parent',
        items: itemsList,
        total_amount: totalAmount,
        status: 'placed'
      });
      if (error) throw error;
      window.showToast('Order placed successfully!', 'success');
    }

    setTimeout(() => window.location.reload(), 1200);
  } catch (err) {
    window.showToast(err.message || 'Failed to submit order.', 'error');
    btn.disabled = false;
    btn.textContent = isEditingMode ? 'Update Existing Order' : 'Place Order';
  }
};