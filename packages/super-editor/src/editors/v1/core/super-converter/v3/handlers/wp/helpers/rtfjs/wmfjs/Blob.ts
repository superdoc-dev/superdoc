/*

The MIT License (MIT)

Copyright (c) 2015 Thomas Bluemel

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

*/

import { WMFJSError } from './Helper';

export class Blob {
  public pos: number;
  private blob: Blob | ArrayBuffer;
  private data: Uint8Array;

  constructor(blob: Blob | ArrayBuffer, offset?: number) {
    if (blob instanceof Blob) {
      this.blob = blob.blob;
      this.data = blob.data;
      this.pos = offset || blob.pos;
    } else {
      this.blob = blob;
      this.data = new Uint8Array(blob);
      this.pos = offset || 0;
    }
  }

  public eof(): boolean {
    return this.pos >= this.data.length;
  }

  public seek(newpos: number): void {
    if (newpos < 0 || newpos > this.data.length) {
      throw new WMFJSError('Invalid seek position');
    }
    this.pos = newpos;
  }

  public skip(cnt: number): void {
    const newPos = this.pos + cnt;
    if (newPos > this.data.length) {
      throw new WMFJSError('Unexpected end of file');
    }
    this.pos = newPos;
  }

  public readBinary(cnt: number): string {
    const end = this.pos + cnt;
    if (end > this.data.length) {
      throw new WMFJSError('Unexpected end of file');
    }
    let ret = '';
    while (cnt-- > 0) {
      ret += String.fromCharCode(this.data[this.pos++]);
    }
    return ret;
  }

  public readInt8(): number {
    if (this.pos + 1 > this.data.length) {
      throw new WMFJSError('Unexpected end of file');
    }
    return this.data[this.pos++];
  }

  public readUint8(): number {
    return this.readInt8() >>> 0;
  }

  public readInt32(): number {
    if (this.pos + 4 > this.data.length) {
      throw new WMFJSError('Unexpected end of file');
    }
    let val = this.data[this.pos++];
    val |= this.data[this.pos++] << 8;
    val |= this.data[this.pos++] << 16;
    val |= this.data[this.pos++] << 24;
    return val;
  }

  public readUint32(): number {
    return this.readInt32() >>> 0;
  }

  public readUint16(): number {
    if (this.pos + 2 > this.data.length) {
      throw new WMFJSError('Unexpected end of file');
    }
    let val = this.data[this.pos++];
    val |= this.data[this.pos++] << 8;
    return val;
  }

  public readInt16(): number {
    let val = this.readUint16();
    if (val > 32767) {
      val -= 65536;
    }
    return val;
  }

  public readString(length: number): string {
    if (this.pos + length > this.data.length) {
      throw new WMFJSError('Unexpected end of file');
    }
    let ret = '';
    for (let i = 0; i < length; i++) {
      ret += String.fromCharCode(this.data[this.pos++] >>> 0);
    }
    return ret;
  }

  public readNullTermString(maxSize: number): string {
    let ret = '';
    if (maxSize > 0) {
      maxSize--;
      for (let i = 0; i < maxSize; i++) {
        if (this.pos + i + 1 > this.data.length) {
          throw new WMFJSError('Unexpected end of file');
        }
        const byte = this.data[this.pos + i] >>> 0;
        if (byte === 0) {
          break;
        }
        ret += String.fromCharCode(byte);
      }
    }
    return ret;
  }
}
