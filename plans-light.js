(() => {
  'use strict';
  const section = document.getElementById('plans');
  const canvas = document.getElementById('plans-light');
  const control = document.querySelector('.plans-motion-control');
  if (!section || !canvas || !control) return;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let gl;
  try {
    gl = canvas.getContext('webgl', {antialias: false, depth: false, stencil: false, powerPreference: 'low-power'});
  } catch (_) { return; }
  if (!gl) return; // The CSS light wash remains when WebGL is unavailable.

  const shaders = [];
  let program;
  let buffer;
  function shader(type, source) {
    const result = gl.createShader(type);
    if (!result) throw new Error('Shader unavailable');
    shaders.push(result);
    gl.shaderSource(result, source);
    gl.compileShader(result);
    return result;
  }
  try {
    program = gl.createProgram();
    if (!program) throw new Error('Program unavailable');
    gl.attachShader(program, shader(gl.VERTEX_SHADER, `
      attribute vec2 position;
      varying vec2 uv;
      void main() { uv = position * .5 + .5; gl_Position = vec4(position, 0., 1.); }
    `));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, `
      precision mediump float;
      varying vec2 uv;
      uniform float time;
      uniform vec2 pointer;
      void main() {
        vec2 p = vec2(uv.x, 1. - uv.y);
        float t = time * .13;
        float x = p.x + (pointer.x - .5) * .065;
        float y = p.y + (pointer.y - .5) * .025;
        float fold = sin(x * 6.2 + sin(y * 4.5 - t) * 1.1 + t);
        float sweep = x + y * .48 + fold * .13;
        float ribbon = .5 + .5 * sin(sweep * 15. - t * .7);
        float fine = pow(.5 + .5 * sin(sweep * 29. + t * .3), 12.);
        float light = exp(-pow((sweep - .82 - sin(t) * .07) * 3.2, 2.));
        vec3 cream = vec3(.922, .871, .775);
        vec3 sage = vec3(.56, .67, .52);
        vec3 gold = vec3(.91, .72, .44);
        vec3 color = mix(cream, sage, ribbon * .40);
        color = mix(color, gold, light * .34);
        color += vec3(.12, .105, .08) * fine;
        // Keep the heading's left side and the section edges quiet.
        float strength = smoothstep(.12, .67, p.x) * (1. - smoothstep(.65, 1., p.y));
        strength *= smoothstep(0., .10, p.y);
        color = mix(cream, color, strength);
        gl_FragColor = vec4(color, 1.);
      }
    `));
    gl.bindAttribLocation(program, 0, 'position');
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Shader link failed');
    gl.useProgram(program);
    buffer = gl.createBuffer();
    if (!buffer) throw new Error('Buffer unavailable');
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  } catch (_) {
    if (buffer) gl.deleteBuffer(buffer);
    if (program) gl.deleteProgram(program);
    return;
  } finally {
    shaders.forEach(item => gl.deleteShader(item));
  }

  const clock = gl.getUniformLocation(program, 'time');
  const mouse = gl.getUniformLocation(program, 'pointer');
  let visible = false;
  let paused = false;
  let lost = false;
  let frame = 0;
  let last = 0;
  let elapsed = 0;
  let pointer = [.5, .5];
  let target = [.5, .5];
  const running = () => visible && !document.hidden && !paused && !reduced.matches && !lost;

  function draw() {
    if (lost) return;
    gl.uniform1f(clock, elapsed);
    gl.uniform2f(mouse, pointer[0], pointer[1]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function resize() {
    if (lost) return;
    const {width, height} = section.getBoundingClientRect();
    // A soft backdrop does not need a full-resolution retina framebuffer.
    const scale = Math.min(devicePixelRatio || 1, 1.25, 1400 / Math.max(width, height), Math.sqrt(900000 / Math.max(1, width * height)));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
    draw();
  }
  function tick(now) {
    frame = 0;
    if (!running()) return;
    if (!last || now - last >= 1000 / 30) {
      elapsed += last ? Math.min((now - last) / 1000, .1) : 0;
      last = now;
      pointer = pointer.map((value, i) => value + (target[i] - value) * .055);
      draw();
    }
    frame = requestAnimationFrame(tick);
  }
  function update() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
    control.hidden = reduced.matches || lost;
    control.textContent = paused ? 'Play light effect' : 'Pause light effect';
    control.setAttribute('aria-pressed', String(paused));
    if (running()) frame = requestAnimationFrame(tick);
  }
  control.addEventListener('click', () => { paused = !paused; update(); });
  reduced.addEventListener('change', update);
  document.addEventListener('visibilitychange', update);
  section.addEventListener('pointermove', event => {
    if (!running() || event.pointerType !== 'mouse') return;
    const rect = section.getBoundingClientRect();
    target = [(event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height];
  }, {passive: true});
  section.addEventListener('pointerleave', () => { target = [.5, .5]; });
  const resizeObserver = new ResizeObserver(resize);
  const visibilityObserver = new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    update();
  });
  canvas.addEventListener('webglcontextlost', () => {
    lost = true;
    canvas.hidden = true;
    update();
    resizeObserver.disconnect();
    visibilityObserver.disconnect();
    // Keep the static fallback for this visit; the content never depends on GL.
  });
  resize();
  canvas.hidden = false;
  resizeObserver.observe(section);
  visibilityObserver.observe(section);
  update();
})();
