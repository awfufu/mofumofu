'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const scene = $('scene');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const PET_DURATION = 3;
  const TAIL_DURATION = 1.05;
  const PRESS_IN_DURATION = .12;
  const PRESS_OUT_DURATION = .18;
  const BLINK_DURATION = .32;
  const EAR_TWITCH_DURATION = .45;
  const sides = ['left', 'right'];
  const hitIds = ['head-hit', 'tail-hit', ...sides.flatMap(side => [`eye-${side}-hit`, `ear-${side}-hit`])];
  const spring = () => ({ value: 0, velocity: 0 });
  const pressCycle = () => ({ value: 0, phase: 'idle', start: -10, releaseAt: null });
  const state = {
    paused: reducedMotion.matches, x: 0, y: 0, tx: 0, ty: 0,
    vx: 0, vy: 0, time: 0, last: 0, frame: 0,
    nextBlink: 3.2, petStart: -10,
    blinks: { left: { start: -10, speed: 1 }, right: { start: -10, speed: 1 } },
    earTwitchStart: { left: -10, right: -10 },
    pointer: null, tailMatrix: new DOMMatrix(),
    tailReadyAt: 0, heldPointer: null, heldKey: null, tailHeldPointer: null,
    press: pressCycle(), tailPress: pressCycle(),
    earLeft: spring(), earRight: spring(), bell: spring(),
    hairLeft: spring(), hairRight: spring(), tailShake: spring(),
    tailAction: null, previousPose: null,
    gaze: { left: { x: 0, y: 0 }, right: { x: 0, y: 0 } },
  };
  const nodes = {};
  ['tail','head','body','sleeve','ear-left','ear-right','back-locks','hairpin','bell',
    'iris-left','iris-right','aperture-left','aperture-right','lid-left','lid-right','lashes-left','lashes-right',
    'fringe-shine','left-lock-shine','left-lock-contour','hair-back-main',
    'blushes','lock-fill','lock-edge','lock-shine', ...hitIds].forEach(id => nodes[id] = $(id));
  const fmt = n => Number(n.toFixed(3));
  const transform = (id, value) => nodes[id].setAttribute('transform', value);
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const smoothstep = v => { const u = clamp(v, 0, 1); return u * u * (3 - 2 * u); };
  const smootherstep = v => { const u = clamp(v, 0, 1); return u ** 3 * (u * (u * 6 - 15) + 10); };
  const matrixTransform = m => `matrix(${[m.a,m.b,m.c,m.d].map(n => Number(n.toFixed(6))).join(' ')} ${fmt(m.e)} ${fmt(m.f)})`;
  // Offset a highlight inward from the actual Bézier boundary, with tapered ends.
  // Fill, outline and highlight therefore stay registered when a lock bends.
  function insetRibbon(curve, from, to, inset = 7, width = 4.8) {
    const outer = [], inner = [];
    for (let i = 0; i <= 20; i++) {
      const u = i / 20, t = from + (to - from) * u, v = 1 - t;
      const p = [0, 1].map(axis => v ** 3 * curve[0][axis] + 3 * v * v * t * curve[1][axis]
        + 3 * v * t * t * curve[2][axis] + t ** 3 * curve[3][axis]);
      const tangent = [0, 1].map(axis => 3 * v * v * (curve[1][axis] - curve[0][axis])
        + 6 * v * t * (curve[2][axis] - curve[1][axis]) + 3 * t * t * (curve[3][axis] - curve[2][axis]));
      const length = Math.hypot(...tangent);
      const normal = [tangent[1] / length, -tangent[0] / length];
      const halfWidth = width / 2 * Math.sin(Math.PI * u) ** .5;
      outer.push(p.map((n, axis) => n + normal[axis] * (inset - halfWidth)));
      inner.push(p.map((n, axis) => n + normal[axis] * (inset + halfWidth)));
    }
    const point = p => `${fmt(p[0])} ${fmt(p[1])}`;
    function smoothPath(points, command) {
      let path = `${command}${point(points[0])}`;
      for (let i = 0; i < points.length - 1; i++) {
        const a = points[Math.max(0, i - 1)], b = points[i];
        const c = points[i + 1], d = points[Math.min(points.length - 1, i + 2)];
        const first = b.map((n, axis) => n + (c[axis] - a[axis]) / 6);
        const second = c.map((n, axis) => n - (d[axis] - b[axis]) / 6);
        path += `C${point(first)} ${point(second)} ${point(c)}`;
      }
      return path;
    }
    return smoothPath(outer, 'M') + smoothPath(inner.reverse(), 'L') + 'Z';
  }
  nodes['fringe-shine'].setAttribute('d',
    insetRibbon([[813,391],[824,426],[847,456],[868,465]], .07, .94)
    + insetRibbon([[915,309],[922,366],[938,419],[957,451]], .1, .88));
  nodes['left-lock-shine'].setAttribute('d',
    insetRibbon([[650,444],[653,482.333],[656,520.667],[659,559]], .08, .94));
  const upperLockShine = insetRibbon([[980,361],[975,421],[959,489],[936,521]], .6, .97);

  function updateEyelid(side, closed) {
    const height = closed * 76;
    const left = height - 1, middle = height + 1 + closed * 12, right = height + 1;
    const edge = `M-39 ${fmt(left)}Q0 ${fmt(middle)} 39 ${fmt(right)}`;
    const yAt = x => {
      const u = (x + 39) / 78;
      return (1 - u) ** 2 * left + 2 * (1 - u) * u * middle + u ** 2 * right;
    };
    const lashes = [[-37,-4,9],[-23,-3,8],[35,1,12]].map(([x, dx, length]) =>
      `M${x} ${fmt(yAt(x) - 1)}L${x + dx} ${fmt(yAt(x) - length)}`).join('');
    // Reveal only the area below the descending lid. The eyeball is never scaled.
    nodes[`aperture-${side}`].setAttribute('d', edge + 'L60 112H-60Z');
    nodes[`lid-${side}`].setAttribute('d', edge);
    nodes[`lid-${side}`].setAttribute('stroke-width', fmt(10 - closed * 2));
    nodes[`lashes-${side}`].setAttribute('d', lashes);
  }
  function toScene(event) {
    const matrix = scene.getScreenCTM();
    if (!matrix) return null;
    return new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
  }
  function follow(event) {
    const p = toScene(event);
    if (!p) return;
    state.pointer = p;
    state.tx = clamp((p.x - 830) / 490, -1, 1);
    state.ty = clamp((p.y - 400) / 430, -1, 1);
  }
  function center() { state.tx = state.ty = 0; state.pointer = null; }
  function updateInteractionAvailability() {
    for (const id of hitIds) nodes[id].setAttribute('aria-disabled', String(state.paused));
  }
  function requestFrame() {
    if (!state.frame && !state.paused && !document.hidden) {
      state.last = performance.now();
      state.frame = requestAnimationFrame(frame);
    }
  }
  function setPaused(value) {
    state.paused = value;
    if (value) {
      releaseHead();
      releaseTail();
      cancelAnimationFrame(state.frame);
      state.frame = 0;
    }
    updateInteractionAvailability();
    requestFrame();
  }
  function pet() {
    if (state.time >= state.petStart + PET_DURATION + .35) state.petStart = state.time;
  }
  function pressHead({ pointerId = null, key = null, pulse = false } = {}) {
    if (state.paused || state.press.phase !== 'idle') return false;
    state.heldPointer = pointerId;
    state.heldKey = key;
    state.press.phase = 'down';
    state.press.start = state.time;
    state.press.releaseAt = pulse ? state.time : null;
    pet();
    return true;
  }
  function releaseHead() {
    if (state.heldPointer === null && state.heldKey === null) return;
    const pointerId = state.heldPointer;
    state.heldPointer = state.heldKey = null;
    state.press.releaseAt = state.time;
    if (pointerId !== null && nodes['head-hit'].hasPointerCapture(pointerId)) {
      nodes['head-hit'].releasePointerCapture(pointerId);
    }
  }
  function updatePress(press, t) {
    if (press.phase === 'idle') return;
    const downEnd = press.start + PRESS_IN_DURATION;
    if (t < downEnd) {
      press.value = smootherstep((t - press.start) / PRESS_IN_DURATION);
    } else if (press.releaseAt === null) {
      press.phase = 'held';
      press.value = 1;
    } else {
      // A short tap still finishes the downstroke before returning. There is no
      // extra cooldown: the next press is accepted as soon as this return ends.
      const age = t - Math.max(downEnd, press.releaseAt);
      press.phase = age + 1e-8 >= PRESS_OUT_DURATION ? 'idle' : 'up';
      press.value = press.phase === 'idle' ? 0 : 1 - smootherstep(age / PRESS_OUT_DURATION);
    }
  }
  function isBlinking(side) {
    const blink = state.blinks[side];
    return (state.time - blink.start) * blink.speed + 1e-8 < BLINK_DURATION;
  }
  function blink(side) {
    const targets = side ? [side] : sides;
    if (state.paused || targets.some(isBlinking)) return;
    for (const target of targets) state.blinks[target] = { start: state.time, speed: side ? 1.5 : 1 };
    state.nextBlink = state.time + 3.5 + Math.random() * 2.5;
  }
  function twitchEar(side) {
    if (state.paused || state.time - state.earTwitchStart[side] < EAR_TWITCH_DURATION) return;
    state.earTwitchStart[side] = state.time;
  }
  function earTwitch(side, t) {
    const age = (t - state.earTwitchStart[side]) / EAR_TWITCH_DURATION;
    if (age < 0 || age >= 1) return 0;
    // Three quick oscillations with zero speed at the start and end.
    return Math.sin(age * Math.PI * 6) * Math.sin(age * Math.PI) ** 2 * (side === 'left' ? 6 : -6);
  }
  function teaseTail(event) {
    if (state.paused || state.tailPress.phase !== 'idle' || state.time < state.tailReadyAt) return false;
    const p = event && toScene(event);
    const local = p ? p.matrixTransform(state.tailMatrix.inverse()) : new DOMPoint(315, 580);
    // The upper cap presses down. Below it, the outer quarters dodge inward
    // and the middle shakes. Coordinates follow the tail through every pose.
    let left = Infinity, right = -Infinity;
    const silhouette = $('tail-silhouette');
    for (let x = 145; x <= 505; x += 2) {
      if (silhouette.isPointInFill(new DOMPoint(x, local.y))) {
        left = Math.min(left, x);
        right = Math.max(right, x);
      }
    }
    const position = Number.isFinite(left) && right > left ? (local.x - left) / (right - left) : .5;
    const kind = local.y < 535 ? 'compress' : position < .24 || position > .76 ? 'dodge' : 'shake';
    state.tailAction = { kind, start: state.time, direction: position < .5 ? 1 : -1 };
    if (kind === 'shake') {
      // A center click plays one shake regardless of how long the pointer stays down.
      state.tailReadyAt = state.time + TAIL_DURATION + .55;
      return false;
    }
    state.tailHeldPointer = event.pointerId;
    state.tailPress.phase = 'down';
    state.tailPress.start = state.time;
    state.tailPress.releaseAt = null;
    return true;
  }
  function releaseTail() {
    if (state.tailHeldPointer === null) return;
    const pointerId = state.tailHeldPointer;
    state.tailHeldPointer = null;
    state.tailPress.releaseAt = state.time;
    if (scene.hasPointerCapture(pointerId)) scene.releasePointerCapture(pointerId);
  }
  function stepSpring(s, target, stiffness, damping, dt) {
    s.velocity += ((target - s.value) * stiffness - s.velocity * damping) * dt;
    s.value += s.velocity * dt;
  }
  function getPose(t) {
    const age = t - state.petStart;
    const petActive = age >= 0 && age < PET_DURATION;
    // Zero velocity at both ends keeps secondary motion continuous at the boundary.
    const pat = petActive ? Math.sin(Math.PI * age / PET_DURATION) ** 2 : 0;
    const breath = Math.sin(t * 1.65);
    const nod = pat * Math.sin(age * 5) * 1.8;
    const bodyAngle = state.x * 1.1 + Math.sin(t * .8) * .1 + nod * .28;
    const headAngle = state.x + Math.sin(t * .8) * .25 + nod * .72;
    const bodyMatrix = new DOMMatrix().translate(state.x * 5.5, state.y * 2.4 - breath * 1.8 + pat * .6)
      .translate(798, 728).rotate(bodyAngle).translate(-798, -728);
    const headMatrix = bodyMatrix.translate(state.x * 3, state.y * 3.6 - breath * 1.2 + pat * 2.4)
      .translate(850, 550).rotate(headAngle).scale(1, 1 - state.press.value * .05).translate(-850, -550);
    const neck = new DOMPoint(850, 550).matrixTransform(headMatrix);
    const collar = new DOMPoint(791, 544).matrixTransform(bodyMatrix);
    return { age, petActive, pat, breath, nod, bodyMatrix, headMatrix,
      angle: bodyAngle + headAngle, neckX: neck.x, collarX: collar.x };
  }
  function updatePhysics(dt) {
    if (!dt) return;
    // Fixed small substeps keep the springs stable across fast and slow displays.
    const steps = Math.ceil(dt / (1 / 120)), h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const t = state.time - dt + (i + 1) * h;
      state.vx += ((state.tx - state.x) * 62 - state.vx * 14) * h;
      state.vy += ((state.ty - state.y) * 62 - state.vy * 14) * h;
      state.x += state.vx * h;
      state.y += state.vy * h;
      updatePress(state.press, t);
      updatePress(state.tailPress, t);
      const pose = getPose(t), previous = state.previousPose || pose;
      const neckVX = (pose.neckX - previous.neckX) / h;
      const collarVX = (pose.collarX - previous.collarX) / h;
      const angleV = (pose.angle - previous.angle) / h;
      const cycle = t % 7.8;
      const twitch = cycle > 6.7 ? Math.sin((cycle - 6.7) * 15) * Math.sin((cycle - 6.7) / 1.1 * Math.PI) ** 2 * 2.1 : 0;
      const flutter = pose.pat * Math.sin(pose.age * 12) * 3.2;
      // Ears follow the absolute head angle on softer springs, then render relative
      // to it. Translation also bends their tips opposite the head's travel.
      stepSpring(state.earLeft, pose.angle - clamp(neckVX * .075, -6, 6) + twitch + flutter, 46, 9, h);
      stepSpring(state.earRight, pose.angle - clamp(neckVX * .06, -5, 5) - twitch * .65 - flutter * .75, 35, 8, h);
      // Positive rotation about the bell's TOP sends its center to the left.
      stepSpring(state.bell, clamp(collarVX * .32, -18, 18) - pose.angle * .45
        + Math.sin(t * 1.65) * 1.3, 80, 12, h);
      const hairDrive = clamp(-neckVX * .17 + angleV * .35, -14, 14);
      stepSpring(state.hairLeft, hairDrive * .8 + Math.sin(t * 1.7 + .7) * 2.1 + pose.nod * 1.6, 48, 9, h);
      stepSpring(state.hairRight, hairDrive + Math.sin(t * 1.7) * 3 + pose.nod * 2.4, 32, 7.5, h);
      let shake = 0;
      const action = state.tailAction;
      if (action?.kind === 'shake') {
        const age = t - action.start;
        if (age >= 0 && age < TAIL_DURATION) {
          const envelope = smoothstep(age / .18) * (1 - smoothstep((age - .5) / .55));
          shake = Math.sin(age * Math.PI * 2 * 3.8) * 8 * envelope;
        }
      }
      stepSpring(state.tailShake, shake, 600, 32, h);
      state.previousPose = pose;
    }
  }
  function drawHair() {
    const left = state.hairLeft.value, right = state.hairRight.value;
    const l = (v, weight = 1) => fmt(v + left * weight);
    const r = v => fmt(v + right);
    const leftCurve = [[650,444],[653,482.333],[l(656,.65),520.667],[l(659),559]];
    const leftContour = `M780 250C726 264 679 309 645 363C620 404 603 424 578 440Q607 456 650 444C653 482.333 ${l(656,.65)} 520.667 ${l(659)} 559C${l(693,.75)} 549 ${l(718,.3)} 525 730 495L719 488C706 478 702 467 719 451L730 406C740 367 738 330 751 299`;
    nodes['left-lock-contour'].setAttribute('d', leftContour);
    nodes['left-lock-shine'].setAttribute('d', insetRibbon(leftCurve, .08, .94));
    // The rear silhouette shares the left tip's bend, preventing a static duplicate edge.
    nodes['hair-back-main'].setAttribute('d', `M780 250C726 264 679 309 645 363C620 404 603 424 578 440Q607 456 650 444C635 480 ${l(625,.25)} 499 ${l(602,.4)} 510Q${l(620,.4)} 522 ${l(657,.65)} 520L${l(658)} 559C${l(695,.75)} 548 ${l(721,.3)} 529 738 504L919 543Q962 571 992 608L1001 589C1005 609 1017 631 1030 643C1035 603 1048 574 1059 552C1075 515 1088 476 1086 434C1084 394 1076 363 1061 341L1014 267C955 253 897 229 839 240`);
    const rightContour = `M980 361C975 421 959 489 936 521L917 533L941 527C912 557 ${r(895)} 584 ${r(908)} 614C${r(915)} 629 ${r(923)} 637 ${r(913)} 650Q${r(932)} 654 ${r(929)} 639C${r(929)} 623 ${r(945)} 612 964 599C1014 564 1040 489 1048 415`;
    nodes['lock-fill'].setAttribute('d', rightContour + 'L1044 361Z');
    nodes['lock-edge'].setAttribute('d', rightContour);
    nodes['lock-shine'].setAttribute('d', upperLockShine
      + insetRibbon([[941,527],[912,557],[r(895),584],[r(908),614]], .1, .94));
    transform('back-locks', `rotate(${fmt(right * .24)} 1065 539)`);
    transform('hairpin', `rotate(${fmt(-right * .08)} 1090 438)`);
  }
  function draw(dt) {
    updatePhysics(dt);
    const t = state.time;
    const { age: petTime, petActive, pat, breath, bodyMatrix, headMatrix, angle } = getPose(t);
    const headTransform = matrixTransform(headMatrix);
    transform('head', headTransform);
    transform('body', matrixTransform(bodyMatrix.translate(798, 728).scale(1, 1 + breath * .004).translate(-798, -728)));
    transform('sleeve', matrixTransform(bodyMatrix.translate(0, breath)
      .translate(955, 646).rotate(breath * .23).translate(-955, -646)));
    // Bend the upper tail around its buried base: the bottom cap stays under the rim.
    const tailAction = state.tailAction;
    const tailLean = state.tailShake.value + (tailAction?.kind === 'dodge' ? tailAction.direction * 10 * state.tailPress.value : 0);
    const tailCompression = tailAction?.kind === 'compress' ? state.tailPress.value : 0;
    state.tailMatrix = new DOMMatrix().translate(471, 723)
      .rotate(Math.sin(t * 1.12) * 2.25 + pat * Math.sin(petTime * 7) * 2.5).translate(-471, -723)
      .translate(471, 800).skewX(-tailLean).scale(1, 1 - tailCompression * .05).translate(-471, -800);
    transform('tail', matrixTransform(state.tailMatrix));
    for (const [side, inertia, pivot] of [['left', state.earLeft, '782 250'], ['right', state.earRight, '1010 335']]) {
      const earTransform = `rotate(${fmt(inertia.value - angle + earTwitch(side, t))} ${pivot})`;
      transform(`ear-${side}`, earTransform);
      transform(`ear-${side}-hit`, earTransform);
    }
    transform('bell', `translate(791 574) rotate(18) rotate(${fmt(state.bell.value)} 0 -30)`);
    drawHair();
    // Eyes respond faster than the head and keep tracking even while it is being patted.
    const look = state.pointer ? state.pointer.matrixTransform(headMatrix.inverse()) : null;
    const eyeAngle = 20 * Math.PI / 180, eyeCos = Math.cos(eyeAngle), eyeSin = Math.sin(eyeAngle);
    const gazeBlend = 1 - Math.exp(-dt * 20);
    for (const [side, cx, cy] of [['left',773,397], ['right',913,447]]) {
      const dx = look ? look.x - cx : 0, dy = look ? look.y - cy : 0;
      const gx = look ? clamp((dx * eyeCos + dy * eyeSin - 6) / 420, -1, 1) * 6.5 : 0;
      const gy = look ? clamp((-dx * eyeSin + dy * eyeCos - 38) / 380, -1, 1) * 3.4 : 0;
      const gaze = state.gaze[side];
      gaze.x += (gx - gaze.x) * gazeBlend;
      gaze.y += (gy - gaze.y) * gazeBlend;
      transform(`iris-${side}`, `translate(${fmt(gaze.x)} ${fmt(gaze.y)})`);
    }
    // A quick downward lid, a brief closed hold, then a softer reopening.
    if (t >= state.nextBlink && !petActive) blink();
    for (const side of sides) {
      const blinkAge = (t - state.blinks[side].start) * state.blinks[side].speed;
      const close = blinkAge < 0 || blinkAge >= BLINK_DURATION ? 0
        : blinkAge < .105 ? smoothstep(blinkAge / .105)
        : blinkAge < .15 ? 1 : 1 - smoothstep((blinkAge - .15) / .17);
      updateEyelid(side, close);
    }
    nodes.blushes.setAttribute('opacity', fmt(.8 + pat * .2));
  }
  function frame(now) {
    state.frame = 0;
    if (state.paused || document.hidden) return;
    const dt = Math.min((now - state.last) / 1000, .05);
    state.last = now;
    state.time += dt;
    draw(dt);
    state.frame = requestAnimationFrame(frame);
  }
  document.addEventListener('pointermove', follow, { passive: true });
  document.addEventListener('pointerdown', follow, { passive: true });
  document.addEventListener('pointerleave', center);
  window.addEventListener('blur', () => { releaseHead(); releaseTail(); center(); });
  document.addEventListener('pointerup', event => {
    if (event.pointerId === state.heldPointer) releaseHead();
    if (event.pointerId === state.tailHeldPointer) releaseTail();
    if (event.pointerType !== 'mouse') center();
  });
  document.addEventListener('pointercancel', event => {
    if (event.pointerId === state.heldPointer) releaseHead();
    if (event.pointerId === state.tailHeldPointer) releaseTail();
    center();
  });
  nodes['head-hit'].addEventListener('pointerdown', event => {
    if (event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    if (pressHead({ pointerId: event.pointerId })) nodes['head-hit'].setPointerCapture(event.pointerId);
  });
  nodes['head-hit'].addEventListener('lostpointercapture', event => {
    if (event.pointerId === state.heldPointer) releaseHead();
  });
  nodes['head-hit'].addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (!event.repeat) pressHead({ key: event.key });
  });
  document.addEventListener('keyup', event => {
    if (event.key === state.heldKey) { event.preventDefault(); releaseHead(); }
  });
  nodes['head-hit'].addEventListener('blur', () => { if (state.heldKey !== null) releaseHead(); });
  // A detail=0 click supports assistive activation; pointer presses already ran above.
  nodes['head-hit'].addEventListener('click', event => { if (event.detail === 0) pressHead({ pulse: true }); });
  function bindTap(id, action) {
    nodes[id].addEventListener('pointerdown', event => {
      if (event.button !== 0 || !event.isPrimary) return;
      event.preventDefault();
      action(event);
    });
    nodes[id].addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      if (!event.repeat) action();
    });
    nodes[id].addEventListener('click', event => { if (event.detail === 0) action(); });
  }
  bindTap('tail-hit', event => {
    // Capture on the stable scene, not the animated SVG <use> instance.
    if (teaseTail(event)) scene.setPointerCapture(event.pointerId);
  });
  scene.addEventListener('lostpointercapture', event => {
    if (event.target === scene && event.pointerId === state.tailHeldPointer) releaseTail();
  });
  for (const side of sides) {
    bindTap(`eye-${side}-hit`, () => blink(side));
    bindTap(`ear-${side}-hit`, () => twitchEar(side));
  }
  reducedMotion.addEventListener('change', event => setPaused(event.matches));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      releaseHead();
      releaseTail();
      cancelAnimationFrame(state.frame);
      state.frame = 0;
      center();
    } else requestFrame();
  });
  state.previousPose = getPose(0);
  draw(0);
  updateInteractionAvailability();
  requestFrame();
})();
