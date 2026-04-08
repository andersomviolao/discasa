export type HsvColor = {
  hue: number;
  saturation: number;
  value: number;
};

export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeHexColor(value: string): string | null {
  const raw = value.trim().replace(/^#/, "");

  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    const expanded = raw
      .split("")
      .map((character) => `${character}${character}`)
      .join("");

    return `#${expanded.toUpperCase()}`;
  }

  if (/^[0-9a-fA-F]{6}$/.test(raw)) {
    return `#${raw.toUpperCase()}`;
  }

  return null;
}

export function hexToRgb(hex: string): { red: number; green: number; blue: number } {
  const normalized = normalizeHexColor(hex) ?? "#E9881D";
  const value = normalized.slice(1);

  return {
    red: Number.parseInt(value.slice(0, 2), 16),
    green: Number.parseInt(value.slice(2, 4), 16),
    blue: Number.parseInt(value.slice(4, 6), 16),
  };
}

export function hexToRgbChannels(hex: string, fallbackHex = "#E9881D"): string {
  const normalized = normalizeHexColor(hex) ?? fallbackHex;
  const { red, green, blue } = hexToRgb(normalized);
  return `${red}, ${green}, ${blue}`;
}

export function tintHexColor(hex: string, amount: number, fallbackHex = "#E9881D"): string {
  const normalized = normalizeHexColor(hex) ?? fallbackHex;
  const { red, green, blue } = hexToRgb(normalized);
  const tinted = [red, green, blue].map((channel) => {
    const mixed = Math.round(channel + (255 - channel) * amount);
    return clampNumber(mixed, 0, 255).toString(16).padStart(2, "0");
  });

  return `#${tinted.join("").toUpperCase()}`;
}

export function rgbToHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue]
    .map((channel) => clampNumber(Math.round(channel), 0, 255).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

export function rgbToHsv(red: number, green: number, blue: number): HsvColor {
  const normalizedRed = red / 255;
  const normalizedGreen = green / 255;
  const normalizedBlue = blue / 255;

  const max = Math.max(normalizedRed, normalizedGreen, normalizedBlue);
  const min = Math.min(normalizedRed, normalizedGreen, normalizedBlue);
  const delta = max - min;

  let hue = 0;

  if (delta !== 0) {
    if (max === normalizedRed) {
      hue = ((normalizedGreen - normalizedBlue) / delta) % 6;
    } else if (max === normalizedGreen) {
      hue = (normalizedBlue - normalizedRed) / delta + 2;
    } else {
      hue = (normalizedRed - normalizedGreen) / delta + 4;
    }
  }

  hue = Math.round(hue * 60);
  if (hue < 0) {
    hue += 360;
  }

  return {
    hue,
    saturation: max === 0 ? 0 : delta / max,
    value: max,
  };
}

export function hsvToRgb(hue: number, saturation: number, value: number): { red: number; green: number; blue: number } {
  const normalizedHue = ((hue % 360) + 360) % 360;
  const chroma = value * saturation;
  const huePrime = normalizedHue / 60;
  const x = chroma * (1 - Math.abs((huePrime % 2) - 1));

  let red = 0;
  let green = 0;
  let blue = 0;

  if (huePrime >= 0 && huePrime < 1) {
    red = chroma;
    green = x;
  } else if (huePrime >= 1 && huePrime < 2) {
    red = x;
    green = chroma;
  } else if (huePrime >= 2 && huePrime < 3) {
    green = chroma;
    blue = x;
  } else if (huePrime >= 3 && huePrime < 4) {
    green = x;
    blue = chroma;
  } else if (huePrime >= 4 && huePrime < 5) {
    red = x;
    blue = chroma;
  } else {
    red = chroma;
    blue = x;
  }

  const match = value - chroma;

  return {
    red: Math.round((red + match) * 255),
    green: Math.round((green + match) * 255),
    blue: Math.round((blue + match) * 255),
  };
}

export function hexToHsv(hex: string): HsvColor {
  const { red, green, blue } = hexToRgb(hex);
  return rgbToHsv(red, green, blue);
}

export function hsvToHex(hue: number, saturation: number, value: number): string {
  const { red, green, blue } = hsvToRgb(hue, saturation, value);
  return rgbToHex(red, green, blue);
}
