// Reglas de negocio del programa de niveles — únicas y compartidas por
// todas las funciones para que cliente y admin nunca se desincronicen.

function computeLevel(points) {
  if (points >= 3000) return 'Oro';
  if (points >= 1000) return 'Plata';
  return 'Bronce';
}

function levelDiscount(level) {
  // Nuevos parámetros Club Open Wines: beneficio adicional sobre precio vigente
  // Bronce: sin beneficio adicional (solo descuento bienvenida 5% en 2da compra)
  // Plata: 5% adicional + beneficios exclusivos
  // Oro: 7% adicional + beneficios exclusivos
  return { Bronce: 0, Plata: 5, Oro: 7 }[level] || 0;
}

function nextLevelInfo(points) {
  if (points < 1000) return { nextLevel: 'Plata', pointsToNext: 1000 - points };
  if (points < 3000) return { nextLevel: 'Oro', pointsToNext: 3000 - points };
  return { nextLevel: null, pointsToNext: null };
}

// 5% OFF de bienvenida: en la segunda compra (todos los clientes Bronce)
function isWelcomeEligible(client, purchaseCount) {
  return purchaseCount === 1;
}

function effectiveDiscount(client, level, purchaseCount) {
  const base = levelDiscount(level);
  // Segunda compra: 5% OFF
  // Resto: beneficio según nivel (Plata 5%, Oro 7%)
  return isWelcomeEligible(client, purchaseCount) ? Math.max(5, base) : base;
}

module.exports = {
  computeLevel,
  levelDiscount,
  nextLevelInfo,
  isWelcomeEligible,
  effectiveDiscount,
};
