import { SerializedAnimatedSprite, SerializedWorldMap, TileLayer } from './types';

export type { TileLayer } from './types';
export type AnimatedSprite = SerializedAnimatedSprite;

export class WorldMap {
  width: number;
  height: number;
  tileSetUrl: string;
  tileSetDimX: number;
  tileSetDimY: number;
  tileDim: number;
  bgTiles: number[][][];
  objectTiles: TileLayer[];
  animatedSprites: AnimatedSprite[];

  constructor(s: SerializedWorldMap) {
    this.width = s.width;
    this.height = s.height;
    this.tileSetUrl = s.tileSetUrl;
    this.tileSetDimX = s.tileSetDimX;
    this.tileSetDimY = s.tileSetDimY;
    this.tileDim = s.tileDim;
    this.bgTiles = s.bgTiles;
    this.objectTiles = s.objectTiles;
    this.animatedSprites = s.animatedSprites;
  }

  serialize(): SerializedWorldMap {
    return {
      width: this.width,
      height: this.height,
      tileSetUrl: this.tileSetUrl,
      tileSetDimX: this.tileSetDimX,
      tileSetDimY: this.tileSetDimY,
      tileDim: this.tileDim,
      bgTiles: this.bgTiles,
      objectTiles: this.objectTiles,
      animatedSprites: this.animatedSprites,
    };
  }
}
