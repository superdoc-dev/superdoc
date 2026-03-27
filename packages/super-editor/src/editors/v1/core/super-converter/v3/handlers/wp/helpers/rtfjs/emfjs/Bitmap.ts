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
import { Helper } from './Helper';

interface Bitmap {
  getWidth(): number;

  getHeight(): number;
}

class BitmapCoreHeader {
  public width: number;
  public height: number;
  public planes: number;
  public bitcount: number;

  constructor(reader: Blob, skipsize: boolean) {
    if (skipsize) {
      reader.skip(4);
    }
    this.width = reader.readUint16();
    this.height = reader.readUint16();
    this.planes = reader.readUint16();
    this.bitcount = reader.readUint16();
  }

  public colors(): number {
    return this.bitcount <= 8 ? 1 << this.bitcount : 0;
  }
}

class BitmapInfoHeader {
  public width: number;
  public height: number;
  public planes: number;
  public bitcount: number;
  public compression: number;
  public sizeimage: number;
  public xpelspermeter: number;
  public ypelspermeter: number;
  public clrused: number;
  public clrimportant: number;

  constructor(reader: Blob, skipsize: boolean) {
    if (skipsize) {
      reader.skip(4);
    }
    this.width = reader.readInt32();
    this.height = reader.readInt32();
    this.planes = reader.readUint16();
    this.bitcount = reader.readUint16();
    this.compression = reader.readUint32();
    this.sizeimage = reader.readUint32();
    this.xpelspermeter = reader.readInt32();
    this.ypelspermeter = reader.readInt32();
    this.clrused = reader.readUint32();
    this.clrimportant = reader.readUint32();
  }

  public colors(): number {
    if (this.clrused !== 0) {
      return this.clrused < 256 ? this.clrused : 256;
    } else {
      return this.bitcount > 8 ? 0 : 1 << this.bitcount;
    }
  }
}

export class BitmapInfo implements Bitmap {
  private _usergb: boolean;
  private _infosize: number;
  private _header: BitmapCoreHeader | BitmapInfoHeader;

  constructor(reader: Blob, usergb: boolean) {
    this._usergb = usergb;
    const hdrsize = reader.readUint32();
    this._infosize = hdrsize;
    if (hdrsize === Helper.GDI.BITMAPCOREHEADER_SIZE) {
      this._header = new BitmapCoreHeader(reader, false);
      this._infosize += this._header.colors() * (usergb ? 3 : 2);
    } else {
      this._header = new BitmapInfoHeader(reader, false);
      const masks =
        (this._header as BitmapInfoHeader).compression === Helper.GDI.BitmapCompression.BI_BITFIELDS ? 3 : 0;
      if (hdrsize <= Helper.GDI.BITMAPINFOHEADER_SIZE + masks * 4) {
        this._infosize = Helper.GDI.BITMAPINFOHEADER_SIZE + masks * 4;
      }
      this._infosize += this._header.colors() * (usergb ? 4 : 2);
    }
  }

  public getWidth(): number {
    return this._header.width;
  }

  public getHeight(): number {
    return Math.abs(this._header.height);
  }

  public infosize(): number {
    return this._infosize;
  }

  public header(): BitmapCoreHeader | BitmapInfoHeader {
    return this._header;
  }
}

export class DIBitmap implements Bitmap {
  private _reader: Blob;
  private _offset: number;
  private _location: any;
  private _info: BitmapInfo;

  constructor(reader: Blob, bitmapInfo?: any) {
    this._reader = reader;
    this._offset = reader.pos;
    this._location = bitmapInfo;
    this._info = new BitmapInfo(reader, true);
  }

  public getWidth(): number {
    return this._info.getWidth();
  }

  public getHeight(): number {
    return this._info.getHeight();
  }

  public totalSize(): number {
    return this._location.header.size + this._location.data.size;
  }

  public makeBitmapFileHeader(): string {
    const buf = new ArrayBuffer(14);
    const view = new Uint8Array(buf);
    view[0] = 0x42;
    view[1] = 0x4d;
    Helper._writeUint32Val(view, 2, this.totalSize() + 14);
    Helper._writeUint32Val(view, 10, this._info.infosize() + 14);
    return Helper._blobToBinary(view);
  }

  private convertToPNG(bitmapData: Uint8Array, width: number, height: number, hasAlpha: boolean): string {
    // Create a canvas element to convert bitmap to PNG
    // This provides better browser compatibility than BMP format
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = Math.abs(height);
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Unable to get canvas context for PNG conversion');
    }

    // Create ImageData object
    const imageData = ctx.createImageData(width, Math.abs(height));
    const pixels = imageData.data;

    // Calculate row size with padding (for BMP format)
    const rowSize = ((width * 32 + 31) >>> 5) << 2;

    // Convert BGRA to RGBA and copy to ImageData
    // BMP rows are stored bottom-to-top (unless height is negative), so we need to flip
    const absHeight = Math.abs(height);
    const topDown = height < 0; // Negative height means top-down storage

    // Check if alpha channel is actually used (any non-zero alpha values)
    let alphaUsed = false;
    if (hasAlpha) {
      for (let y = 0; y < absHeight && !alphaUsed; y++) {
        const srcY = topDown ? y : absHeight - 1 - y;
        for (let x = 0; x < width && !alphaUsed; x++) {
          const srcOffset = srcY * rowSize + x * 4;
          if (bitmapData[srcOffset + 3] > 0) {
            alphaUsed = true;
          }
        }
      }
    }

    for (let y = 0; y < absHeight; y++) {
      const srcY = topDown ? y : absHeight - 1 - y;
      for (let x = 0; x < width; x++) {
        const srcOffset = srcY * rowSize + x * 4;
        const dstOffset = (y * width + x) * 4;

        // Convert BGRA to RGBA
        pixels[dstOffset] = bitmapData[srcOffset + 2]; // R
        pixels[dstOffset + 1] = bitmapData[srcOffset + 1]; // G
        pixels[dstOffset + 2] = bitmapData[srcOffset]; // B
        // Preserve alpha channel as-is if it's used, otherwise make it opaque
        pixels[dstOffset + 3] = alphaUsed ? bitmapData[srcOffset + 3] : 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);

    // Convert canvas to PNG data URL
    return canvas.toDataURL('image/png');
  }

  public base64ref(): string {
    const prevpos = this._reader.pos;
    this._reader.seek(this._offset);
    const header = this._info.header();

    // Check if this is an embedded JPEG or PNG
    if (header instanceof BitmapInfoHeader && header.compression != null) {
      switch (header.compression) {
        case Helper.GDI.BitmapCompression.BI_JPEG:
          this._reader.seek(this._location.data.off);
          const jpegData = 'data:image/jpeg;base64,' + btoa(this._reader.readBinary(this._location.data.size));
          this._reader.seek(prevpos);
          return jpegData;
        case Helper.GDI.BitmapCompression.BI_PNG:
          this._reader.seek(this._location.data.off);
          const pngData = 'data:image/png;base64,' + btoa(this._reader.readBinary(this._location.data.size));
          this._reader.seek(prevpos);
          return pngData;
      }
    }

    // For 32-bit bitmaps, convert to PNG for better browser compatibility
    // BMP format has poor support in browsers, especially on Linux
    if (header instanceof BitmapInfoHeader && header.bitcount === 32) {
      this._reader.seek(this._location.data.off);

      // Read bitmap data into a buffer
      const bitmapBytes = new Uint8Array(this._location.data.size);
      const bitmapData = this._reader.readBinary(this._location.data.size);

      // Convert binary string to Uint8Array
      for (let i = 0; i < this._location.data.size; i++) {
        bitmapBytes[i] = bitmapData.charCodeAt(i);
      }

      // Convert to PNG format using canvas
      // This provides much better browser compatibility than BMP
      const pngDataUrl = this.convertToPNG(bitmapBytes, header.width, header.height, true);

      this._reader.seek(prevpos);
      return pngDataUrl;
    }

    // For other bitmap formats (not 32-bit), fall back to BMP format
    let data = this.makeBitmapFileHeader();
    this._reader.seek(this._location.header.off);
    data += this._reader.readBinary(this._location.header.size);
    this._reader.seek(this._location.data.off);
    data += this._reader.readBinary(this._location.data.size);

    const ref = 'data:image/bmp;base64,' + btoa(data);
    this._reader.seek(prevpos);
    return ref;
  }
}
