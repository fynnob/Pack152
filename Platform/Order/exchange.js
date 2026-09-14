let eurExchangeRate = 0.86;
const THIRTY_SIX_HOURS_MS = 36 * 60 * 60 * 1000;

async function initExchangeRate() {
  const cachedRate = localStorage.getItem('pack152_eur_rate');
  const cachedExpiry = localStorage.getItem('pack152_eur_rate_expiry');
  const now = Date.now();

  if (cachedRate && cachedExpiry && now < Number(cachedExpiry)) {
    eurExchangeRate = parseFloat(cachedRate);
    return;
  }

  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    const data = await res.json();
    if (data && data.rates && data.rates.EUR) {
      eurExchangeRate = Number(data.rates.EUR);
      localStorage.setItem('pack152_eur_rate', eurExchangeRate.toString());
      localStorage.setItem('pack152_eur_rate_expiry', (now + THIRTY_SIX_HOURS_MS).toString());
    }
  } catch (err) {
    console.warn('Exchange rate fetch failed, using fallback rate:', err);
  }
}

function formatPriceDisplay(usdAmount) {
  const usd = Number(usdAmount);
  const eur = Math.round(usd * eurExchangeRate * 100) / 100;
  return `$${usd.toFixed(2)} (€${eur.toFixed(2)})`;
}