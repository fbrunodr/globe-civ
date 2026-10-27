// Times the GPU's work (WebGL2's EXT_disjoint_timer_query_webgl2): wrap a
// frame's drawing in begin()/end(), call frame() once a frame, and read
// `ms`: the GPU time per frame, averaged over the last half second. Results
// arrive a few frames late; a disjoint GPU (a power state change) throws
// that half second away. Null where the browser hides the extension. (Whole
// frames only: on Apple's GPUs, through Metal, a single draw inside a
// render pass times as 0.)

export class GpuTimer {
  private readonly ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
  private open: WebGLQuery | null = null;
  private pending: WebGLQuery[] = [];
  private sum = 0;
  private frames = 0;
  private since = 0;
  ms: number | null = null;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as GpuTimer['ext'];
  }

  begin(): void {
    if (!this.ext || this.open) return;
    const q = this.gl.createQuery();
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q);
    this.open = q;
  }

  end(): void {
    if (!this.ext || !this.open) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.pending.push(this.open);
    this.open = null;
  }

  frame(now: number): void {
    if (!this.ext) return;
    const gl = this.gl, disjoint = gl.getParameter(this.ext.GPU_DISJOINT_EXT) as boolean;
    let done = 0;
    while (this.pending.length > 0 && gl.getQueryParameter(this.pending[0]!, gl.QUERY_RESULT_AVAILABLE)) {
      const q = this.pending.shift()!;
      if (!disjoint) { this.sum += gl.getQueryParameter(q, gl.QUERY_RESULT) as number; done++; }
      gl.deleteQuery(q);
    }
    this.frames += done;
    if (now - this.since >= 500) {
      if (!disjoint && this.frames > 0) this.ms = this.sum / this.frames / 1e6;
      this.sum = 0; this.frames = 0; this.since = now;
    }
  }
}
