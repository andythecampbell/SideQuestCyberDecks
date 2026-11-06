/** glTF meters Y-up -> domain millimeters Z-up; applied only at mesh boundary. */
export function fromGLB([x, y, z]: [number, number, number]): [number, number, number] {
  return [x * 1000, z === 0 ? 0 : -z * 1000, y * 1000]
}
export const GLB_TO_DOMAIN = {
  scale: 1000,
  rotation: [Math.SQRT1_2, 0, 0, Math.SQRT1_2] as [number, number, number, number],
}
