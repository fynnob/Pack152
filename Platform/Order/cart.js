// Cart Operations & Catalog Management
const SUPABASE_URL = 'https://ygoxjtgoyoxjcvtypoii.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_yfKBDqPQsdXY2dNhkuUPRw_7pea76ia';
var supabaseClient = null;

let userProfile = null;
let existingOrder = null;
let isEditingMode = false;
let cart = {}; // Key: item_id + '_' + size
let kidsDens = [];
const CUSTOM_ITEMS_STORAGE_KEY = 'pack152_custom_scoutshop_items';
const MAX_CUSTOM_ITEMS = 20;
const ACTIVE_ORDER_STATUSES = [
  'placed',
  'Ordered (on platform)',
  'Payment Verified',
  'Order Placed (inside scout shop)'
];

document.addEventListener('DOMContentLoaded', async () => {
  if (window.supabase) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    await window.initExchangeRate();
    await initOrdering();
    renderSavedCustomItems();
  }
});

// Payment verification is the authoritative lock for parent order changes.
function isOrderLocked(order) {
  return Boolean(order && order.payment_verified === true);
}

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

  const { data: profile } = await supabaseClient
    .from('profile')
    .select('*')
    .eq('id', user.id)
    .single();
  userProfile = profile;

  if (profile && Array.isArray(profile.kids)) {
    kidsDens = profile.kids.map(k => {
      if (typeof k === 'object' && k !== null && k.rank) return String(k.rank).trim().toLowerCase();
      return String(k || '').trim().toLowerCase();
    });
  }

  await loadCatalog();

  const { data: orders } = await supabaseClient
    .from('orders')
    .select('*')
    .eq('user_id', user.id)
    .in('status', ACTIVE_ORDER_STATUSES)
    .order('created_at', { ascending: false });
  if (orders && orders.length > 0) {
    existingOrder = orders[0];
    showOrderBanner(existingOrder);
  }
}

window.confirmDeleteOrder = function() {
  if (!existingOrder) return;

  if (isOrderLocked(existingOrder)) {
    window.showToast('Your order has been processed and cannot be deleted. Please email pack152berlin@gmail.com.', 'error');
    return;
  }

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
    },
    'Delete Order'
  );
};

async function loadCatalog() {
  const container = document.getElementById('catalog-container');
  const { data: items, error } = await supabaseClient.from('items').select('*').order('name');

  if (error || !items) {
    container.innerHTML = '<p style="color:#ef4444;">Failed to load items catalog.</p>';
    return;
  }

  window.catalogItems = Object.fromEntries(items.map(item => [item.id, item]));

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
            const initialSku = hasSizes ? 'Per-size SKUs' : (item.sku || 'N/A');

            return `
              <div class="item-card" onclick="window.openItemDetails('${item.id}')">
                <div>
                  <img src="${item.image_url || 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&w=400&q=80'}" class="item-image" alt="${window.escapeHtml(item.name)}" />
                  <div class="item-heading">
                    <div class="item-title">${window.escapeHtml(item.name)}</div>
                    <span id="sku-badge-${item.id}" class="badge-sku item-sku">${window.escapeHtml(initialSku)}</span>
                  </div>
                </div>
                <div>
                  <div class="item-price">${window.formatPriceDisplay(item.price)}</div>

                  <button class="btn-add" onclick="event.stopPropagation(); window.addToCart('${item.id}', '${window.escapeHtml(item.name)}', ${item.price}, '${item.sku || ''}', ${hasSizes})">+ Add to Cart</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </details>
    `;
  }).join('');
}

window.openItemDetails = function(itemId) {
  const item = window.catalogItems && window.catalogItems[itemId];
  if (!item) return;

  const modal = document.getElementById('item-detail-modal');
  document.getElementById('item-detail-image').src = item.image_url || 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&w=800&q=80';
  document.getElementById('item-detail-image').alt = item.name || 'Catalog item';
  document.getElementById('item-detail-den').textContent = item.target_den || 'General';
  document.getElementById('item-detail-title').textContent = item.name || 'Catalog item';
  document.getElementById('item-detail-description').textContent = item.description || 'No additional description provided.';
  document.getElementById('item-detail-price').textContent = window.formatPriceDisplay(item.price);
  const sizes = (Array.isArray(item.sizes) ? item.sizes : []).map(size => window.normalizeSize(size, item.sku)).filter(Boolean);
  document.getElementById('item-detail-sku').textContent = sizes.length ? 'Per-size SKUs' : (item.sku || 'N/A');
  document.getElementById('item-detail-sizes').textContent = sizes.length
    ? `Available sizes: ${sizes.map(size => `${size.size} (${size.sku})`).join(', ')}`
    : 'No size variants';
  modal.style.display = 'flex';
};

window.closeItemDetails = function() {
  document.getElementById('item-detail-modal').style.display = 'none';
};

window.addToCart = function(id, name, price, defaultSku, hasSizes) {
  if (existingOrder && isOrderLocked(existingOrder)) {
    window.showToast('Your order has been verified or processed. Please email pack152berlin@gmail.com to change your order.', 'error');
    return;
  }

  if (existingOrder && !isEditingMode) {
    window.showToast('You already have an active order. Click "Change Order" to edit.', 'error');
    return;
  }

  if (hasSizes) {
    window.openSizePicker(id, name, price, defaultSku);
    return;
  }

  addCartItem(id, name, price, defaultSku, null);
};

function addCartItem(id, name, price, activeSku, selectedSize) {
  if (existingOrder && isOrderLocked(existingOrder)) return;

  const cartKey = `${id}_${selectedSize || 'default'}`;
  const catalogItem = window.catalogItems && window.catalogItems[id];

  if (!cart[cartKey]) {
    cart[cartKey] = {
      id,
      name,
      price: Number(price),
      sku: activeSku,
      size: selectedSize,
      description: catalogItem?.description || '',
      image_url: catalogItem?.image_url || '',
      quantity: 0
    };
  }
  cart[cartKey].quantity += 1;
  renderCart();
}

window.openSizePicker = function(id, name, price, defaultSku) {
  const item = window.catalogItems && window.catalogItems[id];
  const sizes = item && Array.isArray(item.sizes)
    ? item.sizes.map(size => window.normalizeSize(size, item.sku)).filter(Boolean)
    : [];
  const options = document.getElementById('size-picker-options');
  document.getElementById('size-picker-title').textContent = name;
  options.innerHTML = sizes.map(size => `
    <button type="button" class="size-picker-option" onclick="window.chooseSize('${id}', '${window.escapeHtml(name)}', ${price}, '${window.escapeHtml(size.sku || defaultSku)}', '${window.escapeHtml(size.size)}')">
      ${window.escapeHtml(size.size)}
    </button>
  `).join('');
  document.getElementById('size-picker-modal').style.display = 'flex';
};

window.chooseSize = function(id, name, price, sku, size) {
  addCartItem(id, name, price, sku, size);
  window.closeSizePicker();
};

window.closeSizePicker = function() {
  document.getElementById('size-picker-modal').style.display = 'none';
};

window.updateQty = function(cartKey, delta) {
  if (existingOrder && isOrderLocked(existingOrder)) {
    window.showToast('Order is locked and cannot be modified.', 'error');
    return;
  }

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
  const totalQuantity = itemsList.reduce((sum, [, item]) => sum + Number(item.quantity || 0), 0);
  const countEl = document.getElementById('cart-count');
  if (countEl) countEl.textContent = totalQuantity;
  if (itemsList.length === 0) {
    container.innerHTML = '<p style="font-size: 0.875rem; color: #94a3b8;">Your cart is empty.</p>';
    renderCartModal();
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

  renderCartModal();

  const totalEur = Math.round(totalUsd * window.eurExchangeRate * 100) / 100;
  totalUsdEl.textContent = `$${totalUsd.toFixed(2)}`;
  totalEurEl.textContent = `€${totalEur.toFixed(2)}`;
  btn.disabled = !!(existingOrder && isOrderLocked(existingOrder));
}

function renderCartModal() {
  const modalItems = document.getElementById('cart-modal-items');
  if (!modalItems) return;

  const itemsList = Object.entries(cart);
  if (itemsList.length === 0) {
    modalItems.innerHTML = '<p class="cart-empty-message">Your cart is empty.</p>';
    return;
  }

  modalItems.innerHTML = itemsList.map(([cartKey, item]) => {
    const catalogItem = window.catalogItems && window.catalogItems[item.id];
    const sizes = catalogItem && Array.isArray(catalogItem.sizes)
      ? catalogItem.sizes.map(size => window.normalizeSize(size, catalogItem.sku)).filter(Boolean)
      : [];
    const sizeControl = sizes.length
      ? `<select class="cart-size-select" onchange="window.changeCartSize('${cartKey}', this.value)" ${isOrderLocked(existingOrder) ? 'disabled' : ''}>
          ${sizes.map(size => `<option value="${window.escapeHtml(size.size)}" ${size.size === item.size ? 'selected' : ''}>${window.escapeHtml(size.size)}</option>`).join('')}
        </select>`
      : '<span class="cart-no-size">One size</span>';

    return `<div class="cart-modal-row">
      <div class="cart-modal-item-info">
        <strong>${window.escapeHtml(item.name)}</strong>
        <span class="badge-sku">${window.escapeHtml(item.sku || 'N/A')}</span>
        ${sizeControl}
      </div>
      <div class="qty-controls">
        <button class="btn-qty" onclick="window.updateQty('${cartKey}', -1)" ${isOrderLocked(existingOrder) ? 'disabled' : ''}>-</button>
        <span>${item.quantity}</span>
        <button class="btn-qty" onclick="window.updateQty('${cartKey}', 1)" ${isOrderLocked(existingOrder) ? 'disabled' : ''}>+</button>
      </div>
    </div>`;
  }).join('');
}

window.openCartModal = function() {
  renderCartModal();
  document.getElementById('cart-modal').style.display = 'flex';
};

window.closeCartModal = function() {
  document.getElementById('cart-modal').style.display = 'none';
};

window.changeCartSize = function(cartKey, newSize) {
  if (existingOrder && isOrderLocked(existingOrder)) return;

  const item = cart[cartKey];
  if (!item || item.size === newSize) return;

  const catalogItem = window.catalogItems && window.catalogItems[item.id];
  const sizeOption = catalogItem && (catalogItem.sizes || [])
    .map(size => window.normalizeSize(size, catalogItem.sku))
    .find(size => size && size.size === newSize);
  const nextKey = `${item.id}_${newSize || 'default'}`;

  if (cart[nextKey]) {
    cart[nextKey].quantity += item.quantity;
    delete cart[cartKey];
  } else {
    cart[nextKey] = { ...item, size: newSize, sku: sizeOption ? sizeOption.sku : item.sku };
    delete cart[cartKey];
  }
  renderCart();
};

window.submitOrder = async function() {
  const btn = document.getElementById('place-order-btn');

  if (existingOrder && isOrderLocked(existingOrder)) {
    window.showToast('Your order has been verified or processed. Please email pack152berlin@gmail.com to change your order.', 'error');
    btn.disabled = true;
    btn.textContent = 'Order Locked (Payment Verified)';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Submitting...';

  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    const itemsList = Object.values(cart);
    const totalAmount = itemsList.reduce((sum, i) => sum + (i.price * i.quantity), 0);

    let orderId = null;

    if (existingOrder && isEditingMode) {
      const { data, error } = await supabaseClient.from('orders').update({
        items: itemsList,
        total_amount: totalAmount,
        updated_at: new Date().toISOString()
      }).eq('id', existingOrder.id).select().single();

      if (error) throw error;
      orderId = data.id;
      window.showToast('Order updated successfully!', 'success');
    } else {
      const { data, error } = await supabaseClient.from('orders').insert({
        user_id: user.id,
        parent_name: userProfile ? userProfile.parent_name : 'Parent',
        items: itemsList,
        total_amount: totalAmount,
        status: 'Ordered (on platform)'
      }).select().single();

      if (error) throw error;
      orderId = data.id;
      window.showToast('Order placed successfully!', 'success');
    }

    try {
      const { data: fnData, error: fnErr } = await supabaseClient.functions.invoke('send-order-email', {
        body: { orderId: orderId, email: user.email }
      });
      if (!fnErr && fnData?.referenceCode) {
        window.showToast(`Reference Code: ${fnData.referenceCode} - Payment email sent!`, 'success');
      }
    } catch (e) {
      console.warn('Edge Function trigger warning:', e);
    }

    setTimeout(() => window.location.reload(), 1500);
  } catch (err) {
    window.showToast(err.message || 'Failed to submit order.', 'error');
    btn.disabled = false;
    btn.textContent = isEditingMode ? 'Update Existing Order' : 'Place Order';
  }
};

function getSavedCustomItems() {
  try {
    const saved = JSON.parse(localStorage.getItem(CUSTOM_ITEMS_STORAGE_KEY) || '[]');
    return Array.isArray(saved) ? saved.filter(item => item && item.sku && item.name) : [];
  } catch (error) {
    return [];
  }
}

function saveCustomItem(item) {
  const existingItems = getSavedCustomItems().filter(saved => String(saved.sku) !== String(item.sku));
  const savedItems = [item, ...existingItems].slice(0, MAX_CUSTOM_ITEMS);
  localStorage.setItem(CUSTOM_ITEMS_STORAGE_KEY, JSON.stringify(savedItems));
  return savedItems;
}

function renderSavedCustomItems(items = getSavedCustomItems()) {
  const previewEl = document.getElementById('custom-item-preview');
  if (!previewEl) return;

  if (items.length === 0) {
    previewEl.innerHTML = '';
    return;
  }

  previewEl.innerHTML = items.map(item => `
    <div class="custom-item-preview-card">
      <div class="custom-item-preview-heading">
        <strong>${window.escapeHtml(item.name)}</strong>
        <span class="badge-sku">${window.escapeHtml(item.sku)}</span>
      </div>
      ${item.description ? `<p class="custom-item-preview-description">${window.escapeHtml(item.description)}</p>` : ''}
      <div class="custom-item-preview-footer">
        <span class="custom-item-preview-price">$${Number(item.price || 0).toFixed(2)}</span>
        <button class="btn-add" onclick="window.addToCart('${item.id}', '${window.escapeHtml(item.name)}', ${Number(item.price) || 0}, '${window.escapeHtml(item.sku)}', false)">+ Add to Cart</button>
      </div>
    </div>
  `).join('');
}

window.fetchCustomScoutShopItem = async function() {
  if (existingOrder && isOrderLocked(existingOrder)) {
    window.showToast('Your order is locked and cannot be updated.', 'error');
    return;
  }

  const inputEl = document.getElementById('custom-sku-input');
  const previewEl = document.getElementById('custom-item-preview');
  const sku = (inputEl.value || '').trim();

  if (!sku) {
    window.showToast('Please enter a valid SKU', 'error');
    return;
  }

  previewEl.innerHTML = '<p style="color:#94a3b8; font-size:0.875rem;">Fetching product details from ScoutShop...</p>';

  try {
    const { data, error } = await supabaseClient.functions.invoke('fetch-scoutshop-item', {
      body: { sku }
    });

    if (error || !data?.success) {
      throw new Error(error?.message || data?.error || 'Product not found');
    }

    const item = data.item;

    const savedItems = saveCustomItem({
      id: item.id,
      sku: String(item.sku),
      name: String(item.name),
      description: item.description ? String(item.description) : '',
      price: Number(item.price) || 0
    });
    renderSavedCustomItems(savedItems);
    inputEl.value = '';

    window.showToast('Item retrieved successfully!', 'success');
  } catch (err) {
    previewEl.innerHTML = `<p style="color:#ef4444; font-size:0.875rem;">${window.escapeHtml(err.message)}</p>`;
  }
};

function showOrderBanner(order) {
  const banner = document.getElementById('order-banner');
  const details = document.getElementById('order-banner-details');
  const totalItems = (order.items || []).reduce((sum, i) => sum + i.quantity, 0);
  const refText = order.reference_code ? ` | Ref: ${order.reference_code}` : '';

  details.textContent = `Status: ${order.status || 'Ordered'} | Items: ${totalItems} | Total: ${window.formatPriceDisplay(order.total_amount)}${refText}`;
  banner.style.display = 'flex';
  updateCatalogButtonState();
}

function updateCatalogButtonState() {
  const addBtns = document.querySelectorAll('.btn-add');
  const locked = isOrderLocked(existingOrder);

  addBtns.forEach(btn => {
    btn.disabled = !!(existingOrder && (!isEditingMode || locked));
  });

  const orderBtn = document.getElementById('place-order-btn');
  const bannerEditBtn = document.querySelector('.btn-edit');
  const bannerDeleteBtn = document.querySelector('.btn-delete');

  if (existingOrder) {
    if (locked) {
      if (bannerEditBtn) bannerEditBtn.style.display = 'inline-block';
      if (bannerDeleteBtn) bannerDeleteBtn.style.display = 'none';
      if (orderBtn) {
        orderBtn.disabled = true;
        orderBtn.textContent = 'Order Locked (Payment Verified)';
      }
    } else if (!isEditingMode) {
      if (bannerEditBtn) bannerEditBtn.style.display = 'inline-block';
      if (bannerDeleteBtn) bannerDeleteBtn.style.display = 'inline-block';
      if (orderBtn) {
        orderBtn.disabled = true;
        orderBtn.textContent = 'Order Already Placed';
      }
    }
  }
}

window.enableEditOrder = function() {
  if (!existingOrder) return;

  if (isOrderLocked(existingOrder)) {
    window.showConfirmModal(
      'Order Cannot Be Changed',
      'Payment has been verified for this order. Please email pack152berlin@gmail.com to request a change.',
      () => {},
      'Close'
    );
    return;
  }

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