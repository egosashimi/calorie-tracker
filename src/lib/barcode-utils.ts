/** Expand an 8-digit UPC-E code to its 12-digit UPC-A form. */
export function upcEtoA(code: string): string {
  if (!/^[01]\d{7}$/.test(code)) return code;
  const ns = code[0], d = code.slice(1, 7), check = code[7];
  const last = d[5];
  let body: string;
  if ('012'.includes(last)) body = d.slice(0, 2) + last + '0000' + d.slice(2, 5);
  else if (last === '3') body = d.slice(0, 3) + '00000' + d.slice(3, 5);
  else if (last === '4') body = d.slice(0, 4) + '00000' + d[4];
  else body = d.slice(0, 5) + '0000' + last;
  return ns + body + check;
}

export function normalizeScan(raw: string, format?: string): string {
  const digits = raw.replace(/\D/g, '');
  if (format === 'upc_e' || (digits.length === 8 && format !== 'ean_8')) return upcEtoA(digits);
  return digits;
}

/** Validate the GS1 check digit of EAN-8/UPC-A/EAN-13/GTIN-14. */
export function validGtin(code: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false;
  const digits = code.split('').map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((s, d, i) => s + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}
