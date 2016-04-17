import type Position from "./position";
import repeating from "repeating";
import trimRight from "trim-right";

/**
 * Buffer for collecting generated output.
 */

export default class Buffer {
  constructor(position: Position, format: Object) {
    this.printedCommentStarts = {};
    this.parenPushNewlineState = null;
    this.position = position;
    this._indent = format.indent.base;
    this.format = format;
    this.buf = "";

    // Maintaining a reference to the last char in the buffer is an optimization
    // to make sure that v8 doesn't "flatten" the string more often than needed.
    // We also maintain an 'uncommittedText' list of characters that we allow the
    // printer to roll back to not be included to avoid adding and removing items
    // from "buf".
    // see https://github.com/babel/babel/pull/3283 for details.
    this.last = "";
    this.uncommittedText = "";

    this._endsWithCharacters = false;

    this.map = null;
    this._sourcePosition = {
      line: null,
      column: null,
      filename: null,
    };
  }

  printedCommentStarts: Object;
  parenPushNewlineState: ?Object;
  position: Position;
  _indent: number;
  format: Object;
  buf: string;
  last: string;

  /**
   * Description
   */

  catchUp(node: Object) {
    // catch up to this nodes newline if we're behind
    if (node.loc && this.format.retainLines && (this.last || this.uncommittedText)) {
      while (this.position.line < node.loc.start.line) {
        this.push("\n", true /* noIndent */);
      }
    }
  }

  /**
   * Get the current trimmed buffer.
   */

  get(): string {
    return trimRight(this.buf + this.uncommittedText);
  }

  /**
   * Get the current indent.
   */

  getIndent(): string {
    if (this.format.compact || this.format.concise) {
      return "";
    } else {
      return repeating(this.format.indent.style, this._indent);
    }
  }

  /**
   * Get the current indent size.
   */

  indentSize(): number {
    return this.getIndent().length;
  }

  /**
   * Increment indent size.
   */

  indent() {
    this._indent++;
  }

  /**
   * Decrement indent size.
   */

  dedent() {
    this._indent--;
  }

  /**
   * Add a semicolon to the buffer.
   */

  semicolon() {
    this.push(";");
  }

  /**
   * Add a right brace to the buffer.
   */

  rightBrace() {
    this.newline(true);
    if (this.format.minified && !this._lastPrintedIsEmptyStatement) {
      this._removeLast(";");
    }
    this.push("}");
  }

  /**
   * Add a word to the buffer.
   */

  word(name){
    if (this._endsWithCharacters) this.push(" ");

    this.push(name);
    this._endsWithCharacters = true;
  }

  number(value){
    if (this._endsWithCharacters) this.push(" ");

    this.push(value);
    this._endsWithCharacters = true;
  }

  regex(str, hasFlags){
    this.push(str);

    this._endsWithCharacters = hasFlags;
  }

  /**
   * Add a space to the buffer unless it is compact.
   */

  space() {
    if (this.format.compact) return;

    if ((this.last || this.uncommittedText) && !this.endsWith(" ") && !this.endsWith("\n")) {
      this.push(" ");
    }
  }

  /**
   * Remove the last character.
   */

  removeLast(cha: string) {
    if (this.format.compact) return;
    return this._removeLast(cha);
  }

  _removeLast(cha: string) {
    if (!this.endsWith(cha)) return;
    this.uncommittedText = this.uncommittedText.slice(0, -cha.length);
    this.position.unshift(cha);
  }

  /**
   * Set some state that will be modified if a newline has been inserted before any
   * non-space characters.
   *
   * This is to prevent breaking semantics for terminatorless separator nodes. eg:
   *
   *    return foo;
   *
   * returns `foo`. But if we do:
   *
   *   return
   *   foo;
   *
   *  `undefined` will be returned and not `foo` due to the terminator.
   */

  startTerminatorless(): Object {
    return this.parenPushNewlineState = {
      printed: false
    };
  }

  /**
   * Print an ending parentheses if a starting one has been printed.
   */

  endTerminatorless(state: Object) {
    if (state.printed) {
      this.dedent();
      this.newline();
      this.push(")");
    }
  }

  /**
   * Add a newline (or many newlines), maintaining formatting.
   * Strips multiple newlines if removeLast is true.
   */

  newline(i?: boolean | number, removeLast?: boolean) {
    if (this.format.retainLines || this.format.compact) return;

    if (this.format.concise) {
      this.space();
      return;
    }

    // never allow more than two lines
    if (this.endsWith("\n\n")) return;

    if (typeof i === "boolean") removeLast = i;
    if (typeof i !== "number") i = 1;

    i = Math.min(2, i);
    if (this.endsWith("{\n") || this.endsWith(":\n")) i--;
    if (i <= 0) return;

    // remove the last newline
    if (removeLast) {
      this.removeLast("\n");
    }

    this._removeSpacesAfterLastNewline();
    for (let j = 0; j < i; j++){
      this.push("\n", true /* noIndent */);
    }
  }

  /**
   * If buffer ends with a newline and some spaces after it, trim those spaces.
   */

  _removeSpacesAfterLastNewline() {
    let lastNewlineIndex = this.uncommittedText.lastIndexOf("\n");
    if (lastNewlineIndex >= 0 && trimRight(this.uncommittedText).length <= lastNewlineIndex) {
      this.position.unshift(this.uncommittedText.slice(lastNewlineIndex + 1));
      this.uncommittedText = this.uncommittedText.substring(0, lastNewlineIndex + 1);
    } else if (lastNewlineIndex === -1 && trimRight(this.uncommittedText) === ''){
      this.position.unshift(this.uncommittedText);
      this.uncommittedText = '';
    }
  }

  /**
   * Sets a given position as the current source location so generated code after this call
   * will be given this position in the sourcemap.
   */

  source(prop: string, loc: Location) {
    if (prop && !loc) return;

    let pos = loc ? loc[prop] : null;

    this._sourcePosition.line = pos ? pos.line : null;
    this._sourcePosition.column = pos ? pos.column : null;
    this._sourcePosition.filename = loc && loc.filename || null;
  }

  /**
   * Call a callback with a specific source location and restore on completion.
   */

  withSource(prop: string, loc: Location, cb: () => void) {
    // Use the call stack to manage a stack of "source location" data.
    let originalLine = this._sourcePosition.line;
    let originalColumn = this._sourcePosition.column;
    let originalFilename = this._sourcePosition.filename;

    this.source(prop, loc);

    cb();

    this._sourcePosition.line = originalLine;
    this._sourcePosition.column = originalColumn;
    this._sourcePosition.filename = originalFilename;
  }

  /**
   * Push a string to the buffer, maintaining indentation and newlines.
   */

  push(str: string, noIndent?: boolean) {
    if (!this.format.compact && this._indent && !noIndent && str !== "\n") {
      // we have an indent level and we aren't pushing a newline
      let indent = this.getIndent();

      // replace all newlines with newlines with the indentation
      str = str.replace(/\n/g, `\n${indent}`);

      // we've got a newline before us so prepend on the indentation
      if (this.endsWith("\n")) this._push(indent);
    }

    this._push(str);
  }

  /**
   * Push a string to the buffer.
   */

  _push(str: string): void {
    // see startTerminatorless() instance method
    let parenPushNewlineState = this.parenPushNewlineState;
    if (parenPushNewlineState) {
      for (let i = 0; i < str.length; i++) {
        let cha = str[i];

        // we can ignore spaces since they wont interupt a terminatorless separator
        if (cha === " ") continue;

        this.parenPushNewlineState = null;

        if (cha === "\n" || cha === "/") {
          // we're going to break this terminator expression so we need to add a parentheses
          this._push("(");
          this.indent();
          parenPushNewlineState.printed = true;
        }

        break;
      }
    }

    let last = (this.last + this.uncommittedText).slice(-1);
    if (last){
      // Ensure that we don't create invalid operators when pushing new operators.
      if ((str[0] === "=" && ["+", "-", "*", "\/", "%", "|", "&", "^", ">>", ">>>", "<<", "!"].indexOf(last) !== -1) ||
        (str[0] === ">" && last === '=') ||
        (str[0] === "-" && last === "-") ||
        (str[0] === "+" && last === "+") ||
        (str[0] === "*" && last === "*") ||

        // space is mandatory to avoid outputting <!--
        // http://javascript.spec.whatwg.org/#comment-syntax
        (str[0] === '!' && last === '<')){
        this._push(" ");
      }
    }

    // If there the line is ending, adding a new mapping marker is redundant
    if (str[0] !== "\n") this.map.mark(this._sourcePosition);

    //
    this.position.push(str);

    let index;
    for (index = str.length - 1; index >= 0; index--){
      let chr = str[index];
      if (chr !== ' ' && chr !== '\n' && chr !== ';'){
        break;
      }
    }

    if (index === -1){
      this.uncommittedText += str;
    } else {
      this.buf += this.uncommittedText + str.slice(0, index + 1);

      this.last = str[index];
      this.uncommittedText = str.slice(index + 1);
    }

    this._endsWithCharacters = false;
  }

  /**
   * Test if the buffer ends with a string.
   */

  endsWith(str: string): boolean {
    if (Array.isArray(str)) return str.some(s => this.endsWith(s));

    let end = this.last + this.uncommittedText;

    // Note, this is not true in the general case, but it is true for the cases
    // that we are using this function for.
    if (str.length > end.length) return false;

    return end.slice(-str.length) === str;
  }
}
