import Decimal from 'decimal.js';

Decimal.set({
  precision: 28,
  rounding: Decimal.ROUND_HALF_UP,
});

export function d(value: Decimal.Value | null | undefined): Decimal {
  if (value === null || value === undefined || value === '') {
    return new Decimal(0);
  }
  return new Decimal(value);
}

export function round2(value: Decimal.Value): Decimal {
  return d(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export function round4(value: Decimal.Value): Decimal {
  return d(value).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
}

export function toNumeric2(value: Decimal.Value): string {
  return round2(value).toFixed(2);
}

export function toNumeric4(value: Decimal.Value): string {
  return round4(value).toFixed(4);
}

export function monthStartUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
}

export function toIsoDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}
