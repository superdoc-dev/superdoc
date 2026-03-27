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

import { DIBitmap } from './Bitmap';
import { Blob } from './Blob';
import { Helper } from './Helper';
import { Obj, PointL } from './Primitives';

export class ColorRef {
  public r: number;
  public g: number;
  public b: number;

  constructor(reader: Blob, r?: number, g?: number, b?: number) {
    if (reader != null) {
      this.r = reader.readUint8();
      this.g = reader.readUint8();
      this.b = reader.readUint8();
      reader.skip(1);
    } else {
      this.r = r;
      this.g = g;
      this.b = b;
    }
  }

  public clone(): ColorRef {
    return new ColorRef(null, this.r, this.g, this.b);
  }

  public toHex(): string {
    const rgb = (this.r << 16) | (this.g << 8) | this.b;
    return (0x1000000 + rgb).toString(16).slice(1);
  }

  public toString(): string {
    return '{r: ' + this.r + ', g: ' + this.g + ', b: ' + this.b + '}';
  }
}

export class Font extends Obj {
  public height: number;
  public width: number;
  public escapement: number;
  public orientation: number;
  public weight: number;
  public italic: number;
  public underline: number;
  public strikeout: number;
  public charset: number;
  public outprecision: number;
  public clipprecision: number;
  public quality: number;
  public pitch: number;
  public family: number;
  public facename: string;

  constructor(reader: Blob, copy: Font | number) {
    super('font');
    if (reader != null) {
      this.height = reader.readInt32();
      this.width = reader.readInt32();
      this.escapement = reader.readInt32();
      this.orientation = reader.readInt32();
      this.weight = reader.readInt32();
      this.italic = reader.readUint8();
      this.underline = reader.readUint8();
      this.strikeout = reader.readUint8();
      this.charset = reader.readUint8();
      this.outprecision = reader.readUint8();
      this.clipprecision = reader.readUint8();
      this.quality = reader.readUint8();
      const pitchAndFamily = reader.readUint8();
      this.pitch = pitchAndFamily & 0xf; // TODO: double check
      this.family = (pitchAndFamily >> 6) & 0x3; // TODO: double check

      const dataLength = copy as number;
      const start = reader.pos;
      this.facename = reader.readFixedSizeUnicodeString(Math.min(dataLength - (reader.pos - start), 32));
    } else if (copy != null) {
      copy = copy as Font;
      this.height = copy.height;
      this.width = copy.width;
      this.escapement = copy.escapement;
      this.orientation = copy.orientation;
      this.weight = copy.weight;
      this.italic = copy.italic;
      this.underline = copy.underline;
      this.strikeout = copy.strikeout;
      this.charset = copy.charset;
      this.outprecision = copy.outprecision;
      this.clipprecision = copy.clipprecision;
      this.quality = copy.quality;
      this.pitch = copy.pitch;
      this.family = copy.family;
      this.facename = copy.facename;
    } else {
      // TODO: Values for a default font?
      this.height = -80;
      this.width = 0;
      this.escapement = 0;
      this.orientation = 0;
      this.weight = 400;
      this.italic = 0;
      this.underline = 0;
      this.strikeout = 0;
      this.charset = 0;
      this.outprecision = 0;
      this.clipprecision = 0;
      this.quality = 0;
      this.pitch = 0;
      this.family = 0;
      this.facename = 'Helvetica';
    }
  }

  public clone(): Font {
    return new Font(null, this);
  }

  public toString(): string {
    return JSON.stringify(this);
  }
}

export class Brush extends Obj {
  public style: number;
  public color: ColorRef;
  public pattern: DIBitmap;
  public dibpatternpt: DIBitmap;
  public hatchstyle: number;

  constructor(
    reader: Blob,
    copy?: {
      style?: number;
      color?: ColorRef;
      pattern?: DIBitmap;
      dibpatternpt?: DIBitmap;
      hatchstyle?: number;
    },
  ) {
    super('brush');
    if (reader != null) {
      const start = reader.pos;

      this.style = reader.readUint32();
      switch (this.style) {
        case Helper.GDI.BrushStyle.BS_SOLID:
          this.color = new ColorRef(reader);
          break;
        case Helper.GDI.BrushStyle.BS_PATTERN:
          this.pattern = new DIBitmap(reader);
          break;
        case Helper.GDI.BrushStyle.BS_DIBPATTERNPT:
          this.dibpatternpt = new DIBitmap(reader);
          break;
        case Helper.GDI.BrushStyle.BS_HATCHED:
          this.color = new ColorRef(reader);
          this.hatchstyle = reader.readUint32();
          break;
      }

      reader.seek(start + 12);
    } else {
      this.style = copy.style;
      switch (this.style) {
        case Helper.GDI.BrushStyle.BS_SOLID:
          this.color = copy.color.clone();
          break;
        case Helper.GDI.BrushStyle.BS_PATTERN:
          this.pattern = copy.pattern;
          break;
        case Helper.GDI.BrushStyle.BS_DIBPATTERNPT:
          this.dibpatternpt = copy.dibpatternpt;
          break;
        case Helper.GDI.BrushStyle.BS_HATCHED:
          this.color = copy.color.clone();
          this.hatchstyle = copy.hatchstyle;
          break;
      }
    }
  }

  public clone(): Brush {
    return new Brush(null, this);
  }

  public toString(): string {
    let ret = '{style: ' + this.style;
    switch (this.style) {
      case Helper.GDI.BrushStyle.BS_SOLID:
        ret += ', color: ' + this.color.toString();
        break;
      case Helper.GDI.BrushStyle.BS_HATCHED:
        ret += ', color: ' + this.color.toString() + ', hatchstyle: ' + this.hatchstyle;
        break;
    }
    return ret + '}';
  }
}

export class Pen extends Obj {
  public style: number | { header: { off: number; size: number }; data: { off: number; size: number } };
  public width: number;
  public brush: Brush;
  public color: ColorRef;

  constructor(
    reader: Blob,
    style?: number | { header: { off: number; size: number }; data: { off: number; size: number } },
    width?: number,
    color?: ColorRef,
    brush?: Brush,
  ) {
    super('pen');
    if (reader != null) {
      if (style != null) {
        // LogPenEx
        this.style = reader.readUint32() & 0xff;
        this.width = reader.readUint32();
        this.brush = new Brush(reader);
        this.color = this.brush.color != null ? this.brush.color.clone() : new ColorRef(null, 0, 0, 0);
        // TODO: NumStyleEntries, StyleEntry
      } else {
        // LogPen
        this.style = reader.readUint32() & 0xff;
        this.width = new PointL(reader).x;
        this.color = new ColorRef(reader);
      }
    } else {
      this.style = style;
      this.width = width;
      if (color != null) {
        this.color = color;
      }
      if (brush != null) {
        this.brush = brush;
      }
    }
  }

  public clone(): Pen {
    return new Pen(
      null,
      this.style,
      this.width,
      this.color != null ? this.color.clone() : null,
      this.brush != null ? this.brush.clone() : null,
    );
  }

  public toString(): string {
    return (
      '{style: ' +
      this.style +
      ', width: ' +
      this.width +
      ', color: ' +
      (this.color != null ? this.color.toString() : 'none') +
      '}'
    );
  }
}
