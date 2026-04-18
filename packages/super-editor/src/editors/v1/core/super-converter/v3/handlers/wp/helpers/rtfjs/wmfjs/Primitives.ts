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

import { Blob } from './Blob';
import { WMFJSError } from './Helper';

export class PointS {
  public x: number;
  public y: number;

  constructor(reader: Blob, x?: number, y?: number) {
    if (reader != null) {
      this.x = reader.readInt16();
      this.y = reader.readInt16();
    } else {
      this.x = x;
      this.y = y;
    }
  }

  public clone(): PointS {
    return new PointS(null, this.x, this.y);
  }

  public toString(): string {
    return '{x: ' + this.x + ', y: ' + this.y + '}';
  }
}

export class Rect {
  public bottom: number;
  public right: number;
  public top: number;
  public left: number;

  constructor(reader: Blob, left?: number, top?: number, right?: number, bottom?: number) {
    if (reader != null) {
      this.bottom = reader.readInt16();
      this.right = reader.readInt16();
      this.top = reader.readInt16();
      this.left = reader.readInt16();
    } else {
      this.bottom = bottom;
      this.right = right;
      this.top = top;
      this.left = left;
    }
  }

  public clone(): Rect {
    return new Rect(null, this.left, this.top, this.right, this.bottom);
  }

  public toString(): string {
    return '{left: ' + this.left + ', top: ' + this.top + ', right: ' + this.right + ', bottom: ' + this.bottom + '}';
  }

  public empty(): boolean {
    return this.left >= this.right || this.top >= this.bottom;
  }

  public intersect(rect: Rect): null | Rect {
    if (this.empty() || rect.empty()) {
      return null;
    }
    if (this.left >= rect.right || this.top >= rect.bottom || this.right <= rect.left || this.bottom <= rect.top) {
      return null;
    }
    return new Rect(
      null,
      Math.max(this.left, rect.left),
      Math.max(this.top, rect.top),
      Math.min(this.right, rect.right),
      Math.min(this.bottom, rect.bottom),
    );
  }
}

export class Obj {
  public type: string;

  constructor(type: string) {
    this.type = type;
  }

  public clone(): Obj {
    throw new WMFJSError('clone not implemented');
  }

  public toString(): string {
    throw new WMFJSError('toString not implemented');
  }
}
