/**
 * pdf.js 在 Node/Electron 环境解析时依赖 DOMMatrix / DOMPoint 等 DOM
 * 类型（坐标变换用）。@napi-rs/canvas 是 pdfjs-dist 的 optionalDependency，
 * 构建机安装失败会被 npm 静默跳过，打包产物因此缺失时 pdf.js 在
 * getDocument 阶段直接抛 `DOMMatrix is not defined`（2026-08-16 线上
 * 反馈：JD PDF 附件全部解析失败）。
 *
 * 本模块优先把 @napi-rs/canvas 的原生实现挂到 globalThis；缺失时用最小
 * 2D affine polyfill 兜底——文本提取只需要矩阵构造/乘法/求逆/平移缩放
 * 旋转，数学语义与标准 DOMMatrix 一致，提取结果不受影响（仅渲染能力
 * 缺失，getTextContent 不涉及渲染）。
 *
 * 注意：发布构建里主进程代码在 vm 中执行（protect-main-bundle），dynamic
 * import() 会抛 "A dynamic import callback was not specified"，因此这里
 * 用 createRequire 按需加载（require 由加载器真实传入，且失败可捕获）。
 */
import { createRequire } from "node:module";

const nodeRequire = createRequire(import.meta.url);

export async function ensurePdfEnvironment(): Promise<void> {
  const globals = globalThis as Record<string, unknown>;
  if (typeof globals.DOMMatrix === "function") return;
  try {
    const canvas = nodeRequire("@napi-rs/canvas") as typeof import("@napi-rs/canvas");
    globals.DOMMatrix = canvas.DOMMatrix;
    globals.DOMPoint = canvas.DOMPoint;
    if (canvas.Path2D) globals.Path2D = canvas.Path2D;
  } catch {
    installPolyfill();
  }
}

function installPolyfill(): void {
  const globals = globalThis as Record<string, unknown>;
  globals.DOMMatrix = MinimalDOMMatrix;
  globals.DOMPoint = MinimalDOMPoint;
}

/** 2D affine 变换矩阵（标准 DOMMatrix 的 a–f 布局）。导出供测试与复用的最小实现。 */
export class MinimalDOMMatrix {
  a = 1;
  b = 0;
  c = 0;
  d = 1;
  e = 0;
  f = 0;

  constructor(...args: unknown[]) {
    if (args.length === 1 && args[0] instanceof MinimalDOMMatrix) {
      const source = args[0];
      this.a = source.a;
      this.b = source.b;
      this.c = source.c;
      this.d = source.d;
      this.e = source.e;
      this.f = source.f;
    } else if (args.length === 1 && Array.isArray(args[0]) && args[0].length >= 6) {
      const values = args[0] as number[];
      this.a = values[0] ?? 1;
      this.b = values[1] ?? 0;
      this.c = values[2] ?? 0;
      this.d = values[3] ?? 1;
      this.e = values[4] ?? 0;
      this.f = values[5] ?? 0;
    }
  }

  translate(tx: number, ty: number): MinimalDOMMatrix {
    return new MinimalDOMMatrix([
      this.a, this.b, this.c, this.d,
      this.e + tx * this.a + ty * this.c,
      this.f + tx * this.b + ty * this.d,
    ]);
  }

  scale(sx: number, sy = sx): MinimalDOMMatrix {
    return new MinimalDOMMatrix([
      this.a * sx, this.b * sx,
      this.c * sy, this.d * sy,
      this.e, this.f,
    ]);
  }

  rotate(degrees: number): MinimalDOMMatrix {
    const radians = (degrees * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    return new MinimalDOMMatrix([
      this.a * cos + this.c * sin,
      this.b * cos + this.d * sin,
      this.a * -sin + this.c * cos,
      this.b * -sin + this.d * cos,
      this.e,
      this.f,
    ]);
  }

  multiply(other: MinimalDOMMatrix): MinimalDOMMatrix {
    return new MinimalDOMMatrix([
      this.a * other.a + this.c * other.b,
      this.b * other.a + this.d * other.b,
      this.a * other.c + this.c * other.d,
      this.b * other.c + this.d * other.d,
      this.a * other.e + this.c * other.f + this.e,
      this.b * other.e + this.d * other.f + this.f,
    ]);
  }

  multiplySelf(other: MinimalDOMMatrix): MinimalDOMMatrix {
    const product = this.multiply(other);
    Object.assign(this, product);
    return this;
  }

  invertSelf(): MinimalDOMMatrix {
    const determinant = this.a * this.d - this.b * this.c;
    if (Math.abs(determinant) < 1e-12) return this;
    const { a, b, c, d, e, f } = this;
    this.a = d / determinant;
    this.b = -b / determinant;
    this.c = -c / determinant;
    this.d = a / determinant;
    this.e = (c * f - d * e) / determinant;
    this.f = (b * e - a * f) / determinant;
    return this;
  }

  transformPoint(point: { x: number; y: number }): { x: number; y: number } {
    return {
      x: this.a * point.x + this.c * point.y + this.e,
      y: this.b * point.x + this.d * point.y + this.f,
    };
  }

  static fromMatrix(matrix: MinimalDOMMatrix): MinimalDOMMatrix {
    return new MinimalDOMMatrix(matrix);
  }

  static fromFloat32Array(values: ArrayLike<number>): MinimalDOMMatrix {
    return new MinimalDOMMatrix(Array.from(values));
  }

  static fromFloat64Array(values: ArrayLike<number>): MinimalDOMMatrix {
    return new MinimalDOMMatrix(Array.from(values));
  }
}

class MinimalDOMPoint {
  x: number;
  y: number;
  z: number;
  w: number;

  constructor(x = 0, y = 0, z = 0, w = 1) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
  }
}
