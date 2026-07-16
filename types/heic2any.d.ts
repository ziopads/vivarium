// heic2any ships without types; a minimal ambient declaration is enough for the
// single lazy import in AddItemPhotos (HEIC → JPEG fallback for desktop browsers).
declare module 'heic2any' {
  const heic2any: (options: {
    blob: Blob;
    toType?: string;
    quality?: number;
  }) => Promise<Blob | Blob[]>;
  export default heic2any;
}
