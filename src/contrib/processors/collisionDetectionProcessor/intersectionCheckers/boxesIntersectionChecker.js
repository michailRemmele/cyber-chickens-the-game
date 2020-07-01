import { Vector2, VectorOps } from 'engine/mathLib';

import IntersectionChecker from './intersectionChecker';

class BoxesIntersectionChecker extends IntersectionChecker {
  _projectPolygon(polygon, axisVector) {
    const initialProjectionValue = VectorOps.dotProduct(polygon.edges[0].point1, axisVector);

    const projection = {
      min: initialProjectionValue,
      max: initialProjectionValue,
    };

    for (let i = 1; i < polygon.edges.length; i++) {
      const projectionValue = VectorOps.dotProduct(polygon.edges[i].point1, axisVector);

      if (projectionValue < projection.min) {
        projection.min = projectionValue;
      } else if (projectionValue > projection.max) {
        projection.max = projectionValue;
      }
    }

    return projection;
  }

  /*
   * Checks boxes colliders at the intersection.
   * The SAT (separating axis theorem) is used to determine an intersection and mtvs.
   * As both boxes are axis aligned, the algorithm was simplified.
   * So only two edges of the one box are used to check objects at the intersection.
   */
  check(arg1, arg2) {
    let overlap;
    let normal;

    const { x: xArg1, y: yArg1 } = arg1.coordinates.center;
    const { x: xArg2, y: yArg2 } = arg2.coordinates.center;

    for (let j = 0; j < arg1.coordinates.edges.length / 2; j++) {
      const axis = arg1.coordinates.edges[j].normal;

      const aProjection = this._projectPolygon(arg1.coordinates, axis);
      const bProjection = this._projectPolygon(arg2.coordinates, axis);

      const aDistance = aProjection.min - bProjection.max;
      const bDistance = bProjection.min - aProjection.max;

      if (aDistance > 0 || bDistance > 0) {
        return false;
      }

      const aOverlap = Math.abs(aDistance);
      const bOverlap = Math.abs(bDistance);

      if (overlap === undefined || aOverlap < overlap) {
        overlap = aOverlap;
        normal = axis;
      }

      if (overlap === undefined || bOverlap < overlap) {
        overlap = bOverlap;
        normal = axis;
      }
    }

    const mtv = normal.clone();
    mtv.multiplyNumber(overlap);

    const positiveX = Math.abs(mtv.x);
    const negativeX = -Math.abs(mtv.x);
    const positiveY = Math.abs(mtv.y);
    const negativeY = -Math.abs(mtv.y);

    return {
      mtv1: new Vector2(
        xArg1 < xArg2 ? negativeX : positiveX,
        yArg1 < yArg2 ? negativeY : positiveY
      ),
      mtv2: new Vector2(
        xArg2 > xArg1 ? positiveX : negativeX,
        yArg2 > yArg1 ? positiveY : negativeY
      ),
    };
  }
}

export default BoxesIntersectionChecker;
