export function labelsToMask(
  labels: Uint8Array,
  width: number,
  height: number,
  colorIndex: number
): Uint8Array {
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < labels.length; i += 1) {
    mask[i] = labels[i] === colorIndex ? 1 : 0;
  }
  return mask;
}

export function removeSmallComponents(
  mask: Uint8Array,
  width: number,
  height: number,
  minPixels: number
): Uint8Array {
  if (minPixels <= 1) {
    return mask;
  }
  const out = new Uint8Array(mask);
  const visited = new Uint8Array(mask.length);
  const dirs = [1, -1, width, -width];

  for (let i = 0; i < mask.length; i += 1) {
    if (!out[i] || visited[i]) {
      continue;
    }

    const queue: number[] = [i];
    const component: number[] = [];
    visited[i] = 1;

    while (queue.length) {
      const current = queue.pop() as number;
      component.push(current);
      const x = current % width;

      for (const d of dirs) {
        const next = current + d;
        if (next < 0 || next >= out.length || visited[next] || !out[next]) {
          continue;
        }
        if ((d === 1 && x === width - 1) || (d === -1 && x === 0)) {
          continue;
        }
        visited[next] = 1;
        queue.push(next);
      }
    }

    if (component.length < minPixels) {
      for (const index of component) {
        out[index] = 0;
      }
    }
  }

  return out;
}

export function erodeMask(mask: Uint8Array, width: number, height: number, iterations: number): Uint8Array {
  if (iterations <= 0) {
    return mask;
  }
  let current = new Uint8Array(mask);
  const neighbors = [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1]
  ];

  for (let iter = 0; iter < iterations; iter += 1) {
    const next = new Uint8Array(current.length);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const idx = y * width + x;
        if (!current[idx]) {
          continue;
        }
        let keep = true;
        for (const [dx, dy] of neighbors) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
            keep = false;
            break;
          }
          const nIdx = ny * width + nx;
          if (!current[nIdx]) {
            keep = false;
            break;
          }
        }
        if (keep) {
          next[idx] = 1;
        }
      }
    }
    current = next;
  }

  return current;
}

export function dilateMask(mask: Uint8Array, width: number, height: number, iterations: number): Uint8Array {
  if (iterations <= 0) {
    return mask;
  }
  let current = new Uint8Array(mask);
  const neighbors = [
    [0, 0],
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1]
  ];

  for (let iter = 0; iter < iterations; iter += 1) {
    const next = new Uint8Array(current.length);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const idx = y * width + x;
        if (!current[idx]) {
          continue;
        }
        for (const [dx, dy] of neighbors) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
            continue;
          }
          next[ny * width + nx] = 1;
        }
      }
    }
    current = next;
  }

  return current;
}

export function closeMask(mask: Uint8Array, width: number, height: number, iterations: number): Uint8Array {
  if (iterations <= 0) {
    return mask;
  }
  const dilated = dilateMask(mask, width, height, iterations);
  return erodeMask(dilated, width, height, iterations);
}

export function erodeMaskPreserveSmallComponents(
  mask: Uint8Array,
  width: number,
  height: number,
  iterations: number,
  preserveMaxPixels: number
): Uint8Array {
  const eroded = erodeMask(mask, width, height, iterations);
  if (preserveMaxPixels <= 0) {
    return eroded;
  }

  const out = new Uint8Array(eroded);
  const visited = new Uint8Array(mask.length);
  const neighbors = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ];

  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i] || visited[i]) {
      continue;
    }

    const stack: number[] = [i];
    const component: number[] = [];
    visited[i] = 1;

    while (stack.length > 0) {
      const current = stack.pop() as number;
      component.push(current);
      const x = current % width;
      const y = Math.floor(current / width);

      for (const [dx, dy] of neighbors) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
          continue;
        }
        const next = ny * width + nx;
        if (visited[next] || !mask[next]) {
          continue;
        }
        visited[next] = 1;
        stack.push(next);
      }
    }

    if (component.length <= preserveMaxPixels) {
      for (const idx of component) {
        out[idx] = 1;
      }
    }
  }

  return out;
}
