/** @type {import('next').NextConfig} */
export default {
  // The converters load native or WASM code and read files at runtime: keep them out of the bundle.
  serverExternalPackages: ['anymark', 'tesseract.js', 'mammoth', 'unpdf', 'read-excel-file'],
  experimental: { serverActions: { bodySizeLimit: '11mb' } },
};
