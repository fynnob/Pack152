// Exchange Rate Manager
window.eurExchangeRate = 0.86;
const THIRTY_SIX_HOURS_MS = 36 * 60 * 60 * 1000;

window.initExchangeRate = async function() {
  const cachedRate = localStorage.getItem('pack152_eur_rate');
  const cachedExpiry = localStorage.getItem('pack152_eur_rate_expiry');
  const now = Date.now();

  if (cachedRate && cachedExpiry && now < Number(cachedExpiry)) {
    window.eurExchangeRate = parseFloat(cachedRate);
    return;
  }

  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    const data = await res.json();
    if (data && data.rates && data.rates.EUR) {
      window.eurExchangeRate = Number(data.rates.EUR);
      localStorage.setItem('pack152_eur_rate', window.eurExchangeRate.toString());
      localStorage.setItem('pack152_eur_rate_expiry', (now + THIRTY_SIX_HOURS_MS).toString());
    }
  } catch (err) {
    console.warn('Exchange rate fetch failed, using fallback rate:', err);
  }
};

window.formatPriceDisplay = function(usdAmount) {
  const usd = Number(usdAmount || 0);
  const eur = Math.round(usd * window.eurExchangeRate * 100) / 100;
  return `$${usd.toFixed(2)} (€${eur.toFixed(2)})`;
};