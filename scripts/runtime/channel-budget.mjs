export function solveCoefficients(frequency1MHz, loss1DbPerM, frequency2MHz, loss2DbPerM) {
  const f1 = Number(frequency1MHz) / 1000;
  const f2 = Number(frequency2MHz) / 1000;
  const l1 = Number(loss1DbPerM);
  const l2 = Number(loss2DbPerM);
  if (![f1, f2, l1, l2].every(Number.isFinite) || f1 <= 0 || f2 <= 0 || l1 < 0 || l2 < 0) {
    return { a: null, b: null, warning: 'Frequencies and losses must be finite positive values.', valid: false };
  }
  const sqrtF1 = Math.sqrt(f1);
  const sqrtF2 = Math.sqrt(f2);
  const denominator = f2 * sqrtF1 - f1 * sqrtF2;
  if (Math.abs(denominator) < 0.0001) {
    return { a: null, b: null, warning: 'Frequencies are too similar to solve. Choose more separated frequencies.', valid: false };
  }
  let b = (l2 * sqrtF1 - l1 * sqrtF2) / denominator;
  let warning = null;
  let a;
  if (b < 0) {
    b = 0;
    a = l1 / sqrtF1;
    warning = 'Dielectric coefficient calculated as negative (inconsistent data). Defaulted b=0, using skin-only model.';
  } else {
    a = (l1 - b * f1) / sqrtF1;
  }
  if (a < 0) return { a: null, b: null, warning: 'Calculated coefficients are physically impossible. Please check your datasheet values.', valid: false };
  const lossAt2GHz = a * Math.sqrt(2) + b * 2;
  if (lossAt2GHz < 0.05 || lossAt2GHz > 5) warning = `${warning ? `${warning} ` : ''}Warning: Calculated loss at 2 GHz is ${lossAt2GHz.toFixed(2)} dB/m, which is unusual.`;
  return { a, b, warning, valid: true };
}

export function solveSinglePoint(frequencyMHz, lossDbPerM) {
  const frequencyGHz = Number(frequencyMHz) / 1000;
  const loss = Number(lossDbPerM);
  if (!Number.isFinite(frequencyGHz) || frequencyGHz <= 0 || !Number.isFinite(loss) || loss < 0) {
    return { a: null, b: null, warning: 'Frequency and loss must be finite positive values.', valid: false, singlePoint: true };
  }
  return {
    a: (loss * 0.9) / Math.sqrt(frequencyGHz),
    b: (loss * 0.1) / frequencyGHz,
    warning: 'Coefficients estimated using 90/10 skin/dielectric split (single data point).',
    valid: true,
    singlePoint: true
  };
}

export function calculateChannelBudget(scenario) {
  const frequencyGHz = Math.max(0.000001, Number(scenario.frequencyGHz));
  const temperatureFactor = 1 + (Number(scenario.temperatureC) - Number(scenario.temperatureReferenceC)) * Number(scenario.temperatureCoefficient);
  const baseCableLossDb = scenario.segments.reduce((total, segment) => {
    const rate = segment.manualRateDbPerM ?? (Number(segment.a) * Math.sqrt(frequencyGHz) + Number(segment.b) * frequencyGHz);
    return total + Number(segment.lengthM) * rate;
  }, 0);
  const cableLossDb = baseCableLossDb * temperatureFactor;
  const connectors = scenario.connectors ?? {};
  const connectorLossDb = Number(connectors.count ?? 0) * Number(connectors.baseLossDb ?? 0) * Math.sqrt(frequencyGHz / Number(connectors.referenceFrequencyGHz ?? frequencyGHz));
  const pcb = scenario.pcb ?? {};
  const pcbLossDb = Number(pcb.lengthCm ?? 0) * Number(pcb.lossDbPerCm ?? 0) * Math.sqrt(frequencyGHz / Number(pcb.referenceFrequencyGHz ?? frequencyGHz));
  const safetyMarginDb = Number(scenario.safetyMarginDb ?? 0);
  const totalLossDb = cableLossDb + connectorLossDb + pcbLossDb + safetyMarginDb;
  const remainingMarginDb = Math.abs(Number(scenario.equalizerLimitDb)) - totalLossDb;
  return Object.freeze({ temperatureFactor, baseCableLossDb, cableLossDb, connectorLossDb, pcbLossDb, safetyMarginDb, totalLossDb, remainingMarginDb, passes: remainingMarginDb >= 0 });
}
