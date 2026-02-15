const EPSILON = 0.0001;
export function clampAxis(value) {
    if (!Number.isFinite(value)) {
        return 0;
    }
    if (value > 1) {
        return 1;
    }
    if (value < -1) {
        return -1;
    }
    return value;
}
export function normalizeMoveIntent(input) {
    const clampedDx = clampAxis(input?.dx ?? 0);
    const clampedDy = clampAxis(input?.dy ?? 0);
    const magnitude = Math.hypot(clampedDx, clampedDy);
    if (magnitude > 1) {
        return {
            dx: clampedDx / magnitude,
            dy: clampedDy / magnitude
        };
    }
    return {
        dx: clampedDx,
        dy: clampedDy
    };
}
export function nextDirection(current, intent) {
    const { dx, dy } = intent;
    if (Math.abs(dx) < EPSILON && Math.abs(dy) < EPSILON) {
        return current;
    }
    if (Math.abs(dx) >= Math.abs(dy)) {
        return dx >= 0 ? "right" : "left";
    }
    return dy >= 0 ? "down" : "up";
}
