export class Canvas {
  constructor(_width: number, _height: number, _type?: string) {}
}

export declare function createCanvas(
  width: number,
  height: number,
): Canvas;

export declare class Image {
  src: string | Buffer;
  width: number;
  height: number;
}

export declare function loadImage(
  source: string | Buffer,
): Promise<Image>;
