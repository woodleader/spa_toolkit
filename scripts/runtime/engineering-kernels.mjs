const WATER_VAPOR_GAS_CONSTANT = 0.4615;

export function saturationPressureHPa(temperatureC) {
  return 6.1094 * Math.exp((17.625 * temperatureC) / (temperatureC + 243.04));
}

export function dewPointC(actualPressureHPa) {
  if (actualPressureHPa <= 0) return -273.15;
  const logarithm = Math.log(actualPressureHPa / 6.1094);
  return (243.04 * logarithm) / (17.625 - logarithm);
}

export function calculateDesiccant(scenario) {
  const saturation = saturationPressureHPa(Number(scenario.sealingTemperatureC));
  const actualPressure = Number(scenario.relativeHumidityPct) * saturation / 100;
  const dewPoint = dewPointC(actualPressure);
  const initialMoistureG = (actualPressure * Number(scenario.volumeL) * 0.1) / (WATER_VAPOR_GAS_CONSTANT * (Number(scenario.sealingTemperatureC) + 273.15));
  const ingressMoistureG = (Number(scenario.sealAreaCm2 ?? 0) / 10000) * Number(scenario.mvtrGPerM2Day ?? 0) * Number(scenario.serviceLifeYears ?? 0) * 365;
  const totalMoistureG = initialMoistureG + ingressMoistureG;
  const theoreticalDesiccantG = totalMoistureG / Number(scenario.absorptionGPerG);
  const recommendedDesiccantG = theoreticalDesiccantG * Number(scenario.safetyFactor ?? 1);
  const foggingMarginC = Number(scenario.minimumTemperatureC) - dewPoint;
  const foggingStatus = foggingMarginC > 5 ? 'safe' : foggingMarginC > 0 ? 'warning' : 'danger';
  return Object.freeze({ saturationPressureHPa: saturation, actualPressureHPa: actualPressure, dewPointC: dewPoint, initialMoistureG, ingressMoistureG, totalMoistureG, theoreticalDesiccantG, recommendedDesiccantG, foggingMarginC, foggingStatus });
}

export function calculateReactionScenario(scenario) {
  const speedMps = Number(scenario.speedKmh) / 3.6;
  const distanceM = Number(scenario.distanceM);
  const warningDelayS = scenario.warningMode === 'distance'
    ? Math.max(0, (distanceM - Number(scenario.warningThreshold)) / Math.max(speedMps, 1e-6))
    : Math.max(0, distanceM / Math.max(speedMps, 1e-6) - Number(scenario.warningThreshold));
  const distanceAtWarningM = Math.max(0, distanceM - speedMps * warningDelayS);
  const brakeDelayS = Number(scenario.brakeDelayMs) / 1000;
  const reactionDistanceM = speedMps * (Number(scenario.reactionTimeS) + brakeDelayS);
  const brakingDistanceM = speedMps ** 2 / (2 * Math.max(0.01, Number(scenario.decelerationMps2)));
  const requiredDistanceM = reactionDistanceM + brakingDistanceM;
  const marginM = distanceAtWarningM - requiredDistanceM;
  return Object.freeze({ speedMps, warningDelayS, distanceAtWarningM, brakeDelayS, reactionDistanceM, brakingDistanceM, requiredDistanceM, marginM, canAvoid: marginM >= 0 });
}

export function calculateLatency({ fps, ecuLatencyMs, monitorLatencyMs, vehicleSpeedKmh }) {
  const sensorLatencyMs = 1000 / Math.max(0.001, Number(fps));
  const totalLatencyMs = sensorLatencyMs + Number(ecuLatencyMs) + Number(monitorLatencyMs);
  const positionOffsetM = totalLatencyMs / 1000 * (Number(vehicleSpeedKmh) / 3.6);
  return Object.freeze({ sensorLatencyMs, totalLatencyMs, positionOffsetM });
}

export function applyRadialDistortion(imageX, imageY, { resolutionWidth, resolutionHeight, distortionK }) {
  const halfDiagonal = Math.hypot(Number(resolutionWidth) / 2, Number(resolutionHeight) / 2);
  const normalizedRadius = Math.hypot(Number(imageX), Number(imageY)) / halfDiagonal;
  const factor = 1 + Number(distortionK) * normalizedRadius ** 2;
  return Object.freeze({ x: Number(imageX) / factor, y: Number(imageY) / factor });
}

export function calculateGroundFov({ cameraHeightM, cameraTiltRad, horizontalFovRad, verticalFovRad }) {
  const nearAngle = Number(cameraTiltRad) + Number(verticalFovRad) / 2;
  const farAngle = Number(cameraTiltRad) - Number(verticalFovRad) / 2;
  const nearDistanceM = nearAngle >= Math.PI / 2 ? 0 : Number(cameraHeightM) * Math.tan(Math.PI / 2 - nearAngle);
  const farDistanceM = farAngle <= 0 ? 200 : Math.min(Number(cameraHeightM) * Math.tan(Math.PI / 2 - farAngle), 200);
  const nearWidthM = 2 * (nearDistanceM > 0 ? nearDistanceM : Number(cameraHeightM)) * Math.tan(Number(horizontalFovRad) / 2);
  const farWidthM = 2 * farDistanceM * Math.tan(Number(horizontalFovRad) / 2);
  return Object.freeze({ nearDistanceM, farDistanceM, nearWidthM, farWidthM, blindSpotDistanceM: nearDistanceM });
}

export function calculateSensorTopFootprint({ x, y, orientationDeg, fieldOfViewDeg, rangeM }) {
  const svgX = -Number(y);
  const svgY = -Number(x);
  const svgOrientationDeg = Number(orientationDeg) - 90;
  const startAngle = (svgOrientationDeg - Number(fieldOfViewDeg) / 2) * Math.PI / 180;
  const endAngle = (svgOrientationDeg + Number(fieldOfViewDeg) / 2) * Math.PI / 180;
  return Object.freeze({
    originX: svgX,
    originY: svgY,
    startX: svgX + Number(rangeM) * Math.cos(startAngle),
    startY: svgY + Number(rangeM) * Math.sin(startAngle),
    endX: svgX + Number(rangeM) * Math.cos(endAngle),
    endY: svgY + Number(rangeM) * Math.sin(endAngle),
    largeArc: Number(fieldOfViewDeg) > 180 ? 1 : 0,
    orientationRad: svgOrientationDeg * Math.PI / 180
  });
}
