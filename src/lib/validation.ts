// One set of rules for everything a person or an outside system can enter.
//
// Every entry form and API goes through these, so a bad value is turned away
// with a plain 4xx message instead of crashing into a database error. Each
// helper returns a clean, correctly typed value or throws a ValidationError,
// which apiErrorResponse (src/lib/apiError.ts) turns into a 400.

/** The entry is wrong. The message is safe to show to the person who typed it. */
export class ValidationError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/** The record asked for doesn't exist. */
export class NotFoundError extends Error {
  readonly status = 404;
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

/** The request is fine but clashes with the current state (a duplicate, or money already applied). */
export class ConflictError extends Error {
  readonly status = 409;
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

/** The largest value a money column (numeric(14,2)) can hold. */
export const MAX_MONEY = 999_999_999_999.99;
/** The largest quantity (numeric(14,4)) and unit price we accept. */
export const MAX_QTY = 9_999_999_999;
export const MAX_LINES = 500;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Deliberately plain: one @, something on each side, a dot in the domain, no spaces.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

interface FieldOptions {
  /** Defaults to true. When false, a missing value gives undefined instead of an error. */
  required?: boolean;
}

function missing(field: string): never {
  throw new ValidationError(`${field} is required.`);
}

/** A JSON object (not null, an array, or a bare value). */
export function asRecord(value: unknown, what = 'The request'): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${what} must be a JSON object.`);
  }
  return value as Record<string, unknown>;
}

/** Trimmed text of a sensible length with no control characters. */
export function text(value: unknown, field: string, opts: FieldOptions & { max?: number } = {}): string {
  const { required = true, max = 200 } = opts;
  if (value === undefined || value === null || value === '') {
    if (!required) return '' as string;
    return missing(field);
  }
  if (typeof value !== 'string') throw new ValidationError(`${field} must be text.`);
  const trimmed = value.trim();
  if (!trimmed) {
    if (!required) return '' as string;
    return missing(field);
  }
  if (trimmed.length > max) throw new ValidationError(`${field} can be at most ${max} characters.`);
  if (CONTROL_CHARS.test(trimmed)) throw new ValidationError(`${field} contains characters that aren't allowed.`);
  return trimmed;
}

/** Optional text: undefined when blank. */
export function optText(value: unknown, field: string, max = 200): string | undefined {
  const t = text(value, field, { required: false, max });
  return t === '' ? undefined : t;
}

export function uuid(value: unknown, field: string): string {
  if (value === undefined || value === null || value === '') return missing(field);
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw new ValidationError(`${field} is not valid. Choose it from the list.`);
  }
  return value.toLowerCase();
}

export function optUuid(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return uuid(value, field);
}

export function email(value: unknown, field = 'Email'): string {
  const t = text(value, field, { max: 254 });
  if (!EMAIL.test(t)) throw new ValidationError(`${field} doesn't look like an email address.`);
  return t;
}

export function optEmail(value: unknown, field = 'Email'): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return email(value, field);
}

const currencyCodes = new Set(
  (typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('currency') : ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'MXN', 'JPY', 'CNY', 'INR', 'BRL']),
);

/** An ISO 4217 currency code such as USD. */
export function currency(value: unknown, field = 'Currency'): string {
  const t = text(value, field, { max: 3 }).toUpperCase();
  if (!/^[A-Z]{3}$/.test(t) || !currencyCodes.has(t)) throw new ValidationError(`${field} "${t}" isn't a recognised currency code.`);
  return t;
}

export function optCurrency(value: unknown, field = 'Currency'): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return currency(value, field);
}

export function oneOf<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  if (value === undefined || value === null || value === '') return missing(field);
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw new ValidationError(`${field} must be one of: ${allowed.join(', ')}.`);
  }
  return value as T;
}

export function optOneOf<T extends string>(value: unknown, field: string, allowed: readonly T[]): T | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return oneOf(value, field, allowed);
}

interface NumberOptions extends FieldOptions {
  min?: number;
  max?: number;
  /** Most decimal places allowed. Money is 2, quantities and unit prices are 4. */
  decimals?: number;
  /** Allow exactly zero even when min is above zero. */
  allowZero?: boolean;
}

function number(value: unknown, field: string, opts: NumberOptions): number {
  const { min = 0, max = MAX_MONEY, decimals = 2 } = opts;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new ValidationError(`${field} must be a number.`);
  const scaled = Math.round(value * 10 ** decimals);
  if (Math.abs(scaled - value * 10 ** decimals) > 1e-6) {
    throw new ValidationError(`${field} can have at most ${decimals} decimal place${decimals === 1 ? '' : 's'}.`);
  }
  if (value === 0 && opts.allowZero) return 0;
  if (value < min) throw new ValidationError(min > 0 ? `${field} must be greater than zero.` : `${field} can't be negative.`);
  if (value > max) throw new ValidationError(`${field} is too large.`);
  return value;
}

/**
 * An amount of money in dollars (or any currency), to the cent.
 * By default it must be greater than zero; pass allowZero for fields like a price.
 */
export function money(value: unknown, field: string, opts: NumberOptions = {}): number {
  if (value === undefined || value === null) {
    if (opts.required === false) return undefined as unknown as number;
    return missing(field);
  }
  return number(value, field, { min: 0.01, max: MAX_MONEY, decimals: 2, ...opts });
}

export function optMoney(value: unknown, field: string, opts: NumberOptions = {}): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return money(value, field, opts);
}

/** A quantity: greater than zero, up to 4 decimals. */
export function quantity(value: unknown, field = 'Quantity'): number {
  if (value === undefined || value === null) return missing(field);
  return number(value, field, { min: 0.0001, max: MAX_QTY, decimals: 4 });
}

/** A unit price: zero or more, up to 4 decimals. */
export function unitPrice(value: unknown, field = 'Unit price'): number {
  if (value === undefined || value === null) return missing(field);
  return number(value, field, { min: 0, max: MAX_MONEY, decimals: 4, allowZero: true });
}

/** A real calendar date written YYYY-MM-DD (so 2026-02-30 and "yesterday" are refused). */
export function isoDate(value: unknown, field = 'Date'): string {
  if (value === undefined || value === null || value === '') return missing(field);
  if (typeof value !== 'string') throw new ValidationError(`${field} must be a date written YYYY-MM-DD.`);
  const match = ISO_DATE.exec(value);
  if (!match) throw new ValidationError(`${field} must be a date written YYYY-MM-DD.`);
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const real = new Date(Date.UTC(y, m - 1, d));
  if (real.getUTCFullYear() !== y || real.getUTCMonth() !== m - 1 || real.getUTCDate() !== d || y < 1900 || y > 2200) {
    throw new ValidationError(`${field} isn't a real date.`);
  }
  return value;
}

export function optIsoDate(value: unknown, field = 'Date'): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return isoDate(value, field);
}

/** Today as YYYY-MM-DD, used when an entry leaves its date blank. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** The later date must not be earlier than the first. Both are YYYY-MM-DD, so plain comparison is correct. */
export function dateNotBefore(later: string | undefined, earlier: string, laterName: string, earlierName: string): void {
  if (later && later < earlier) throw new ValidationError(`${laterName} can't be before ${earlierName}.`);
}

/** An array of entries, at least min and at most MAX_LINES long. */
export function list(value: unknown, field: string, opts: { min?: number; max?: number } = {}): unknown[] {
  const { min = 1, max = MAX_LINES } = opts;
  if (!Array.isArray(value)) {
    if (min > 0) throw new ValidationError(`${field}: add at least one.`);
    return [];
  }
  if (value.length < min) throw new ValidationError(min === 1 ? `${field}: add at least one.` : `${field}: add at least ${min}.`);
  if (value.length > max) throw new ValidationError(`${field} can have at most ${max} entries.`);
  return value;
}

/** Rounds to the cent the same way everywhere. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
