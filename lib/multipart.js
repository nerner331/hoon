const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const { 
  DEFAULT_MAX_BODY_BYTES, 
  MAX_MULTIPART_BODY_BYTES, 
  MAX_IMAGE_SIZE_BYTES, 
  MIN_IMAGE_WIDTH, 
  MIN_IMAGE_HEIGHT,
  UPLOADS_DIR
} = require("./config");
const { normalizeText } = require("./utils");

async function readRawBody(req, maxBytes = DEFAULT_MAX_BODY_BYTES) {
  const chunks = [];
  let totalSize = 0;
  for await (const chunk of req) {
    totalSize += chunk.length;
    if (totalSize > maxBytes) {
      const error = new Error("حجم الملف كبير جدًا. الحد الأقصى هو 5 ميغابايت.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readMultipartFormData(req, contentType, maxBytes = MAX_MULTIPART_BODY_BYTES) {
  const boundary = extractBoundary(contentType);
  if (!boundary) {
    const error = new Error("تعذر قراءة ملف الصورة المرفوع.");
    error.statusCode = 400;
    throw error;
  }
  const bodyBuffer = await readRawBody(req, maxBytes);
  return parseMultipartFormData(bodyBuffer, boundary);
}

function extractBoundary(contentType) {
  const match = String(contentType).match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  return match ? (match[1] || match[2]) : "";
}

function parseMultipartFormData(buffer, boundary) {
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const separatorBuffer = Buffer.from("\r\n\r\n");
  const parts = [];
  const fields = {};
  const files = [];
  let cursor = 0;

  while (cursor < buffer.length) {
    const boundaryIndex = buffer.indexOf(boundaryBuffer, cursor);
    if (boundaryIndex === -1) break;
    let partStart = boundaryIndex + boundaryBuffer.length;
    if (buffer.slice(partStart, partStart + 2).equals(Buffer.from("--"))) break;
    if (buffer.slice(partStart, partStart + 2).equals(Buffer.from("\r\n"))) partStart += 2;
    const nextBoundaryIndex = buffer.indexOf(boundaryBuffer, partStart);
    if (nextBoundaryIndex === -1) break;
    let partBuffer = buffer.slice(partStart, nextBoundaryIndex);
    if (partBuffer.slice(-2).equals(Buffer.from("\r\n"))) partBuffer = partBuffer.slice(0, -2);
    parts.push(partBuffer);
    cursor = nextBoundaryIndex;
  }

  for (const part of parts) {
    const headerEndIndex = part.indexOf(separatorBuffer);
    if (headerEndIndex === -1) continue;
    const headersText = part.slice(0, headerEndIndex).toString("utf-8");
    const content = part.slice(headerEndIndex + separatorBuffer.length);
    const disposition = headersText.match(/name="([^"]+)"/i);
    const name = disposition ? disposition[1] : "";
    if (!name) continue;
    const fileNameMatch = headersText.match(/filename="([^"]*)"/i);
    if (fileNameMatch && fileNameMatch[1]) {
      const contentTypeMatch = headersText.match(/content-type:\s*([^\r\n]+)/i);
      files.push({
        fieldName: name,
        fileName: path.basename(fileNameMatch[1]),
        mimeType: normalizeText(contentTypeMatch ? contentTypeMatch[1] : ""),
        buffer: content,
      });
      continue;
    }
    fields[name] = content.toString("utf-8");
  }
  return { fields, files };
}

function saveUploadedImage(file) {
  const reportedMimeType = normalizeText(file.mimeType).toLowerCase();
  const detectedImageType = detectImageType(file.buffer);
  if (!detectedImageType) {
    const error = new Error("ملف الصورة غير صالح أو لا يحتوي على بيانات صورة حقيقية.");
    error.statusCode = 400;
    throw error;
  }
  if (reportedMimeType && detectedImageType.mimeType !== reportedMimeType) {
    const error = new Error("نوع ملف الصورة لا يطابق محتواه الحقيقي.");
    error.statusCode = 400;
    throw error;
  }
  if (!["image/jpeg", "image/png", "image/webp"].includes(detectedImageType.mimeType)) {
    const error = new Error("صيغة الصورة غير مدعومة. استخدم JPG أو PNG أو WEBP.");
    error.statusCode = 400;
    throw error;
  }
  if (!file.buffer || file.buffer.length === 0) {
    const error = new Error("تم إرسال ملف صورة فارغ.");
    error.statusCode = 400;
    throw error;
  }
  if (file.buffer.length > MAX_IMAGE_SIZE_BYTES) {
    const error = new Error("حجم الصورة كبير جدًا. الحد الأقصى هو 5 ميغابايت.");
    error.statusCode = 413;
    throw error;
  }
  const dimensions = getImageDimensions(file.buffer, detectedImageType.mimeType);
  if (!dimensions) {
    const error = new Error("تعذر قراءة أبعاد الصورة. التقط صورة أوضح ثم حاول مجددًا.");
    error.statusCode = 400;
    throw error;
  }
  if (dimensions.width < MIN_IMAGE_WIDTH || dimensions.height < MIN_IMAGE_HEIGHT) {
    const error = new Error(`أبعاد الصورة صغيرة جدًا. الحد الأدنى هو ${MIN_IMAGE_WIDTH}x${MIN_IMAGE_HEIGHT} بكسل.`);
    error.statusCode = 400;
    throw error;
  }
  const extension = detectedImageType.extension;
  const fileName = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${extension}`;
  const absolutePath = path.join(UPLOADS_DIR, fileName);
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  fs.writeFileSync(absolutePath, file.buffer);
  return `/uploads/${fileName}`;
}

function detectImageType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { mimeType: "image/jpeg", extension: ".jpg" };
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return { mimeType: "image/png", extension: ".png" };
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return { mimeType: "image/webp", extension: ".webp" };
  return null;
}

function getImageDimensions(buffer, mimeType) {
  if (mimeType === "image/png") return getPngDimensions(buffer);
  if (mimeType === "image/jpeg") return getJpegDimensions(buffer);
  if (mimeType === "image/webp") return getWebpDimensions(buffer);
  return null;
}

function getPngDimensions(buffer) {
  if (buffer.length < 24) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function getJpegDimensions(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) { offset += 1; continue; }
    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
    if (offset >= buffer.length) break;
    const marker = buffer[offset];
    offset += 1;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (marker === 0xda) break;
    if (offset + 1 >= buffer.length) break;
    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) break;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      if (offset + 7 > buffer.length) break;
      return { height: buffer.readUInt16BE(offset + 3), width: buffer.readUInt16BE(offset + 5) };
    }
    offset += segmentLength;
  }
  return null;
}

function getWebpDimensions(buffer) {
  if (buffer.length < 30) return null;
  const chunkType = buffer.toString("ascii", 12, 16);
  if (chunkType === "VP8X") return { width: 1 + buffer[24] + (buffer[25] << 8) + (buffer[26] << 16), height: 1 + buffer[27] + (buffer[28] << 8) + (buffer[29] << 16) };
  if (chunkType === "VP8 " && buffer.length >= 30) return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  if (chunkType === "VP8L" && buffer.length >= 25) {
    if (buffer[20] !== 0x2f) return null;
    const b0 = buffer[21], b1 = buffer[22], b2 = buffer[23], b3 = buffer[24];
    return { width: 1 + (((b1 & 0x3f) << 8) | b0), height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)) };
  }
  return null;
}

module.exports = {
  readRawBody,
  readMultipartFormData,
  saveUploadedImage
};
