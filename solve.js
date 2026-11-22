// A fast drop-in for csv-reader 1.0.0: run(input) returns exactly csv-reader's
// answer {columns, rows, errors} for every input. One flat function: every
// hot-path value is a local, so the scanner never crosses a closure or a
// function call per field; only the rare broken-CSV paths (junk after a
// closing quote, a quote that never closes) leave the loop for a helper.
//
// Semantics (from the kit's RULES.txt, implemented here from scratch):
// - U+FEFF at the very start is dropped; a record ends at LF or CRLF, and a
//   line left with no characters is no record.
// - Outside quotes a CR not followed by LF is dropped (stray_cr).
// - A field opening with a quote runs to the next undoubled quote; "" inside
//   is one quote and each CRLF or lone CR inside is read as LF; what follows
//   the closing quote up to the next comma or line break is appended as it
//   stands (quote_junk, when the field ends); a quote that never closes is a
//   literal character, and the text after it is read again as unquoted
//   (unterminated_quote). A quote inside an unquoted field is literal.
// - Fields stay strings, never trimmed or converted. columns is the first
//   record when header is true, else null; rows are the records after it,
//   each padded with "" (short_row) or cut (long_row) to the first record's
//   width. Each error is {code, line, row}: the 1-based line its record
//   starts on, and the record's index in rows (null for the header).

// Next delimiter inside an unquoted field: comma, quote, CR or LF.
const DELIM = /[",\r\n]/g;
// Next special inside a quoted field: quote, CR or LF.
const QUOTED = /["\r\n]/g;
// The same delimiter search, for the rare-path helper below, which must not
// disturb DELIM's position in the main loop.
const DELIM2 = /[",\r\n]/g;

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

// Reads unquoted characters from `pos` onto `prefix` up to the next comma or
// line break; a CR not followed by LF is dropped (stray_cr). Only used for
// the junk after a closing quote and for a quote that never closes, so its
// cost never shows in the common case. Returns [value, pos, line, ended].
// `errors` takes the stray_cr entries, each on the record's line and row.
function readUnquotedFrom(text, n, pos, line, recordLine, recordRow, errors, prefix) {
  let spanStart = pos;
  let parts = null;
  DELIM2.lastIndex = pos;
  let m;
  while ((m = DELIM2.exec(text)) !== null) {
    const i = m.index;
    const cc = text.charCodeAt(i);
    if (cc === 44) {
      return [prefix + (parts === null ? text.slice(spanStart, i) : parts.join('') + text.slice(spanStart, i)), i + 1, line, COMMA];
    }
    if (cc === 10) {
      return [prefix + (parts === null ? text.slice(spanStart, i) : parts.join('') + text.slice(spanStart, i)), i + 1, line + 1, LINE_BREAK];
    }
    if (cc === 13) {
      if (text.charCodeAt(i + 1) === 10) {
        return [prefix + (parts === null ? text.slice(spanStart, i) : parts.join('') + text.slice(spanStart, i)), i + 2, line + 1, LINE_BREAK];
      }
      errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
      if (parts === null) parts = [text.slice(spanStart, i)];
      else parts.push(text.slice(spanStart, i));
      pos = i + 1;
      spanStart = i + 1;
      continue;
    }
    // '"' (34): a literal character inside an unquoted field; keep scanning.
  }
  return [prefix + (parts === null ? text.slice(spanStart, n) : parts.join('') + text.slice(spanStart, n)), n, line, END];
}

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;
  const n = text.length;
  let pos = 0;
  let line = 1;
  if (text.charCodeAt(0) === 0xFEFF) pos = 1;

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    const recordLine = line;
    const recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let lastQuoted = false;
    let fend = COMMA;

    do {
      if (text.charCodeAt(pos) === 34) {
        // ---- quoted field ----
        lastQuoted = true;
        const open = pos;
        const openLine = line;
        pos += 1;
        let spanStart = pos;
        let parts = null;
        let fval = '';
        let closed = false;
        QUOTED.lastIndex = pos;
        let m;
        while ((m = QUOTED.exec(text)) !== null) {
          const i = m.index;
          const cc = text.charCodeAt(i);
          if (cc === 34) {
            // '"': doubled means one literal quote, otherwise it closes.
            if (text.charCodeAt(i + 1) === 34) {
              if (parts === null) parts = [text.slice(spanStart, i), '"'];
              else {
                parts.push(text.slice(spanStart, i));
                parts.push('"');
              }
              pos = i + 2;
              spanStart = i + 2;
              QUOTED.lastIndex = i + 2;
              continue;
            }
            const value = parts === null ? text.slice(spanStart, i) : parts.join('') + text.slice(spanStart, i);
            pos = i + 1;
            if (pos >= n) {
              fval = value;
              fend = END;
              closed = true;
              break;
            }
            const c = text.charCodeAt(pos);
            if (c === 44) {
              pos += 1;
              fval = value;
              fend = COMMA;
              closed = true;
              break;
            }
            if (c === 10) {
              pos += 1;
              line += 1;
              fval = value;
              fend = LINE_BREAK;
              closed = true;
              break;
            }
            if (c === 13 && text.charCodeAt(pos + 1) === 10) {
              pos += 2;
              line += 1;
              fval = value;
              fend = LINE_BREAK;
              closed = true;
              break;
            }
            // What follows the closing quote is appended as it stands.
            const r = readUnquotedFrom(text, n, pos, line, recordLine, recordRow, errors, value);
            fval = r[0];
            pos = r[1];
            line = r[2];
            fend = r[3];
            if (fval.length > value.length) {
              errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
            }
            closed = true;
            break;
          }
          if (cc === 10) {
            // LF inside quotes is read as LF.
            if (parts === null) parts = [text.slice(spanStart, i), '\n'];
            else {
              parts.push(text.slice(spanStart, i));
              parts.push('\n');
            }
            pos = i + 1;
            spanStart = i + 1;
            line += 1;
            QUOTED.lastIndex = i + 1;
            continue;
          }
          // CR inside quotes: CRLF and a lone CR are each one LF.
          if (parts === null) parts = [text.slice(spanStart, i), '\n'];
          else {
            parts.push(text.slice(spanStart, i));
            parts.push('\n');
          }
          const adv = text.charCodeAt(i + 1) === 10 ? 2 : 1;
          pos = i + adv;
          spanStart = i + adv;
          line += 1;
          QUOTED.lastIndex = i + adv;
        }
        if (!closed) {
          // The quote never closes: it is a literal character, and the text
          // after it is read again as unquoted.
          errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
          const r = readUnquotedFrom(text, n, open + 1, openLine, recordLine, recordRow, errors, '"');
          fval = r[0];
          pos = r[1];
          line = r[2];
          fend = r[3];
        }
        fields.push(fval);
      } else {
        // ---- unquoted field ----
        lastQuoted = false;
        let spanStart = pos;
        let parts = null;
        let fval = '';
        DELIM.lastIndex = pos;
        let m;
        let done = false;
        while ((m = DELIM.exec(text)) !== null) {
          const i = m.index;
          const cc = text.charCodeAt(i);
          if (cc === 44) {
            fval = parts === null ? text.slice(spanStart, i) : parts.join('') + text.slice(spanStart, i);
            pos = i + 1;
            fend = COMMA;
            done = true;
            break;
          }
          if (cc === 10) {
            fval = parts === null ? text.slice(spanStart, i) : parts.join('') + text.slice(spanStart, i);
            pos = i + 1;
            line += 1;
            fend = LINE_BREAK;
            done = true;
            break;
          }
          if (cc === 13) {
            // CR: CRLF ends the field, a lone CR is dropped.
            if (text.charCodeAt(i + 1) === 10) {
              fval = parts === null ? text.slice(spanStart, i) : parts.join('') + text.slice(spanStart, i);
              pos = i + 2;
              line += 1;
              fend = LINE_BREAK;
              done = true;
              break;
            }
            errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
            if (parts === null) parts = [text.slice(spanStart, i)];
            else parts.push(text.slice(spanStart, i));
            pos = i + 1;
            spanStart = i + 1;
            continue;
          }
          // '"' (34): a literal character inside an unquoted field.
        }
        if (!done) {
          fval = parts === null ? text.slice(spanStart, n) : parts.join('') + text.slice(spanStart, n);
          pos = n;
          fend = END;
        }
        fields.push(fval);
      }
    } while (fend === COMMA);

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !lastQuoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
