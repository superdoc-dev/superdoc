/*

The MIT License (MIT)

Copyright (c) 2016 Tom Zoehner
Copyright (c) 2018 Thomas Bluemel

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
import { EMFJSError } from './Helper';

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

export class PointL {
  public x: number;
  public y: number;

  constructor(reader: Blob, x?: number, y?: number) {
    if (reader != null) {
      this.x = reader.readInt32();
      this.y = reader.readInt32();
    } else {
      this.x = x;
      this.y = y;
    }
  }

  public clone(): PointL {
    return new PointL(null, this.x, this.y);
  }

  public toString(): string {
    return '{x: ' + this.x + ', y: ' + this.y + '}';
  }
}

export class RectL {
  public left: number;
  public top: number;
  public right: number;
  public bottom: number;

  constructor(reader: Blob, left?: number, top?: number, right?: number, bottom?: number) {
    if (reader != null) {
      this.left = reader.readInt32();
      this.top = reader.readInt32();
      this.right = reader.readInt32();
      this.bottom = reader.readInt32();
    } else {
      this.bottom = bottom;
      this.right = right;
      this.top = top;
      this.left = left;
    }
  }

  public clone(): RectL {
    return new RectL(null, this.left, this.top, this.right, this.bottom);
  }

  public toString(): string {
    return '{left: ' + this.left + ', top: ' + this.top + ', right: ' + this.right + ', bottom: ' + this.bottom + '}';
  }

  public empty(): boolean {
    return this.left >= this.right || this.top >= this.bottom;
  }

  public intersect(rectL: RectL): null | RectL {
    if (this.empty() || rectL.empty()) {
      return null;
    }
    if (this.left >= rectL.right || this.top >= rectL.bottom || this.right <= rectL.left || this.bottom <= rectL.top) {
      return null;
    }
    return new RectL(
      null,
      Math.max(this.left, rectL.left),
      Math.max(this.top, rectL.top),
      Math.min(this.right, rectL.right),
      Math.min(this.bottom, rectL.bottom),
    );
  }
}

export class SizeL {
  public cx: number;
  public cy: number;

  constructor(reader: Blob, cx?: number, cy?: number) {
    if (reader != null) {
      this.cx = reader.readUint32();
      this.cy = reader.readUint32();
    } else {
      this.cx = cx;
      this.cy = cy;
    }
  }

  public clone(): SizeL {
    return new SizeL(null, this.cx, this.cy);
  }

  public toString(): string {
    return '{cx: ' + this.cx + ', cy: ' + this.cy + '}';
  }
}

export class Obj {
  public type: string;

  constructor(type: string) {
    this.type = type;
  }

  public clone(): Obj {
    throw new EMFJSError('clone not implemented');
  }

  public toString(): string {
    throw new EMFJSError('toString not implemented');
  }
}
