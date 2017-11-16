// @flow

import type File from "./file/file";

export default class PluginPass {
  _map: Map<mixed, mixed> = new Map();
  key: ?string;
  file: File;
  opts: Object;
  filename: string | void;
  cached: {} | void;

  constructor(file: File, key: ?string, options: ?Object, cached: {} | void) {
    this.key = key;
    this.file = file;
    this.opts = options || {};
    this.filename =
      typeof file.opts.filename === "string" ? file.opts.filename : undefined;
    this.cached = cached;
  }

  set(key: mixed, val: mixed) {
    this._map.set(key, val);
  }

  get(key: mixed): any {
    return this._map.get(key);
  }

  addHelper(name: string) {
    return this.file.addHelper(name);
  }

  addImport() {
    return this.file.addImport();
  }

  getModuleName(): ?string {
    return this.file.getModuleName();
  }

  buildCodeFrameError(
    node: ?{
      loc?: { line: number, column: number },
      _loc?: { line: number, column: number },
    },
    msg: string,
    Error?: typeof Error,
  ) {
    return this.file.buildCodeFrameError(node, msg, Error);
  }
}
