import { Glue } from './Glue';
import { glueGet2dContext } from './GlueUtils';

export class GlueCanvas2D {
  readonly canvas: HTMLCanvasElement;
  readonly gl: CanvasRenderingContext2D;

  /**
   * Creates a new canvas and a new Glue instance.
   */
  constructor(options?: WebGLContextAttributes) {
    this.canvas = document.createElement('canvas');
    this.canvas.id = "glue2dCanvas"
    this.gl = glueGet2dContext(this.canvas, options);
  }

  /**
   * Sets the size of the output. Must be called before everything else.
   * @param width Width (px).
   * @param height Height (px).
   */
  setSize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
  }
}
