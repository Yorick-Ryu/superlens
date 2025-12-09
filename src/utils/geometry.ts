import type { ShapeConfig } from '../types';

interface Point {
    x: number;
    y: number;
}

export const getRectConnectionPoints = (r1: ShapeConfig, r2: ShapeConfig): [Point, Point][] => {
    // Connect corners: TL-TL, TR-TR, BR-BR, BL-BL
    // Assumes width and height are centered or corner-based?
    // Konva default is corner-based unless offset is set.
    // We'll manage shapes as center-based for easier logic, or corner based? 
    // Let's assume (x, y) is top-left for Rect to match Konva's default for Rect.
    // For Circle, (x, y) is center. We will need to normalize.

    // Actually, let's normalize everything to Center for calculation, then map back if needed.
    // But Konva 'Rect' x,y is top-left.

    const p1 = [
        { x: r1.x, y: r1.y }, // TL
        { x: r1.x + r1.width, y: r1.y }, // TR
        { x: r1.x + r1.width, y: r1.y + r1.height }, // BR
        { x: r1.x, y: r1.y + r1.height } // BL
    ];

    const p2 = [
        { x: r2.x, y: r2.y }, // TL
        { x: r2.x + r2.width, y: r2.y }, // TR
        { x: r2.x + r2.width, y: r2.y + r2.height }, // BR
        { x: r2.x, y: r2.y + r2.height } // BL
    ];

    return [
        [p1[0], p2[0]],
        [p1[1], p2[1]],
        [p1[2], p2[2]],
        [p1[3], p2[3]]
    ];
};

export const getCircleTangents = (c1: ShapeConfig, c2: ShapeConfig): [Point, Point][] => {
    // c1 and c2 are circles. x, y are centers. width is diameter.
    // We want external tangents.
    const r1 = c1.width / 2;
    const r2 = c2.width / 2;
    const d = Math.hypot(c2.x - c1.x, c2.y - c1.y);

    if (d <= Math.abs(r1 - r2)) return []; // One inside other

    // External tangents
    const theta = Math.acos((r1 - r2) / d);
    const baseAngle = Math.atan2(c2.y - c1.y, c2.x - c1.x);

    const t1 = baseAngle + theta;
    const t2 = baseAngle - theta;

    // Tangent points on c1
    const p1_1 = { x: c1.x + r1 * Math.cos(t1), y: c1.y + r1 * Math.sin(t1) };
    const p1_2 = { x: c1.x + r1 * Math.cos(t2), y: c1.y + r1 * Math.sin(t2) };

    // Tangent points on c2
    const p2_1 = { x: c2.x + r2 * Math.cos(t1), y: c2.y + r2 * Math.sin(t1) };
    const p2_2 = { x: c2.x + r2 * Math.cos(t2), y: c2.y + r2 * Math.sin(t2) };

    return [
        [p1_1, p2_1],
        [p1_2, p2_2]
    ];
};
