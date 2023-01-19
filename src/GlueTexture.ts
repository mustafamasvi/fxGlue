import { Glue } from './Glue';
import { GlueProgram } from './GlueProgram';
import { blendFragmentShaders, defaultFragmentShader, defaultVertexShader, GlueBlendMode } from './GlueShaderSources';
import {
  glueIsSourceLoaded,
  glueGetSourceDimensions,
  GlueSourceType,
} from './GlueUtils';

/**
 * Draw options for textures.
 */
export interface GlueTextureDrawOptions {
  /**
   * Horizontal offset in pixels.
   */
  x?: number;

  /**
   * Vertical offset in pixels.
   */
  y?: number;

  /**
   * Width in pixels.
   */
  width?: number;

  /**
   * Height in pixels.
   */
  height?: number;

  /**
   * Opacity from 0.0 to 1.0.
   */
  opacity?: number;

  /**
   * Blend mode.
   */
  mode?: GlueBlendMode;

  /**
   * Mask.
   */
  mask?: string | GlueSourceType;
}

export class GlueTexture {
  private _width: number;
  private _height: number;
  private _disposed = false;
  private _texture: WebGLTexture;
  private _programs: Record<string, GlueProgram> = {};
  private _imports: Record<string, string> = {};

  /**
   * Creates a new GlueTexture instance.
   * This constructor should not be called from outside of the Glue class.
   * @param gl WebGL context.
   * @param glue Glue instance.
   * @param _source HTMLImageElement, HTMLVideoElement or HTMLCanvasElement containing the source. Must be loaded.
   */
  constructor(
    private gl: WebGLRenderingContext,
    private glue: Glue,
    private _source: GlueSourceType
  ) {
    if (!glueIsSourceLoaded(_source)) {
      throw new Error('Source is not loaded.');
    }

    const target = gl.TEXTURE1;
    const texture = glue._createTexture(target);

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      _source
    );

    this.registerProgram('~default');
    for (const mode of Object.values(GlueBlendMode) as GlueBlendMode[]) {
      this.registerProgram('~blend_' + mode, blendFragmentShaders[mode]);
    }
    
    this._texture = texture;
    const [width, height] = glueGetSourceDimensions(_source);
    this._width = width;
    this._height = height;

    this.program('~default')?.apply();
  }

  /**
   * Draws the texture onto the current framebuffer.
   * @param options Drawing options.
   */
  draw({
    x = 0,
    y = 0,
    width,
    height,
    opacity = 1,
    mode = GlueBlendMode.NORMAL,
    mask,
  }: GlueTextureDrawOptions = {}): void {
    this.use();

    let size = [this._width, this._height];
    if (width && height) {
      size = [width, height];
    }

    const blendProgram = this.program('~blend_' + mode);

    if (!blendProgram) {
      throw new Error('Invalid blend mode.');
    }

    blendProgram.apply(
      {
        iImage: 1,
        iSize: size,
        iOffset: [x / this._width, y / this._height],
        iOpacity: opacity,
      },
      mask
    );
  }

  /**
   * Updates the current texture.
   * This is useful in case of video textures, where
   * this action will set the texture to the current playback frame.
   */
  update(source?: GlueSourceType): void {
    this.checkDisposed();

    if (source) {
      if (!glueIsSourceLoaded(source)) {
        throw new Error('Source is not loaded.');
      }

      const [width, height] = glueGetSourceDimensions(source);
      this._width = width;
      this._height = height;
      this._source = source;
    }

    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE1);

    gl.bindTexture(gl.TEXTURE_2D, this._texture);

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      this._source
    );
  }

  /**
   * Creates and registers a WeBGL program for a later use.
   * NOTE: Glue uses a preprocessor for its GLSL programs.
   * Consult the documentation for more information.
   * Program names must not start with "~".
   * @param name Program name (must not be registered already).
   * @param fragmentShader Glue-compatible GLSL fragment shader code.
   * @param vertexShader Glue-compatible GLSL vertex shader code.
   * @returns A new GlueProgram instance.
   */
  registerProgram(
    name: string,
    fragmentShader?: string,
    vertexShader?: string
  ): GlueProgram {
    this.checkDisposed();

    if (this._programs[name]) {
      throw new Error('A program with this name already exists: ' + name);
    }

    const program = new GlueProgram(
      this.gl,
      this.glue,
      fragmentShader || defaultFragmentShader,
      vertexShader || defaultVertexShader,
      this._imports
    );

    this._programs[name] = program;
    return program;
  }

  /**
   * Removes a program from registered programs and disposes it.
   * @param name Name of the registered program.
   */
  deregisterProgram(name: string): void {
    this.checkDisposed();

    this._programs[name]?.dispose();
    delete this._programs[name];
  }

  /**
   * Checks if a registered program with a given name is available.
   * @param name Name of the registered program.
   * @returns Whether the program is available or not.
   */
  hasProgram(name: string): boolean {
    return !!this._programs[name];
  }

   /**
   * Retrieves a registered program with a given name.
   * @param name Name of the registered program.
   * @returns A GlueProgram instance or undefined if there is no program with such name.
   */
   program(name: string): GlueProgram | undefined {
    this.checkDisposed();
    return this._programs[name];
  }

  /**
   * Selects and binds the current texture to TEXTURE1 or target.
   * @param target gl.TEXTURE1 to gl.TEXTURE32 (default: gl.TEXTURE1).
   */
  use(target?: number): void {
    this.checkDisposed();

    const gl = this.gl;
    gl.activeTexture(target || gl.TEXTURE1);

    gl.bindTexture(gl.TEXTURE_2D, this._texture);
  }

   /**
   * Registers a GLSL partial as an import to be used with the @use syntax.
   * Unlike other register functions, this will replace the currently registered import with the same name.
   * @param name Name of the partial.
   * @param source Source of the partial.
   */
   registerImport(name: string, source: string): void {
    this.checkDisposed();

    this._imports[name] = source;
  }

  /**
   * Removes a GLSL partial from registered imports
   * @param name Name of the partial.
   */
  deregisterImport(name: string): void {
    this.checkDisposed();

    delete this._imports[name];
  }

  /**
   * Disposes of this GlueTexture object.
   * After this operation, the GlueTexture object may not be utilized further.
   * A new GlueTexture instance must be created for further use.
   */
  dispose(): void {
    this.gl.deleteTexture(this._texture);
  }

  private checkDisposed() {
    if (this._disposed) {
      throw new Error('This GlueTexture object has been disposed.');
    }
  }
}
