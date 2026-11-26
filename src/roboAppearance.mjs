export const ROBO_BODY_PALETTE = {
  Cloud: { hex: '#f4f4f5', rgb: '255, 255, 255' },
  Mint: { hex: '#6ee7b7', rgb: '110, 231, 183' },
  Sky: { hex: '#7dd3fc', rgb: '125, 211, 252' },
  Rose: { hex: '#f9a8d4', rgb: '249, 168, 212' },
  Classic: { hex: '#4b5563', rgb: '148, 163, 184' },
  Night: { hex: '#27272a', rgb: '82, 82, 91' },
  Blue: { hex: '#3b82f6', rgb: '59, 130, 246' },
  Purple: { hex: '#8b5cf6', rgb: '139, 92, 246' },
  Pink: { hex: '#ec4899', rgb: '236, 72, 153' },
  Gold: { hex: '#f59e0b', rgb: '245, 158, 11' },
};

export function resolveRoboAppearance(settings = {}) {
  const rawOutfit = settings?.outfit;
  const outfit = !rawOutfit || rawOutfit === 'Best' ? 'None' : rawOutfit;
  const seasonalOutfits = Boolean(settings?.seasonalOutfits);
  const bodyColor =
    settings?.bodyColor && ROBO_BODY_PALETTE[settings.bodyColor]
      ? settings.bodyColor
      : 'Night';
  const palette = ROBO_BODY_PALETTE[bodyColor] || ROBO_BODY_PALETTE.Night;
  const eyeColorHex =
    typeof settings?.eyeColorHex === 'string' && settings.eyeColorHex.trim()
      ? settings.eyeColorHex.trim()
      : '#ffffff';

  return {
    outfit,
    seasonalOutfits,
    bodyColor,
    bodyHex: palette.hex,
    bodyRgb: palette.rgb,
    eyeColorHex,
    cssVars: {
      '--robo-eye-color': eyeColorHex,
      '--robo-body-hex': palette.hex,
      '--robo-body-rgb': palette.rgb,
    },
  };
}
