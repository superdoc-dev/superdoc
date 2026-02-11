export function flattenPoints(points) {
  return points.flatMap((pair) => [pair[0], pair[1]]);
}
