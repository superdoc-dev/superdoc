import * as xmljs from 'xml-js';
import JSZip from 'jszip';
import { getContentTypesFromXml, base64ToUint8Array } from './super-converter/helpers.js';
import { ensureXmlString, isXmlLike } from './encoding-helpers.js';

/**
 * Class to handle unzipping and zipping of docx files
 */
class DocxZipper {
  constructor(params = {}) {
    this.debug = params.debug || false;
    this.zip = new JSZip();
    this.files = [];
    this.media = {};
    this.mediaFiles = {};
    this.fonts = {};
  }

  /**
   * Get all docx data from the zipped docx
   *
   * [ContentTypes].xml
   * _rels/.rels
   * word/document.xml
   * word/_rels/document.xml.rels
   * word/footnotes.xml
   * word/endnotes.xml
   * word/header1.xml
   * word/theme/theme1.xml
   * word/settings.xml
   * word/styles.xml
   * word/webSettings.xml
   * word/fontTable.xml
   * docProps/core.xml
   * docProps/app.xml
   * */
  async getDocxData(file, isNode = false) {
    const extractedFiles = await this.unzip(file);
    const files = Object.entries(extractedFiles.files);

    for (const [, zipEntry] of files) {
      const name = zipEntry.name;

      if (isXmlLike(name)) {
        // Read raw bytes and decode (handles UTF-8 & UTF-16)
        const u8 = await zipEntry.async('uint8array');
        const content = ensureXmlString(u8);
        this.files.push({ name, content });
      } else if (
        (name.startsWith('word/media') && name !== 'word/media/') ||
        (zipEntry.name.startsWith('media') && zipEntry.name !== 'media/') ||
        (name.startsWith('media') && name !== 'media/') ||
        (name.startsWith('word/embeddings') && name !== 'word/embeddings/')
      ) {
        // Media and embedded binaries (charts, OLE)
        if (isNode) {
          const buffer = await zipEntry.async('nodebuffer');
          const fileBase64 = buffer.toString('base64');
          this.mediaFiles[name] = fileBase64;
        } else {
          const fileBase64 = await zipEntry.async('base64');
          const extension = this.getFileExtension(name)?.toLowerCase();
          // Only build data URIs for images; keep raw base64 for other binaries (e.g., xlsx)
          const imageTypes = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'tiff', 'emf', 'wmf', 'svg', 'webp']);
          if (imageTypes.has(extension)) {
            this.mediaFiles[name] = `data:image/${extension};base64,${fileBase64}`;
            const blob = await zipEntry.async('blob');
            const fileObj = new File([blob], name, { type: blob.type });
            const imageUrl = URL.createObjectURL(fileObj);
            this.media[name] = imageUrl;
          } else {
            this.mediaFiles[name] = fileBase64;
          }
        }
      } else if (name.startsWith('word/fonts') && name !== 'word/fonts/') {
        // Font files
        const uint8array = await zipEntry.async('uint8array');
        this.fonts[name] = uint8array;
      }
    }

    return this.files;
  }

  getFileExtension(fileName) {
    const fileSplit = fileName.split('.');
    if (fileSplit.length < 2) return null;
    return fileSplit[fileSplit.length - 1];
  }

  /**
   * Update [Content_Types].xml with extensions of new Image annotations
   */
  async updateContentTypes(docx, media, fromJson, updatedDocs = {}) {
    const additionalPartNames = Object.keys(updatedDocs || {});
    const imageExts = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'tiff', 'emf', 'wmf', 'svg', 'webp']);
    const newMediaTypes = Object.keys(media)
      .map((name) => this.getFileExtension(name))
      .filter((ext) => ext && imageExts.has(ext));

    const contentTypesPath = '[Content_Types].xml';
    let contentTypesXml;
    if (fromJson) {
      if (Array.isArray(docx.files)) {
        contentTypesXml = docx.files.find((file) => file.name === contentTypesPath)?.content || '';
      } else {
        contentTypesXml = docx.files?.[contentTypesPath] || '';
      }
    } else contentTypesXml = await docx.file(contentTypesPath).async('string');

    let typesString = '';

    const defaultMediaTypes = getContentTypesFromXml(contentTypesXml);

    // Update media types in content types
    const seenTypes = new Set();
    for (let type of newMediaTypes) {
      // Current extension already presented in Content_Types
      if (defaultMediaTypes.includes(type)) continue;
      if (seenTypes.has(type)) continue;

      const newContentType = `<Default Extension="${type}" ContentType="image/${type}"/>`;
      typesString += newContentType;
      seenTypes.add(type);
    }

    // Update for comments
    const xmlJson = JSON.parse(xmljs.xml2json(contentTypesXml, null, 2));
    const types = xmlJson.elements?.find((el) => el.name === 'Types') || {};

    // Overrides
    const hasComments = types.elements?.some(
      (el) => el.name === 'Override' && el.attributes.PartName === '/word/comments.xml',
    );
    const hasCommentsExtended = types.elements?.some(
      (el) => el.name === 'Override' && el.attributes.PartName === '/word/commentsExtended.xml',
    );
    const hasCommentsIds = types.elements?.some(
      (el) => el.name === 'Override' && el.attributes.PartName === '/word/commentsIds.xml',
    );
    const hasCommentsExtensible = types.elements?.some(
      (el) => el.name === 'Override' && el.attributes.PartName === '/word/commentsExtensible.xml',
    );

    const hasFile = (filename) => {
      if (updatedDocs && Object.prototype.hasOwnProperty.call(updatedDocs, filename)) {
        return true;
      }
      if (!docx?.files) return false;
      if (!fromJson) return Boolean(docx.files[filename]);
      if (Array.isArray(docx.files)) return docx.files.some((file) => file.name === filename);
      return Boolean(docx.files[filename]);
    };

    if (hasFile('word/comments.xml')) {
      const commentsDef = `<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml" />`;
      if (!hasComments) typesString += commentsDef;
    }

    if (hasFile('word/commentsExtended.xml')) {
      const commentsExtendedDef = `<Override PartName="/word/commentsExtended.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.commentsExtended+xml" />`;
      if (!hasCommentsExtended) typesString += commentsExtendedDef;
    }

    if (hasFile('word/commentsIds.xml')) {
      const commentsIdsDef = `<Override PartName="/word/commentsIds.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.commentsIds+xml" />`;
      if (!hasCommentsIds) typesString += commentsIdsDef;
    }

    if (hasFile('word/commentsExtensible.xml')) {
      const commentsExtendedDef = `<Override PartName="/word/commentsExtensible.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.commentsExtensible+xml" />`;
      if (!hasCommentsExtensible) typesString += commentsExtendedDef;
    }

    // Update for footnotes
    const hasFootnotes = types.elements?.some(
      (el) => el.name === 'Override' && el.attributes.PartName === '/word/footnotes.xml',
    );

    if (hasFile('word/footnotes.xml')) {
      const footnotesDef = `<Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml" />`;
      if (!hasFootnotes) typesString += footnotesDef;
    }

    const partNames = new Set(additionalPartNames);
    if (docx?.files) {
      if (fromJson && Array.isArray(docx.files)) {
        docx.files.forEach((file) => partNames.add(file.name));
      } else {
        Object.keys(docx.files).forEach((key) => partNames.add(key));
      }
    }

    partNames.forEach((name) => {
      if (name.includes('.rels')) return;
      if (!name.includes('header') && !name.includes('footer')) return;
      const hasExtensible = types.elements?.some(
        (el) => el.name === 'Override' && el.attributes.PartName === `/${name}`,
      );
      const type = name.includes('header') ? 'header' : 'footer';
      const extendedDef = `<Override PartName="/${name}" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.${type}+xml"/>`;
      if (!hasExtensible) {
        typesString += extendedDef;
      }
    });

    const beginningString = '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">';
    let updatedContentTypesXml = contentTypesXml.replace(beginningString, `${beginningString}${typesString}`);

    // Include any header/footer targets referenced from document relationships
    let relationshipsXml = updatedDocs['word/_rels/document.xml.rels'];
    if (!relationshipsXml) {
      if (fromJson) {
        if (Array.isArray(docx.files)) {
          relationshipsXml = docx.files.find((file) => file.name === 'word/_rels/document.xml.rels')?.content;
        } else {
          relationshipsXml = docx.files?.['word/_rels/document.xml.rels'];
        }
      } else {
        relationshipsXml = await docx.file('word/_rels/document.xml.rels')?.async('string');
      }
    }

    if (relationshipsXml) {
      try {
        const relJson = xmljs.xml2js(relationshipsXml, { compact: false });
        const relationships = relJson.elements?.find((el) => el.name === 'Relationships');
        relationships?.elements?.forEach((rel) => {
          const type = rel.attributes?.Type;
          const target = rel.attributes?.Target;
          if (!type || !target) return;
          const isHeader = type.includes('/header');
          const isFooter = type.includes('/footer');
          if (!isHeader && !isFooter) return;
          let sanitizedTarget = target.replace(/^\.\//, '');
          if (sanitizedTarget.startsWith('../')) sanitizedTarget = sanitizedTarget.slice(3);
          if (sanitizedTarget.startsWith('/')) sanitizedTarget = sanitizedTarget.slice(1);
          const partName = sanitizedTarget.startsWith('word/') ? sanitizedTarget : `word/${sanitizedTarget}`;
          partNames.add(partName);
        });
      } catch (error) {
        console.warn('Failed to parse document relationships while updating content types', error);
      }
    }

    partNames.forEach((name) => {
      if (name.includes('.rels')) return;
      if (!name.includes('header') && !name.includes('footer')) return;
      if (updatedContentTypesXml.includes(`PartName="/${name}"`)) return;
      const type = name.includes('header') ? 'header' : 'footer';
      const extendedDef = `<Override PartName="/${name}" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.${type}+xml"/>`;
      updatedContentTypesXml = updatedContentTypesXml.replace('</Types>', `${extendedDef}</Types>`);
    });

    if (fromJson) return updatedContentTypesXml;

    docx.file(contentTypesPath, updatedContentTypesXml);
  }

  async unzip(file) {
    const zip = await this.zip.loadAsync(file);
    return zip;
  }

  async updateZip({ docx, updatedDocs, originalDocxFile, media, fonts, isHeadless, compression = 'DEFLATE' }) {
    // We use a different re-zip process if we have the original docx vs the docx xml metadata
    let zip;

    if (originalDocxFile) {
      zip = await this.exportFromOriginalFile(originalDocxFile, updatedDocs, media);
    } else {
      zip = await this.exportFromCollaborativeDocx(docx, updatedDocs, media, fonts);
    }

    // If we are headless we don't have 'blob' support, so export as 'nodebuffer'
    const exportType = isHeadless ? 'nodebuffer' : 'blob';
    return await zip.generateAsync({
      type: exportType,
      compression,
      compressionOptions: compression === 'DEFLATE' ? { level: 6 } : undefined,
    });
  }

  /**
   * Export the Editor content to a docx file, updating changed docs
   * @param {Object} docx An object containing the unzipped docx files (keys are relative file names)
   * @param {Object} updatedDocs An object containing the updated docs (keys are relative file names)
   * @returns {Promise<JSZip>} The unzipped but updated docx file ready for zipping
   */
  async exportFromCollaborativeDocx(docx, updatedDocs, media, fonts) {
    const zip = new JSZip();

    // Rebuild original files
    for (const file of docx) {
      const content = file.content;
      zip.file(file.name, content);
    }

    // Replace updated docs
    Object.keys(updatedDocs).forEach((key) => {
      const content = updatedDocs[key];
      zip.file(key, content);
    });

    Object.keys(media).forEach((path) => {
      const value = media[path];
      const binaryData = typeof value === 'string' ? base64ToUint8Array(value) : value;
      zip.file(path, binaryData);
    });

    // Export font files
    for (const [fontName, fontUintArray] of Object.entries(fonts)) {
      zip.file(fontName, fontUintArray);
    }

    await this.updateContentTypes(zip, media, false, updatedDocs);
    return zip;
  }

  /**
   * Export the Editor content to a docx file, updating changed docs
   * Requires the original docx file
   * @param {File} originalDocxFile The original docx file
   * @param {Object} updatedDocs An object containing the updated docs (keys are relative file names)
   * @returns {Promise<JSZip>} The unzipped but updated docx file ready for zipping
   */
  async exportFromOriginalFile(originalDocxFile, updatedDocs, media) {
    const unzippedOriginalDocx = await this.unzip(originalDocxFile);
    const filePromises = [];
    unzippedOriginalDocx.forEach((relativePath, zipEntry) => {
      const promise = zipEntry.async('string').then((content) => {
        unzippedOriginalDocx.file(zipEntry.name, content);
      });
      filePromises.push(promise);
    });
    await Promise.all(filePromises);

    // Make replacements of updated docs
    Object.keys(updatedDocs).forEach((key) => {
      unzippedOriginalDocx.file(key, updatedDocs[key]);
    });

    Object.keys(media).forEach((path) => {
      unzippedOriginalDocx.file(path, media[path]);
    });

    await this.updateContentTypes(unzippedOriginalDocx, media, false, updatedDocs);

    return unzippedOriginalDocx;
  }
}

export default DocxZipper;
