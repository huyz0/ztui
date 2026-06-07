declare module "omggif" {
  export class GifReader {
    public width: number;
    public height: number;
    constructor(buf: Buffer | Uint8Array);
    public numFrames(): number;
    public decodeAndBlitFrameRGBA(frameNum: number, pixels: Uint8Array): void;
  }
}
