const SUPABASE_URL = 'https://ygoxjtgoyoxjcvtypoii.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_yfKBDqPQsdXY2dNhkuUPRw_7pea76ia';
var supabaseClient = null;

let userProfile = null;
let existingOrder = null;
let isEditingMode = false;
let cart = {};
let kidsDens = [];

document.addEventListener('DOMContentLoaded', async () => {
  if (window.supabase) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    await initExchangeRate();
    await initOrdering();
  }
});

async function initOrdering() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return;

  const { data: profile } = await supabaseClient.from('profile').select('*').eq('id', user.id).single();
  userProfile = profile;
  if (profile && profile.kids) {
    kidsDens = profile.kids.map(k => (k.rank || '').trim().toLowerCase());
  }

  const { data: orders } = await supabaseClient.from('orders').select('*').eq('user_id', user.id).eq('status', 'placed');
  if (orders && orders.length > 0) {
    existingOrder = orders[0];
    showOrderBanner(existingOrder);
  }

  await loadCatalog();
}

function showOrderBanner(order) {
  const banner = document.getElementById('order-banner');
  const details = document.getElementById('order-banner-details');
  const totalItems = order.items.reduce((sum, i) => sum + i.quantity, 0);
  details.textContent = `Total Items: ${totalItems} | Total: ${formatPriceDisplay(order.total_amount)} (Placed: ${new Date(order.created_at).toLocaleDateString()})`;
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

function enableEditOrder() {
  if (!existingOrder) return;
  isEditingMode = true;
  cart = {};
  existingOrder.items.forEach(i => {
    cart[i.id] = { ...i };
  });
  renderCart();
  updateCatalogButtonState();

  const orderBtn = document.getElementById('place-order-btn');
  orderBtn.disabled = false;
  orderBtn.textContent = 'Update Existing Order';

  showToast('Existing order loaded into cart. Make changes and click Update.', 'success');
}

function confirmDeleteOrder() {
  if (!existingOrder) return;
  showConfirmModal(
    'Delete Order?',
    'Are you sure you want to delete your active order? This cannot be undone.',
    async () => {
      try {
        const { error } = await supabaseClient.from('orders').update({ status: 'cancelled' }).eq('id', existingOrder.id);
        if (error) throw error;
        showToast('Order deleted successfully.', 'success');
        setTimeout(() => window.location.reload(), 1000);
      } catch (err) {
        showToast(err.message || 'Failed to delete order.', 'error');
      }
    }
  );
}

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
          <span>${escapeHtml(den)} Items ${isPriority ? '<span class="priority-badge">Your Scout\'s Den</span>' : ''}</span>
          <span style="font-size:0.85rem; color:#94a3b8;">▼</span>
        </summary>
        <div class="items-grid">
          ${groups[den].map(item => `
            <div class="item-card">
              <div>
                <img src="${item.image_url || 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&w=400&q=80'}" class="item-image" alt="${escapeHtml(item.name)}" />
                <div class="item-title">${escapeHtml(item.name)}</div>
                <div class="item-desc">${escapeHtml(item.description || '')}</div>
              </div>
              <div>
                <div class="item-price">${formatPriceDisplay(item.price)}</div>
                <button class="btn-add" onclick="addToCart('${item.id}', '${escapeHtml(item.name)}', ${item.price})">+ Add to Cart</button>
              </div>
            </div>
          `).join('')}
        </div>
      </details>
    `;
  }).join('');

  updateCatalogButtonState();
}

function addToCart(id, name, price) {
  if (existingOrder && !isEditingMode) {
    showToast('You already have an active order. Click "Change Order" to edit.', 'error');
    return;
  }

  if (!cart[id]) {
    cart[id] = { id, name, price: Number(price), quantity: 0 };
  }
  cart[id].quantity += 1;
  renderCart();
}

function updateQty(id, delta) {
  if (cart[id]) {
    cart[id].quantity += delta;
    if (cart[id].quantity <= 0) {
      delete cart[id];
    }
  }
  renderCart();
}

function renderCart() {
  const container = document.getElementById('cart-items');
  const totalUsdEl = document.getElementById('cart-total-usd');
  const totalEurEl = document.getElementById('cart-total-eur');
  const btn = document.getElementById('place-order-btn');

  const itemsList = Object.values(cart);
  if (itemsList.length === 0) {
    container.innerHTML = '<p style="font-size: 0.875rem; color: #94a3b8;">Your cart is empty.</p>';
    totalUsdEl.textContent = '$0.00';
    totalEurEl.textContent = '€0.00';
    btn.disabled = true;
    return;
  }

  let totalUsd = 0;
  container.innerHTML = itemsList.map(item => {
    const subtotal = item.price * item.quantity;
    totalUsd += subtotal;
    return `
      <div class="cart-item">
        <div>
          <div style="font-weight:700;">${escapeHtml(item.name)}</div>
          <div style="font-size:0.75rem; color:#94a3b8;">${formatPriceDisplay(item.price)} each</div>
        </div>
        <div class="qty-controls">
          <button class="btn-qty" onclick="updateQty('${item.id}', -1)">-</button>
          <span style="font-weight:700; width:18px; text-align:center;">${item.quantity}</span>
          <button class="btn-qty" onclick="updateQty('${item.id}', 1)">+</button>
        </div>
      </div>
    `;
  }).join('');

  const totalEur = Math.round(totalUsd * eurExchangeRate * 100) / 100;
  totalUsdEl.textContent = `$${totalUsd.toFixed(2)}`;
  totalEurEl.textContent = `€${totalEur.toFixed(2)}`;
  btn.disabled = false;
}

async function submitOrder() {
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
      showToast('Order updated successfully!', 'success');
    } else {
      const { error } = await supabaseClient.from('orders').insert({
        user_id: user.id,
        parent_name: userProfile ? userProfile.parent_name : 'Parent',
        items: itemsList,
        total_amount: totalAmount,
        status: 'placed'
      });
      if (error) throw error;
      showToast('Order placed successfully!', 'success');
    }

    setTimeout(() => window.location.reload(), 1200);
  } catch (err) {
    showToast(err.message || 'Failed to submit order.', 'error');
    btn.disabled = false;
    btn.textContent = isEditingMode ? 'Update Existing Order' : 'Place Order';
  }
}