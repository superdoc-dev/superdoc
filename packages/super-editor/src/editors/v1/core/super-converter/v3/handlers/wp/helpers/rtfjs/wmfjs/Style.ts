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

import { Bitmap16, DIBitmap, PatternBitmap16 } from './Bitmap';
import { Blob } from './Blob';
import { Helper } from './Helper';
import { Obj, PointS } from './Primitives';

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
      this.height = reader.readInt16();
      this.width = reader.readInt16();
      this.escapement = reader.readInt16();
      this.orientation = reader.readInt16();
      this.weight = reader.readInt16();
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
      this.facename = reader.readNullTermString(Math.min(dataLength - (reader.pos - start), 32));
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
  public pattern: Bitmap16;
  public colorusage: number;
  public dibpatternpt: DIBitmap;
  public hatchstyle: number;

  constructor(reader: Blob, copy: Brush | number, forceDibPattern?: boolean | PatternBitmap16) {
    super('brush');
    if (reader != null) {
      const dataLength = copy as number;
      const start = reader.pos;

      if (forceDibPattern === true || forceDibPattern === false) {
        this.style = reader.readUint16();
        if (forceDibPattern && this.style !== Helper.GDI.BrushStyle.BS_PATTERN) {
          this.style = Helper.GDI.BrushStyle.BS_DIBPATTERNPT;
        }
        switch (this.style) {
          case Helper.GDI.BrushStyle.BS_SOLID:
            this.color = new ColorRef(reader);
            break;
          case Helper.GDI.BrushStyle.BS_PATTERN:
            reader.skip(forceDibPattern ? 2 : 6);
            this.pattern = new Bitmap16(reader, dataLength - (reader.pos - start));
            break;
          case Helper.GDI.BrushStyle.BS_DIBPATTERNPT:
            this.colorusage = forceDibPattern ? reader.readUint16() : reader.readUint32();
            if (!forceDibPattern) {
              reader.skip(2);
            }
            this.dibpatternpt = new DIBitmap(reader, dataLength - (reader.pos - start));
            break;
          case Helper.GDI.BrushStyle.BS_HATCHED:
            this.color = new ColorRef(reader);
            this.hatchstyle = reader.readUint16();
            break;
        }
      } else if (forceDibPattern instanceof PatternBitmap16) {
        this.style = Helper.GDI.BrushStyle.BS_PATTERN;
        this.pattern = forceDibPattern;
      }
    } else if (copy != null) {
      copy = copy as Brush;
      this.style = copy.style;
      switch (this.style) {
        case Helper.GDI.BrushStyle.BS_SOLID:
          this.color = copy.color.clone();
          break;
        case Helper.GDI.BrushStyle.BS_PATTERN:
          this.pattern = copy.pattern.clone();
          break;
        case Helper.GDI.BrushStyle.BS_DIBPATTERNPT:
          this.colorusage = copy.colorusage;
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
      case Helper.GDI.BrushStyle.BS_DIBPATTERNPT:
        ret += ', colorusage: ' + this.colorusage;
        break;
      case Helper.GDI.BrushStyle.BS_HATCHED:
        ret += ', color: ' + this.color.toString() + ', hatchstyle: ' + this.hatchstyle;
        break;
    }
    return ret + '}';
  }
}

export class Pen extends Obj {
  public style: number;
  public width: PointS;
  public color: ColorRef;
  public linecap: number;
  public join: number;

  constructor(reader: Blob, style?: number, width?: PointS, color?: ColorRef, linecap?: number, join?: number) {
    super('pen');
    if (reader != null) {
      style = reader.readUint16();
      this.style = style & 0xff;
      this.width = new PointS(reader);
      this.color = new ColorRef(reader);
      this.linecap = style & (Helper.GDI.PenStyle.PS_ENDCAP_SQUARE | Helper.GDI.PenStyle.PS_ENDCAP_FLAT);
      this.join = style & (Helper.GDI.PenStyle.PS_JOIN_BEVEL | Helper.GDI.PenStyle.PS_JOIN_MITER);
    } else {
      this.style = style;
      this.width = width;
      this.color = color;
      this.linecap = linecap;
      this.join = join;
    }
  }

  public clone(): Pen {
    return new Pen(null, this.style, this.width.clone(), this.color.clone(), this.linecap, this.join);
  }

  public toString(): string {
    return (
      '{style: ' +
      this.style +
      ', width: ' +
      this.width.toString() +
      ', color: ' +
      this.color.toString() +
      ', linecap: ' +
      this.linecap +
      ', join: ' +
      this.join +
      '}'
    );
  }
}

export class PaletteEntry {
  public flag: number;
  public b: number;
  public g: number;
  public r: number;

  constructor(reader: Blob, copy?: PaletteEntry) {
    if (reader != null) {
      this.flag = reader.readUint8();
      this.b = reader.readUint8();
      this.g = reader.readUint8();
      this.r = reader.readUint8();
    } else {
      this.flag = copy.flag;
      this.b = copy.b;
      this.g = copy.g;
      this.r = copy.r;
    }
  }

  public clone(): PaletteEntry {
    return new PaletteEntry(null, this);
  }
}

export class Palette extends Obj {
  public start: number;
  public entries: PaletteEntry[];

  constructor(reader: Blob, copy?: Palette) {
    super('palette');
    if (reader != null) {
      this.start = reader.readUint16();
      let cnt = reader.readUint16();
      this.entries = [];
      while (cnt > 0) {
        this.entries.push(new PaletteEntry(reader));
        cnt--;
      }
    } else {
      this.start = copy.start;
      this.entries = [];
      const len = copy.entries.length;
      for (let i = 0; i < len; i++) {
        this.entries.push(copy.entries[i]);
      }
    }
  }

  public clone(): Palette {
    return new Palette(null, this);
  }

  public toString(): string {
    return '{ #entries: ' + this.entries.length + '}'; // TODO
  }
}
