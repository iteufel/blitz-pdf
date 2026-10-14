export function record(value, name) {
    if (value === null || typeof value !== "object" || Array.isArray(value) ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
        throw new TypeError(`${name} must be a plain object`);
    }
}
//# sourceMappingURL=validation.js.map