/**
 * Runs the game's own edition shaders (public/game/shaders, copied from the game by
 * `npm run import-game`) in WebGL, so falling cards shine like in Balatro.
 *
 * The shaders are LÖVE shaders: an `effect()` function plus LÖVE's names for GLSL types. A few
 * defines translate those, and a `main()` calls `effect()` with what the game passes it (see
 * Card:draw in the game's card.lua). Shaders and the WebGL context are only set up the first
 * time an edition card needs them.
 */

export type ShaderName =
  | "foil"
  | "holo"
  | "polychrome"
  | "negative"
  | "negative_shine";

const HEADER = `precision highp float;
#define number float
#define Image sampler2D
#define extern uniform
#define Texel texture2D
`;

const FOOTER = `
uniform sampler2D u_texture;
varying vec2 v_uv;
void main() {
  gl_FragColor = effect(vec4(1.0), u_texture, v_uv, gl_FragCoord.xy);
}
`;

const VERTEX = `attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  // Texture (0, 0) is the image's top-left, so the output reads the right way up.
  v_uv = vec2(a_pos.x, 1.0 - a_pos.y);
  gl_Position = vec4(a_pos * 2.0 - 1.0, 0.0, 1.0);
}
`;

interface Program {
  program: WebGLProgram;
  uniform: (name: string) => WebGLUniformLocation | null;
}

export class EditionShaders {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private programs = new Map<ShaderName, Program | "loading" | "failed">();
  private textures = new WeakMap<HTMLCanvasElement, WebGLTexture>();

  private constructor(canvas: HTMLCanvasElement, gl: WebGLRenderingContext) {
    this.canvas = canvas;
    this.gl = gl;
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
  }

  /** Null where WebGL isn't available; callers then keep the still look. */
  static create(): EditionShaders | null {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl", {
      premultipliedAlpha: false,
      antialias: false,
      depth: false,
    });
    return gl ? new EditionShaders(canvas, gl) : null;
  }

  private load(name: ShaderName) {
    this.programs.set(name, "loading");
    fetch(`/game/shaders/${name}.fs`)
      .then((res) => (res.ok ? res.text() : Promise.reject(res.status)))
      .then((source) => this.programs.set(name, this.compile(source)))
      .catch(() => this.programs.set(name, "failed"));
  }

  private compile(source: string): Program | "failed" {
    const { gl } = this;
    const shader = (type: number, text: string) => {
      const s = gl.createShader(type);
      if (!s) return null;
      gl.shaderSource(s, text);
      gl.compileShader(s);
      return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
    };
    const vertex = shader(gl.VERTEX_SHADER, VERTEX);
    const fragment = shader(gl.FRAGMENT_SHADER, HEADER + source + FOOTER);
    const program = gl.createProgram();
    if (!vertex || !fragment || !program) return "failed";
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return "failed";
    const locations = new Map<string, WebGLUniformLocation | null>();
    return {
      program,
      uniform: (name) => {
        if (!locations.has(name))
          locations.set(name, gl.getUniformLocation(program, name));
        return locations.get(name) ?? null;
      },
    };
  }

  private texture(source: HTMLCanvasElement) {
    const { gl } = this;
    let texture = this.textures.get(source);
    if (!texture) {
      texture = gl.createTexture() ?? undefined;
      if (!texture) return null;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        source,
      );
      // Pixel art: no smoothing; card sizes aren't powers of two, so clamp.
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.textures.set(source, texture);
    }
    return texture;
  }

  /**
   * Draws `source` through a shader and returns the canvas holding the result (valid until the
   * next call), or null while the shader is still loading or if it can't run. `shine` and `time`
   * are what the game passes as the shader's own vec2 (send_to_shader).
   */
  render(
    name: ShaderName,
    source: HTMLCanvasElement,
    shine: number,
    time: number,
  ): HTMLCanvasElement | null {
    const entry = this.programs.get(name);
    if (entry === undefined) this.load(name);
    if (!entry || entry === "loading" || entry === "failed") return null;
    const texture = this.texture(source);
    if (!texture) return null;
    const { gl, canvas } = this;
    const w = source.width;
    const h = source.height;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    // biome-ignore lint/correctness/useHookAtTopLevel: WebGL's useProgram, not a React hook
    gl.useProgram(entry.program);
    const pos = gl.getAttribLocation(entry.program, "a_pos");
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(entry.uniform("u_texture"), 0);
    gl.uniform2f(entry.uniform(name), shine, time);
    gl.uniform1f(entry.uniform("dissolve"), 0);
    gl.uniform1f(entry.uniform("time"), time);
    // A standalone image: the whole texture is the sprite.
    gl.uniform4f(entry.uniform("texture_details"), 0, 0, w, h);
    gl.uniform2f(entry.uniform("image_details"), w, h);
    gl.uniform1i(entry.uniform("shadow"), 0);
    gl.uniform4f(entry.uniform("burn_colour_1"), 0, 0, 0, 0);
    gl.uniform4f(entry.uniform("burn_colour_2"), 0, 0, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return canvas;
  }
}
