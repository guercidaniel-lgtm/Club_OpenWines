// Reglas de negocio del programa de niveles — únicas y compartidas por
// todas las funciones para que cliente y admin nunca se desincronicen.

function computeLevel(points) {
  if (points >= 3000) return 'Oro';
  if (points >= 1000) return 'Plata';
  return 'Bronce';
}

function levelDiscount(level) {
  return { Bronce: 5, Plata: 10, Oro: 15 }[level] || 0;
}

function nextLevelInfo(points) {
  if (points < 1000) return { nextLevel: 'Plata', pointsToNext: 1000 - points };
  if (points < 3000) return { nextLevel: 'Oro', pointsToNext: 3000 - points };
  return { nextLevel: null, pointsToNext: null };
}

// 15% off de bienvenida: referidos y altas de restaurante, en su primera compra.
function isWelcomeEligible(client, purchaseCount) {
  return ['referido', 'restaurante'].includes(client.origin) && purchaseCount === 0;
}

function effectiveDiscount(client, level, purchaseCount) {
  const base = levelDiscount(level);
  return isWelcomeEligible(client, purchaseCount) ? Math.max(15, base) : base;
}

module.exports = {
  computeLevel,
  levelDiscount,
  nextLevelInfo,
  isWelcomeEligible,
  effectiveDiscount,
};
